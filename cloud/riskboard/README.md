# 시장 리스크 보드 (riskboard)

미국장 중 5분마다 VIX 기간구조·VVIX·SKEW·MOVE·DXY·S&P 500을 읽어 단계를 매기고 텔레그램으로 보냅니다.
trade-alert와 같은 봇·같은 방을 쓰지만 별도 서비스입니다(보내기만 해서 trade-alert 명령과 충돌 없음).

## 단계
| 단계 | 조건(기본값) |
|---|---|
| 🔵 STABLE 안정 | 아래 어느 것도 아님 |
| 🟤 TENSION 긴장 | VIX/3M ≥ 0.95(NEAR_BW) 또는 VVIX ≥ 115 또는 VIX 전일비 ≥ +15% |
| 🟠 FRACTURE 구조 균열 | VIX/3M ≥ 0.95(NEAR_BW 이상, 1.1.0부터 — 원본 봇에 맞춤) 그리고 (VVIX ≥ 110 또는 VVIX 전일비 ≥ +20% 또는 SPX ≤ −1.0%) |
| 🔴 TRIGGER | FRACTURE + (VIX ≥ 28 또는 VIX% ≥ +20) + SPX ≤ −2.0% + (VVIX ≥ 120 또는 3M−VIX ≤ −3) |

- 올라갈 때는 즉시, 내려갈 때는 3번 연속(약 15분) 낮아야 바뀜 → 깜빡임 방지.
- 보내는 때: 단계가 바뀔 때, TRIGGER가 10분 이어질 때 한 번, 장 마감 15분 뒤(16:15 ET) 종가 보드.
- 🟢 재진입 후보(1.2.0): TRIGGER가 난 다음 거래일부터 VIX/3M 종가가 1 미만인 첫날 마감 뒤 한 번 → 다음 거래일 시가 진입 후보(2026-11-10 백테스트). TRIGGER 뒤 3거래일 안이면 '비중 작게' 표시. TRIGGER가 다시 나면(장중·종가) 처음부터 셈. 설치·재시작 때 마지막 종가가 TRIGGER면 거기서부터 셈. 60거래일 안에 안 나오면 접음.
- ⚠ 고장 알림(1.2.0): 시세·전송이 3번 연속 실패하면 한 번, 다시 되면 ✅ 한 번.
- 텔레그램 /risk(trade-alert)는 1.2.0부터 서비스와 같은 기준값(/var/lib/riskboard/config.json)과 확정 단계(state.json)로 보드를 만듦 → 자동 알림과 단계가 일치.
- 신호등: 3M−VIX(🔴<1 🟡<2), 6M−3M(🔴<0 🟡<0.5), VIX/3M(🔴≥0.97 🟡≥0.9), 9D−VIX(🔴>1 🟡>0).
- 구조 리스크: S&P 500 30주 이동평균 위/아래, 일봉 ATR·ADX·±DI(14, Wilder).
- 데이터: Yahoo Finance(무료, 지연될 수 있음). 휴장일은 자동으로 건너뜀.

## 설치 (Lightsail)
```
curl -fsSL https://raw.githubusercontent.com/stopfirst/trade-log/main/cloud/riskboard/install-riskboard.sh | sudo bash
sudo riskboard-now        # 지금 보드 한 번 받기
journalctl -u riskboard -f
```
기준값 바꾸기: `sudo nano /opt/riskboard/.env` → `sudo systemctl restart riskboard`. 끄기: `sudo systemctl disable --now riskboard`.
