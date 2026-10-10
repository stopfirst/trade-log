#!/usr/bin/env bash
# 매매일지 텔레그램 손실 한도 알림(trade-alert) 설치/업데이트 (Ubuntu 22.04/24.04, AWS Lightsail)
#   curl -fsSL https://raw.githubusercontent.com/stopfirst/trade-log/main/cloud/alert/install-alert.sh | sudo bash
# 다시 실행하면 코드만 업데이트합니다(.env와 알림 기록은 절대 덮어쓰지 않음).
# 키움 수집기(kiwoom-collector)와 별개의 서비스입니다. 수집기는 건드리지 않습니다.
# 옵션: TA_REF=<커밋 또는 브랜치> (기본 main)
set -euo pipefail
REF="${TA_REF:-main}"
BASE="https://raw.githubusercontent.com/stopfirst/trade-log/${REF}/cloud/alert"
DIR=/opt/trade-alert
SVC=trade-alert
USR=tradealert
STATE=/var/lib/trade-alert
KWC_ENV=/opt/kiwoom-collector/.env
FILES="package.json src/alert.mjs src/core.mjs src/hl-balance.cjs env.template trade-alert.service"

say(){ printf '\n\033[1;36m==> %s\033[0m\n' "$*"; }
die(){ printf '\n\033[1;31m[중단] %s\033[0m\n' "$*" >&2; exit 1; }
[ "$(id -u)" -eq 0 ] || die "sudo 로 실행하세요:  curl -fsSL $BASE/install-alert.sh | sudo bash"
command -v apt-get >/dev/null || die "Ubuntu/Debian(apt)에서만 지원합니다."

say "1/5 Node.js 확인"
need_node=1
if command -v node >/dev/null; then
  major="$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0)"
  [ "${major}" -ge 22 ] && need_node=0
fi
if [ "$need_node" -eq 1 ]; then
  export DEBIAN_FRONTEND=noninteractive
  apt-get update -qq
  apt-get install -y -qq curl ca-certificates gnupg nano >/dev/null
  curl -fsSL https://deb.nodesource.com/setup_24.x | bash - >/dev/null
  apt-get install -y -qq nodejs >/dev/null
fi
node -e 'if(+process.versions.node.split(".")[0]<22)process.exit(1)' || die "Node 22 이상 설치 실패"
echo "node $(node -v)"

say "2/5 알림 파일 받기 (${REF})"
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
curl -fsSL "$BASE/SHA256SUMS" -o "$TMP/SHA256SUMS" || die "SHA256SUMS 다운로드 실패 ($BASE)"
for f in $FILES; do
  mkdir -p "$TMP/$(dirname "$f")"
  curl -fsSL "$BASE/$f" -o "$TMP/$f" || die "다운로드 실패: $f"
done
( cd "$TMP" && sha256sum -c --quiet SHA256SUMS ) || die "파일 무결성(SHA256) 확인 실패. 잠시 후 다시 실행하세요."

id -u "$USR" >/dev/null 2>&1 || useradd --system --home-dir "$DIR" --shell /usr/sbin/nologin "$USR"
mkdir -p "$DIR/src"
for f in $FILES; do install -m 0644 -o root -g root "$TMP/$f" "$DIR/$f"; done
install -m 0644 -o root -g root "$TMP/SHA256SUMS" "$DIR/SHA256SUMS"
install -d -m 0700 -o "$USR" -g "$USR" "$STATE"

say "3/5 설정 파일(.env)"
if [ ! -f "$DIR/.env" ]; then
  install -m 0640 -o root -g "$USR" "$DIR/env.template" "$DIR/.env"
  echo "새 .env를 만들었습니다."
  if [ -f "$KWC_ENV" ]; then
    # 키움 수집기 .env에서 Supabase 3줄만 복사합니다(값은 화면에 출력하지 않음).
    copied=0
    for k in SUPABASE_URL SUPABASE_KEY KW_COLLECTOR_TOKEN; do
      line="$(grep -E "^${k}=" "$KWC_ENV" | tail -n 1 || true)"
      if [ -n "$line" ] && ! printf '%s' "$line" | grep -q '여기에_붙여넣기'; then
        awk -v k="$k" -v l="$line" 'BEGIN{FS="="} $1==k{print l; next} {print}' "$DIR/.env" > "$DIR/.env.tmp"
        cat "$DIR/.env.tmp" > "$DIR/.env"; rm -f "$DIR/.env.tmp"; copied=$((copied+1))
      fi
    done
    echo "키움 수집기 설정에서 Supabase 값 ${copied}/3줄을 복사했습니다."
  fi
else
  echo "기존 .env 유지 (덮어쓰지 않음)."
fi
chown root:"$USR" "$DIR/.env"; chmod 0640 "$DIR/.env"

say "4/5 자동 실행(systemd) 등록"
install -m 0644 "$DIR/trade-alert.service" "/etc/systemd/system/$SVC.service"
systemctl daemon-reload
systemctl enable "$SVC" >/dev/null 2>&1

say "5/5 시작"
if grep -q '여기에_붙여넣기' "$DIR/.env"; then
  systemctl stop "$SVC" 2>/dev/null || true
  cat <<'EOT'

설치 완료. 이제 .env에 텔레그램 값을 넣으세요:
  sudo nano /opt/trade-alert/.env
    - TELEGRAM_BOT_TOKEN (BotFather가 준 토큰)
    - SUPABASE_KEY / KW_COLLECTOR_TOKEN 이 '여기에_붙여넣기'로 남아 있으면 앱에서 복사한 값
    저장 Ctrl+O → Enter, 종료 Ctrl+X
대화방 번호 찾기(봇에게 먼저 아무 메시지를 보낸 뒤):
  sudo -u tradealert node --env-file=/opt/trade-alert/.env /opt/trade-alert/src/alert.mjs --find-chat
  → 나온 TELEGRAM_CHAT_ID=… 줄을 .env에 넣기
테스트 메시지:
  sudo -u tradealert node --env-file=/opt/trade-alert/.env /opt/trade-alert/src/alert.mjs --test
시작과 로그:
  sudo systemctl restart trade-alert
  sudo journalctl -u trade-alert -n 30 --no-pager
EOT
else
  systemctl restart "$SVC"
  sleep 3
  systemctl --no-pager --lines=0 status "$SVC" | head -n 3 || true
  echo
  echo "업데이트 완료 · 로그 보기: sudo journalctl -u trade-alert -n 30 --no-pager"
fi
