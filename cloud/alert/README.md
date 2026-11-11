# 매매일지 손실한도 판정 v1.6 (trade-alert 2.17.0 · alert21)

## 2.17.0 — 앱 v126 '새 출발' 기준 시각(SQL alert21.sql · 기본 켜짐, 앱에서 새 출발했을 때만 동작 · `FRESH_START=0` = 2.16.0)

- **읽는 것**: 앱 일지 `settings.v126`(기준 시각 cutoff · 세대 epoch · 새 출발 시점 계좌 가치 eq · 이월 id)만. Supabase `fresh_status(token)`(alert21.sql)로 5분마다. 거래·복기·보관함(`v126Archive`)은 안 나감.
- **판정**: 그 시각 이전 체결·펀딩(HL 주계정·탄창·Supabase 수집분, 키움 주문)을 뺀 뒤 기존 판정 그대로 — 손실 한도 하루·주·월 · 연속 손실 · 복수매매 · 방향 전환 · 즉시 복기 · 탄창 점검. 이월 포지션은 새 출발 뒤 청산분부터.
- **분모**: 새 출발이 든 하루·주·월 = 앱이 저장한 새 출발 시점 계좌 가치(`새 출발 시점 $X`). 다음 날·다음 주·다음 달부터는 평소(직전 마감).
- **경계**: 기존 '한도 기준일'(RISK_START_DATE) 구조를 그대로 씀 — 기준 시각 = cutoff. `.env RISK_START_DATE`가 더 늦으면 그쪽. 새 출발 전 손실로 걸린 거래 중단은 해제(🔄 1회 · risk_events clear/risk-start).
- **US(키움)**: 일별 실현손익은 하루 합계뿐이라 새 출발 날은 '서버가 새 출발을 처음 본 때의 그날 합계'를 뺌(근사 — 서버가 늦게 알면 그 사이 실현은 빠짐).
- **취소**: 앱에서 '새 출발 취소' → 5분 안에 전체 체결로 돌아감. 매일 복기 알림은 앱 일지(활성 거래)를 읽어 원래 새 출발 뒤만.
- alert21.sql이 없으면 2.16.0과 같음(로그 WARN 1회). harden 뒤에 실행했으면 alert21.sql 한 번 더. 되돌리기: `drop function if exists public.fresh_status(text);` 또는 `.env FRESH_START=0`.


## 2.16.0 — HL 하위계정 '탄창'(앱 v123과 같은 규칙 · SQL alert20.sql · 기본 켜짐, 탄창이 정해졌을 때만 동작 · `MAG=0` = 2.15.0)
사용자 규칙: 매일 HL 하루 시작(UTC 00:00 = 09:00 KST)에 계좌의 2%(= 하루 손실 한도)만 하위계정 하나('탄창')에 넣고 그 계정으로만 거래, 장중 재충전 금지, 주계정 = 금고.
- **탄창 목록**: 앱 설정(일지 `state.settings.v123Subs`, Supabase `mag_status`로 읽음) → 비었거나 alert20.sql이 없으면 `.env HL_SUBS`. 앱 제외 목록 `v123Ex`(없으면 Scalping), 주계정, Scalping `0x2b4f…eea9`는 항상 뺌. 최대 5개. 주계정의 하위계정 목록(`subAccounts`)에 없는 주소는 뺌(로그 1회).
- **손실 한도(하루·주·월·연속)**: 실현손익 = 주계정 + 탄창 체결 Σ(closedPnl − fee) + 펀딩. 분모 = 주계정 마감(acct_snapshots, 현물 포함) + 탄창 마감(탄창 HL portfolio 기록점: 마감 직전 4시간 안 → 직후 4시간 안 → 앞뒤 값이 같으면 그 값, 근삿값 — 앱과 같음). 그 날 탄창 마감값을 모르면 그 날 분모는 주계정만(섞인 숫자 안 만듦, `--test`에 '탄창 마감값 확인 중'). 현재 기준액 = 주계정 BALANCE + 탄창 잔고(앱 v123Bal, HIP-3 dex 제외). 탄창 잔고(`subAccounts`)를 10분 넘게 모르면 그 회차 HL 판정은 건너뜀.
- **주↔탄창(·탄창끼리) 이체**(send·subAccountTransfer·internalTransfer·spotTransfer, USDC)는 입출금이 아님 — risk_flows에 안 올리고 판정에서도 뺌.
- **새 텔레그램 알림**(각 1회, `.env`로 끔): `🧯 탄창 소진 · 오늘 매매 끝`(탄창 잔고 < 목표의 10%, 그날 탄창 체결 뒤 · `MAG_EMPTY_ALERT`) · `⚠️ [장중 재충전]`(같은 HL 하루 첫 탄창 체결 뒤 주계정→탄창 이체 · `MAG_REFILL_ALERT`) · `⚠️ [금고에서 거래]`(주계정 새 무기한 진입, 주문마다 · 앱 v123Since 뒤 · `MAG_VAULT_ALERT`) · `🔔 탄창 09:00 점검`(09:10 KST 뒤 첫 확인, 12:00 KST 전, 탄창 잔고가 목표 = 직전 마감 합산 × 2%와 ±10% 넘게 다르면 · `MAG_OPEN_ALERT`). 목표 % = 앱 `v123Pct` → `MAG_PCT`(2).
- **복수매매·방향 전환·즉시 복기**: 탄창 체결도 계정별로 구간을 만든 뒤 합침(쿨다운·오늘은 여기까지·위험 증가가 두 계정을 함께 봄 — 탄창 손실 뒤 주계정 진입도 경고). 매일 복기 알림은 일지 기반이라 앱이 넣은 탄창 거래도 그대로 대상.
- **Supabase alert20.sql**: 새 cron `hl-sub-collector`가 탄창 주소의 체결·펀딩을 같은 `hl_fills`·`hl_funding`에(주소 = 탄창) 수집, 기존 `hl-collector`·`hl_watch`·주계정 행은 그대로(unique(address,tid) → 중복 없음). 앱은 `address=eq.주계정`으로 읽어 섞이지 않음. `mag_status` RPC(토큰). harden 뒤에 실행했으면 alert20.sql 한 번 더.
- **오늘 탄창 보기**(보내지 않음·저장 안 함): `sudo -u tradealert node --env-file=/opt/trade-alert/.env /opt/trade-alert/src/alert.mjs --mag-dry`(= `--dry`).
- 한계: 탄창 HIP-3 dex 잔고 미포함 · 마감값은 portfolio 근삿값 · 서버 백업(alert13 backup_dump)은 주계정 hl_fills만 · 설치 첫날 '미실현 포함 변동' 참고 줄은 하루 시작 관측이 주계정만이라 틀릴 수 있음.


