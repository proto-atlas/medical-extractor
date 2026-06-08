# 設計判断

medical-extractorで採用した主要な設計判断とそのトレードオフをADR形式で記録します。citation-readerからの差分を中心に、医療ドメイン特化で何を変えたかを明示します。

---

## 1. SOAP抽出にAnthropic `tool_use` を採用 (textレスポンス + JSON parseはしない)

### 文脈

AIから構造化JSONを得る方法は複数ある:
- (a) textモードで「JSONで返してください」とプロンプト → クライアントで `JSON.parse`
- (b) `tool_use` を使い、`input_schema` (JSON Schema) で構造を定義
- (c) `response_format: { type: 'json_schema' }` (一部モデルのみ)

### 決定

(b) tool_use + `tool_choice: { type: 'tool', name: 'extract_soap' }` を採用。

### 理由

- (a) はモデルが説明テキストや前置きを混ぜる、JSONの前後にバッククォートを付ける、stringified JSONを返す等の揺らぎがある。Zod検証も別途必要で、「JSONを取り出す」工程が脆弱。
- (b) はAnthropic SDKが `input_schema` でJSON Schemaを強制し、`tool_use` ブロックの `.input` が `unknown` 型ではあるものの構造化されたオブジェクトとして返る。`tool_choice: { type: 'tool', name: ... }` で必ずそのツールを呼ばせるため、テキスト混入リスクがほぼゼロ。
- (c) は対応モデルが限定的で、Claude Haiku 4.5 ではtool_use経由が標準。

### トレードオフ

- ツール定義のオーバーヘッド: `tool_use` には ~313〜346 tokensのsystem promptが自動付加される (Anthropic公式ドキュメント)。1 リクエストあたり数百トークン課金が増えるが、Haiku 4.5 では実用上問題ない範囲。
- AIが `tool_use` を返さない可能性: 0 ではないため、502 で「AI did not return a tool_use block」を返却する分岐を残してある。

---

## 2. Zodによる二重検証 (SDKのinput_schema + サーバー側safeParse)

### 決定

Anthropic SDKの `input_schema` (JSON Schema) で構造を定義しつつ、サーバー側でも `SOAPDataSchema.safeParse(toolUseBlock.input)` を実行。スキーマ違反は 502 を返してクライアントに「再試行」を促す。

### 理由

- SDK側のinput_schema検証はAnthropicサーバーで行われるが、AIのサンプリング揺らぎで 100% 厳格ではないという現実的な前提を取る。
- サーバー側で再検証することで、(1) AI出力がZodの型に一致しなければ即 502 を返してクライアントを混乱させない、(2) 検証ロジックがTypeScriptの `SOAPData` 型と機械的に整合 (`z.infer`)、(3) スキーマ違反の `path` / `code` を構造化して返せる。
- AI出力を楽観視せず、SDK側とサーバー側の二段で検証する方針にした。

### トレードオフ

- スキーマ定義がJSON Schema (Anthropic用) とZod (サーバー検証用) の 2 重管理になる。soap-schema.tsに併置し、`soap-schema.test.ts` で両者の整合 (`required` / `properties` / 型) を機械的に検証することで管理コストを抑える。

---

## 3. Citations APIは使わない、`source_text` フィールドで代替

### 決定

Anthropic Citations APIは採用せず、`SOAP_TOOL_INPUT_SCHEMA` の各フィールドに `source_text` (原文の該当箇所をそのまま引用) を必須プロパティとして追加。AIに「原文をそのまま引用してください」と指示する。

### 理由

- Citations APIはstreaming前提の文字位置 (start_char_index等) をテキストブロック単位で返す設計で、tool_useと同時に使うとレスポンス解釈が複雑化する (どのtool_use blockにどのcitationが紐づくか曖昧)。
- 医療文書は短い (10,000 文字上限) ため、AIに「原文を引用」させる方式で十分実用に耐える。
- citation-readerはstreaming + 文字位置highlightを本格実装したが、medical-extractorは構造化抽出が主目的。CitationsにコストをかけるよりSOAPの精度に投資する方がデモの評価軸と整合。

### トレードオフ

- AIが `source_text` を要約してしまうリスク: system promptで「原文をそのまま引用」を強調 + 違反時は次回再試行 (Zod検証は通るが、ユーザー側で不一致に気付くケース)。原文との完全一致は将来SOAPViewerに「原文中の該当箇所をハイライト」機能を追加する余地として残してある。

---

## 4. Streamingを捨ててnon-streaming `messages.create` に

### 決定

citation-readerはSSE streamingだったが、medical-extractorは `messages.create` (非streaming) で一括レスポンス。

