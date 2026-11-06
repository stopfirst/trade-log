// 시장 리스크 보드 — 순수 계산(네트워크 없음). 테스트 대상.
export const STAGES = ['STABLE', 'TENSION', 'FRACTURE', 'TRIGGER'];
export const STAGE_KO = { STABLE: '안정 구간', TENSION: '긴장 구간', FRACTURE: '구조 균열', TRIGGER: '방아쇠' };
export const STAGE_EMOJI = { STABLE: '🔵', TENSION: '🟤', FRACTURE: '🟠', TRIGGER: '🔴' };

// 기준값(.env로 바꿀 수 있음)
export const DEFAULTS = {
  NEAR_BW: 0.95,        // VIX/3M ≥ 이 값이면 NEAR_BACKWARDATION
  BW: 1.0,              // VIX/3M ≥ 이 값이면 BACKWARDATION
  TENSION_VVIX: 115,    // VVIX ≥ → 긴장
  TENSION_VIXPCT: 15,   // VIX 전일비 ≥ +% → 긴장
  FRACTURE_VVIX: 110, FRACTURE_VVIXPCT: 20, FRACTURE_SPX: -1.0,
  TRIGGER_VIX: 28, TRIGGER_VIXPCT: 20, TRIGGER_SPX: -2.0, TRIGGER_VVIX: 120, TRIGGER_3M: -3,
};

const r1 = x => Math.round(x * 10) / 10;
export const pct = (v, p) => (Number.isFinite(v) && Number.isFinite(p) && p) ? (v / p - 1) * 100 : NaN;

// q: {VIX,VIX9D,VIX3M,VIX6M,VVIX,SKEW,MOVE,DXY,SPX} 각 {v, prev}
export function derive(q) {
  const d = {
    vix: q.VIX.v, vixPct: pct(q.VIX.v, q.VIX.prev),
    vvix: q.VVIX.v, vvixPct: pct(q.VVIX.v, q.VVIX.prev),
    skew: q.SKEW.v, skewPct: pct(q.SKEW.v, q.SKEW.prev),
    move: q.MOVE.v, movePct: pct(q.MOVE.v, q.MOVE.prev),
    dxy: q.DXY.v, dxyPct: pct(q.DXY.v, q.DXY.prev),
    spx: q.SPX.v, spxPct: pct(q.SPX.v, q.SPX.prev),
    c3m: q.VIX3M.v - q.VIX.v,          // 3M-VIX
    c63: q.VIX6M.v - q.VIX3M.v,        // 6M-3M
    ratio: q.VIX.v / q.VIX3M.v,        // VIX/3M
    s9d: q.VIX9D.v - q.VIX.v,          // 9D-VIX
  };
  return d;
}

export function structure(ratio, T = DEFAULTS) {
  if (ratio >= T.BW) return 'BACKWARDATION';
  if (ratio >= T.NEAR_BW) return 'NEAR_BACKWARDATION';
  return 'CONTANGO';
}

// 신호등: 🟢 정상 🟡 주의 🔴 위험
export function lights(d) {
  const L = (x, red, yel) => red(x) ? '🔴' : yel(x) ? '🟡' : '🟢';
  return {
    c3m: L(d.c3m, x => x < 1, x => x < 2),
    c63: L(d.c63, x => x < 0, x => x < 0.5),
    ratio: L(d.ratio, x => x >= 1, x => x >= 0.9),
    s9d: L(d.s9d, x => x > 1, x => x > 0),
  };
}

