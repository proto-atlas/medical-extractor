import type { NextConfig } from 'next';
import { initOpenNextCloudflareForDev } from '@opennextjs/cloudflare';

const nextConfig: NextConfig = {
  // OpenNext Cloudflareが .next/standalone/ を参照するため必須（pages-manifest.json欠落エラー回避）
  output: 'standalone',
  // x-powered-by: Next.jsを出力しない (情報露出の最小化)
  poweredByHeader: false,
  turbopack: {
    root: import.meta.dirname,
  },
  // 非機能要件「セキュリティヘッダ」対応
  // (nosniff / X-Frame-Options / Referrer-Policy / Permissions-Policy / HSTS / CSP)
  async headers() {
    // CSP: 1 行で組み立てると読みづらいため配列で組成
    // 注意: next dev (development) ではReactのdebug機能がeval() を使うため
    // CSP警告がコンソールに出る (Next.js公式CSPガイド参照:
    // https://nextjs.org/docs/app/guides/content-security-policy)。本番
    // (next build --webpack) ではeval不使用なので 'unsafe-eval' を含めない方針。
    // dev時の警告は機能影響なし (Chromium E2E 10 件はpass、警告は既知制約)。
    const csp = [
      "default-src 'self'",
      // Next.jsのハイドレーションスクリプトとlayout.tsxのtheme初期化スクリプトが
      // インラインなので 'unsafe-inline' が必要 (nonce化は将来課題)。
      "script-src 'self' 'unsafe-inline'",
      // Tailwind v4 はインラインスタイルではなく単一のCSSファイルだが、
      // Reactのinline style用に 'unsafe-inline' を入れる
      "style-src 'self' 'unsafe-inline'",
      // og-image / favicon / inline data URI / Blob (エクスポート時のpreview)
      "img-src 'self' data: blob:",
      "font-src 'self' data:",
      // /api/authと /api/extractは同origin。外部API直叩きはなし
      "connect-src 'self'",
      // X-Frame-Options DENYと整合。CSP側で重複指定して古いブラウザ + 新規をカバー
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "object-src 'none'",
    ].join('; ');

    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          // 注意: VoiceInputButton (Web Speech API) のためmicrophoneはself許可必須。
          // 全origin disallowにすると音声入力機能がpermission拒否で動かない。
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(self), geolocation=()',
          },
          // Cloudflare Workersは常時HTTPS、サブドメインも対象
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=31536000; includeSubDomains',
          },
          { key: 'Content-Security-Policy', value: csp },
        ],
      },
    ];
  },
};

initOpenNextCloudflareForDev();

export default nextConfig;
