import { getCloudflareContext } from '@opennextjs/cloudflare';

/**
 * In-memory sliding window rate limiter, keyed by (scope, IP).
 *
 * Why in-memory:
 * - Demo / portfolio scale traffic. Most requests will hit the same isolate.
 * - Avoids requiring a KV namespace or Durable Object setup before deploy.
 *
 * Why this is NOT enough for production:
 * - Cloudflare Workers can spin up multiple isolates; counters are per-isolate.
 * - 実測 2026-04-26: 1 IP から 6 連打したとき 0 回 429 が観測された (期待: 6 回目で 429)。
 * 複数 isolate に分散してそれぞれが MAX に達しなかったと推定。N isolate 並列時は
 * 最悪 MAX*N req/window まで通り得る。詳細は docs/DESIGN-DECISIONS.md #5 / #13 参照。
 * - Production first tries Cloudflare Rate Limiting bindings. In-memory remains
 * the dev/test fallback when bindings are unavailable.
 *
 * Why (scope, IP) keying instead of just IP:
 * - `/api/auth` と `/api/extract` が同じ bucket を共有していると、
 * ログイン確認が抽出 API の 5 req/60s 枠を消費してしまう。本来別物の流量を別 bucket
 * で管理したい。
 * - `/api/extract` の credential 総当たり対策として、認証前にチェックする
 * pre-auth limiter ('extract-auth' scope) を別 bucket で持たせる。auth と extract
 * と pre-auth を完全分離することで、正規ユーザーが UI から複数回再試行しても
 * 誤 Bearer 連打の影響を受けない。
 *
 * The shape of `checkRateLimit` is intentionally similar to a KV-backed
 * implementation so swapping later is mechanical.
 */

export type RateLimitScope = 'auth' | 'extract' | 'extract-auth';

interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
}

/**
 * Scope ごとの閾値設定。
 *
 * - auth (5/60s): /api/auth の総当たり防御。OWASP Authentication Cheat Sheet 推奨に沿った
 * 厳しめの閾値。正規ユーザーが UI で複数回パスワードを試行した時に 1 分ロックされる
 * 軽微な UX コストを許容する。
 * - extract (5/60s): /api/extract 本体 (Anthropic API 課金が発生するパス)。
 * 既存挙動を維持。
 * - extract-auth (10/60s): /api/extract の認証前ゲート。「正規ユーザーがアクセスキー
 * 入力を 1 回間違えて再送する」程度を許しつつ、ボットによる Bearer 候補の総当たりを
 * 遅らせる目的。auth の 5 より緩めにして「正規 UI 経由」の誤打を吸収する。
 */
const SCOPE_CONFIG: Record<RateLimitScope, RateLimitConfig> = {
  auth: { windowMs: 60_000, maxRequests: 5 },
  extract: { windowMs: 60_000, maxRequests: 5 },
  'extract-auth': { windowMs: 60_000, maxRequests: 10 },
};

interface RequestLog {
  timestamps: number[];
}

const buckets = new Map<string, RequestLog>();

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
  source: 'cloudflare-binding' | 'edge-cache' | 'memory';
}

interface RateLimitBinding {
  limit(options: { key: string }): Promise<{ success: boolean }>;
}

type RateLimitBindingName =
  | 'AUTH_RATE_LIMITER'
  | 'EXTRACT_AUTH_RATE_LIMITER'
  | 'EXTRACT_RATE_LIMITER';

interface RateLimitCloudflareEnv {
  AUTH_RATE_LIMITER?: RateLimitBinding;
  EXTRACT_AUTH_RATE_LIMITER?: RateLimitBinding;
  EXTRACT_RATE_LIMITER?: RateLimitBinding;
}

declare global {
  interface CloudflareEnv {
    AUTH_RATE_LIMITER?: RateLimitBinding;
    EXTRACT_AUTH_RATE_LIMITER?: RateLimitBinding;
    EXTRACT_RATE_LIMITER?: RateLimitBinding;
  }
}

type RateLimitEnvLoader = () => Promise<RateLimitCloudflareEnv | null>;
type EdgeCacheLimiter = (
  scope: RateLimitScope,
  ip: string,
  now: number,
) => Promise<RateLimitResult | null>;

const RATE_LIMIT_BINDINGS: Record<
  RateLimitScope,
  { bindingName: RateLimitBindingName; retryAfterSeconds: number }
> = {
  auth: { bindingName: 'AUTH_RATE_LIMITER', retryAfterSeconds: 60 },
  'extract-auth': { bindingName: 'EXTRACT_AUTH_RATE_LIMITER', retryAfterSeconds: 60 },
  extract: { bindingName: 'EXTRACT_RATE_LIMITER', retryAfterSeconds: 60 },
};

