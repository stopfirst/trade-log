# 매매일지 텔레그램 손실 한도 알림 (trade-alert 1.0.0 · alert1)

키움 수집기가 있는 같은 Lightsail 서버에서 **별도 서비스**(`trade-alert`)로 동작합니다.
수집기가 멈춰도 알림 서비스는 따로 돌고, 알림 서비스가 멈춰도 수집기는 영향을 받지 않습니다.
Node 22 이상(서버는 Node 24), 외부 패키지 없음.

## 무엇을 보나
Supabase `alert_status(토큰)` 한 번 호출로 내 데이터만 읽습니다(쓰기 없음, 수집기와 같은 분당 60회 한도 공유).
- **미국주식**: 키움 수집 스냅샷의 일별 순실현손익(ust21640) + 앱에 저장된 수동 기록.
  앱과 같은 규칙: 키움 일별 보고가 있는 날짜는 키움 합계만, 없는 날짜는 수동 기록 손익(평균단가, 수수료 포함).
  날짜 기준도 앱과 같습니다: 키움 자동기록이 있으면 **한국 날짜**, 수동 기록만 있으면 **미국 동부 날짜**.
- **하이퍼리퀴드**: 클라우드 수집(hl_fills/hl_funding)의 `closedPnl − fee` + 펀딩(앱과 같이 포함), **UTC 날짜**.
  HL 수집을 쓰지 않으면 앱에 저장된 일지(거래·미배정 펀딩)로 계산합니다.
- **한도**: 앱 설정 → 계좌·위험의 손실 한도(하루·주·달 %) × 계좌 기준액. 주는 월요일 시작, 달은 달력 월.
  계좌 기준액: 미국주식 = 키움 총 계좌금액(주식 평가 + USD 예수금) → 없으면 앱 계좌 기준액.
  하이퍼리퀴드 = 하이퍼리퀴드 BALANCE(공개 /info 조회, 앱과 같은 계산) → 실패 시 앱 계좌 기준액.

## 규칙(기본값, .env로 변경)
| 규칙 | 기본 | 설정 |
|---|---|---|
| 한도 도달 알림 | 50%·80%·100%, 기간(하루/주/달)마다 각 1회. 한 번에 여러 단계를 넘으면 가장 높은 단계 1건만 | `ALERT_THRESHOLDS=50,80,100` |
| 연속 손실 | 최근 종료 거래 3연속 손실부터, 이후 손실마다 1회 | `LOSS_STREAK_N=3`, `LOSS_STREAK_REPEAT=1` (0: 연속 구간당 1회) |
| 한도 미설정 | 해당 한도 규칙 건너뜀, 서비스 시작 때 1회 안내 | — |
| 미실현 손익 | 제외(실현만) | `INCLUDE_UNREALIZED=1` (키움 보고 평가손익 / HL unrealizedPnl을 모든 기간에 더함) |
| 확인 주기 | 미국 동부 04:00–20:00 평일 60초, 그 외 600초 | `CHECK_ACTIVE_SEC`, `CHECK_IDLE_SEC`, `HL_ALWAYS_ACTIVE=1` |
| 일일 요약 | 평일 미국 동부 16:15 이후 1회 | `DAILY_SUMMARY=0`, `DAILY_SUMMARY_TIME_ET=16:15` |
| 앱 값 대신 | 비움(앱 설정 사용) | `US_LIMITS_PCT=2,5,10`, `HL_LIMITS_PCT`, `US_ACCOUNT_BASIS`, `HL_ACCOUNT_BASIS` |

중복 방지 기록: `/var/lib/trade-alert/state.json` (재시작해도 같은 기간·같은 단계는 다시 보내지 않음, 45일 지난 기록 정리).
텔레그램 전송이 실패하면 기록하지 않고 다음 확인 때 다시 보냅니다.

메시지 예:
```
🔔 미국주식 오늘 손실 -$260.00 · 하루 한도 $500.00의 52%
⚠️ 미국주식 오늘 손실 -$412.30 · 하루 한도 $500.00의 82%
⛔ 미국주식 오늘 손실 -$510.00 · 하루 한도 $500.00 도달(102%)
🔻 하이퍼리퀴드 연속 손실 3회 · 최근 ETH -$41.64, BTC -$12.10, SOL -$3.00
📊 일일 요약 · 미국 10/12 장 마감 후
```

## 설치 순서 (Lightsail 브라우저 SSH)
1. 텔레그램에서 `@BotFather` → `/newbot` → 이름·아이디 입력 → 받은 토큰(`123456789:AA…`) 보관.
2. 만든 봇 대화방을 열고 **시작(Start)** 또는 아무 메시지(예: `안녕`) 보내기.
3. Supabase → SQL Editor → `alert.sql` 전체 붙여넣고 Run (다시 실행해도 안전).
4. 서버 설치:
   ```
   curl -fsSL https://raw.githubusercontent.com/stopfirst/trade-log/main/cloud/alert/install-alert.sh | sudo bash
   ```
   키움 수집기 `.env`가 있으면 Supabase 3줄(SUPABASE_URL / SUPABASE_KEY / KW_COLLECTOR_TOKEN)을 자동 복사합니다(화면 출력 없음).
5. `.env` 입력: `sudo nano /opt/trade-alert/.env` → `TELEGRAM_BOT_TOKEN=` 에 1번 토큰.
6. 대화방 번호와 테스트:
   ```
   sudo -u tradealert node --env-file=/opt/trade-alert/.env /opt/trade-alert/src/alert.mjs --find-chat
   ```
   나온 `TELEGRAM_CHAT_ID=…` 줄을 `.env`에 넣고
   ```
   sudo -u tradealert node --env-file=/opt/trade-alert/.env /opt/trade-alert/src/alert.mjs --test
   ```
   텔레그램에 "✅ 매매일지 알림 테스트" + 현재 오늘/주/달 손익과 한도 비율이 오면 정상.
7. 시작·로그:
   ```
   sudo systemctl restart trade-alert
   sudo journalctl -u trade-alert -n 30 --no-pager
   ```

## 관리
- 1회 점검(보내지 않고 출력만): `sudo -u tradealert node --env-file=/opt/trade-alert/.env /opt/trade-alert/src/alert.mjs --once --dry-run`
- 업데이트: 4번 명령 다시 실행(.env·알림 기록 유지).
- 멈춤: `sudo systemctl disable --now trade-alert`
- 테스트(개발): `node --test tests/*.test.mjs`, SQL: `node tests/alert-sql.pglite.mjs cloud.sql kiwoom-collector.sql hl-collector.sql alert.sql fixtures` (@electric-sql/pglite 필요)

## 보안
- 비밀값은 `/opt/trade-alert/.env`(root:tradealert 0640)에만. 로그에는 봇 토큰·수집기 토큰·Supabase 키를 `[비공개]`로 가립니다.
- Supabase secret/service_role 키는 거부합니다(publishable 키만).
- `alert_status`는 토큰 주인의 데이터만, 사진·메모·복기 문장 없이 숫자만 돌려줍니다.
