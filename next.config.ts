import type { NextConfig } from 'next';
import { initOpenNextCloudflareForDev } from '@opennextjs/cloudflare';

const nextConfig: NextConfig = {
  // OpenNext Cloudflare が .next/standalone/ を参照するため必須（pages-manifest.json 欠落エラー回避）
  output: 'standalone',
  // x-powered-by: Next.js を出力しない (情報露出の最小化)
  poweredByHeader: false,
  turbopack: {
    root: import.meta.dirname,
  },
  // 非機能要件「セキュリティヘッダ」対応
  // (nosniff / X-Frame-Options / Referrer-Policy / Permissions-Policy / HSTS / CSP)
  async headers() {
    // CSP: 1 行で組み立てるとレビュー時に読みづらいため配列で組成
    // 注意: next dev (development) では React の debug 機能が eval() を使うため
    // CSP 警告がコンソールに出る (Next.js 公式 CSP ガイド参照:
    // https://nextjs.org/docs/app/guides/content-security-policy)。本番
    // (next build --webpack) では eval 不使用なので 'unsafe-eval' を含めない方針。
    // dev 時の警告は機能影響なし (Chromium E2E 10 件は pass、警告は既知制約)。
    const csp = [
      "default-src 'self'",
      // Next.js のハイドレーションスクリプトと layout.tsx の theme 初期化スクリプトが
      // インラインなので 'unsafe-inline' が必要 (nonce 化は将来課題)。
      "script-src 'self' 'unsafe-inline'",
      // Tailwind v4 はインラインスタイルではなく単一の CSS ファイルだが、
      // React の inline style 用に 'unsafe-inline' を入れる
      "style-src 'self' 'unsafe-inline'",
      // og-image / favicon / inline data URI / Blob (エクスポート時の preview)
      "img-src 'self' data: blob:",
      "font-src 'self' data:",
      // /api/auth と /api/extract は同 origin。外部 API 直叩きはなし
      "connect-src 'self'",
      // X-Frame-Options DENY と整合。CSP 側で重複指定して古いブラウザ + 新規をカバー
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
          // 注意: VoiceInputButton (Web Speech API) のため microphone は self 許可必須。
          // 全 origin disallow にすると音声入力機能が permission 拒否で動かない。
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(self), geolocation=()',
          },
          // Cloudflare Workers は常時 HTTPS、サブドメインも対象
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
