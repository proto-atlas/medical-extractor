# Design Decisions

medical-extractor で採用した主要な設計判断とそのトレードオフを ADR 形式で記録します。citation-reader からの差分を中心に、医療ドメイン特化で何を変えたかを明示します。

---

## 1. SOAP 抽出に Anthropic `tool_use` を採用 (text レスポンス + JSON parse はしない)

### 文脈

AI から構造化 JSON を得る方法は複数ある:
- (a) text モードで「JSON で返してください」とプロンプト → クライアントで `JSON.parse`
- (b) `tool_use` を使い、`input_schema` (JSON Schema) で構造を定義
- (c) `response_format: { type: 'json_schema' }` (一部モデルのみ)

### 決定

(b) tool_use + `tool_choice: { type: 'tool', name: 'extract_soap' }` を採用。

### 理由

- (a) はモデルが説明テキストや前置きを混ぜる、JSON の前後にバッククォートを付ける、 stringified JSON を返す等の揺らぎがある。Zod 検証も別途必要で、「JSON を取り出す」工程が脆弱。
- (b) は Anthropic SDK が `input_schema` で JSON Schema を強制し、`tool_use` ブロックの `.input` が `unknown` 型ではあるものの構造化されたオブジェクトとして返る。`tool_choice: { type: 'tool', name: ... }` で必ずそのツールを呼ばせるため、テキスト混入リスクがほぼゼロ。
- (c) は対応モデルが限定的で、Claude Haiku 4.5 では tool_use 経由が標準。

### トレードオフ

- ツール定義のオーバーヘッド: `tool_use` には ~313〜346 tokens の system prompt が自動付加される (Anthropic 公式ドキュメント)。1 リクエストあたり数百トークン課金が増えるが、Haiku 4.5 では実用上問題ない範囲。
- AI が `tool_use` を返さない可能性: 0 ではないため、502 で「AI did not return a tool_use block」を返却する分岐を残してある。

---

## 2. Zod による二重検証 (SDK の input_schema + サーバー側 safeParse)

### 決定

Anthropic SDK の `input_schema` (JSON Schema) で構造を定義しつつ、サーバー側でも `SOAPDataSchema.safeParse(toolUseBlock.input)` を実行。スキーマ違反は 502 を返してクライアントに「再試行」を促す。

### 理由

- SDK 側の input_schema 検証は Anthropic サーバーで行われるが、AI のサンプリング揺らぎで 100% 厳格ではないという現実的な前提を取る。
- サーバー側で再検証することで、(1) AI 出力が Zod の型に一致しなければ即 502 を返してクライアントを混乱させない、(2) 検証ロジックが TypeScript の `SOAPData` 型と機械的に整合 (`z.infer`)、(3) スキーマ違反の `path` / `code` を構造化して返せる。
- AI 出力を楽観視せず、SDK 側とサーバー側の二段で検証する方針にした。

### トレードオフ

- スキーマ定義が JSON Schema (Anthropic 用) と Zod (サーバー検証用) の 2 重管理になる。soap-schema.ts に併置し、`soap-schema.test.ts` で両者の整合 (`required` / `properties` / 型) を機械的に検証することで管理コストを抑える。

---

## 3. Citations API は使わない、`source_text` フィールドで代替

### 決定

Anthropic Citations API は採用せず、`SOAP_TOOL_INPUT_SCHEMA` の各フィールドに `source_text` (原文の該当箇所をそのまま引用) を必須プロパティとして追加。AI に「原文をそのまま引用してください」と指示する。

### 理由

- Citations API は streaming 前提の文字位置 (start_char_index 等) をテキストブロック単位で返す設計で、tool_use と同時に使うとレスポンス解釈が複雑化する (どの tool_use block にどの citation が紐づくか曖昧)。
- 医療文書は短い (10,000 文字上限) ため、AI に「原文を引用」させる方式で十分実用に耐える。
- citation-reader は streaming + 文字位置 highlight を本格実装したが、medical-extractor は構造化抽出が主目的。Citations にコストをかけるより SOAP の精度に投資する方がデモの評価軸と整合。

### トレードオフ

- AI が `source_text` を要約してしまうリスク: system prompt で「原文をそのまま引用」を強調 + 違反時は次回再試行 (Zod 検証は通るが、ユーザー側で不一致に気付くケース)。原文との完全一致は将来 SOAPViewer に「原文中の該当箇所をハイライト」機能を追加する余地として残してある。

---

## 4. Streaming を捨てて non-streaming `messages.create` に

### 決定

citation-reader は SSE streaming だったが、medical-extractor は `messages.create` (非 streaming) で一括レスポンス。

