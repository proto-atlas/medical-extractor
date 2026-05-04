// サーバから返される ExtractErrorCode をユーザー向け日本語に変換するマップ。
// ユーザーが見ても自然で、内部実装の詳細を漏らさない文言に統一する。
//
// 注: SDK や Zod 検証や内部例外の生 message は UI に出さない方針
// OWASP Improper Error Handling 対応)。
import type { ExtractErrorCode } from './types';

export const ERROR_LABELS: Record<ExtractErrorCode, string> = {
  unauthorized: 'アクセスキーが正しくありません。',
  rate_limit: '短時間に多くのリクエストがありました。しばらく時間を置いてから再度お試しください。',
  invalid_input: '入力内容に問題があります。フォームをご確認ください。',
  document_too_long: 'ドキュメントが長すぎます。10,000 文字以内に収めてください。',
  schema_violation: 'AI 出力の検証に失敗しました。再試行してください。',
  source_text_mismatch: 'AI 出力の根拠確認に失敗しました。再試行してください。',
  tool_use_missing: 'AI が想定形式で応答しませんでした。再試行してください。',
  upstream_unavailable: 'AI サービスとの通信に失敗しました。時間を置いて再度お試しください。',
  upstream_timeout: 'AI サービスの応答がタイムアウトしました。時間を置いて再度お試しください。',
  server_misconfigured: 'サーバー設定エラーが発生しました。デモ管理者にお問い合わせください。',
  aborted: 'リクエストがキャンセルされました。',
  unknown: '予期しないエラーが発生しました。',
};

export function labelFor(code: ExtractErrorCode): string {
  return ERROR_LABELS[code] ?? ERROR_LABELS.unknown;
}
