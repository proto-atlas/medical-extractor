// /api/extract のリクエスト / レスポンス型。
// SOAP の中身 (subjective / objective / assessment / plan) は src/lib/soap-schema.ts の
// Zod 推論型 (SOAPData) を使い、ここでは外側の API 契約だけを定義する。
import type { SOAPData } from './soap-schema';

export interface ExtractRequest {
  documentText: string;
}

export interface ExtractUsage {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
}

export interface ExtractResponse {
  soap: SOAPData;
  model: string;
  usage: ExtractUsage;
}

/**
 * /api/auth と /api/extract で共通の error code union。
 * UI に出す文言は src/lib/error-labels.ts の ERROR_LABELS で日本語に変換する。
 *
 * raw upstream errors reach UI / schema validation
 * details leak to client" / OWASP Improper Error Handling への対応として、
 * SDK / Zod / 内部処理の生エラーを UI に出さない方針。code のみを JSON で返却し、
 * サーバ内では console.error で詳細を残す (内部詳細露出の防止)。
 */
export type ExtractErrorCode =
  | 'unauthorized'
  | 'rate_limit'
  | 'invalid_input'
  | 'document_too_long'
  | 'schema_violation'
  | 'source_text_mismatch'
  | 'tool_use_missing'
  | 'server_misconfigured'
  | 'upstream_unavailable'
  | 'upstream_timeout'
  | 'aborted'
  | 'unknown';

export interface ApiErrorResponse {
  error: ExtractErrorCode;
  retryAfterSeconds?: number;
}
