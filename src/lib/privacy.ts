// プライバシー警告の同意状態を localStorage に保存する小さなユーティリティ。
// 同意フラグは「ユーザーがバナー / モーダルを 1 度閉じた」事実だけを意味し、
// 法的同意や個人情報処理の同意ではない (デモアプリのため)。
//
// プライバシー警告バナー (架空データのみ使用してください)

export const PRIVACY_KEY = 'medical-extractor.privacy-acknowledged';

export function isPrivacyAcknowledged(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(PRIVACY_KEY) === '1';
  } catch {
    // プライベートブラウズ等で localStorage が使えない環境では未同意扱い
    return false;
  }
}

export function setPrivacyAcknowledged(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(PRIVACY_KEY, '1');
  } catch {
    // 失敗しても致命的ではない (次回アクセス時もモーダルが出るだけ)
  }
}