### 理由

- SOAP抽出は短時間処理 (~5 秒)。streamingの「即時フィードバック」効果が薄い。
- non-streamingの方がtool_useの取り出しがシンプル (`response.content.find(b => b.type === 'tool_use')` で完了)。
- AbortController / SSEパーサ / chunked状態管理が不要になり、クライアント / サーバー両方が単純化。
- 副作用として `enable_request_signal` flagは未使用 (streaming時のclient disconnect検知に必要だった)。client disconnect検知は `req.signal.aborted` で十分。

### トレードオフ

- ユーザー体験は「ボタン押す → ~5 秒待つ → 結果表示」になり、進捗フィードバックがない。spinner + 「抽出中...」テキストでカバー。

---

## 5. レート制限をCloudflare binding + edge cache補助 + メモリ上の代替処理にする

### 決定

本番ではCloudflare Workers Rate Limiting bindingを先に通し、Workers Cache APIのedge cache補助リミッターを重ねる。ローカルdev / unit testではbinding / Cache APIが存在しないため、in-memory sliding windowに切り替える。

scope別の閾値:

| scope | binding | 閾値 |
|---|---|---:|
| `auth` | `AUTH_RATE_LIMITER` | 5 req/60s |
| `extract-auth` | `EXTRACT_AUTH_RATE_LIMITER` | 10 req/60s |
| `extract` | `EXTRACT_RATE_LIMITER` | 5 req/60s |

### 理由

- 医療用途というドメインで「保守的」を選ぶ姿勢を示す。
- AIコストの実害保護: 1 IPからの大量送信を抑制する。Anthropic側Spend Limit ($5〜$10/月) も併用する。
- 模擬データ前提のデモなので、ユーザーが 1 分間に 5 回試せれば十分。
- 2026-04-29 の本番burst疎通確認 で、in-memory limiterはWorkers isolate分散により 429 を返せないケースが確認されたため、本番はCloudflare binding + edge cache補助へ変更した。

### 既知の制約

Cloudflare Rate Limiting bindingはabuse reduction用であり、完全な会計システムではない。Workers Cache APIも同一edgeでの補助防衛であり、強整合カウンタではない。グローバルに1リクエスト単位の強整合カウンタが必要な場合はDurable Objectsへ置き換える。

in-memoryの代替処理はdev/test用の決定的な実装で、本番の挙動とは分けて扱う。

### 実害評価

- デモ閲覧者の手動操作シナリオではbinding + edge cache補助によりscope別 429 を返す
- 攻撃者が分散 (複数地理PoP経由) する場合、Rate Limiting binding / Cache APIを会計グレードの上限として扱わない
- このアプリは架空データ前提・招待制パスワード認証のため、攻撃シナリオの優先度は低と判断

### 将来の改善

確実なグローバルレート制限が必要になった時点でDurable Objects (テナントごとの強整合性) にswapする。

### トレードオフ

- デモ閲覧者が短時間に複数サンプルを試したい場合に 429 を踏む可能性。エラー文言で `Retry-After` を秒単位で表示してフォロー。
- binding / Cache APIが使えないdev/testではin-memoryの代替処理になる。実態と乖離しないようREADME / DESIGN-DECISIONS / evidenceに境界を明記する。

---

## 6. 入力本文をエラーメッセージ・ログに含めない

### 決定

サーバー側の `try/catch` でAI呼び出しが失敗しても `documentText` をerror messageやログに含めない。`wrangler tail` で本文が見えない設計。

### 理由

- 医療情報を扱う前提のデモなので、誤って実患者データが入った場合の漏洩リスクを最小化。
- ユーザーが架空データを使うことが期待されるが、UI側の警告だけに依存せず、サーバー実装でも「ログに出さない」を機械的に担保する。
- プライバシー要件「ログに本文出力なし」と整合。

### トレードオフ

- デバッグ時に「どの入力で失敗したか」が追えない。代わりにschemaIssues (Zodの `path` / `code`) やerrorName / statusCodeのメタ情報のみ返却して原因切り分けできる粒度を保つ。

---

## 7. プライバシー警告は「常時バナー」+「初回モーダル」の二重提示

### 決定

- 常時バナー: header直下にamberカラーで「実患者の情報は入力しないでください」を表示
- 初回モーダル: localStorage未同意時にdialogをoverlay表示 → 「理解しました」でlocalStorage保存 → 以後非表示

### 理由