// 원시 단계 + 핵심 신호
export function rawStage(d, T = DEFAULTS) {
  const st = structure(d.ratio, T);
  const bw = st === 'BACKWARDATION';
  const fVvix = d.vvix >= T.FRACTURE_VVIX || d.vvixPct >= T.FRACTURE_VVIXPCT;
  const fSpx = d.spxPct <= T.FRACTURE_SPX;
  const fracture = bw && (fVvix || fSpx);
  const trigger = fracture
    && (d.vix >= T.TRIGGER_VIX || d.vixPct >= T.TRIGGER_VIXPCT)
    && d.spxPct <= T.TRIGGER_SPX
    && (d.vvix >= T.TRIGGER_VVIX || d.c3m <= T.TRIGGER_3M);
  const tension = st !== 'CONTANGO' || d.vvix >= T.TENSION_VVIX || d.vixPct >= T.TENSION_VIXPCT;
  const sig = [];
  if (bw) sig.push('BACKWARDATION'); else if (st === 'NEAR_BACKWARDATION') sig.push('NEAR_BW');
  if (fVvix || d.vvix >= T.TENSION_VVIX) sig.push('VVIX');
  if (d.vixPct >= T.TENSION_VIXPCT) sig.push('VIX↑');
  if (fSpx) sig.push('SPX');
  const stage = trigger ? 'TRIGGER' : fracture ? 'FRACTURE' : tension ? 'TENSION' : 'STABLE';
  const core = stage === 'TRIGGER' ? 'BACKWARDATION' : (sig.join(' + ') || '—');
  return { stage, structure: st, core };
}

// 단계 상태기계: 올라갈 땐 즉시, 내려갈 땐 downConfirm 회 연속 낮아야
// st: {stage, since, lowerCount, lowerMax, persistSent}
export function step(st, raw, now, downConfirm = 3) {
  const s = { stage: 'STABLE', since: now, lowerCount: 0, lowerMax: null, persistSent: false, ...st };
  const I = x => STAGES.indexOf(x);
  let changed = null;
  if (I(raw) > I(s.stage)) {
    changed = { from: s.stage, to: raw };
    Object.assign(s, { stage: raw, since: now, lowerCount: 0, lowerMax: null, persistSent: false });
  } else if (I(raw) < I(s.stage)) {
    s.lowerCount += 1;
    s.lowerMax = s.lowerMax && I(s.lowerMax) > I(raw) ? s.lowerMax : raw;
    if (s.lowerCount >= downConfirm) {
      changed = { from: s.stage, to: s.lowerMax };
      Object.assign(s, { stage: s.lowerMax, since: now, lowerCount: 0, lowerMax: null, persistSent: false });
    }
  } else { s.lowerCount = 0; s.lowerMax = null; }
  return { state: s, changed };
}

// ── SPX 추세(일봉 OHLC: [{h,l,c}]) ──
export function wilder(bars, n = 14) {
  if (bars.length < 2 * n + 2) return null;
  const tr = [], pdm = [], mdm = [];
  for (let i = 1; i < bars.length; i++) {
    const b = bars[i], p = bars[i - 1];
    tr.push(Math.max(b.h - b.l, Math.abs(b.h - p.c), Math.abs(b.l - p.c)));
    const up = b.h - p.h, dn = p.l - b.l;
    pdm.push(up > dn && up > 0 ? up : 0); mdm.push(dn > up && dn > 0 ? dn : 0);
  }
  let atr = 0, sp = 0, sm = 0;
  for (let i = 0; i < n; i++) { atr += tr[i]; sp += pdm[i]; sm += mdm[i]; }
  const out = []; let adx = null; const dxs = [];
  const push = (i) => {
    const pdi = 100 * sp / atr, mdi = 100 * sm / atr;
    const dx = (pdi + mdi) ? 100 * Math.abs(pdi - mdi) / (pdi + mdi) : 0;
    if (adx === null) { dxs.push(dx); if (dxs.length === n) adx = dxs.reduce((a, b) => a + b, 0) / n; }
    else adx = (adx * (n - 1) + dx) / n;
    out.push({ atr: atr / n, pdi, mdi, adx });
  };
  push(n - 1);
  for (let i = n; i < tr.length; i++) {
    atr = atr - atr / n + tr[i]; sp = sp - sp / n + pdm[i]; sm = sm - sm / n + mdm[i]; push(i);
  }
  return out;
}

export function trend(daily, weeklyCloses) {
  const w = wilder(daily);
  if (!w || w.length < 2) return null;
  const a = w[w.length - 1], b = w[w.length - 2];
  const wc = weeklyCloses.filter(Number.isFinite);
  const sma = wc.length >= 30 ? wc.slice(-30).reduce((x, y) => x + y, 0) / 30 : NaN;
  const last = daily[daily.length - 1].c;
  return {
    pos: Number.isFinite(sma) ? (last >= sma ? 'ABOVE' : 'BELOW') : '—', sma,
    atr: a.atr, atrUp: a.atr >= b.atr, adx: a.adx, adxUp: a.adx >= b.adx, pdi: a.pdi, mdi: a.mdi,
  };
}