## 2.15.0 — 복수매매 '오늘은 여기까지' = 같은 날 연속 손실 청산 3회(SQL 없음 · 손실 한도·쿨다운·갈아타기·위험 증가·방향 전환·백업 변경 없음)
- 같은 하루(HL UTC 00:00 = KST 09:00 / US 16:00 ET) 안에서 **청산 순서대로** 손실이면 +1, **이익 청산(순손익 > 0, 수수료·펀딩 포함)이면 0으로**, 순손익 정확히 0이면 그대로(`REVENGE_MIN_LOSS_USD` 이하 손실도 그대로).
  `DAILY_LOSS_STREAK_MAX`(기본 3)에 닿으면 `🛑 [오늘은 여기까지] … 오늘 연속 손실 3회` 1회, 그 뒤 그날 진입마다 `⛔ [오늘은 여기까지 위반] … 연속 손실 3회 뒤 진입`(도달 뒤 이익 청산이 와도 그날은 계속 — 2.14.0과 같음).
  예: 손-이-손-손 = 알림 없음(2.14.0은 있었음) · 손-손-손 = 있음 · 손-0-손-손 = 있음.
- 바뀌는 범위: 복수매매 규칙 3(오늘은 여기까지·그 뒤 진입 위반) + 매일 복기 알림 단타 예외 `n연패 후 진입`(scalp.mjs v99Flags, 앱 설정 v99MaxLoss). 둘 다 `revenge.mjs streakReach` 하나로 셈.
  쿨다운(규칙 1)·US 갈아타기(규칙 2, N회 기준을 쓰지 않음)·위험 증가(규칙 4)는 그대로.
- 되돌리기(코드 그대로): `.env` `DAILY_LOSS_STREAK_MODE=count` → 2.14.0 횟수 방식·문구('손실 청산 3회'). 기본 `consecutive`.
- 앱(v123까지)의 v99 '3연패 후 진입' 표시는 아직 횟수 방식 → 앱 v124 전까지 손-이-손-손 같은 날은 앱엔 표시·서버 복기 알림엔 없음(단타 예외만 차이).
- 지난 체결로 비교: `--revenge-dry`(기본 연속) · `DAILY_LOSS_STREAK_MODE=count node … --revenge-dry`(예전).

## 2.14.0 — 매일 복기 알림에서 단타 제외(앱 v121·v122와 같은 판정 · 손실 한도·백업·존·복수매매·방향 전환 변경 없음 · 기본 켜짐 · SQL alert18.sql)
계기: 스캘핑은 거래마다 일지를 쓰지 않음(앱 v121에서 보유 30분 미만 = 단타로 따로). 텔레그램 복기 알림도 같은 기준으로 맞춤.
- **단타** = 끝난 거래에서 포지션이 0→0으로 열고 닫힌 왕복마다 보유를 재고 가장 긴 왕복 < 기준 분(앱 v122 — 수집 거래는 왕복 1번 = 첫 진입~마지막 청산). 기준 = 앱 설정 '단타 기준 · 분'(`settings.v121Min`) → 없으면 `.env` `SCALP_MIN`(기본 30). `SCALP_MIN=0`이면 끔(2.13.0까지와 같음).
  시각 = 체결 timestamp, 없으면 HL = UTC 날짜·시각, 미국 = 미국 동부 벽시계(앱 v99와 같음). 진행 중·시각 모르는 거래는 판정 안 함(스윙).
- 예외 없는 단타는 빈 칸 알림·건수에서 빠지고 메시지에 `단타 n건 제외 · 보유 30분 미만 (규칙 위반·−1R 넘긴 손실은 남김)` 한 줄(0건이면 없음).
- **예외(단타여도 남음, 앱 v121Exc와 같은 문구)**: 규칙 위반(저장한 위반·청산 위반 표시·서버 거래 중단 중 진입·복수매매 의심·n연패 후 진입·위험 키움·갈아타기 '강해 보여서', 앱에서 ×로 숨긴 감지는 뺌) · 손익비 기준 미달 · 포지션 위험/총 오픈 위험 초과 · 실현 R < −1(수수료·HL 펀딩 포함). 남은 단타 줄 끝에 `[단타 10분 · 예외: …]`.
- 단타를 빼고 대상이 없거나, 남은 게 빈 칸 없는 예외 단타뿐이면 **안 보냄**(로그만).
- Supabase: **alert18.sql 실행**(review_gaps v12 — v11 칸 그대로 + 체결가·수수료·timestamp·1R·HL 펀딩 합·위반 여부(라벨 아님)·v99Why·v109 숨김 키·서버 중단 중 진입 여부·설정 몇 개. 메모 본문·사진은 여전히 안 나감, 읽기 전용, 데이터 변경 없음).
  alert18.sql이 없으면 단타 제외 없이 예전처럼 알림 + 로그 WARN 1회. 되돌리기 = alert11.sql 다시 실행.
- 미리 보기(보내지 않음·저장 안 함): `sudo -u tradealert node --env-file=/opt/trade-alert/.env /opt/trade-alert/src/alert.mjs --remind-dry [--day 2026-11-04]` — 그날(기본 어제) 알림 문구·뺀 단타·남은 예외 단타.
- `--test` '매일 복기 알림' 줄에 alert18.sql 확인·단타 제외 상태·어제 뺀 건수. 시작 로그에 '매일 복기 알림 단타 제외 켜짐…'.
- 한계: 앱 v37 '한도 도달 뒤 진입'은 앱 장부 기준이라 서버는 자기 거래 중단 판정(중단 중 진입)으로 대신함. 위험 초과 기준액은 거래의 acctAt → 설정 account(앱은 그 사이 전일 마감 잔액·HL 실시간 잔액도 봄).


## 2.13.0 — HL 포지션 방향 전환 감지(손실 한도·백업·존·복수매매·복기 변경 없음 · 기본 켜짐 · 기록용 SQL alert17.sql)
계기: 주문창에 남은 수량을 reduce-only 없이 반대로 내 롱 청산 + 숏 진입(11-03 kPEPE). 같은 코인(HIP-3 `dex:COIN` 포함, 현물 제외) 포지션이 롱↔숏으로 바뀌면 바로 경고합니다. 주문을 막지 않습니다(알림만).
- 규칙
  1. **한 주문 반전**: 한 주문(oid)의 체결로 포지션 부호가 바뀜(HL 체결 `dir` 'Long > Short'/'Short > Long', 또는 0으로 닫는 체결 + 같은 주문의 반대 진입 체결). = reduce-only 아닌 주문이 기존 포지션을 넘어 반대 포지션을 연 경우.
  2. **청산 뒤 반대 진입**: 포지션이 0으로 청산된 뒤 `FLIP_WINDOW_MIN`(기본 5)분 이내(정각 포함) 다른 주문으로 반대 방향 진입(청산 마지막 체결 → 진입 첫 체결).
