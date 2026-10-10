# 키움 클라우드 수집기 (v10)

내 서버(AWS Lightsail, 키움 App Key에 등록한 고정 IP)에서 키움 미국주식 **조회 전용** API
(ust21150 주문, ust21070 잔고, ust21640 일별 실현손익)를 읽어 Supabase `kw_snapshots`에 올립니다.
매매일지 앱(US)은 로그인 상태에서 그 행을 읽어 PC 서버 동기화와 같은 방식(KJ.apply)으로 반영합니다.

- 주기: 미국 동부 04:00–20:00 평일(프리·애프터 포함) 1분, 그 외 평일 15분, 주말 30분.
  장중에는 오늘(한국 날짜)을 매분, 어제(한국 날짜)를 5분마다 조회합니다.
- 전송: 주문·실현손익·수량이 바뀌면 즉시, 시세만 바뀌면 최대 10분마다.
- 키움 오류 시 지수 백오프(요청 한도 2→15분, 인증 5→30분, 네트워크 1→10분).
- Supabase 쓰기: Publishable key + 수집기 토큰(kwc_…)으로 `kw_push` RPC만 호출. service_role 키는 거부합니다.
- 키움 App Key/Secret/계좌번호는 이 서버 `/opt/kiwoom-collector/.env`에만 있습니다.

## 설치 (Lightsail 브라우저 SSH)
```
curl -fsSL https://raw.githubusercontent.com/stopfirst/trade-log/main/cloud/kiwoom-collector/install.sh | sudo bash
sudo nano /opt/kiwoom-collector/.env
sudo systemctl restart kiwoom-collector
sudo journalctl -u kiwoom-collector -n 30 --no-pager
```
같은 첫 줄을 다시 실행하면 코드만 업데이트합니다(.env 유지).

## 관리
- 상태: `sudo systemctl status kiwoom-collector`
- 실시간 로그: `sudo journalctl -u kiwoom-collector -f` (Ctrl+C로 나가기)
- 1회 점검: `sudo -u kwcollector node --env-file=/opt/kiwoom-collector/.env /opt/kiwoom-collector/src/collector.ts --once`
- 멈춤/해제: `sudo systemctl disable --now kiwoom-collector`
- 테스트(개발): `node --test tests/*.test.ts` (Node 24)
