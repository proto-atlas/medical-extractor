# Architecture

## 概要

medical-extractor は架空の医療文書を入力として、Anthropic Claude Haiku 4.5 に SOAP 4 項目 (Subjective / Objective / Assessment / Plan) を抽出させ、各項目について整理サマリー (`text`) と原文引用 (`source_text`) を返すデモアプリです。

## コンポーネント構成

```
┌────────────────────────┐    ┌───────────────────────────┐    ┌────────────────┐
│   ブラウザ              │    │ Cloudflare Workers         │    │ Anthropic API  │
│                        │    │ (OpenNext + Next.js 16)   │    │                │
│ PasswordGate           │───►│ POST /api/auth             │    │                │
│  ↓ 認証通過            │    │  - constant-time compare   │    │                │
│ PrivacyDialog          │    │                            │    │                │
│  ↓ 同意                │    │ POST /api/extract          │───►│ messages.create│
│ DocumentInput          │    │  1. checkAccess (Bearer)   │    │ + tool_use     │
│  ├ サンプル dropdown   │    │  2. checkRateLimit (5/60s) │    │ + tool_choice  │
│  ├ .txt/.md upload     │    │  3. validate (1〜10000字)  │    │   forced       │
│  ├ VoiceInputButton    │    │  4. Anthropic 呼び出し     │◄───│  → tool_use    │
│  └ textarea            │    │  5. tool_use ブロック取得  │    │    block       │
│        ↓               │    │  6. Zod safeParse 検証     │    │  + Zod schema  │
│ ExtractButton          │    │  7. 200 / 502 / 401 / 429  │    │                │
│        ↓               │    │     を返却                 │    │                │
│ SOAPViewer (4 cards)   │◄───│                            │    │                │
│        ↓               │    │                            │    │                │
│ ExportButtons          │    │ プライバシー:              │    │                │
│  ├ JSON                │    │  - 入力本文をログに出さない│    │                │
│  ├ CSV                 │    │  - 永続化なし (in-memory) │    │                │
│  └ Markdown            │    │                            │    │                │
└────────────────────────┘    └───────────────────────────┘    └────────────────┘
```

## ファイル責務

### `src/app/`

- `page.tsx`: 認証 → プライバシー同意 → 本体 UI のラップ + state 管理 + `/api/extract` 呼び出し
- `layout.tsx`: HTML root、`<html lang="ja">`、メタタグ (OG / Twitter)、ダークモード初期化スクリプト (FOUC 防止)
- `globals.css`: Tailwind v4 `@import` + `@custom-variant dark`
- `api/auth/route.ts`: アクセスキー検証 (constant-time)
- `api/extract/route.ts`: SOAP 抽出。tool_use 強制 + Zod 検証 + 多層エラー (401 / 429 / 502 / 499 / 500)

### `src/components/`

- `PasswordGate.tsx`: 認証ゲート (citation-reader から流用)
- `PrivacyDialog.tsx`: 初回プライバシー警告モーダル (localStorage で 1 度だけ表示)
- `DocumentInput.tsx`: 本文入力エリア (サンプル選択 / ファイル / 音声入力 / textarea)
- `VoiceInputButton.tsx`: Web Speech API ラッパー UI (Chrome / Edge / Safari)
- `ExtractButton.tsx`: 「SOAP を抽出する」専用ボタン
- `SOAPViewer.tsx`: 4 カード表示 (S/O/A/P)、各カードに `text` + 折り畳み式 `source_text`
- `ExportButtons.tsx`: JSON / CSV / Markdown の Blob ダウンロードボタン
- `ThemeToggle.tsx`: ダークモード 3 択 (citation-reader から流用)

### `src/lib/`

