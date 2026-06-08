// /api/extractのリクエスト / レスポンス型。
// SOAPの中身 (subjective / objective / assessment / plan) はsrc/lib/soap-schema.tsの
// Zod推論型 (SOAPData) を使い、ここでは外側のAPI契約だけを定義する。
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
 * /api/authと /api/extractで共通のerror code union。
 * UIに出す文言はsrc/lib/error-labels.tsのERROR_LABELSで日本語に変換する。
 *
 * raw upstream errors reach UI / schema validation
 * details leak to client" / OWASP Improper Error Handlingへの対応として、
 * SDK / Zod / 内部処理の生エラーをUIに出さない方針。codeのみをJSONで返却し、
 * サーバ内ではconsole.errorで詳細を残す (内部詳細露出の防止)。
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
