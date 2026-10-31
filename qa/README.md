# 매매일지 QA (CI)

`cloud/index.html` 을 실제 Chromium(headless)으로 열어 기능·화면 넘침을 확인합니다. push·PR 마다 GitHub Actions(`.github/workflows/qa.yml`)가 자동 실행하고, 실패하면 Pages 배포 job 이 돌지 않습니다.

- **모의 데이터만 사용**: Hyperliquid·Supabase 호출은 각 스크립트 안의 `window.fetch` 모의가 답하고, 127.0.0.1 밖으로 나가는 요청은 `qa/lib/pw.cjs` 가 전부 막습니다. 주소는 가짜(`0xabc`, `0x1111…`), 체결·봉·잔고도 가짜 값입니다. 실제 계정 고정본은 저장소에 넣지 않습니다.
- **시계 고정**: 페이지 시계를 2026-10-31(토) 12:00 KST 로 고정해 '어제·이번 주' 기준 결과가 실행 날짜와 상관없이 같습니다. (`QA_NOW` 로 바꿀 수 있음, epoch ms 또는 ISO)
- **버전 무관**: `APP_VER`·`data-v` 는 검사하지 않습니다.

## 실행

```bash
npm ci
npx playwright-core install --with-deps chromium-headless-shell   # 한 번
npm run qa                       # = node qa/run-all.cjs cloud/index.html
node qa/run-all.cjs cloud/index.html --only t90,t91   # 일부만
```

환경변수: `CHROME_PATH`(직접 받은 Chromium 경로) · `QA_JOBS`(동시 실행 수, 기본 CPU-1, 최대 3) · `QA_OUT`(스크린샷·로그 폴더) · `QA_TIMEOUT`(검사당 ms, 기본 180000).

## 구조

- `tests/tNN.cjs` — 버전별 QA 스크립트(원본에서 브라우저 경로만 공통 래퍼로 바꿈). 마지막 줄에 JSON 결과를 출력.
- `expect.cjs` — 각 스크립트의 기대값. 새 기능 QA 를 넣으면 여기 한 줄 추가.
- `check.cjs` — 공통 판정(페이지 오류 0, 넘침/잘림 0, 스크린샷 오류 없음, 정상 종료) + 비교 도우미.
- `run-all.cjs` — 진입점. 실패한 검사는 1회 재시도, 최종 실패가 있으면 exit 1.
- `lib/pw.cjs` — playwright-core 래퍼(브라우저 경로, 시계 고정, 외부 네트워크 차단, 종료 처리).