export function checkRateLimit(
  scope: RateLimitScope,
  ip: string,
  now: number = Date.now(),
): RateLimitResult {
  const cfg = SCOPE_CONFIG[scope];
  const bucketKey = `${scope}:${ip}`;
  const cutoff = now - cfg.windowMs;
  const bucket = buckets.get(bucketKey) ?? { timestamps: [] };

  // Drop expired timestamps
  bucket.timestamps = bucket.timestamps.filter((t) => t > cutoff);

  if (bucket.timestamps.length >= cfg.maxRequests) {
    // noUncheckedIndexedAccess 対策: length >= maxRequests (>=1) なので [0] は必ず存在
    const oldest = bucket.timestamps[0] ?? now;
    const retryAfterMs = cfg.windowMs - (now - oldest);
    buckets.set(bucketKey, bucket);
    return {
      allowed: false,
      remaining: 0,
      retryAfterSeconds: Math.max(1, Math.ceil(retryAfterMs / 1000)),
      source: 'memory',
    };
  }

  bucket.timestamps.push(now);
  buckets.set(bucketKey, bucket);
  return {
    allowed: true,
    remaining: cfg.maxRequests - bucket.timestamps.length,
    retryAfterSeconds: 0,
    source: 'memory',
  };
}

export async function checkRequestRateLimit(
  scope: RateLimitScope,
  ip: string,
  now: number = Date.now(),
  loadEnv: RateLimitEnvLoader = loadCloudflareEnv,
  edgeCacheLimiter: EdgeCacheLimiter = checkEdgeCacheRateLimit,
): Promise<RateLimitResult> {
  const config = RATE_LIMIT_BINDINGS[scope];

  try {
    const env = await loadEnv();
    const binding = env?.[config.bindingName];
    if (binding) {
      const { success } = await binding.limit({ key: `${scope}:${ip}` });
      return success
        ? await continueAfterCloudflareAllow(scope, ip, now, edgeCacheLimiter)
        : {
            allowed: false,
            remaining: 0,
            retryAfterSeconds: config.retryAfterSeconds,
            source: 'cloudflare-binding',
          };
    }
  } catch {
    // Cloudflare context is unavailable in local Next dev / unit tests.
    // Fall through to the deterministic in-memory limiter.
  }

  const edgeResult = await edgeCacheLimiter(scope, ip, now);
  if (edgeResult) {
    return edgeResult;
  }

  return checkRateLimit(scope, ip, now);
}

export function getRateLimitBindingName(scope: RateLimitScope): RateLimitBindingName {
  return RATE_LIMIT_BINDINGS[scope].bindingName;
}

async function loadCloudflareEnv(): Promise<RateLimitCloudflareEnv | null> {
  const context = await getCloudflareContext({ async: true });
  return context.env;
}

async function continueAfterCloudflareAllow(
  scope: RateLimitScope,
  ip: string,
  now: number,
  edgeCacheLimiter: EdgeCacheLimiter,
): Promise<RateLimitResult> {
  const edgeResult = await edgeCacheLimiter(scope, ip, now);
  return (
    edgeResult ?? {
      allowed: true,
      remaining: 0,
      retryAfterSeconds: 0,
      source: 'cloudflare-binding',
    }
  );
}

interface RateLimitCachePayload {
  timestamps: number[];
}

const RATE_LIMIT_CACHE_ORIGIN = 'https://medical-extractor-rate-limit.local';

async function checkEdgeCacheRateLimit(
  scope: RateLimitScope,
  ip: string,
  now: number,
): Promise<RateLimitResult | null> {
  try {
    const cacheStorage = globalThis.caches as (CacheStorage & { default?: Cache }) | undefined;
    const cache = cacheStorage?.default;
    if (!cache) {
      return null;
    }

    const cfg = SCOPE_CONFIG[scope];
    const cacheRequest = new Request(
      `${RATE_LIMIT_CACHE_ORIGIN}/${scope}/${await hashBucketKey(`${scope}:${ip}`)}`,
    );
    const cached = await cache.match(cacheRequest);
    const cutoff = now - cfg.windowMs;
    const timestamps = cached
      ? parseRateLimitCachePayload(await cached.text()).filter((t) => t > cutoff)
      : [];

    if (timestamps.length >= cfg.maxRequests) {
      const oldest = timestamps[0] ?? now;
      return {
        allowed: false,
        remaining: 0,
        retryAfterSeconds: Math.max(1, Math.ceil((cfg.windowMs - (now - oldest)) / 1000)),
        source: 'edge-cache',
      };
    }

    timestamps.push(now);
    await cache.put(
      cacheRequest,
      new Response(JSON.stringify({ timestamps } satisfies RateLimitCachePayload), {
        headers: {
          'Cache-Control': `max-age=${Math.ceil(cfg.windowMs / 1000)}`,
          'Content-Type': 'application/json',
        },
      }),
    );

    return {
      allowed: true,
      remaining: cfg.maxRequests - timestamps.length,
      retryAfterSeconds: 0,
      source: 'edge-cache',
    };
  } catch {
    // Cache API is unavailable in local Next dev and can be unavailable on non-Worker runtimes.
    return null;
  }
}

function parseRateLimitCachePayload(text: string): number[] {
  try {
    const payload: unknown = JSON.parse(text);
    if (!isRateLimitCachePayload(payload)) {
      return [];
    }
    return payload.timestamps.filter((value) => Number.isFinite(value));
  } catch {
    return [];
  }
}

function isRateLimitCachePayload(value: unknown): value is RateLimitCachePayload {
  return (
    typeof value === 'object' &&
    value !== null &&
    Array.isArray((value as { timestamps?: unknown }).timestamps) &&
    (value as { timestamps: unknown[] }).timestamps.every((item) => typeof item === 'number')
  );
}

async function hashBucketKey(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function getClientIp(request: Request): string {
  return (
    request.headers.get('CF-Connecting-IP') ??
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    'unknown'
  );
}