- 메시지 `🔄 [방향 전환 의심]`: 코인, 이전/현재 방향·수량(현재 = 감지 시점), 체결가, 시각(KST, 초까지), 주문 oid·주문 종류·TIF·주문 수량·**reduce-only 여부**(공개 /info `orderStatus`, 실패하면 '체결로 판단'), 창 규칙이면 청산 시각·oid, 마지막 줄 'Positions 탭의 Close로만 청산' 안내.
- 같은 주문은 한 번만(키 `flip:hl:<coin>:<oid>`, 보내기 전에 state2.json `flip.sent`에 저장 → 재시작해도 다시 안 보냄). 설치 전·6시간 넘은 체결은 보내지 않음. 전송 실패는 2시간 재시도. 같은 주문 체결이 뒤에 더 붙으면 메시지 없이 기록 크기만 갱신.
- 확인 주기 = 기존 HL 확인 루프(RISK_CHECK_SEC, 기본 60초) — 체결 뒤 최대 약 1분 안에 경고.
- 기록: **alert17.sql**(`flip_alerts` 표 + `flip_push`). 앱이 '주문 실수' 태그를 붙일 때 읽음(앱 v111 몫). SQL이 없으면 텔레그램은 그대로, 기록은 서버 대기열(최대 200)에 두었다가 설치되면 올림.
  harden-2026-11.sql은 flip_push를 허용 목록에 안 갖고 있으므로 **harden 먼저, alert17.sql 나중**(뒤에 harden을 다시 돌렸으면 alert17.sql 한 번 더).
- 지난 체결로 몇 건 나왔을지(보내지 않음·저장 안 함): `sudo -u tradealert node --env-file=/opt/trade-alert/.env /opt/trade-alert/src/alert.mjs --flip-dry --from 2026-10-01 --to 2026-10-31` (`--address 0x…`, `--no-orders` 선택)
- `.env`(선택): `FLIP_ALERT=1`(0 = 끔) · `FLIP_WINDOW_MIN=5`(0 = 창 규칙 끔, 최대 60).

## 2.12.0 — 매일 복기 알림 = 앱 v106 '일지 빈 칸'과 같은 판정(손실 한도·백업·존·복수매매 변경 없음 · .env 추가값 없음)
- 손익비: 계획 손익비(plan0.rr 또는 최초 손절·목표로 계산)가 **기록돼 있으면 기준(v92MinRR) 미달이어도 빈 칸 아님**. 빈 칸은 손익비 '미기록'일 때만.
  (기준 미달 표시는 앱 거래 상세 '진입 전 체크' 카드에 그대로 남음. 'LTF 진입인데 HTF 청산' ⚠️는 앱과 같이 그대로 빈 칸.)
- 앱 대시보드·복기 빈 칸 목록에서 **×로 숨긴 거래(t.v92Hide)는 알림에서도 뺌**(건수에도 안 셈). 앱에서 '다시 보기'하면 다음 날 알림부터 다시 나옴.
- Supabase: **alert11.sql 다시 실행**(review_gaps가 거래마다 `hide` = t.v92Hide를 더 줌, 읽기 전용·데이터 변경 없음). 예전 SQL 그대로면 손익비 판정은 바뀌지만 숨긴 거래는 계속 나오고, 로그에 'alert11.sql이 예전 판' 경고 1회.

## 2.11.0 — 복수매매 차단 알림(판정·백업·존 로직 변경 없음 · 기본 켜짐 · 기록용 SQL alert15.sql)
손실 직후 감정 진입을 텔레그램으로 바로 경고합니다. 주문을 막거나 취소하지 않습니다(알림만). HL·미국주식 각각 따로 봅니다.
- 정의(앱 v99와 같게): 기준 시각 = **손실 청산 체결 시각 → 다음 진입 체결 시각**. 손실 = 그 거래(포지션 0 → 0 구간) 누적 실현손익 < 0
  (HL = Σ(closedPnl − fee) + 구간 펀딩, 즉시 복기와 같은 계산 · US = 키움 일별 종목별 실현손익 ust21640 `pl_amt`(수수료·세금 뺀 값)).
  새 진입 = 포지션이 0에서 열리거나 방향이 바뀌는 체결(같은 포지션 추가 매수는 새 진입 아님). 하루 = HL UTC 00:00(KST 09:00) · US 16:00 ET(손실 한도와 같음).
- 규칙
  1. **쿨다운**: 진입 전 마지막 손실 청산에서 `REVENGE_COOLDOWN_MIN`(기본 15)분 이내(정각 포함) 새 진입 → `🚨 [복수매매 의심]` (직전 손실 종목·손익·경과 분). 사이에 이익 청산이 있어도 기준은 마지막 손실 청산(앱 v99와 같음).
  2. **US 손절 후 갈아타기**: 손절한 거래일에 그날 손절한 종목과 다른 종목 매수 → 별도 메시지 `🔁 [손절 후 종목 갈아타기]` + 버튼 **[미리 정한 가격] [강해 보여서]**.
     답은 Supabase `revenge_alerts.why`(`plan`/`strong`)에 저장(앱이 t.v99Why로 옮기는 건 앱 쪽 작업). SQL이 없으면 이 서버 state2.json에 보관했다가 설치되면 올림.
  3. **오늘은 여기까지**: 같은 날 손실 청산 `DAILY_LOSS_STREAK_MAX`(기본 3)회(2.15.0부터 연속 — 위 2.15.0 참고, `DAILY_LOSS_STREAK_MODE=count`면 연속 아니어도) → `🛑 [오늘은 여기까지]` 1회, 그 뒤 그날 진입마다 `⛔ [오늘은 여기까지 위반]`.
  4. **위험 증가**: 손실 직후(쿨다운 안, 또는 같은 날 그 손실 청산 뒤 첫 진입) 진입의 위험이 직전 손실 거래보다 크면 제목에 🔥 + "잃은 걸 한 번에 되찾으려는 크기" 강한 문구.
     위험 = HL 열린 스탑 주문(frontendOpenOrders)으로 잰 스탑 기준 위험 금액(진입·직전 거래 둘 다 있을 때) · 없으면 명목(최대 |포지션| × 가격).