### 理由

- SOAP 抽出は短時間処理 (~5 秒)。streaming の「即時フィードバック」効果が薄い。
- non-streaming の方が tool_use の取り出しがシンプル (`response.content.find(b => b.type === 'tool_use')` で完了)。
- AbortController / SSE パーサ / chunked 状態管理が不要になり、クライアント / サーバー両方が単純化。
- 副作用として `enable_request_signal` flag は未使用 (streaming 時の client disconnect 検知に必要だった)。client disconnect 検知は `req.signal.aborted` で十分。

### トレードオフ

- ユーザー体験は「ボタン押す → ~5 秒待つ → 結果表示」になり、進捗フィードバックがない。spinner + 「抽出中...」テキストでカバー。

---

## 5. レート制限を Cloudflare binding + edge cache 補助 + in-memory fallback にする

### 決定

本番では Cloudflare Workers Rate Limiting binding を第一防衛にし、Workers Cache API の edge cache 補助リミッターを重ねる。ローカル dev / unit test では binding / Cache API が存在しないため、in-memory sliding window に fallback する。

scope別の閾値:

| scope | binding | 閾値 |
|---|---|---:|
| `auth` | `AUTH_RATE_LIMITER` | 5 req/60s |
| `extract-auth` | `EXTRACT_AUTH_RATE_LIMITER` | 10 req/60s |
| `extract` | `EXTRACT_RATE_LIMITER` | 5 req/60s |

### 理由

- 医療用途というドメインで「保守的」を選ぶ姿勢を示す。
- AI コストの実害保護: 1 IP からの大量送信を抑制する**第一防衛線**。最終防衛は Anthropic 側 Spend Limit ($5〜$10/月) で二段で守る。
- 模擬データ前提のデモなので、ユーザーが 1 分間に 5 回試せれば十分。
- 2026-04-29 の本番 burst smoke で、in-memory limiter は Workers isolate 分散により 429 を返せないケースが確認されたため、本番は Cloudflare binding + edge cache 補助へ変更した。

### 既知の制約

Cloudflare Rate Limiting binding は abuse reduction 用であり、完全な会計システムではない。Workers Cache API も同一 edge での補助防衛であり、強整合カウンタではない。グローバルに1リクエスト単位の強整合カウンタが必要な場合は Durable Objects へ置き換える。

in-memory fallback は dev/test 用の決定的な実装で、本番の保証とは分けて扱う。

### 実害評価

- デモ閲覧者の手動操作シナリオでは binding + edge cache 補助により scope別 429 を返す
- 攻撃者が分散 (複数地理 PoP 経由) する場合、Rate Limiting binding / Cache API を会計グレードの上限として扱わない
- 本デモは架空データ前提・招待制パスワード認証のため、攻撃シナリオの優先度は低と判断

### 将来の改善

確実なグローバルレート制限が必要になった時点で Durable Objects (テナントごとの強整合性) に swap する。

### トレードオフ

- デモ閲覧者が短時間に複数サンプルを試したい場合に 429 を踏む可能性。エラー文言で `Retry-After` を秒単位で表示してフォロー。
- binding / Cache API が使えない dev/test では in-memory fallback になる。実態と乖離しないよう README / DESIGN-DECISIONS / evidence に境界を明記する。

---

## 6. 入力本文をエラーメッセージ・ログに含めない

### 決定

サーバー側の `try/catch` で AI 呼び出しが失敗しても `documentText` を error message やログに含めない。`wrangler tail` で本文が見えない設計。

### 理由

- 医療情報を扱う前提のデモなので、誤って実患者データが入った場合の漏洩リスクを最小化。
- ユーザーが架空データを使うことが期待されるが、UI 側の警告だけに依存せず、サーバー実装でも「ログに出さない」を機械的に担保する。
- プライバシー要件「ログに本文出力なし」と整合。

### トレードオフ

- デバッグ時に「どの入力で失敗したか」が追えない。代わりに schemaIssues (Zod の `path` / `code`) や errorName / statusCode のメタ情報のみ返却して原因切り分けできる粒度を保つ。

---

## 7. プライバシー警告は「常時バナー」+「初回モーダル」の二重提示

### 決定

- 常時バナー: header 直下に amber カラーで「実患者の情報は入力しないでください」を表示
- 初回モーダル: localStorage 未同意時に dialog を overlay 表示 → 「理解しました」で localStorage 保存 → 以後非表示

### 理由

- 常時バナーだけだと「気付かれない」リスク (デモ閲覧者が他の UI 要素に気を取られる)。
- 初回モーダルだけだと「2 回目以降は警告がない」状態になり、共有 PC 等で他人が見るときに警告が消える。
- 二重で出すことで、初回には強制視認、以降は背景情報として残る。

