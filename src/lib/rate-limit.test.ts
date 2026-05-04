import { afterEach, describe, expect, it } from 'vitest';
import {
  checkRateLimit,
  checkRequestRateLimit,
  getClientIp,
  getRateLimitBindingName,
} from './rate-limit';

const originalCachesDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'caches');

class MemoryCache {
  private readonly store = new Map<string, Response>();

  match(request: RequestInfo | URL): Promise<Response | undefined> {
    return Promise.resolve(this.store.get(new Request(request).url)?.clone());
  }

  put(request: RequestInfo | URL, response: Response): Promise<void> {
    this.store.set(new Request(request).url, response.clone());
    return Promise.resolve();
  }
}

function installMemoryCache(cache: MemoryCache): void {
  Object.defineProperty(globalThis, 'caches', {
    configurable: true,
    value: { default: cache as unknown as Cache },
  });
}

afterEach(() => {
  if (originalCachesDescriptor) {
    Object.defineProperty(globalThis, 'caches', originalCachesDescriptor);
    return;
  }
  Reflect.deleteProperty(globalThis, 'caches');
});

describe('checkRateLimit (scope=extract, 5 req/60s)', () => {
  // 各テストで異なる IP を使い、module-level の buckets が干渉しないようにする。
  // medical-extractor の extract は 5 req/60s/IP (citation-reader の 10 より厳しい)。

  it('初回リクエストは許可され、remaining が 4 になる', () => {
    const result = checkRateLimit('extract', '10.0.0.1', 1000);
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(4);
    expect(result.retryAfterSeconds).toBe(0);
  });

  it('5 回目のリクエストまでは許可される', () => {
    const ip = '10.0.0.2';
    let last;
    for (let i = 0; i < 5; i++) {
      last = checkRateLimit('extract', ip, 1000 + i);
    }
    expect(last?.allowed).toBe(true);
    expect(last?.remaining).toBe(0);
  });

  it('6 回目のリクエストはブロックされる', () => {
    const ip = '10.0.0.3';
    for (let i = 0; i < 5; i++) {
      checkRateLimit('extract', ip, 1000 + i);
    }
    const blocked = checkRateLimit('extract', ip, 1000 + 5);
    expect(blocked.allowed).toBe(false);
    expect(blocked.remaining).toBe(0);
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
  });

  it('ブロック時の retryAfterSeconds はウィンドウ内の最古タイムスタンプ基準で算出される', () => {
    const ip = '10.0.0.4';
    for (let i = 0; i < 5; i++) {
      checkRateLimit('extract', ip, 1000);
    }
    const blocked = checkRateLimit('extract', ip, 1000 + 30_000);
    // 1000 からウィンドウ 60_000 なので、31_000 の時点で残り 30s
    expect(blocked.retryAfterSeconds).toBe(30);
  });

  it('60 秒経過後は古いタイムスタンプが期限切れで、再度許可される', () => {
    const ip = '10.0.0.5';
    for (let i = 0; i < 5; i++) {
      checkRateLimit('extract', ip, 1000);
    }
    const afterWindow = checkRateLimit('extract', ip, 1000 + 60_001);
    expect(afterWindow.allowed).toBe(true);
  });

  it('retryAfterSeconds は最低でも 1 を返す（切り上げ保証）', () => {
    const ip = '10.0.0.6';
    for (let i = 0; i < 5; i++) {
      checkRateLimit('extract', ip, 1000);
    }
    // ウィンドウ終了直前 1ms 前
    const blocked = checkRateLimit('extract', ip, 1000 + 59_999);
    expect(blocked.retryAfterSeconds).toBeGreaterThanOrEqual(1);
  });
});

describe('checkRateLimit (scope 分離)', () => {
  // auth / extract / extract-auth が独立 bucket で管理されることを機械的に保証する。

  it('auth と extract は独立 bucket: 同 IP で auth を 5 回消費しても extract は影響なし', () => {
    const ip = '10.0.1.1';
    for (let i = 0; i < 5; i++) {
      const a = checkRateLimit('auth', ip, 1000 + i);
      expect(a.allowed).toBe(true);
    }
    // auth は 6 回目で 429
    const authBlocked = checkRateLimit('auth', ip, 2000);
    expect(authBlocked.allowed).toBe(false);
    // 同 IP の extract は手付かず
    const extractFresh = checkRateLimit('extract', ip, 2000);
    expect(extractFresh.allowed).toBe(true);
    expect(extractFresh.remaining).toBe(4);
  });

  it('extract と extract-auth は独立 bucket: pre-auth 連打しても extract 本体には影響しない', () => {
    const ip = '10.0.1.2';
    for (let i = 0; i < 10; i++) {
      checkRateLimit('extract-auth', ip, 1000 + i);
    }
    // extract-auth は 11 回目で 429
    const preBlocked = checkRateLimit('extract-auth', ip, 2000);
    expect(preBlocked.allowed).toBe(false);
    // extract 本体は手付かず
    const extract = checkRateLimit('extract', ip, 2000);
    expect(extract.allowed).toBe(true);
  });
});