- 같은 진입은 한 번만(보내기 전에 state2.json `rv.sent`에 저장 → 재시작해도 다시 안 보냄). 설치 전·6시간 넘은 체결은 보내지 않음. 전송 실패는 2시간 동안 재시도.
- 기록: **alert15.sql**(`revenge_alerts` 표 + `revenge_push`·`revenge_data`). 앱이 읽는 기존 위반 기록(risk_events kind=violation)은 앱이 '중단 중 진입'으로 표시하므로 쓰지 않음.
  `revenge_data`는 US 손절 판정용 읽기 전용(키움 주문·종목별 실현·최신 보유). SQL이 없으면 텔레그램은 그대로, US 손익은 주문 평균단가로 추정(수수료 제외, 메시지에 '(추정)').
- 지난 체결로 몇 건 나왔을지(보내지 않음·저장 안 함):
  `sudo -u tradealert node --env-file=/opt/trade-alert/.env /opt/trade-alert/src/alert.mjs --revenge-dry --from 2026-10-01 --to 2026-10-31`
  (US는 alert15.sql이 있어야 62일까지, 없으면 최근 7일만.)
- `.env`(선택): `REVENGE_ALERT=1`(0 = 끔) · `REVENGE_COOLDOWN_MIN=15` · `DAILY_LOSS_STREAK_MAX=3` · `DAILY_LOSS_STREAK_MODE=consecutive`(2.15.0, count = 횟수) · `REVENGE_US_SWITCH=1` · `REVENGE_RISK_UP=1` · `REVENGE_MIN_LOSS_USD=0`(이 금액 이하 손실 무시).
- 텔레그램 받기 루프: 즉시 복기와 같은 getUpdates를 함께 씀(`rv|…` 버튼만 복수매매 처리기로). QUICK_REVIEW=0이어도 복수매매가 켜져 있으면 받기 루프가 돎.

## 2.10.0 — flow-chart 존 터치 알림(판정·백업 로직 변경 없음 · 새 SQL 없음 · 기본 꺼짐)
- flow-chart(stopfirst.github.io/flow-chart)가 그리는 **BB+FVG**(브레이커 블록 ∩ 같은 방향 FVG, 무효화 안 된 것 중 가격에 가까운 2개)와
  **OB 백도식**(스윙 BOS/CHoCH 직전 마지막 반대색 봉 몸통, 방향별 최근 1개, 진행 중 봉은 돌파·무효화에서 제외)에 가격이 닿으면 텔레그램 1회:
  ```
  🎯 BTC 1H BB+FVG 약세 존 터치

  존: 79,811.2 – 79,871.2
  현재가: 79,840.5
  존 시작 봉: 10/27 18:00 KST · Binance 선물
  https://stopfirst.github.io/flow-chart/?s=BTC&tf=1h
  ```
- 계산: `src/zones.mjs` = flow-chart `js/calc.js`(e99a059)의 atr·findFVG·findOB(백도식/넓게)·swings·findBBFVG를 **글자 그대로** 복사 +
  data.js의 존 부분(표시 봉 + 워밍업 260봉, 진행 중 봉 처리) + render.js의 표시 선택. 차트 y축 가격 범위 밖 존을 숨기는 것만 생략(가격이 닿을 땐 화면 안).
- 봉: `ZONE_SOURCE=auto`(기본) = flow-chart와 같은 순서 **Binance USDT-M 선물 → Binance 현물 → Hyperliquid candleSnapshot**. 서버가 미국 리전이면
  Binance 선물이 451이라 현물을 씀(한국에서 보는 차트는 선물) — `--zones-dry` 첫 줄의 소스로 확인. `ZONE_SOURCE=hl`이면 Hyperliquid만.
- 요청량: 처음·6시간마다·틈이 생기면 전체 360봉 1회, 그 사이엔 1분마다 종목당 최근 봉 2~3개 1회(BTC·ETH = 분당 2회). 429/5xx/네트워크 → 1·2·4·8·15분 백오프(Retry-After 우선).
- 터치 = 직전 확인 뒤의 봉(진행 중 봉 포함) 고가·저가가 존 [하단, 상단]에 걸침. 이번에 처음 보이는 존은 **지금 가격이 존 안**일 때만.
  존이 만들어진 봉(BB+FVG: FVG 셋째 봉·브레이커 돌파 봉 / OB: 돌파 봉)까지는 터치로 치지 않음(flow-chart `touched`와 같은 시작점).
  1분 사이에 존을 뚫고 지나가 차트에서 사라진 존도, 직전에 보이던 존이면 한 번 알림(`(존을 종가로 넘는 중)`).
- 같은 존은 한 번만: id = `종목:종류:방향:시작 봉 시각` → `/var/lib/trade-alert/state2.json`의 `zones.sent`(보내기 전에 먼저 저장 → 재시작해도 중복 없음, 실패분은 30분 동안 재전송).
  존이 **마감된 봉** 종가로 무효화되면 기록 삭제(진행 중 봉 종가만으로는 유지), 계산에서 24시간 사라지면 삭제. 조용한 시간 없음.
- 켜고 끄기: `.env` `ZONE_ALERT=1` 또는 텔레그램 **`/zones on` · `/zones off` · `/zones status`**(TELEGRAM_CHAT_ID 대화방만, 상태 파일에 저장).
  텔레그램으로 바꾼 값이 우선이고, `.env`의 ZONE_ALERT 값을 바꾸면 다시 `.env` 값. 명령은 즉시 복기와 같은 getUpdates 루프로 받음
  (`QUICK_REVIEW=0`이어도 `ZONE_ALERT=1`이면 명령용으로 받음, `ZONE_COMMANDS=0`이면 안 받음).
- 설정(.env, 모두 선택): `ZONE_SYMBOLS=BTC,ETH` · `ZONE_TF=1h`(15m·1h·4h) · `ZONE_KINDS=bbfvg,ob` · `ZONE_CHECK_SEC=60` · `ZONE_BARS=100`(차트 '봉 개수'와 같게) · `ZONE_SOURCE=auto|hl|binance`.
- 지금 존 목록(보내지도 저장하지도 않음, 꺼져 있어도 동작): `sudo -u tradealert node --env-file=/opt/trade-alert/.env /opt/trade-alert/src/alert.mjs --zones-dry`
- 손실 한도 확인 루프와 별개 루프라 존 쪽 실패가 판정·알림에 영향 없음. 새 파일 `src/zones.mjs`, `src/zonewatch.mjs`(설치 FILES·SHA256SUMS에 추가).

