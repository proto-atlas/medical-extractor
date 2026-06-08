/**
 * 共有秘密による簡易アクセス制御。
 *
 * ACCESS_PASSWORDはローカルでは .dev.vars、本番ではCloudflare Workers Secretに置く。
 * クライアントは `Authorization: Bearer <password>` で送り、サーバー側で定時間比較する。
 *
 * ユーザー認証ではなく、公開URLのAPI利用量を抑えるための境界として扱う。
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
 * 長さが違う場合も最長長まで比較してから長さ差分を反映し、
 * アクセスキーの一致度をタイミング差で推測しづらくする。
 */
function constantTimeEqual(a: string, b: string): boolean {
  let mismatch = a.length ^ b.length;
  const maxLength = Math.max(a.length, b.length);
  for (let i = 0; i < maxLength; i++) {
    const aCode = i < a.length ? a.charCodeAt(i) : 0;
    const bCode = i < b.length ? b.charCodeAt(i) : 0;
    mismatch |= aCode ^ bCode;
  }
  return mismatch === 0;
}