// ── 메시지(텔레그램 <pre> 고정폭) ──
const sgn = (x, k = 1) => (x >= 0 ? '+' : '') + x.toFixed(k);
const pc = x => Number.isFinite(x) ? ` (${sgn(x, 2)}%)` : '';
const dw = s => [...s].reduce((n, ch) => n + (/[\u1100-\u11ff\u3130-\u318f\uac00-\ud7a3]/.test(ch) ? 2 : 1), 0);
const padW = (s, w) => s + ' '.repeat(Math.max(1, w - dw(s)));
const row = (a, b, c = '') => (padW(a, 15) + (b || c ? padW(b, 10) : '') + c).trimEnd();
const row2 = (a, v) => padW(a, 15) + v;
const num = (x, k, w = 7) => x.toFixed(k).padStart(w);
const sn = (x, w = 7) => sgn(x, 1).padStart(w);

export function render({ d, raw, stage, title, trend: t, kst, et, footer, T = DEFAULTS }) {
  const L = lights(d);
  const st = raw.structure;
  const lines = [];
  lines.push(`시장 리스크 보드  ${title}`);
  lines.push('');
  lines.push(row2('현재 단계', `${STAGE_EMOJI[stage]} ${stage}${stage === 'TRIGGER' ? '' : ' (' + STAGE_KO[stage] + ')'}`));
  lines.push(row2('핵심 신호', raw.core));
  lines.push('');
  lines.push(row('TAIL HEDGE', 'SKEW', num(d.skew, 0) + pc(d.skewPct)));
  lines.push(row('VOL OF VOL', 'VVIX', num(d.vvix, 0) + pc(d.vvixPct)));
  lines.push(row('FEAR GAUGE', 'VIX', num(d.vix, 2) + pc(d.vixPct)));
  lines.push(row('VIX STRUCTURE', st));
  lines.push(row('CURVE 30-3M', '3M-VIX', sn(d.c3m) + ' ' + L.c3m));
  lines.push(row('CURVE 3M-6M', '6M-3M', sn(d.c63) + ' ' + L.c63));
  lines.push(row('CURVE RATIO', 'VIX/3M', num(d.ratio, 3) + ' ' + L.ratio));
  lines.push(row('SHORT STRESS', '9D-VIX', sn(d.s9d) + ' ' + L.s9d));
  lines.push(row('RATES VOL', 'MOVE', num(d.move, 0) + pc(d.movePct)));
  lines.push(row('USD STRESS', 'DXY', num(d.dxy, 1) + pc(d.dxyPct)));
  lines.push(row('S&P 500', 'SPX', num(d.spx, 0) + pc(d.spxPct)));
  lines.push('');
  if (stage === 'FRACTURE' || stage === 'TRIGGER') {
    lines.push(`⚠ FRACTURE + (VIX≥${T.TRIGGER_VIX} OR VIX%≥+${T.TRIGGER_VIXPCT}) + SPX≤${T.TRIGGER_SPX.toFixed(1)}% +`);
    lines.push(`(VVIX≥${T.TRIGGER_VVIX} OR 3M-VIX≤${T.TRIGGER_3M})`);
  }
  lines.push('[구조 리스크]');
  if (t) {
    lines.push('');
    lines.push(row('30W TREND', t.pos));
    lines.push(row('ATR', `${t.atr.toFixed(1)} ${t.atrUp ? '↑' : '↓'}`));
    lines.push(row('ADX', `${t.adx.toFixed(1)} ${t.adxUp ? '↑' : '↓'}`));
    lines.push(row('DI', `-DI ${t.mdi.toFixed(1)} / +DI ${t.pdi.toFixed(1)}`));
  }
  lines.push('');
  lines.push(footer);
  lines.push(`🕒 🇰🇷 ${kst} KST · 🇺🇸 ${et} ET`);
  return lines.join('\n');
}

export const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
