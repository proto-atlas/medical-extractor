import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import './globals.css';

// SNS シェア時のプレビュー対策と SEO の最低限を満たすため、Next.js Metadata API で
// openGraph と twitter を明示する。
const SITE_TITLE = 'medical-extractor — 医療文書 SOAP 構造化抽出デモ';
const SITE_DESCRIPTION =
  '医療文書（架空データ）から SOAP 形式（Subjective / Objective / Assessment / Plan）を AI で構造化抽出するデモ。Anthropic Tool Use + Citations API。';
const SITE_URL = 'https://medical-extractor.atlas-lab.workers.dev';
const OG_IMAGE = '/opengraph-image.svg';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: SITE_TITLE,
  description: SITE_DESCRIPTION,
  openGraph: {
    type: 'website',
    siteName: 'medical-extractor',
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    images: [{ url: OG_IMAGE, width: 1200, height: 630, alt: SITE_TITLE }],
  },
  twitter: {
    card: 'summary',
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    images: [OG_IMAGE],
  },
};

// FOUC（ハイドレーション前のフラッシュ）防止のため、head で早期にテーマ class を適用する inline script。
// localStorage 未設定時は prefers-color-scheme に追従。
const themeInitScript = `(function(){try{var t=localStorage.getItem('medical-extractor.theme');var m=window.matchMedia('(prefers-color-scheme: dark)').matches;var d=(t==='dark')||(t!=='light'&&m);document.documentElement.classList.toggle('dark',d);}catch(e){}})();`;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ja" className="h-full antialiased" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="min-h-full bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
        {children}
      </body>
    </html>
  );
}