## 2.9.0 — 서버 일일 백업(판정·알림 로직 변경 없음)
- 새 systemd 타이머 `trade-alert-backup.timer`: 매일 **06:40 KST**(±10분) `src/backup.mjs` 1회 → Supabase `backup_dump`(alert13.sql, 수집기 토큰, 읽기 전용)
  → `/opt/trade-alert/backups/trade-journal-YYYY-MM-DD-HHMM.json.gz`(0600, `.sha256` 함께) · **30일 보관**(최신 3개는 항상 남김).
- 담기는 것: 클라우드 일지 US·HL 전체(payload 그대로 — 거래·계획·복기·**사진** 포함), 이전 버전 목록(내용 제외), 키움 스냅샷, risk_state/days/events/flows,
  acct_snapshots, quick_reviews, hl_watch, HL 원천 체결·펀딩. **토큰 해시(kw_collector)·auth 는 절대 안 담김.**
- 호출 사이 2.5초(수집기·알림과 같은 분당 60회 한도를 나눠 씀), 하루 400회 상한(SQL). 실패하면 텔레그램 ⚠️ 1회(`BACKUP_NOTIFY=fail`, 기본).
- 설정(.env, 모두 선택): `BACKUP_KEEP_DAYS=30` · `BACKUP_PHOTOS=1`(0 = 사진 빼고) · `BACKUP_NOTIFY=fail|always|0` · `BACKUP_DIR`(바꾸면 서비스 ReadWritePaths도).
- 명령: 지금 한 번 `sudo systemctl start trade-alert-backup` · 결과 `sudo journalctl -u trade-alert-backup -n 5 --no-pager` · 목록 `sudo -u tradealert node --env-file=/opt/trade-alert/.env /opt/trade-alert/src/backup.mjs --list`
  · 다음 실행 시각 `systemctl list-timers trade-alert-backup.timer` · 끄기 `sudo systemctl disable --now trade-alert-backup.timer`.
- 복원(자세히: repo `cloud/security/BACKUP-RESTORE.md`)
  1. 일지(가장 흔함): `sudo -u tradealert node /opt/trade-alert/src/backup.mjs --extract /opt/trade-alert/backups/<파일>.json.gz /tmp/restore`
     → 만든 `trade-journal-usd-…json` / `trade-journal-hyperliquid-…json` 을 PC로 옮겨 앱 **설정 → 백업과 이전 → 기존 기록 가져오기** → 확인 뒤 클라우드 저장.
  2. 서버 표(키움 스냅샷·손실 한도 기록 등): `node /opt/trade-alert/src/backup.mjs --restore-sql <파일> > restore.sql` → SQL Editor 실행(없는 행만 추가, 다시 실행해도 안전).
     `--journal` 을 붙이면 일지도 SQL 로 교체(지금 저장본은 이전 버전으로 보관 → 앱에서 되돌릴 수 있음). 다른 프로젝트·계정으로 옮길 땐 `--user <새 uuid>`.
- 보안 메모: 이 기능으로 수집기 토큰이 일지 **전체(메모·사진)** 를 읽을 수 있게 됨(이전엔 요약 필드만). 토큰은 이 서버 .env(0640)에만 있음.
  유출이 의심되면 앱에서 토큰 다시 만들기(즉시 폐기) 또는 SQL `drop function public.backup_dump(text,text,text,bigint);`.


## 2.6.0 — 텔레그램 즉시 복기(판정 로직 변경 없음)
- HL 포지션이 0이 되거나 방향이 바뀌는 체결(청산)을 보면 텔레그램 '📝 BTC 롱 청산 · +$120.00 (+0.6R) · 복기' + [규칙 준수] [규칙 위반] [나중에].
  R = 청산 손익 ÷ (HL 잔고 × 앱 기본 위험 %) — 앱의 거래별 초기 1R과 다를 수 있음(메시지 각주).
- [규칙 위반] → 같은 메시지가 위반 칩(추격 · 계획 외 진입 · 과도한 위험 배정 · 손절 지연 · 청산 규칙 미준수 = 앱 체크리스트) + [← 뒤로] [완료].
  [나중에] → 버튼 유지(앱 복기 대기열에 남음). 답은 quick_review_push(토큰, alert9.sql) → 앱 v37이 거래에 반영(앱에서 이미 복기했으면 앱 값 유지).
- 버튼 응답 = 서비스 안 getUpdates 롱폴링(allowed_updates message·channel_post·my_chat_member·callback_query), TELEGRAM_CHAT_ID 대화방만.
- 서비스 시작 이후의 청산만, 청산 후 6시간 안에만 질문. 상태는 /var/lib/trade-alert/state2.json의 qr.
- alert9.sql 없으면 로그 1회 후 질문 안 함. .env QUICK_REVIEW=0 = 끔. 미국주식(키움)은 아직 없음.
- 거래 키 = 'hl:<청산 체결 tid>' — 앱 거래의 청산 체결 fills[].fillId.


## 2.5.1 — 텔레그램 메시지 가독성(판정·DB·SQL 변경 없음)
- 모든 알림(경고 50/80%, 중단 ⛔, 해제 🔄/✅, 연속 손실, 위반 🚫, 장마감 요약 📊, `--test`) = **첫 줄 제목(이모지 + 시장 + 핵심) · 빈 줄 · `라벨: 값` 짧은 줄**. 여러 시장이면 블록 사이 빈 줄 + 구분 제목 `🇺🇸 미국주식` / `🟦 하이퍼리퀴드`.
- 요약·`--test`의 한도 줄: `오늘   −1.20% / 3%  (40%)`(한도 대비 사용률), 기준일 전이면 `오늘   — 10/26부터`.
- 긴 `기준: 손익 = 실현손익…` 설명은 `--test` 맨 아래 각주 한 번만(장마감 요약·일반 알림엔 없음). `※ 손실 한도 기준일 …` 중복 줄 제거(`status.note`는 앱용으로 그대로).
- 기준일 표기(표시만, 경계 계산 그대로): 미국 `한도 적용: 10/26(월) 미국 장부터 (KST 10/26 22:30~)`(정규장 09:30 ET, 서머타임 자동), HL `한도 적용: 10/26(월) 09:00 KST부터`. `--test` 각주에 실제 미국 경계(`10/23 16:00 ET 이후 체결부터, 애프터·프리마켓 포함`).
- 중단 중 신규 진입: 같은 시장·종목·방향·중단에서 **60초 이내 체결(같은 확인 회차)** 은 알림 1개(`총 수량 510 · 체결 3건 @ 0.79269`, 가격이 다르면 `@ 평균 …`). `risk_events` violation(일지 '규칙 위반')은 체결마다 그대로.
- 전송: Telegram `parse_mode=HTML` — 전부 HTML 이스케이프 후 제목 줄만 `<b>`. 400이면 같은 내용을 일반 텍스트로 다시 보냄. `.env` `TELEGRAM_HTML=0`이면 일반 텍스트. 3800자 넘으면 블록·줄 경계에서 나눠 여러 메시지(`제목 (2/3)`).
- 새 파일 `src/format.mjs`(설치 FILES·SHA256SUMS에 추가).