### トレードオフ

- UX の摩擦: 初回モーダルで 1 ステップ余計に必要。デモ動画では「同意ボタンを 1 回押せば消える」ことを短く見せられるので致命的ではない。

---

## 8. 音声入力 (Web Speech API) は Should 範囲で実装

### 決定

`SpeechRecognition` ラッパーを自前実装 (TS lib.dom.d.ts に未収録のため ambient 型を最小定義)、`continuous + interimResults + ja-JP`。Firefox は非対応のためボタン非表示でフォールバック。

### 理由

- 医療現場の典型ユースケース (音声カルテ → SOAP 自動生成) との整合性を示すために含めたい機能。補助機能としてなら 1 ファイル + 1 コンポーネント + テストで完結。
- @types/dom-speech-recognition 等のサードパーティ型を避け、依存を増やさない方針 (citation-reader / nuxt-ai-blog と同じ姿勢)。

### トレードオフ

- 音声データは Apple / Google のクラウドに送信される (ブラウザ実装依存)。これは Web Speech API の仕様であり実装側で制御不可。プライバシーモーダルで明示。
- `isFinal=true` のみ確定し interim を捨てる: 「リアルタイム反映」の見栄えは劣るが、編集中のカーソル混乱や AI への不安定テキスト流入を防ぐトレードオフ。

---

## 9. エクスポートはクライアント側のみで完結 (サーバー往復なし)

### 決定

`Blob` + `URL.createObjectURL` + `<a download>` で 3 形式 (JSON / CSV / Markdown) をローカル保存。サーバーに「エクスポート要求」を送る API は作らない。

### 理由

- 抽出結果はサーバーに永続化しない方針。エクスポートのために再送信するのも矛盾するため、クライアント側のみで完結させる。
- 純関数 `formatJson` / `formatCsv` / `formatMarkdown` は `src/lib/exporters.ts` で Vitest unit test 可能。DOM 操作部分 (Blob / a[download]) は E2E テストで `download` イベントを assert。

### トレードオフ

- CSV は BOM を付けない方針。Excel で UTF-8 として開くには手動指定が必要。BOM 付きにすると Markdown / JSON とのフォーマット統一が崩れるため、現状はトレードオフを許容。

---

## 10. PDF サポートを廃止 (citation-reader からの diff)

### 決定

`pdfjs-dist` 依存を削除。受け付けるのは textarea 直接入力 + `.txt` / `.md` ファイル + 音声入力のみ。

### 理由

- 初期仕様: 「テキスト直接入力 or ファイル添付 (.txt / .md、最大 10,000 文字)」で PDF は要件外。
- citation-reader で PDF を扱った経緯は「クライアント側 pdfjs で抽出してサーバーに送らない」プライバシー設計のため。medical-extractor も同じプライバシー姿勢だが、PDF の用途 (長文書のページ単位処理) が SOAP 抽出 (短い診療メモ) とは合わない。
- bundle size の削減: pdfjs-dist + worker で 1〜2 MiB 削減され、Cloudflare Workers の 3 MiB 制限に余裕が生まれる。

### トレードオフ

- ユーザーが手元の PDF カルテをそのままアップロードしたいケースに非対応。架空データ前提のデモではほぼ不要だが、要望があれば B1 のコードを呼び戻す形で再追加可能。

---

## 11. ファイル / コンポーネント設計の方針

- **1 ファイル 1 関心事**: `soap-schema.ts` は Zod + JSON Schema、`samples.ts` はサンプル + 検索、`exporters.ts` は formatter のみ、と責務を分離。
- **純関数優先**: ブラウザ DOM 依存はコンポーネント層 (`ExportButtons.tsx`) に閉じ込め、`exporters.ts` は string in / string out で完全テスト可能。
- **Nuxt auto-import 系の罠を回避**: React なので Nuxt のような auto-import 罠は無いが、`@/lib/...` alias で path を統一し、`@/components/...` 経由で循環参照を抑制。

---

## 12. 公開準備が整った状態を初回公開版にする方針

### 決定

GitHub には、動作確認・証跡整理・公開前チェックが完了した状態を初回公開版として置く。

### 理由

- 医療ドメインを扱うデモなので、未完成状態よりも「動作する範囲」と「範囲外」を明確にした状態を公開する方が誤解が少ない。
- GitHub URL から直接読まれる前提で、README / docs / evidence / CI の整合が取れた状態を公開単位にする。
- 機能完成 + 個人情報 0 + secret 0 + 公開前チェック pass を満たすまで公開しない方針。