describe('checkRateLimit (scope=extract-auth, 10 req/60s)', () => {
  // /api/extract の認証前 credential-attempt limiter。
  // extract / auth より緩めの 10 req/60s で「正規 UI の誤打吸収」「ボット遅延」を両立する。

  it('10 回目のリクエストまでは許可される', () => {
    const ip = '10.0.2.1';
    let last;
    for (let i = 0; i < 10; i++) {
      last = checkRateLimit('extract-auth', ip, 1000 + i);
    }
    expect(last?.allowed).toBe(true);
    expect(last?.remaining).toBe(0);
  });

  it('11 回目のリクエストはブロックされる', () => {
    const ip = '10.0.2.2';
    for (let i = 0; i < 10; i++) {
      checkRateLimit('extract-auth', ip, 1000 + i);
    }
    const blocked = checkRateLimit('extract-auth', ip, 2000);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
  });
});

describe('checkRequestRateLimit (Cloudflare binding)', () => {
  it('Cloudflare binding がある場合は binding 名と scope/IP key で評価する', async () => {
    const seenKeys: string[] = [];
    const result = await checkRequestRateLimit('auth', '203.0.113.10', 1000, () =>
      Promise.resolve({
        AUTH_RATE_LIMITER: {
          limit({ key }) {
            seenKeys.push(key);
            return Promise.resolve({ success: false });
          },
        },
      }),
    );

    expect(seenKeys).toEqual(['auth:203.0.113.10']);
    expect(result).toEqual({
      allowed: false,
      remaining: 0,
      retryAfterSeconds: 60,
      source: 'cloudflare-binding',
    });
  });

  it('Cloudflare binding が許可した場合は edge cache limiter でも評価する', async () => {
    const result = await checkRequestRateLimit(
      'auth',
      '203.0.113.12',
      1000,
      () =>
        Promise.resolve({
          AUTH_RATE_LIMITER: {
            limit() {
              return Promise.resolve({ success: true });
            },
          },
        }),
      () =>
        Promise.resolve({
          allowed: false,
          remaining: 0,
          retryAfterSeconds: 45,
          source: 'edge-cache',
        }),
    );

    expect(result).toEqual({
      allowed: false,
      remaining: 0,
      retryAfterSeconds: 45,
      source: 'edge-cache',
    });
  });

  it('Cloudflare binding がなければ in-memory limiter にfallbackする', async () => {
    const result = await checkRequestRateLimit(
      'extract',
      '203.0.113.11',
      1000,
      () => Promise.resolve({}),
      () => Promise.resolve(null),
    );

    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(4);
    expect(result.source).toBe('memory');
  });

  it('Cloudflare binding がない本番相当では edge cache limiter で同一edge内のburstを止める', async () => {
    installMemoryCache(new MemoryCache());
    const ip = '203.0.113.13';
    let last;

    for (let i = 0; i < 5; i++) {
      last = await checkRequestRateLimit('auth', ip, 1000 + i, () => Promise.resolve({}));
    }

    expect(last?.allowed).toBe(true);
    expect(last?.remaining).toBe(0);
    expect(last?.source).toBe('edge-cache');

    const blocked = await checkRequestRateLimit('auth', ip, 1000 + 5, () => Promise.resolve({}));
    expect(blocked.allowed).toBe(false);
    expect(blocked.remaining).toBe(0);
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
    expect(blocked.source).toBe('edge-cache');
  });

  it('scopeごとに別binding名を返す', () => {
    expect(getRateLimitBindingName('auth')).toBe('AUTH_RATE_LIMITER');
    expect(getRateLimitBindingName('extract-auth')).toBe('EXTRACT_AUTH_RATE_LIMITER');
    expect(getRateLimitBindingName('extract')).toBe('EXTRACT_RATE_LIMITER');
  });
});

describe('getClientIp', () => {
  it('CF-Connecting-IP ヘッダを優先する', () => {
    const req = new Request('https://example.com', {
      headers: {
        'CF-Connecting-IP': '203.0.113.1',
        'x-forwarded-for': '203.0.113.99',
      },
    });
    expect(getClientIp(req)).toBe('203.0.113.1');
  });

  it('CF-Connecting-IP がなければ x-forwarded-for の先頭を使う', () => {
    const req = new Request('https://example.com', {
      headers: { 'x-forwarded-for': '203.0.113.2, 10.0.0.1' },
    });
    expect(getClientIp(req)).toBe('203.0.113.2');
  });

  it('ヘッダがなければ "unknown" を返す', () => {
    const req = new Request('https://example.com');
    expect(getClientIp(req)).toBe('unknown');
  });
});
