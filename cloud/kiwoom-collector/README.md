# 키움 클라우드 수집기 (v11 · 수집기 1.1.0)

내 서버(AWS Lightsail, 키움 App Key에 등록한 고정 IP)에서 키움 미국주식 **조회 전용** API
(ust21150 주문, ust21070 잔고, ust21640 일별 실현손익, ust21160 USD 예수금)를 읽어 Supabase `kw_snapshots`에 올립니다.
매매일지 앱(US)은 로그인 상태에서 그 행을 읽어 PC 서버 동기화와 같은 방식(KJ.apply)으로 반영합니다.

- 주기: 미국 동부 04:00–20:00 평일(프리·애프터 포함) 1분, 그 외 평일 15분, 주말 30분.
  장중에는 오늘(한국 날짜)을 매분, 어제(한국 날짜)를 5분마다 조회합니다.
- 전송: 주문·실현손익·수량이 바뀌면 즉시, 시세만 바뀌면 최대 10분마다.
- 키움 오류 시 지수 백오프(요청 한도 2→15분, 인증 5→30분, 네트워크 1→10분).
- Supabase 쓰기: Publishable key + 수집기 토큰(kwc_…)으로 `kw_push` RPC만 호출. service_role 키는 거부합니다.
- 키움 App Key/Secret/계좌번호는 이 서버 `/opt/kiwoom-collector/.env`에만 있습니다.
- USD 예수금(1.1.0): `ust21160 미국주식 예수금 상세`의 가장 먼 결제일 열(`d4…d0_usd_fx_entr`, 미결제 매수·매도 반영)을
  잔고 스냅샷 `summary.cash`에 넣습니다. 앱은 주식 평가금액(ust21070 `tot_evlt_amt`) + 이 값을 US 계좌 기준액으로 씁니다.
  원화 예수금(`won_entr`)은 표시만 하고 합산하지 않습니다. 조회 실패 시에도 주식·손익 전송은 계속합니다.

## 설치 (Lightsail 브라우저 SSH)
```
curl -fsSL https://raw.githubusercontent.com/stopfirst/trade-log/main/cloud/kiwoom-collector/install.sh | sudo bash
sudo nano /opt/kiwoom-collector/.env
sudo systemctl restart kiwoom-collector
sudo journalctl -u kiwoom-collector -n 30 --no-pager
```
같은 첫 줄을 다시 실행하면 코드만 업데이트합니다(.env 유지).

## 과거 기록 한 번에 채우기 (백필)
```
sudo systemctl stop kiwoom-collector
sudo -u kwcollector node --disable-warning=ExperimentalWarning --env-file=/opt/kiwoom-collector/.env /opt/kiwoom-collector/src/collector.ts --backfill 2026-01-01
sudo systemctl start kiwoom-collector
```
- `--backfill 시작일 [종료일]` — 종료일 기본값은 어제(한국 날짜). 오래된 날짜부터 하루씩 조회·전송합니다.
- 한국 일요일은 건너뜁니다(미국장이 없음). 토요일은 금요일 미국장이 새벽까지 이어지므로 조회합니다. 일요일도 조회하려면 `--include-sundays`.
- 주문·실현손익이 모두 없는 날은 올리지 않습니다(같은 날짜의 수동 기록이 가려지지 않도록). 올리려면 `--push-empty`.
- 날짜 사이 1.5초 대기(`--delay-ms 3000`처럼 조정). 키움 요청 한도(HTTP 429 또는 코드 1700/1701/1702)는 60초→최대 5분 대기 후 재시도,
  Supabase 분당 60회 제한은 65초 대기 후 재시도. 인증·토큰 오류는 즉시 멈춤. 실패한 날짜는 마지막 줄에 모아 보여 줍니다.
- Supabase는 400일 이내 날짜만 받습니다(시작일은 399일 전까지).
- 각 날짜의 보유잔고·예수금은 "백필 실행 시점" 값입니다(asOf가 그 시각). 앱은 가장 최근 asOf의 잔고만 현재 잔고로 쓰므로 과거 날짜에 잘못 붙지 않습니다.
- 같은 명령을 다시 실행해도 안전합니다(같은 날짜는 더 새 값으로 덮어씀).
- 백필 동안 서비스를 멈추는 이유: 키움 토큰·요청 한도와 Supabase 분당 한도를 백필이 혼자 쓰게 하려는 것입니다.

## 관리
- 상태: `sudo systemctl status kiwoom-collector`
- 실시간 로그: `sudo journalctl -u kiwoom-collector -f` (Ctrl+C로 나가기)
- 1회 점검: `sudo -u kwcollector node --env-file=/opt/kiwoom-collector/.env /opt/kiwoom-collector/src/collector.ts --once`
- 멈춤/해제: `sudo systemctl disable --now kiwoom-collector`
- 테스트(개발): `node --test tests/*.test.ts` (Node 24)