- 常時バナーだけだと「気付かれない」リスク (デモ閲覧者が他のUI要素に気を取られる)。
- 初回モーダルだけだと「2 回目以降は警告がない」状態になり、共有PC等で他人が見るときに警告が消える。
- 二重で出すことで、初回には強制視認、以降は背景情報として残る。

### トレードオフ

- UXの摩擦: 初回モーダルで 1 ステップ余計に必要。デモ動画では「同意ボタンを 1 回押せば消える」ことを短く見せられるので致命的ではない。

---

## 8. 音声入力 (Web Speech API) はShould範囲で実装

### 決定

`SpeechRecognition` ラッパーを自前実装 (TS lib.dom.d.tsに未収録のためambient型を最小定義)、`continuous + interimResults + ja-JP`。Firefoxは非対応のためボタン非表示でフォールバック。

### 理由

- 医療現場の典型ユースケース (音声カルテ → SOAP自動生成) との整合性を示すために含めたい機能。補助機能としてなら 1 ファイル + 1 コンポーネント + テストで完結。
- @types/dom-speech-recognition等のサードパーティ型を避け、依存を増やさない方針 (citation-reader / nuxt-ai-blogと同じ姿勢)。

### トレードオフ

- 音声データはApple / Googleのクラウドに送信される (ブラウザ実装依存)。これはWeb Speech APIの仕様であり実装側で制御不可。プライバシーモーダルで明示。
- `isFinal=true` のみ確定しinterimを捨てる: 「リアルタイム反映」の見栄えは劣るが、編集中のカーソル混乱やAIへの不安定テキスト流入を防ぐトレードオフ。

---

## 9. エクスポートはクライアント側のみで完結 (サーバー往復なし)

### 決定

`Blob` + `URL.createObjectURL` + `<a download>` で 3 形式 (JSON / CSV / Markdown) をローカル保存。サーバーに「エクスポート要求」を送るAPIは作らない。

### 理由

- 抽出結果はサーバーに永続化しない方針。エクスポートのために再送信するのも矛盾するため、クライアント側のみで完結させる。
- 純関数 `formatJson` / `formatCsv` / `formatMarkdown` は `src/lib/exporters.ts` でVitest unit test可能。DOM操作部分 (Blob / a[download]) はE2Eテストで `download` イベントを確認。

### トレードオフ

- CSVはBOMを付けない方針。ExcelでUTF-8 として開くには手動指定が必要。BOM付きにするとMarkdown / JSONとのフォーマット統一が崩れるため、現状はトレードオフを許容。

---

## 10. PDFサポートを廃止 (citation-readerからのdiff)

### 決定

`pdfjs-dist` 依存を削除。受け付けるのはtextarea直接入力 + `.txt` / `.md` ファイル + 音声入力のみ。

### 理由

- 初期仕様: 「テキスト直接入力orファイル添付 (.txt / .md、最大 10,000 文字)」でPDFは要件外。
- citation-readerでPDFを扱った経緯は「クライアント側pdfjsで抽出してサーバーに送らない」プライバシー設計のため。medical-extractorも同じプライバシー姿勢だが、PDFの用途 (長文書のページ単位処理) がSOAP抽出 (短い診療メモ) とは合わない。
- bundle sizeの削減: pdfjs-dist + workerで 1〜2 MiB削減され、Cloudflare Workersの 3 MiB制限に余裕が生まれる。

### トレードオフ

- ユーザーが手元のPDFカルテをそのままアップロードしたいケースに非対応。架空データ前提のデモではほぼ不要だが、要望があればB1 のコードを呼び戻す形で再追加可能。

---

## 11. ファイル / コンポーネント設計の方針

- **1 ファイル 1 関心事**: `soap-schema.ts` はZod + JSON Schema、`samples.ts` はサンプル + 検索、`exporters.ts` はformatterのみ、と責務を分離。
- **純関数優先**: ブラウザDOM依存はコンポーネント層 (`ExportButtons.tsx`) に閉じ込め、`exporters.ts` はstring in / string outで完全テスト可能。
- **Nuxt auto-import系の罠を回避**: ReactなのでNuxtのようなauto-import罠は無いが、`@/lib/...` aliasでpathを統一し、`@/components/...` 経由で循環参照を抑制。

---

## 12. 検証済みの状態をリリース単位にする方針

### 決定

GitHubには、動作確認・証跡整理・リリース確認が完了した状態を置く。

### 理由

- 医療ドメインを扱うデモなので、未完成状態よりも「動作する範囲」と「範囲外」を明確にした状態を公開する方が誤解が少ない。
- GitHub URLから直接読まれる前提で、README / docs / evidence / CIの整合が取れた状態を公開単位にする。
- 機能完成 + 個人情報 0 + secret 0 + リリース確認 通過 を満たすまで公開しない方針。

