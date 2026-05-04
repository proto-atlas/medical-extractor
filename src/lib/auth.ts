/**
 * Simple shared-secret access gate.
 *
 * The password is stored in:
 *   - .dev.vars locally (ACCESS_PASSWORD=xxx)
 *   - Cloudflare Workers Secret in production
 *
 * Client sends it as the `Authorization: Bearer <password>` header.
 * The server compares with constant-time equality.
 *
 * This is intentionally minimal — it's enough to prevent random
 * scrapers from burning the Anthropic budget while still letting
 * the recipient of the demo URL try it without signup friction.
 */

export const STORAGE_KEY = 'medical-extractor.access';

export function checkAccess(authHeader: string | null, expected: string | undefined): boolean {
  if (!expected) return false;
  if (!authHeader) return false;
  const m = authHeader.match(/^Bearer\s+(.+)$/i);
  if (!m) return false;
  const provided = m[1]?.trim();
  if (!provided) return false;
  return constantTimeEqual(provided, expected);
}

/**
 * 簡易的な定時間比較。
 * 注意: 長さが違う場合は先頭で `false` を返すため、厳密な意味でのconstant-timeではない
 * （攻撃者はタイミング差から「長さが一致した」ことだけは推測できる）。
 * 本アプリのACCESS_PASSWORDは共有秘密であり長さの漏洩による実害は限定的なため、
 * 可読性を優先して現状実装を採用している。より厳密な保護が必要になった場合は、
 * 最長長で固定ループし最後に長さ比較をまとめる実装に置き換えること。
 */
function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}
