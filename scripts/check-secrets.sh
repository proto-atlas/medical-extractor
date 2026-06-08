#!/usr/bin/env bash
# CI向けのsecret pattern検出。
# 公開してよい一般的なsecret prefixのみを対象にし、ヒット値は出力しない。

set -eu

cd "$(dirname "${BASH_SOURCE[0]}")/.."

# GitHub PAT / Anthropic API Key / Google API Key / AWS Access Key のプレフィックス。
# 長さは実在フォーマットに合わせて下限を指定。
SECRET_PATTERNS='ghp_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{50,}|sk-ant-[A-Za-z0-9_\-]{20,}|sk-proj-[A-Za-z0-9_\-]{20,}|AIza[A-Za-z0-9_\-]{35}|AKIA[A-Z0-9]{16}'

EXCLUDES=(
  --exclude-dir=node_modules
  --exclude-dir=.git
  --exclude-dir=.next
  --exclude-dir=.nuxt
  --exclude-dir=.output
  --exclude-dir=dist
  --exclude-dir=build
  --exclude-dir=coverage
  --exclude-dir=playwright-report
  --exclude-dir=test-results
  --exclude-dir=.wrangler
  --exclude-dir=.open-next
  --exclude-dir=.husky
  --exclude=".env"
  --exclude=".env.*"
  --exclude=".dev.vars"
  --exclude="check-secrets.sh"
)

echo "Scanning for secret patterns (CI-safe subset)..."
hits="$(grep -rnE "${EXCLUDES[@]}" -- "$SECRET_PATTERNS" . 2>/dev/null || true)"

if [ -z "$hits" ]; then
  echo "OK: secret patterns not found"
  exit 0
fi

# ヒット値そのものは出力しない（transcript / ログ露出回避）。
count=$(printf '%s\n' "$hits" | wc -l | tr -d ' ')
echo "!! HIT: $count 件の secret らしき文字列を検出"
echo "値は伏字表示。該当行を確認して削除すること:"
printf '%s\n' "$hits" | awk -F: 'NF>=3 {printf "  %s:%s: [REDACTED]\n", $1, $2}' | head -20
exit 1