## 2.5.0 — 미래 한도 기준일(실험 기간)
- `RISK_START_DATE`를 **미래 날짜**로 두면(예: `2026-10-26`): 서버를 다시 시작한 첫 판정에서 **지금 걸린 중단을 전부 해제**(기준일 전에 끝나는 중단 포함 — 모두 기준일 전 손실로 생긴 것, `risk_events` clear rule `risk-start`) + 시장별 🔄 1회('… 기준일 10/26 — 10/26(월) 09:00 KST부터 다시 셉니다 … 10/26부터 적용 · 그 전엔 판정·알림 안 함(기록만)').
- 기준 시각 전까지: 하루·주·월·연속 손실 판정, 50/80% 사전 알림, 재시작 첫날(위험 절반) **없음**. 장마감 요약에 `한도 기준일 10/26부터 적용 (…) · 그 전엔 판정·알림 안 함(기록만)`.
- 기준 시각(HL = 그날 UTC 00:00 = KST 09:00, US = 그 날짜 ET 거래일 시작)부터는 2.4.0과 같음(기준일 키부터 합계).
- 바꾸는 한 줄: `sudo sed -i '/^RISK_START_DATE=/d' /opt/trade-alert/.env; echo RISK_START_DATE=2026-10-26 | sudo tee -a /opt/trade-alert/.env >/dev/null; sudo systemctl restart trade-alert`

키움 수집기가 있는 같은 Lightsail 서버의 **별도 서비스**(`trade-alert`)입니다. alert2(2.0.0)·alert3(2.1.0)·alert4(2.2.0)를 같은 자리에서 업데이트합니다.

## v1.6에서 바뀐 것 — 주·월 한도 분모 = 기간 시작 직전 마감 잔액(앱 v31 `limitStatus`와 같음)
- 이유: v1.5는 주·월 % = 실현손익 ÷ **현재** 기준액이라, 출금하면 분모가 작아져 같은 손실이 더 큰 %가 됐습니다(예: US 출금 뒤 주 한도 6% = $974.16, 출금 전 기준 $3,815.57).
- **주·월 % = 기간 실현손익 ÷ 기간 시작 직전 마감 잔액**(acct_snapshots — 하루 한도와 같은 탐색: 시작 키 이전 7일 안의 가장 최근 값 > 0; HL = UTC 날짜 키, US = 미국 마감일 etDate). **없으면 현재 기준액**(v1.5와 같음).
  - 기간 시작 = max(이번 주 월요일·이번 달 1일(HL UTC / US 거래일), 한도 기준일 RISK_START_DATE). 예: 기준일 10/20 → HL 10/19 UTC 마감, US 10/19 ET 마감.
  - 한도 금액 = 분모 × RISK_WEEK_PCT/RISK_MONTH_PCT%. 알림·요약·`--test`에 `기준: MM/DD 마감 $X` 또는 `현재 기준액 $X`(주·월 각각).
  - 기간 중 입출금은 분모를 조정하지 않음(단순 규칙). 마감 판정(다음 키로 넘어갈 때)도 그 기간의 분모.
- `risk_state.status.periods.week|month`에 `startEquity`(분모)·`startSource`(표기)·`denomMode`(close|basis)·`denomKey`(마감 날짜)·`denomStart`(기간 시작), `status.periodDenom='start-close'`, `basis.label`·`config.periodRule` 갱신(앱 서버 판정 카드에 표시).
- **업데이트 후 첫 판정**: 새 분모로 성립하지 않는 실현 주·월 중단(v1.5)은 해제(`risk_events` clear, rule `denom-period-start`) + 시장별 텔레그램 🔄 1회('손실 한도 판정 v1.6 — 주·월 한도 분모 = …', 이번 주·달 기준·한도). 성립하면 그대로.
- **새 SQL 없음**: alert5.sql의 risk_day_data(version 5)가 마감 잔액 40일을 줌(달 시작 직전 마감은 최대 37일 전). alert5.sql을 아직 안 돌렸으면 v1.4(자산 변화)로 동작 + 로그 안내(기존과 같음).

## v1.5에서 바뀐 것 — 주·월 한도와 연속 손실일도 실현손익 기준(앱 v29 `limitStatus`와 같음)
- 이유: v1.4까지 주·월은 '계좌 자산 변화 − 입출금'이었는데, 미국주식 입출금은 키움 API에 내역이 없어 추정(`US_FLOW_MIN_USD`, us-implied)이라 놓치면 **출금이 손실로 잡혀** 중단이 걸릴 수 있었습니다.
- **주·월 % = 이번 주(월요일 시작)·이번 달 실현손익 합(수수료·펀딩 포함) ÷ 현재 기준액**(앱 `acctBasis()`와 같음: HL BALANCE / 키움 주식 평가 + USD 예수금 → 앱 설정 계좌 기준액). 한도 금액 = 기준액 × RISK_WEEK_PCT/RISK_MONTH_PCT%.
  - 경계 = 하루 실현 키와 같음: **HL = UTC 날짜**(주 = 월요일 KST 09:00, 달 = 1일 KST 09:00 시작 — v1.4의 KST 자정 경계에서 바뀜, 앱과 같음), **US = 서버 거래일**(16:00 ET) 주·달. US 합계는 앱처럼 키움 일별 실현손익 행의 날짜 라벨(한국 날짜)로 나눔.
  - 장중 도달 → 그날(실현 키) 끝까지 즉시 중단, 마감 판정 → 다음 날부터 기간 끝까지(규칙은 v1.2와 같음). 50/80% 사전 알림. 새 중단 id `…:weekr…`·`…:monthr…`, 표시 '주간 실현 −6% …'.