### トレードオフ

- このリポジトリでは、完成時点の品質と再現可能な検証手順を優先する。

---

## 13. レート制限を `(scope, IP)` で分離し、`/api/extract` にpre-auth limiterを追加

### 文脈

設計レビューでは、2 つの構造的弱点が指摘された:

1. `/api/auth` と `/api/extract` が `src/lib/rate-limit.ts` の同じIP-bucket (5 req/60s) を共有しており、ログイン確認が抽出APIの枠を消費する。E2Eでも `mockAuthOk` を使って回避していた
2. `/api/extract` は認証を先に評価するため、`/api/auth` 側のpre-auth limiter (5 req/60s) は `/api/extract` への直接Bearer連打 (credential総当たり) を抑止できない

### 決定

`checkRateLimit(scope, ip)` シグネチャに変更し、bucket keyを `${scope}:${ip}` で分離。3 つのscopeを導入:

| scope | 閾値 | 評価タイミング | 目的 |
|---|---|---|---|
| `auth` | 5 req/60s | `/api/auth` 認証前 | 共有秘密の総当たり防御 (OWASP Authentication Cheat Sheet推奨) |
| `extract-auth` | 10 req/60s | `/api/extract` 認証前 (新設) | 抽出APIへのcredential総当たり遅延 + 正規UIの誤打吸収 |
| `extract` | 5 req/60s | `/api/extract` 認証通過後 | 抽出本体 (Anthropic課金経路) の保護 |

### 理由

- **scope分離**: 用途が違うbucketを分けることで、(a) 正規ユーザーのログイン挙動が抽出枠を消費しない、(b) ボットのcredential連打が抽出枠を消費しない、(c) E2Eのテスト間干渉が起きにくい (`mockAuthOk` を外した場合でも `auth.spec.ts` の 2 件と `extract.spec.ts` の 3 件が独立bucketで動く)。
- **`extract-auth` 閾値 10**: `auth` の 5 より緩めにする理由は、正規UIのユーザーが「アクセスキーを 1 回間違えて再送する」「ブラウザリロードで再認証が走る」程度を許容しつつ、ボットが秒間 100 件叩く挙動は確実に抑止すること。10 は「正規UXの余裕 + botとの十分な差」のバランス点 (経験則)。
- **`extract` 閾値 5 を維持**: Anthropic課金が発生する本体パスは保守的に絞る方針を継続。

### Cloudflare Rate Limiting Binding + Edge Cache補助採用

2026-04-29 の本番burst疎通確認 でin-memory limiterがWorkers isolate分散により 429 を返せないケースを確認したため、Cloudflare Workers公式のRate Limiting Binding (`env.MY_RATE_LIMITER.limit({ key })`) を採用した。さらに、公式ドキュメント上もRate Limiting Bindingはlocation単位かつeventually consistentなabuse reductionと説明されているため、同一edgeのWorkers Cache API補助リミッターを重ねた。

実装:

1. `wrangler.jsonc` の `ratelimits` に `AUTH_RATE_LIMITER` / `EXTRACT_AUTH_RATE_LIMITER` / `EXTRACT_RATE_LIMITER` を定義。
2. `src/lib/rate-limit.ts` の `checkRequestRateLimit()` がOpenNext `getCloudflareContext()` からbindingを取得。
3. bindingが許可した後、Workers Cache APIにSHA-256 化したscope/IP keyのsliding windowを保存し、同一edge内のburstを補助的に抑える。
4. binding / Cache APIが存在しないdev/testでは既存 `checkRateLimit()` に切り替える。
5. 呼び出し側routeは `checkRequestRateLimit(scope, ip)` をawaitするだけにし、scope分離の責務は維持。

公式制約として、Rate Limiting BindingはCloudflare location単位のabuse reductionであり、完全な会計システムではない。そのため、招待制アクセスキー + Anthropic側Spend Limitも併用する。参照: https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/

### トレードオフ

- binding数が 3 つに増え、Cache APIの補助実装も加わるため設定と実装はやや重くなるが、scopeごとの説明可能性と本番429 疎通確認の再現性を優先。
- pre-auth limiterが「正規ユーザーが 11 回パスワード入力ミスする」極端ケースを 1 分ロックするUX副作用がある。ただし招待制で配布する単純な共有秘密のため、現実的には起きにくい。
- 詳細な動作確認は単体テスト (`src/lib/rate-limit.test.ts` + route tests) と本番 公開URL確認 (`--burst-rate-limit`) で行う方針。
