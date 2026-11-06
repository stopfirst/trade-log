import test from 'node:test';
import assert from 'node:assert/strict';
import { derive, rawStage, step, wilder, trend, render, lights } from '../src/core.mjs';

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