- `auth.ts`: Bearer トークン解析 + constant-time 比較
- `rate-limit.ts`: 本番は Cloudflare Rate Limiting binding + Workers Cache API 補助リミッター、dev/test は in-memory sliding window fallback
- `models.ts`: Anthropic モデル ID (`claude-haiku-4-5-20251001`)
- `soap-schema.ts`: Zod `SOAPDataSchema` + Anthropic `SOAP_TOOL_INPUT_SCHEMA` (JSON Schema) + 名前 / description
- `samples.ts`: 3 種のサンプル医療文書 (一般内科 / 歯科 / 眼科) と `findSampleById`
- `exporters.ts`: 純関数 `formatJson` / `formatCsv` / `formatMarkdown` + `EXPORT_FORMATS` 配列
- `speech-recognition.ts`: Web Speech API のラッパー + 最小 ambient 型定義
- `privacy.ts`: localStorage に同意フラグを保存する get/set ヘルパー
- `theme.ts`: ダークモード state 永続化
- `types.ts`: `ExtractRequest` / `ExtractResponse` / `ExtractErrorResponse` / `ExtractUsage`

## データフロー

### 1. 認証

1. ブラウザが `/api/auth` に POST (Authorization: Bearer ...)
2. サーバーは `checkAccess()` で `crypto.timingSafeEqual` 風の constant-time 比較
3. 成功で 200、失敗で 401

### 2. SOAP 抽出

1. ユーザーが本文を入力 (サンプル / ファイル / 音声 / 直接入力)
2. 「SOAP を抽出する」クリック → `fetch('/api/extract', { method: 'POST', body: { documentText } })`
3. サーバー側:
   - `checkAccess` (Authorization 検証)
   - `checkRateLimit` (5/60s)
   - `documentText` length 検証 (1〜10,000 文字)
   - `Anthropic.messages.create` を **non-streaming** で呼ぶ:
     - `tools: [{ name: 'extract_soap', description, input_schema }]`
     - `tool_choice: { type: 'tool', name: 'extract_soap' }` (強制)
   - レスポンスから `tool_use` ブロックを find
   - `SOAPDataSchema.safeParse(toolUseBlock.input)` で構造検証
   - 成功 → 200 で `{ soap, model, usage }`
   - スキーマ違反 → 502 で `{ error, schemaIssues }`
   - 認証失敗 → 401 / レート → 429 / その他 → 500 / client disconnect → 499
4. クライアントは `result` state に格納し `SOAPViewer` で 4 カード描画

### 3. エクスポート

1. `EXPORT_FORMATS` の各 `format(soap)` で文字列生成
2. `Blob` + `URL.createObjectURL` + `<a download>` を一時的に DOM に追加 → click → 削除
3. 1 秒遅延後に `URL.revokeObjectURL` (Firefox の早期 revoke 問題回避)

## セキュリティ境界

| 境界 | 防御 |
|---|---|
| ブラウザ → サーバー | HTTPS (Cloudflare 自動)、Bearer 認証、レート制限 |
| サーバー → Anthropic | Workers Secrets 経由の API Key、`maxRetries: 0` で多重課金防止 |
| AI 出力 → クライアント | `input_schema` (JSON Schema) + サーバー側 Zod の二重検証 |
| client disconnect | `req.signal.aborted` で 499 を返却 (Cloudflare Tail で集計可能) |
| ログ出力 | 入力本文を error message に含めない、`wrangler tail` で本文が見えない設計 |
| localStorage | UI 設定 (テーマ / プライバシー同意) のみ。本文 / 抽出結果は非永続 |

## CI 設計

- `.github/workflows/ci.yml`: typecheck / lint / test / secret scan / build (citation-reader / nuxt-ai-blog と同形)
- `scripts/check-secrets.sh`: 一般的なsecret prefixのみを対象にしたCI-safe scan

## テスト戦略

| 種別 | 範囲 | 件数 |
|---|---|---|
| Vitest unit / route / UI | auth / rate-limit / SOAP schema / samples / exporters / speech / privacy / API routes / eval helpers | 137 |
| Playwright E2E (chromium) | auth / privacy / extract / axe a11y / target-size / cross-browser smoke | 19 |
| カバレッジ閾値 | lines 60% / functions 70% / branches 50% / statements 60% | - |

E2E はマルチブラウザ (firefox / webkit / mobile-chrome / mobile-safari) も Playwright config に登録済み。CI では Chromium のみ走らせ、他は手動 / 必要時実行。