- **연속 손실일 = 그날 실현손익 ÷ 그날 직전 마감 잔액(→ 현재 기준액) ≤ −STREAK_LOSS_PCT**(거래 없는 날 건너뜀). 하루 한도(v1.3)와 같은 기준. id `…:streakr:날짜`.
- 미실현 포함 자산 변화(v1.4 방식)는 알림·상태에 **'참고' 줄로만**(`periods.weekEquity`·`monthEquity`).
- **업데이트 후 첫 판정**: 새 기준으로 성립하지 않는 기존 주·월·연속 중단은 해제(`risk_events` kind `clear`, rule `basis-realized`) + 시장별 텔레그램 🔄 1회. 그 중단에서 오는 오늘 '재시작 첫날 절반'도 없어짐. 새 기준으로도 성립하면 그대로 둠.
- `risk_state.status`에 `version`·`rules`·`basis`(앱 v30이 배너·설정 카드에 표시), `periodBasis`, `config.periodRule`.
- 한도 기준일(RISK_START_DATE)은 그대로 적용: 기준일 키 이전 실현손익은 주·월 합계·연속 손실일에서 제외.
- 데이터: Supabase **`alert5.sql`**(risk_day_data version 5 — 키움 일별 실현 45일, 마감 잔액 40일, HL 날짜별 체결·펀딩 합계) + HL 공개 API. **alert5.sql이 없으면 주·월·연속은 v1.4(자산 변화)로 동작**하고 로그에 안내. 한 번 확인한 뒤 일시 장애면 판정을 건너뜀(자산 변화로 되돌아가지 않음).
- `DAY_LIMIT_BASIS=equity`면 하루·주·월 모두 자산 변화(v1.2/v1.4) 그대로.
- 미국주식 입출금 추정은 감지한 회차에 보관(그 회차가 중간에 실패해도 다음 회차에 저장). 판정에는 더 이상 쓰지 않고 참고 줄에만 반영.

## v1.4 — 한도 기준일 — 한도 기준일(선택, `.env` `RISK_START_DATE=YYYY-MM-DD`)
- 기준 시각: **HL = 그날 UTC 00:00(KST 09:00)**, **미국주식 = 그 날짜(ET) 거래일 시작**(= 직전 거래일 16:00 ET; 주말·휴장이면 다음 거래일).
- 그 이전 손익은 **하루·주·월 합계와 연속 손실일에서 제외**. 기준일이 든 주·달은 기준 시각의 자산에서 시작(경계 근처 서버 관측 → HL 마감 잔액(acct_snapshots, UTC 전날) / 키움 마감 잔액 → HL portfolio 근사 → 첫 관측 '근사', 나중에 더 정확한 값이 오면 교체). 다음 주·달부터는 평소대로.
- HL 기준일 당일(KST 하루)의 연속 손실 판정 = 기준 시각부터의 변화. 하루 실현 한도는 기준일 키(HL UTC 날짜 / US 거래일)부터.
- 기준일 전 손실로 **이미 걸린 중단은 처음 적용할 때 해제**(`risk_events` kind `clear`, rule `risk-start`) + 텔레그램 🔄 안내 1회. 그 날 끝난 중단의 '재시작 첫날 절반'도 없앰. 새 중단 id = `…@YYYY-MM-DD`.
- 미래 날짜면 그날 전까지 판정·중단 없음. 비우면 v1.3과 같은 결과(테스트로 확인). `risk_state.status.riskStart`에 기준일·기준 자산 표시.
- 앱 설정의 '한도 기준일'(앱 v29)은 앱 화면 계산용 **별개 설정**입니다. 같게 맞춰 두세요.
- SQL 변경 없음.

### 기준일 넣기(예: 2026-10-20)
```
sudo sed -i '/^RISK_START_DATE=/d' /opt/trade-alert/.env; echo RISK_START_DATE=2026-10-20 | sudo tee -a /opt/trade-alert/.env >/dev/null; sudo systemctl restart trade-alert
```
없애기: `sudo sed -i '/^RISK_START_DATE=/d' /opt/trade-alert/.env; sudo systemctl restart trade-alert`

## v1.3 — 하루 손실 한도 = 앱(v28)과 같은 기준

- **분자 = 오늘 실현손익**(수수료·펀딩 포함). HL = 무기한 체결 Σ(closedPnl − fee) + 펀딩, **UTC 00:00(KST 09:00) 경계**. US = 키움 일별 실현손익(ust21640, 서버 거래일 = 키움 조회일).
- **분모 = 직전 마감 잔액**(acct_snapshots, 7일 이내·> 0; HL UTC 날짜 / US 미국 마감일 etDate) → 없으면 **현재 기준액**(HL BALANCE / US 주식 평가 + USD 예수금 → 앱 설정 기준액).
- **한도 금액 = 분모 × RISK_DAY_PCT%**, 실현손익 ≤ −한도 금액이면 그날 끝까지 신규 진입 중단(HL은 다음 KST 09:00까지). 50/80% 사전 알림 그대로.
- 알림에 `기준: 전일 마감 $X`(전일이 아니면 `MM/DD 마감 $X`) 또는 `현재 기준액 $X`, 그리고 `참고: 미실현 포함 자산 변화 …`(판정에는 안 씀) 한 줄.
- **그대로**: 주 −6%·월 −10%(자산 변화 기준), 연속 손실일, 재시작 첫날 절반, 위반 기록, 장 마감 요약, 입출금 제외.
- 데이터: Supabase `alert3.sql`의 `risk_day_data(토큰)`(키움 일별 실현손익·acct_snapshots·hl_fills/hl_funding) + HL 공개 API(체결·펀딩, 중복 제거). service_role 키 없음.
- `alert3.sql`이 없으면 v1.2(자산 변화) 하루 판정으로 계속 동작하고 로그에 안내. `.env`에 `DAY_LIMIT_BASIS=equity`면 v1.2 방식 유지.
- 아래 표·설명 중 '하루' 부분은 v1.2(또는 DAY_LIMIT_BASIS=equity) 기준입니다.
미국주식(키움)과 하이퍼리퀴드를 **각자 계좌 순자산 기준으로 따로** 판정하고, 텔레그램 알림 + Supabase 상태(앱 상단 '거래 중단 중' 배너) + 규칙 위반 기록을 남깁니다.
**주문을 내거나 취소하지 않습니다**(증권사·거래소를 막을 수 없음).

