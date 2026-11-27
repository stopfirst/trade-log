import test from 'node:test';
import assert from 'node:assert/strict';
import { derive, rawStage, step, wilder, trend, render, lights, reentryClose, renderReentry } from '../src/core.mjs';

// 스크린샷 값으로 만든 시세(vix, vix3m, vvix/prev, spx%)
function Q({ vix, vixPrev = vix, v3m, v6m = v3m + 0.5, v9d = vix, vvix, vvixPrev = vvix, spxPct = 0 }) {
  const P = (v, prev = v) => ({ v, prev });
  return derive({ VIX: P(vix, vixPrev), VIX9D: P(v9d), VIX3M: P(v3m), VIX6M: P(v6m), VVIX: P(vvix, vvixPrev),
    SKEW: P(151), MOVE: P(94), DXY: P(101.6), SPX: P(7000 * (1 + spxPct / 100), 7000) });
}

test('평온 = STABLE', () => {
  assert.equal(rawStage(Q({ vix: 16, v3m: 19, vvix: 90 })).stage, 'STABLE');
});
test('22:10 NEAR_BW → TENSION', () => {
  const r = rawStage(Q({ vix: 20.3, v3m: 21.1, vvix: 104, vvixPrev: 90.5, spxPct: -0.6 }));
  assert.equal(r.stage, 'TENSION'); assert.equal(r.structure, 'NEAR_BACKWARDATION'); assert.equal(r.core, 'NEAR_BW');
});
test('22:35 BACKWARDATION+VVIX+SPX → FRACTURE', () => {
  const r = rawStage(Q({ vix: 23.7, vixPrev: 21, v3m: 23.1, vvix: 117, vvixPrev: 90.4, spxPct: -1.5 }));
  assert.equal(r.stage, 'FRACTURE'); assert.equal(r.core, 'BACKWARDATION + VVIX + SPX');
});
test('23:05 → TRIGGER', () => {
  const r = rawStage(Q({ vix: 26.2, vixPrev: 21, v3m: 24.3, vvix: 124, vvixPrev: 90.4, spxPct: -2.3 }));
  assert.equal(r.stage, 'TRIGGER'); assert.equal(r.core, 'BACKWARDATION');
});
test('11-16 10:30 ET 원본: NEAR_BW + SPX → FRACTURE · VIX/3M 0.974 🔴', () => {
  const d = Q({ vix: 21.37, vixPrev: 19.3, v3m: 21.95, vvix: 106, vvixPrev: 102, spxPct: -1.14 });
  const r = rawStage(d); assert.equal(r.structure, 'NEAR_BACKWARDATION'); assert.equal(r.stage, 'FRACTURE'); assert.equal(r.core, 'NEAR_BW + SPX');
  assert.equal(lights(d).ratio, '🔴');
});
test('11-27 11:23 ET: BW + VVIX 110 하락·SPX 상승 → FRACTURE 아님(1.2.2)', () => {
  const r = rawStage(Q({ vix: 25.50, vixPrev: 26.80, v3m: 24.9, vvix: 110.1, vvixPrev: 115.3, spxPct: 1.22 }));
  assert.equal(r.structure, 'BACKWARDATION'); assert.equal(r.stage, 'TENSION'); assert.equal(r.core, 'BACKWARDATION');
  // 같은 수준이라도 VVIX가 오르는 중이면 균열
  assert.equal(rawStage(Q({ vix: 25.50, v3m: 24.9, vvix: 110.1, vvixPrev: 108, spxPct: 0.2 })).stage, 'FRACTURE');
});
test('NEAR_BW만(VVIX·SPX 약함) = TENSION', () => {
  assert.equal(rawStage(Q({ vix: 21, v3m: 21.8, vvix: 105, spxPct: -0.5 })).stage, 'TENSION');
});
test('SPX -2% 없으면 TRIGGER 아님', () => {
  assert.equal(rawStage(Q({ vix: 30, vixPrev: 21, v3m: 26, vvix: 130, spxPct: -1.2 })).stage, 'FRACTURE');
});
test('신호등', () => {
  const L = lights(Q({ vix: 20.3, v3m: 21.1, v6m: 22.3, v9d: 20.7, vvix: 100 }));
  assert.deepEqual(L, { c3m: '🔴', c63: '🟢', ratio: '🟡', s9d: '🟡' });
});
test('상승 즉시, 하강은 3회 연속 확인', () => {
  let s = { stage: 'STABLE', since: 0 };
  let r = step(s, 'FRACTURE', 1); assert.deepEqual(r.changed, { from: 'STABLE', to: 'FRACTURE' }); s = r.state;
  r = step(s, 'TENSION', 2); assert.equal(r.changed, null); s = r.state;
  r = step(s, 'FRACTURE', 3); assert.equal(r.changed, null); assert.equal(r.state.lowerCount, 0); s = r.state;
  r = step(s, 'STABLE', 4); s = r.state; r = step(s, 'TENSION', 5); s = r.state; r = step(s, 'STABLE', 6);
  assert.deepEqual(r.changed, { from: 'FRACTURE', to: 'TENSION' });
});
test('ADX/ATR 계산과 보드 렌더', () => {
  const bars = []; let c = 100;
  for (let i = 0; i < 200; i++) { c += (i % 7 < 4 ? -1 : 0.6); bars.push({ h: c + 1, l: c - 1, c }); }
  const w = wilder(bars); assert.ok(w.length > 100);
  const t = trend(bars, bars.map(b => b.c).filter((_, i) => i % 5 === 0));
  assert.equal(t.pos, 'BELOW'); assert.ok(t.mdi > t.pdi);
  const d = Q({ vix: 26.2, vixPrev: 21, v3m: 24.3, vvix: 124, vvixPrev: 90.4, spxPct: -2.3 });
  const txt = render({ d, raw: rawStage(d), stage: 'TRIGGER', title: 'x', trend: t, kst: '01:05', et: '11:05', footer: 'f' });
  assert.match(txt, /현재 단계\s+🔴 TRIGGER/); assert.match(txt, /⚠ FRACTURE/); assert.match(txt, /30W TREND\s+BELOW/);
});