### トレードオフ

- 初期から細かい開発履歴を見せることはできない。ただし、このリポでは完成時点の品質と再現可能な検証手順を優先する。

---

## 13. レート制限を `(scope, IP)` で分離し、`/api/extract` に pre-auth limiter を追加

### 文脈

設計レビューでは、2 つの構造的弱点が指摘された:

1. `/api/auth` と `/api/extract` が `src/lib/rate-limit.ts` の同じ IP-bucket (5 req/60s) を共有しており、ログイン確認が抽出 API の枠を消費する。E2E でも `mockAuthOk` でしか回避できなかった
2. `/api/extract` は認証を先に評価するため、`/api/auth` 側の pre-auth limiter (5 req/60s) は `/api/extract` への直接 Bearer 連打 (credential 総当たり) を抑止できない

### 決定

`checkRateLimit(scope, ip)` シグネチャに変更し、bucket key を `${scope}:${ip}` で分離。3 つの scope を導入:

| scope | 閾値 | 評価タイミング | 目的 |
|---|---|---|---|
| `auth` | 5 req/60s | `/api/auth` 認証前 | 共有秘密の総当たり防御 (OWASP Authentication Cheat Sheet 推奨) |
| `extract-auth` | 10 req/60s | `/api/extract` 認証前 (新設) | 抽出 API への credential 総当たり遅延 + 正規 UI の誤打吸収 |
| `extract` | 5 req/60s | `/api/extract` 認証通過後 | 抽出本体 (Anthropic 課金経路) の保護 |

### 理由

- **scope 分離**: 用途が違う bucket を分けることで、(a) 正規ユーザーのログイン挙動が抽出枠を消費しない、(b) ボットの credential 連打が抽出枠を消費しない、(c) E2E のテスト間干渉が起きにくい (`mockAuthOk` を外した場合でも `auth.spec.ts` の 2 件と `extract.spec.ts` の 3 件が独立 bucket で動く)。
- **`extract-auth` 閾値 10**: `auth` の 5 より緩めにする理由は、正規 UI のユーザーが「アクセスキーを 1 回間違えて再送する」「ブラウザリロードで再認証が走る」程度を許容しつつ、ボットが秒間 100 件叩く挙動は確実に抑止すること。10 は「正規 UX の余裕 + bot との十分な差」のバランス点 (経験則)。
- **`extract` 閾値 5 を維持**: Anthropic 課金が発生する本体パスは保守的に絞る方針を継続。

### Cloudflare Rate Limiting Binding + Edge Cache 補助採用

2026-04-29 の本番 burst smoke で in-memory limiter が Workers isolate 分散により 429 を返せないケースを確認したため、Cloudflare Workers 公式の Rate Limiting Binding (`env.MY_RATE_LIMITER.limit({ key })`) を採用した。さらに、公式ドキュメント上も Rate Limiting Binding は location 単位かつ eventually consistent な abuse reduction と説明されているため、同一 edge の Workers Cache API 補助リミッターを重ねた。

実装:

1. `wrangler.jsonc` の `ratelimits` に `AUTH_RATE_LIMITER` / `EXTRACT_AUTH_RATE_LIMITER` / `EXTRACT_RATE_LIMITER` を定義。
2. `src/lib/rate-limit.ts` の `checkRequestRateLimit()` が OpenNext `getCloudflareContext()` から binding を取得。
3. binding が許可した後、Workers Cache API に SHA-256 化した scope/IP key の sliding window を保存し、同一 edge 内の burst を補助的に抑える。
4. binding / Cache API が存在しない dev/test では既存 `checkRateLimit()` に fallback。
5. 呼び出し側 route は `checkRequestRateLimit(scope, ip)` を await するだけにし、scope分離の責務は維持。

公式制約として、Rate Limiting Binding は Cloudflare location 単位の abuse reduction であり、完全な会計システムではない。そのため、招待制アクセスキー + Anthropic 側 Spend Limit も併用する。参照: https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/

### トレードオフ

- binding 数が 3 つに増え、Cache API の補助実装も加わるため設定と実装はやや重くなるが、scopeごとの説明可能性と本番429 smokeの再現性を優先。
- pre-auth limiter が「正規ユーザーが 11 回パスワード入力ミスする」極端ケースを 1 分ロックする UX 副作用がある。ただし招待制で配布する単純な共有秘密のため、現実的には起きにくい。
- 詳細な動作保証は単体テスト (`src/lib/rate-limit.test.ts` + route tests) と本番 production smoke (`--burst-rate-limit`) で行う方針。