## 판정 기준 (아래 표의 '자산 변화' 설명은 v1.2 — v1.5에서는 하루·주·월·연속 손실이 실현손익 기준이고 자산 변화는 참고)
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
1. Supabase → SQL Editor → `alert2.sql`(처음이면) → `alert3.sql`(처음이면) → `alert5.sql` 전체 붙여넣고 Run (모두 다시 실행해도 안전).
2. `curl -fsSL https://raw.githubusercontent.com/stopfirst/trade-log/main/cloud/alert/install-alert.sh | sudo bash`
   (.env·기존 기록 유지. 기존 .env 끝에 v1.2 설정 안내 주석을 덧붙임.)
3. 확인: `sudo -u tradealert node --env-file=/opt/trade-alert/.env /opt/trade-alert/src/alert.mjs --test`
   → 텔레그램에 "✅ 매매일지 손실한도 판정 v1.5 테스트 · trade-alert 2.3.0" + 시장별 '오늘(실현) … · 기준 전일 마감 $X'가 오면 정상.
4. 로그: `sudo journalctl -u trade-alert -n 30 --no-pager` (`trade-alert 2.3.0 시작 · 손실한도 판정 v1.5 …`, `alert5.sql 확인 → 주·월 한도·연속 손실일을 실현손익 기준…`)

새로 설치하는 경우 텔레그램 봇 만들기·`--find-chat`은 alert1과 같습니다(`.env`의 TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID).

## 관리 명령
```
A="sudo -u tradealert node --env-file=/opt/trade-alert/.env /opt/trade-alert/src/alert.mjs"
$A --once --dry-run                 # 지금 판정만 출력(보내지·저장하지 않음)
$A --flow US 500 "원화 환전 입금"     # 입출금 수동 등록(+입금 / −출금, 지금 시각) — 추정이 놓친 경우
$A --flow-remove manual:US:…        # 수동 등록 취소
$A --clear-stops US                 # 잘못 걸린 중단 해제(기록 남김)
$A --zones-dry                      # 2.10.0 지금 존 목록(보내지·저장하지 않음)
$A --mag-dry                        # 2.16.0 오늘 탄창 상태·목표·보낼 알림(보내지·저장하지 않음, = --dry)
```
설정 바꾸기: `sudo nano /opt/trade-alert/.env` → `sudo systemctl restart trade-alert` (키 목록은 env.template).
alert1의 `LOSS_STREAK_N`, `INCLUDE_UNREALIZED`, `US_LIMITS_PCT`, `CHECK_ACTIVE_SEC` 등은 2.0.0에서 쓰지 않습니다(무시).
앱 설정의 손실 한도(하루·주·달 %)는 앱 자체 표시용이고, 서버 판정은 `.env`(기본 3/6/10)를 씁니다. 앱 설정 → 계좌·위험에 서버 값이 그대로 보입니다.

## 테스트(개발)
2.17.0: `node --test tests/*.test.mjs` 220개 (fresh.test.mjs 5) · SQL `node tests/alert21-sql.pglite.mjs <cloud 폴더>` 19개(alert21.sql fresh_status + harden 순서).
2.16.0: `node --test tests/*.test.mjs` 215개 (mag.test.mjs 15) · SQL `node tests/alert20-sql.pglite.mjs <cloud 폴더>` 44개(alert20.sql 탄창 수집기 + mag_status + harden 순서).
2.13.0: `node --test tests/*.test.mjs` (flip.test.mjs) · SQL `node tests/alert17-sql.pglite.mjs <cloud 폴더>`(alert17.sql + harden 순서).
2.12.0: `node --test tests/*.test.mjs` (remind.test.mjs 손익비 미달·숨김 포함) · SQL `node tests/alert11-sql.pglite.mjs <cloud.sql> <kiwoom-collector.sql> <alert11.sql>`.
2.11.0: `node --test tests/*.test.mjs` 163개 (revenge.test.mjs 15) · SQL `node tests/alert15-sql.pglite.mjs <cloud.sql> <kiwoom-collector.sql> <alert15.sql>` 30개.
`node --test tests/*.test.mjs`(존: zones.test.mjs = tests/fixtures/flow-chart 원본과 동일성, zonewatch.test.mjs = 터치·중복·재시작·정리·명령) · 라이브 비교(수동): `node tests/zones-live-compare.mjs` · SQL: `node tests/alert13-sql.pglite.mjs <cloud 폴더>`(backup_dump·복원 왕복·security/harden-2026-11.sql), `node tests/alert2-sql.pglite.mjs cloud.sql kiwoom-collector.sql hl-collector.sql balance-snapshot.sql alert2.sql fixtures`, `node tests/alert3-sql.pglite.mjs cloud.sql kiwoom-collector.sql hl-collector.sql balance-snapshot.sql alert2.sql alert3.sql fixtures`, `node tests/alert5-sql.pglite.mjs cloud.sql kiwoom-collector.sql hl-collector.sql balance-snapshot.sql alert2.sql alert3.sql alert5.sql fixtures` (@electric-sql/pglite)

## 보안
- 비밀값은 `/opt/trade-alert/.env`(root:tradealert 0640)에만. 로그에 토큰·키를 `[비공개]`로 가림. secret/service_role 키 거부.
- Supabase 쓰기는 `risk_push`(수집기 토큰 주인 행만), 앱은 RLS로 본인 행만 읽기. 하이퍼리퀴드는 공개 /info 읽기만.

## 2.8.1 — 현물 포함 분모 버그 수정
2.7.0~2.8.0은 현물 평가가 매 회차 'Cannot read properties of undefined (reading \'raw\')'로 실패해 HL 분모·자산이 USDC만이었습니다. hlData 결과에 HL client를 넘겨 고쳤습니다(판정 규칙 v1.6 그대로).

## 2.8.0 — 매일 복기 알림 (앱 v92)
- 매일 `REVIEW_REMIND_AT`(한국 시간, 기본 09:30)에 한 번: 어제(HL UTC 하루 · 미국 ET 거래일) 체결했거나 들고 있던 거래 중 일지 빈 칸을 텔레그램으로.
  항목 = 앱 '진입 전 체크'와 같음: 진입 근거 · 스탑 이유 · 손익비(앱 설정 최소, 기본 2:1) · 가격 반응 확인 · 타임프레임(LTF 진입이면 청산도 LTF).
- 대상 = 첫 진입이 2026-11-01 이후(앱 settings.v92From). 어제 거래가 없으면 안 보냄.
- Supabase SQL Editor에서 `alert11.sql` 1회 실행 필요(review_gaps, 읽기 전용 — 메모 본문·사진은 서버로 안 나감). 없으면 로그 1회 후 알림만 건너뜀.
- 끄기: `.env`에 `REVIEW_REMIND=0`. `--test` 끝에 '매일 복기 알림: …' 상태 줄.
