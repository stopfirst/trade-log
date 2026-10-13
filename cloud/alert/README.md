# 매매일지 손실한도 판정 v1.2 (trade-alert 2.0.0 · alert2)

키움 수집기가 있는 같은 Lightsail 서버의 **별도 서비스**(`trade-alert`)입니다. alert1(1.0.0)을 같은 자리에서 업데이트합니다.
미국주식(키움)과 하이퍼리퀴드를 **각자 계좌 순자산 기준으로 따로** 판정하고, 텔레그램 알림 + Supabase 상태(앱 상단 '거래 중단 중' 배너) + 규칙 위반 기록을 남깁니다.
**주문을 내거나 취소하지 않습니다**(증권사·거래소를 막을 수 없음).

## 판정 기준
| | 미국주식(키움) | 하이퍼리퀴드 |
|---|---|---|
| 하루 경계 | 미국 장 마감 **16:00 ET**(서머타임 자동 · 한국 05:00/06:00). 거래일 = ET 날짜, **NYSE 휴장일 제외**. 16:00 이후 애프터·주말 체결은 다음 거래일 몫 | **한국시간 24:00**(KST 자정). 매일 |
| 계좌 순자산 | 주식 평가금액(ust21070) + USD 예수금(ust21160) = 앱 ACCOUNT BASIS | BALANCE(앱과 같은 계산: USDC Spot + 전체 USDC Perps) |
| 자산 갱신 | 키움 수집기 스냅샷: 체결·수량 변화는 즉시, **시세만 바뀌면 최대 10분마다**(`KW_PRICE_PUSH_MIN`) | 매 확인(1분)마다 직접 조회 |
| 입출금 제외 | 키움 API에 입출금 내역이 없어 **추정**: 스냅샷 사이 `예수금 변화 + 체결 매수대금 − 매도대금`이 ±$50 이상이면 입출금(환전·배당 포함)으로 보고 제외. 수동 등록도 가능 | `userNonFundingLedgerUpdates`(입금·출금·이체·볼트) 그대로 제외. spot↔perp 이동은 0 |
| 진입 감지 | 매수 체결(키움 주문, 한국 날짜+시각) | 포지션이 커지거나 새로 생기거나 방향이 바뀌는 체결(무기한만) |

- 손익 = 현재 자산 − 기간 시작 자산 − 기간 중 입출금, % = 손익 ÷ **기간 시작 자산(고정 분모)**. 수수료·펀딩·미실현 포함.
- **하루 −3%**: 1분마다 확인 → 도달 즉시 그날 끝까지 신규 진입 중단.
- **주 −6% / 달 −10%**: 매일 마감에 공식 판정 → 다음 거래일부터 그 주/달 마지막 거래일 끝까지 중단. 장중에 닿으면 그날 끝까지 즉시 중단(마감에 회복하면 다음 날부터 해제). 기간 마지막 거래일의 마감 판정은 남은 날이 없어 추가 중단 없음.
- **연속 손실**: 하루 자산 변화 ≤ −0.5%(입출금 제외)인 날만 손실일, 거래 없는 날은 건너뜀. 3일 연속 → 다음 1거래일 중단. 발동 후 카운트는 새로 시작.
- **재시작**: 어떤 중단이든 끝난 뒤 첫 거래일 = 1회 위험 % 절반(앱 포지션 계산기가 자동으로 절반을 쓰고 이유를 표시).
- **기간 고점 대비 하락폭**: 앱·요약에 참고로만 표시(중단 아님).
- 중단 중 새 진입이 수집되면 🚫 위반 알림 + `risk_events`(violation) 기록 → 앱 거래 목록에 '규칙 위반' 표시.
- 기간 시작 자산: 경계 직전 서버 관측값 → (없으면) 미국=키움 장 마감 잔액(acct_snapshots), HL=portfolio 기록 근사 → (없으면) 그 기간의 가장 이른 기록(‘근사’ 표시). 설치한 주·달은 근사일 수 있습니다.

## 설치/업데이트 (Lightsail 브라우저 SSH)
1. Supabase → SQL Editor → `alert2.sql` 전체 붙여넣고 Run (다시 실행해도 안전, alert.sql은 그대로 둬도 됨).
2. `curl -fsSL https://raw.githubusercontent.com/stopfirst/trade-log/main/cloud/alert/install-alert.sh | sudo bash`
   (.env·기존 기록 유지. 기존 .env 끝에 v1.2 설정 안내 주석을 덧붙임.)
3. 확인: `sudo -u tradealert node --env-file=/opt/trade-alert/.env /opt/trade-alert/src/alert.mjs --test`
   → 텔레그램에 "✅ 손실한도 판정 v1.2 테스트" + 시장별 오늘/주/달 % 가 오면 정상.
4. 로그: `sudo journalctl -u trade-alert -n 30 --no-pager` (`trade-alert 2.0.0 시작 · 손실한도 판정 v1.2 …`)

새로 설치하는 경우 텔레그램 봇 만들기·`--find-chat`은 alert1과 같습니다(`.env`의 TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID).

## 관리 명령
```
A="sudo -u tradealert node --env-file=/opt/trade-alert/.env /opt/trade-alert/src/alert.mjs"
$A --once --dry-run                 # 지금 판정만 출력(보내지·저장하지 않음)
$A --flow US 500 "원화 환전 입금"     # 입출금 수동 등록(+입금 / −출금, 지금 시각) — 추정이 놓친 경우
$A --flow-remove manual:US:…        # 수동 등록 취소
$A --clear-stops US                 # 잘못 걸린 중단 해제(기록 남김)
```
설정 바꾸기: `sudo nano /opt/trade-alert/.env` → `sudo systemctl restart trade-alert` (키 목록은 env.template).
alert1의 `LOSS_STREAK_N`, `INCLUDE_UNREALIZED`, `US_LIMITS_PCT`, `CHECK_ACTIVE_SEC` 등은 2.0.0에서 쓰지 않습니다(무시).
앱 설정의 손실 한도(하루·주·달 %)는 앱 자체 표시용이고, 서버 판정은 `.env`(기본 3/6/10)를 씁니다. 앱 설정 → 계좌·위험에 서버 값이 그대로 보입니다.

## 테스트(개발)
`node --test tests/*.test.mjs` · SQL: `node tests/alert2-sql.pglite.mjs cloud.sql kiwoom-collector.sql hl-collector.sql balance-snapshot.sql alert2.sql fixtures` (@electric-sql/pglite)

## 보안
- 비밀값은 `/opt/trade-alert/.env`(root:tradealert 0640)에만. 로그에 토큰·키를 `[비공개]`로 가림. secret/service_role 키 거부.
- Supabase 쓰기는 `risk_push`(수집기 토큰 주인 행만), 앱은 RLS로 본인 행만 읽기. 하이퍼리퀴드는 공개 /info 읽기만.
