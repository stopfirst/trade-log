#!/usr/bin/env bash
# 시장 리스크 보드(riskboard 1.0.1) 설치/업데이트 — Ubuntu, AWS Lightsail
#   curl -fsSL https://raw.githubusercontent.com/stopfirst/trade-log/main/cloud/riskboard/install-riskboard.sh | sudo bash
# trade-alert와 별개 서비스이며 trade-alert는 건드리지 않습니다(텔레그램 설정만 읽음). 다시 실행하면 코드만 업데이트.
set -euo pipefail
REF="${RB_REF:-main}"
BASE="https://raw.githubusercontent.com/stopfirst/trade-log/${REF}/cloud/riskboard"
DIR=/opt/riskboard; USR=riskboard
FILES="package.json src/core.mjs src/riskboard.mjs env.template riskboard.service riskboard-now"
say(){ printf '\n\033[1;36m==> %s\033[0m\n' "$*"; }
die(){ printf '\n\033[1;31m[중단] %s\033[0m\n' "$*" >&2; exit 1; }
[ "$(id -u)" -eq 0 ] || die "sudo 로 실행하세요"

say "1/4 Node.js 확인"
if ! command -v node >/dev/null || ! node -e 'process.exit(+process.versions.node.split(".")[0]>=22?0:1)'; then
  export DEBIAN_FRONTEND=noninteractive
  apt-get update -qq; apt-get install -y -qq curl ca-certificates >/dev/null
  curl -fsSL https://deb.nodesource.com/setup_24.x | bash - >/dev/null; apt-get install -y -qq nodejs >/dev/null
fi
echo "node $(node -v)"

say "2/4 파일 받기 (${REF})"
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
curl -fsSL "$BASE/SHA256SUMS" -o "$TMP/SHA256SUMS" || die "SHA256SUMS 다운로드 실패"
for f in $FILES; do mkdir -p "$TMP/$(dirname "$f")"; curl -fsSL "$BASE/$f" -o "$TMP/$f" || die "다운로드 실패: $f"; done
( cd "$TMP" && sha256sum -c --quiet SHA256SUMS ) || die "파일 무결성(SHA256) 확인 실패"
id -u "$USR" >/dev/null 2>&1 || useradd --system --home-dir "$DIR" --shell /usr/sbin/nologin "$USR"
mkdir -p "$DIR/src"
for f in $FILES; do install -m 0644 -o root -g root "$TMP/$f" "$DIR/$f"; done
install -m 0755 "$TMP/riskboard-now" /usr/local/bin/riskboard-now

say "3/4 설정"
if [ ! -f "$DIR/.env" ]; then install -m 0640 -o root -g "$USR" "$DIR/env.template" "$DIR/.env"; echo "새 .env(기본값) 생성"; else echo "기존 .env 유지"; fi
if [ -f /opt/trade-alert/.env ] && grep -qE '^TELEGRAM_BOT_TOKEN=[0-9]+:' /opt/trade-alert/.env; then echo "텔레그램: trade-alert 설정 사용"
elif grep -qE '^(RB_BOT_TOKEN|TELEGRAM_BOT_TOKEN)=[0-9]+:' "$DIR/.env"; then echo "텔레그램: riskboard .env 사용"
else echo "⚠ 텔레그램 토큰을 못 찾았습니다. sudo nano $DIR/.env 에 TELEGRAM_BOT_TOKEN= / TELEGRAM_CHAT_ID= 를 넣은 뒤 sudo systemctl restart riskboard"; fi

say "4/4 자동 실행 등록"
install -m 0644 "$DIR/riskboard.service" /etc/systemd/system/riskboard.service
systemctl daemon-reload
systemctl enable riskboard >/dev/null 2>&1
systemctl restart riskboard
sleep 2; systemctl is-active --quiet riskboard && echo "riskboard 실행 중" || die "시작 실패: journalctl -u riskboard -n 50"
echo
echo "지금 보드 한 번 받아보기:  sudo riskboard-now"
echo "로그:                       journalctl -u riskboard -f"
echo "끄기:                       sudo systemctl disable --now riskboard"
