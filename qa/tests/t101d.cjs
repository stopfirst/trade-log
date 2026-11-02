/* v101 저장 유실 QA (4/4): 기기 저장이 끝나지 못한 채 새로고침(kill) → 다음 실행에서 미저장 일지 되살림 — 본문은 t101.cjs */
process.env.T101_ACTS='kill';process.env.T101_EXTRA='0';require('./t101.cjs');