// ── 1.2.0 재진입 후보 ──
test('재진입: TRIGGER 다음날부터 VIX/3M 첫 1 미만 종가에서 한 번', () => {
  let rs = { trigDate: '2026-11-17', days: 0, done: false };
  let r = reentryClose(rs, { date: '2026-11-17', ratio: 0.98 }); assert.equal(r.signal, null); rs = r.rs; // 당일은 안 셈
  r = reentryClose(rs, { date: '2026-11-18', ratio: 1.03 }); assert.equal(r.signal, null); assert.equal(r.rs.days, 1); rs = r.rs;
  r = reentryClose(rs, { date: '2026-11-18', ratio: 0.9 }); assert.equal(r.signal, null); // 같은 날 두 번 안 셈
  r = reentryClose(rs, { date: '2026-11-19', ratio: 0.99 });
  assert.deepEqual(r.signal, { trigDate: '2026-11-17', days: 2, fast: true, ratio: 0.99 }); rs = r.rs;
  assert.equal(reentryClose(rs, { date: '2026-11-20', ratio: 0.9 }).signal, null); // 한 번만
});
test('재진입: 4거래일째부터는 빠른 신호 아님 · 60일 넘으면 접음', () => {
  let rs = { trigDate: '2026-11-02', days: 3, lastDate: '2026-11-05' };
  assert.equal(reentryClose(rs, { date: '2026-11-06', ratio: 0.95 }).signal.fast, false);
  assert.equal(reentryClose({ trigDate: '2026-08-01', days: 59 }, { date: '2026-11-06', ratio: 1.1 }).rs, null);
  assert.equal(reentryClose(null, { date: '2026-11-06', ratio: 0.9 }).signal, null);
});
test('재진입 메시지', () => {
  const d = Q({ vix: 21, v3m: 21.5, vvix: 100, spxPct: 0.8 });
  const t = renderReentry({ trigDate: '2026-11-17', days: 2, fast: true, ratio: 0.977 }, d, { kst: '06:15', et: '16:15' });
  assert.match(t, /재진입 후보/); assert.match(t, /0\.977/); assert.match(t, /비중 작게/); assert.match(t, /1R/);
  assert.doesNotMatch(renderReentry({ trigDate: 'x', days: 5, fast: false, ratio: 0.9 }, d), /비중 작게/);
});

// ── 1.2.1 원본 11-20 마감: TRIGGER · 'BACKWARDATION + MOVE' ──
test('11-20 마감 원본: TRIGGER 핵심 신호에 MOVE', () => {
  const q = Q({ vix: 35.89, vixPrev: 28.44, v3m: 30.94, vvix: 138.03, vvixPrev: 127.1, spxPct: -3.70 });
  q.movePct = (106.31 / 96.04 - 1) * 100;
  const r = rawStage(q); assert.equal(r.stage, 'TRIGGER'); assert.equal(r.core, 'BACKWARDATION + MOVE');
  q.movePct = 2; assert.equal(rawStage(q).core, 'BACKWARDATION');
});
test('MOVE 신호는 다른 단계에도 붙음', () => {
  const q = Q({ vix: 21.37, vixPrev: 19.3, v3m: 21.95, vvix: 106, vvixPrev: 102, spxPct: -1.14 }); q.movePct = 12;
  assert.equal(rawStage(q).core, 'NEAR_BW + SPX + MOVE');
});

test('1.2.3 상향 확인: FRACTURE는 2회 연속, 한 번 튀면 무시, TRIGGER는 즉시', () => {
  let s = { stage: 'TENSION', since: 0 };
  let r = step(s, 'FRACTURE', 1, 3, 2); assert.equal(r.changed, null); s = r.state;
  r = step(s, 'TENSION', 2, 3, 2); assert.equal(r.changed, null); assert.equal(r.state.upCount, 0); s = r.state; // 한 번 튄 것 → 무시
  r = step(s, 'FRACTURE', 3, 3, 2); s = r.state; r = step(s, 'FRACTURE', 4, 3, 2);
  assert.deepEqual(r.changed, { from: 'TENSION', to: 'FRACTURE' }); s = r.state;
  r = step({ stage: 'TENSION', since: 0 }, 'TRIGGER', 5, 3, 2); assert.deepEqual(r.changed, { from: 'TENSION', to: 'TRIGGER' });
  // FRACTURE→TRIGGER 섞여 올라가면 낮은 쪽(FRACTURE)으로 확정
  r = step({ stage: 'STABLE', since: 0 }, 'TENSION', 6, 3, 2); r = step(r.state, 'FRACTURE', 7, 3, 2);
  assert.deepEqual(r.changed, { from: 'STABLE', to: 'TENSION' });
});
