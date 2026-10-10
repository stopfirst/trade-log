#!/usr/bin/env bash
# 키움 클라우드 수집기 설치/업데이트 (Ubuntu 22.04/24.04, AWS Lightsail)
#   curl -fsSL https://raw.githubusercontent.com/stopfirst/trade-log/main/cloud/kiwoom-collector/install.sh | sudo bash
# 다시 실행하면 코드만 업데이트합니다(.env는 절대 덮어쓰지 않음).
# 옵션: KWC_REF=<커밋 또는 브랜치> (기본 main), KWC_TARBALL=/경로/kiwoom-collector.tar.gz (오프라인 설치)
set -euo pipefail
REF="${KWC_REF:-main}"
BASE="https://raw.githubusercontent.com/stopfirst/trade-log/${REF}/cloud/kiwoom-collector"
DIR=/opt/kiwoom-collector
SVC=kiwoom-collector
USR=kwcollector
FILES="package.json src/collector.ts src/adapters/kiwoom-journal.ts specs/kiwoom-journal-spec.json env.template kiwoom-collector.service"

say(){ printf '\n\033[1;36m==> %s\033[0m\n' "$*"; }
die(){ printf '\n\033[1;31m[중단] %s\033[0m\n' "$*" >&2; exit 1; }
[ "$(id -u)" -eq 0 ] || die "sudo 로 실행하세요:  curl -fsSL $BASE/install.sh | sudo bash"
command -v apt-get >/dev/null || die "Ubuntu/Debian(apt)에서만 지원합니다."

say "1/5 기본 패키지"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq curl ca-certificates gnupg nano >/dev/null

say "2/5 Node.js 24"
need_node=1
if command -v node >/dev/null; then
  major="$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0)"
  [ "${major}" -ge 24 ] && need_node=0
fi
if [ "$need_node" -eq 1 ]; then
  curl -fsSL https://deb.nodesource.com/setup_24.x | bash - >/dev/null
  apt-get install -y -qq nodejs >/dev/null
fi
node -e 'if(+process.versions.node.split(".")[0]<24)process.exit(1)' || die "Node 24 설치 실패"
echo "node $(node -v)"

say "3/5 수집기 파일 받기 (${REF})"
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
if [ -n "${KWC_TARBALL:-}" ]; then
  tar -xzf "$KWC_TARBALL" -C "$TMP"
  [ -d "$TMP/kiwoom-collector" ] && TMP_SRC="$TMP/kiwoom-collector" || TMP_SRC="$TMP"
else
  TMP_SRC="$TMP"
  curl -fsSL "$BASE/SHA256SUMS" -o "$TMP/SHA256SUMS" || die "SHA256SUMS 다운로드 실패 ($BASE)"
  for f in $FILES; do
    mkdir -p "$TMP/$(dirname "$f")"
    curl -fsSL "$BASE/$f" -o "$TMP/$f" || die "다운로드 실패: $f"
  done
fi
( cd "$TMP_SRC" && sha256sum -c --quiet SHA256SUMS ) || die "파일 무결성(SHA256) 확인 실패. 잠시 후 다시 실행하세요."

id -u "$USR" >/dev/null 2>&1 || useradd --system --home-dir "$DIR" --shell /usr/sbin/nologin "$USR"
mkdir -p "$DIR/src/adapters" "$DIR/specs"
for f in $FILES; do install -m 0644 -o root -g root "$TMP_SRC/$f" "$DIR/$f"; done
install -m 0644 -o root -g root "$TMP_SRC/SHA256SUMS" "$DIR/SHA256SUMS"

say "4/5 설정 파일(.env)"
if [ ! -f "$DIR/.env" ]; then
  install -m 0640 -o root -g "$USR" "$DIR/env.template" "$DIR/.env"
  echo "새 .env를 만들었습니다 (값은 비어 있음)."
else
  chown root:"$USR" "$DIR/.env"; chmod 0640 "$DIR/.env"
  echo "기존 .env 유지 (덮어쓰지 않음)."
fi

say "5/5 자동 실행(systemd) 등록"
install -m 0644 "$DIR/kiwoom-collector.service" "/etc/systemd/system/$SVC.service"
systemctl daemon-reload
systemctl enable "$SVC" >/dev/null 2>&1
if grep -q '여기에_붙여넣기' "$DIR/.env"; then
  systemctl stop "$SVC" 2>/dev/null || true
  cat <<'EOT'

설치 완료. 이제 .env에 값을 넣으세요:
  sudo nano /opt/kiwoom-collector/.env
    - 앱에서 복사한 3줄(SUPABASE_URL / SUPABASE_KEY / KW_COLLECTOR_TOKEN)
    - KIWOOM_APP_KEY / KIWOOM_SECRET / KIWOOM_ACCOUNT
    저장 Ctrl+O → Enter, 종료 Ctrl+X
그다음 시작하고 확인:
  sudo systemctl restart kiwoom-collector
  sudo journalctl -u kiwoom-collector -n 30 --no-pager
EOT
else
  systemctl restart "$SVC"
  sleep 3
  systemctl --no-pager --lines=0 status "$SVC" | head -n 3 || true
  echo
  echo "업데이트 완료 · 로그 보기: sudo journalctl -u kiwoom-collector -n 30 --no-pager"
  echo "과거 기록 채우기(백필): sudo systemctl stop kiwoom-collector && sudo -u kwcollector node --disable-warning=ExperimentalWarning --env-file=/opt/kiwoom-collector/.env /opt/kiwoom-collector/src/collector.ts --backfill 2026-01-01 ; sudo systemctl start kiwoom-collector"
fi
