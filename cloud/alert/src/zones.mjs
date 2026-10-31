// trade-alert 2.10.0 (alert14) — flow-chart(stopfirst/flow-chart, commit e99a059)의 존 계산을 Node로 옮긴 것.
//  * 아래 'flow-chart calc.js 그대로' 구간은 flow-chart js/calc.js의 atr·findFVG·findOB(백도식/넓게)·swings·findBBFVG를
//    글자 그대로 복사했습니다(수정 금지). tests/zones.test.mjs가 원본(tests/fixtures/flow-chart/calc.js)과 소스 동일성 + 결과 동일성을 확인합니다.
//  * computeZones()  = flow-chart js/data.js loadAll()의 존 부분(전체 봉 = 표시 봉 + 워밍업 260, 진행 중 봉은 OB 돌파·무효화에서 제외).
//  * selectShown()   = flow-chart js/render.js의 표시 선택(OB 백도식: 방향별 가장 최근 1개이고 OB 봉이 표시 구간 안 /
//                       BB+FVG: 무효화 안 된 것 중 마지막 봉 종가에 가까운 2개). 화면 가격 범위(y축) 필터만 생략 — 그 밖의 존은 가격이 닿을 때 화면 안에 들어옴.
//  순수 함수(네트워크·파일 없음).
'use strict';
export const FLOW_CHART_COMMIT='e99a059';
export const WARMUP=260; // flow-chart data.js WARMUP (EMA200 워밍업)

// ======================= flow-chart calc.js 그대로 (e99a059) =======================
  function atr(candles, n = 14) {
    const out = new Array(candles.length).fill(null);
    if (candles.length <= n) return out;
    const tr = candles.map((c, i) => {
      if (i === 0) return c.h - c.l;
      const pc = candles[i - 1].c;
      return Math.max(c.h - c.l, Math.abs(c.h - pc), Math.abs(c.l - pc));
    });
    let s = 0;
    for (let i = 1; i <= n; i++) s += tr[i];
    let prev = s / n;
    out[n] = prev;
    for (let i = n + 1; i < candles.length; i++) {
      prev = (prev * (n - 1) + tr[i]) / n;
      out[i] = prev;
    }
    return out;
  }


  function findFVG(candles, opts = {}) {
    const minAtr = opts.minAtr ?? 0.1;
    const A = atr(candles, 14);
    const out = [];
    for (let i = 1; i < candles.length - 1; i++) {
      const a = candles[i - 1], b = candles[i + 1];
      const thr = (A[i] ?? (candles[i].h - candles[i].l)) * minAtr;
      let g = null;
      if (b.l > a.h && b.l - a.h >= thr) g = { dir: 'bull', top: b.l, bottom: a.h };
      else if (b.h < a.l && a.l - b.h >= thr) g = { dir: 'bear', top: a.l, bottom: b.h };
      if (!g) continue;
      g.i0 = i - 1; g.created = i + 1; g.end = null;
      for (let k = i + 2; k < candles.length; k++) {
        const c = candles[k];
        if ((g.dir === 'bull' && c.l <= g.bottom) || (g.dir === 'bear' && c.h >= g.top)) { g.end = k; break; }
      }
      out.push(g);
    }
    return out;
  }


  let OB_MODE = 'baekdo';
  function setOBMode(m) { OB_MODE = m === 'wide' ? 'wide' : 'baekdo'; return OB_MODE; }
  function getOBMode() { return OB_MODE; }
  function findOB(candles, opts = {}) {
    return (opts.mode || OB_MODE) === 'wide' ? findOBWide(candles, opts) : findOBBaekdo(candles, opts);
  }
  // 프랙탈 스윙: {hi:[s...], lo:[s...]} (확정 시점 = s + k)
  function swings(candles, k = 2) {
    const hi = [], lo = [];
    for (let s = k; s < candles.length - k; s++) {
      let h = true, l = true;
      for (let q = 1; q <= k; q++) {
        if (!(candles[s].h > candles[s - q].h && candles[s].h >= candles[s + q].h)) h = false;
        if (!(candles[s].l < candles[s - q].l && candles[s].l <= candles[s + q].l)) l = false;
      }
      if (h) hi.push(s); if (l) lo.push(s);
    }
    return { hi, lo };
  }
  function findOBBaekdo(candles, opts = {}) {
    const k = opts.swing ?? 2, disp = opts.disp ?? 1.5, doji = opts.doji ?? 0.1;
    const A = atr(candles, 14), n = candles.length;
    const L = Math.min(n - 1, opts.lastClosed ?? n - 1); // 마감된 마지막 봉 (진행 중인 봉은 돌파·무효화에 안 씀)
    const sw = swings(candles, k);
    const fvg = findFVG(candles, opts);
    const out = [], used = new Set();
    const ptr = { hi: 0, lo: 0 }, cur = { hi: -1, lo: -1 };
    let trend = null, prot = -1; // 구조 추세 + 보호 극점(직전 돌파 레그의 원점: 상승 추세 = 보호 저점, 하락 추세 = 보호 고점)
    for (let i = 0; i <= L; i++) {
      for (const key of ['hi', 'lo']) { const list = sw[key]; while (ptr[key] < list.length && list[ptr[key]] + k < i) cur[key] = list[ptr[key]++]; }
      const c = candles[i];
      for (const dir of ['bull', 'bear']) {
        const bull = dir === 'bull', s = cur[bull ? 'hi' : 'lo'];
        const lvlOf = (q) => bull ? candles[q].h : candles[q].l;
        const beyond = (q) => q >= 0 && (bull ? c.c > lvlOf(q) : c.c < lvlOf(q));
        let brokeAt = -1;
        if (trend && trend !== dir) { if (beyond(prot)) brokeAt = prot; }          // 추세 반대(CHoCH): 보호 극점을 종가로 깨야만
        else if (s >= 0 && !used.has(s) && beyond(s)) brokeAt = s;              // 추세 방향(BOS): 가장 최근 확정 스윙
        if (s >= 0 && !used.has(s) && beyond(s)) used.add(s);                   // 내부 스윙도 한 번 넘으면 소진
        if (brokeAt < 0) continue;
        // 레그 원점 m: [brokeAt, i] 최저가(강세) / 최고가(약세) → 새 보호 극점
        let m = brokeAt;
        for (let q = brokeAt; q <= i; q++) if (bull ? candles[q].l < candles[m].l : candles[q].h > candles[m].h) m = q;
        const kind = trend && trend !== dir ? 'choch' : 'bos';
        trend = dir; prot = m;
        const a = A[i]; if (a == null) continue;
        let ext = bull ? -Infinity : Infinity;
        for (let q = m; q <= i; q++) ext = bull ? Math.max(ext, candles[q].h) : Math.min(ext, candles[q].l);
        const leg = Math.abs(ext - (bull ? candles[m].l : candles[m].h));
        let j = -1;
        for (let q = i - 1; q >= Math.max(0, m - 3); q--) {
          const x = candles[q];
          if (bull ? !(x.c < x.o) : !(x.c > x.o)) continue;
          const off = bull ? x.l - candles[m].l : candles[m].h - x.h;
          if (off <= leg / 3) { j = q; break; }
        }
        if (j < 0 || out.some(q => q.dir === dir && q.i0 === j)) continue; // 같은 봉 OB 중복 방지
        const o = candles[j];
        let ex2 = bull ? -Infinity : Infinity;
        for (let q = j; q <= i; q++) ex2 = bull ? Math.max(ex2, candles[q].h) : Math.min(ex2, candles[q].l);
        const move = bull ? ex2 - o.l : o.h - ex2;
        const hasFvg = fvg.some(g => g.dir === dir && g.i0 + 1 > j && g.i0 + 1 <= i);
        if (!(move >= disp * a || hasFvg)) continue;
        let top = Math.max(o.o, o.c), bottom = Math.min(o.o, o.c);
        const thin = top - bottom < doji * a;
        if (thin) { if (bull) bottom = o.l; else top = o.h; }
        const z = { dir, top, bottom, i0: j, brk: i, swing: brokeAt, kind, created: i, doji: thin, end: null, touched: null, mode: 'baekdo' };
        for (let q = i + 1; q < n; q++) {
          const x = candles[q];
          if (z.touched == null && (bull ? x.l <= top : x.h >= bottom)) z.touched = q;
          if (q <= L && (bull ? x.c < bottom : x.c > top)) { z.end = q; break; }
        }
        out.push(z);
      }
    }
    return out.sort((a, b) => a.i0 - b.i0 || a.brk - b.brk);
  }
  function findOBWide(candles, opts = {}) {
    const disp = opts.disp ?? 1.5, look = 3;
    const A = atr(candles, 14);
    const out = [];
    for (let j = 1; j < candles.length - 1; j++) {
      const c = candles[j], n1 = candles[j + 1];
      const a = A[j]; if (a == null) continue;
      const seg = candles.slice(j + 1, Math.min(candles.length, j + 1 + look));
      let ob = null;
      if (c.c < c.o && n1.c > n1.o) {
        const brk = seg.some(x => x.c > c.h), mx = Math.max(...seg.map(x => x.h));
        if (brk && mx - c.l >= disp * a) ob = { dir: 'bull', top: c.h, bottom: c.l };
      } else if (c.c > c.o && n1.c < n1.o) {
        const brk = seg.some(x => x.c < c.l), mn = Math.min(...seg.map(x => x.l));
        if (brk && c.h - mn >= disp * a) ob = { dir: 'bear', top: c.h, bottom: c.l };
      }
      if (!ob) continue;
      ob.i0 = j; ob.end = null; ob.touched = null; ob.mode = 'wide';
      for (let k = j + look + 1; k < candles.length; k++) {
        const x = candles[k];
        if (ob.touched == null && ((ob.dir === 'bull' && x.l <= ob.top) || (ob.dir === 'bear' && x.h >= ob.bottom))) ob.touched = k;
        if ((ob.dir === 'bull' && x.c < ob.bottom) || (ob.dir === 'bear' && x.c > ob.top)) { ob.end = k; break; }
      }
      out.push(ob);
    }
    return out;
  }



  function findBBFVG(candles, opts = {}) {
    const N = opts.n ?? 10, wicks = !!opts.wicks, maxRun = opts.maxRun ?? 3;
    // 브레이커 후보는 항상 '넓게'(이전 방식) OB — 백도식 OB는 BOS당 1개라 후보가 너무 적어 BB+FVG가 거의 사라짐
    const obs = opts.ob && opts.ob.every(o => o.mode === 'wide') ? opts.ob : findOBWide(candles, opts);
    const fvgs = opts.fvg || findFVG(candles, opts);
    const out = [];
    for (const ob of obs) {
      if (ob.end == null) continue;               // 아직 돌파되지 않은 OB → 브레이커 아님
      const k = ob.i0, brk = ob.end;
      const dir = ob.dir === 'bear' ? 'bull' : 'bear';
      // ICT: 같은 색 봉이 연속이면 그 묶음 전체가 OB (최대 maxRun개)
      const up = (x) => x.c > x.o, same = ob.dir === 'bear' ? up : (x) => x.c < x.o;
      let s0 = k; while (s0 > 0 && k - s0 + 1 < maxRun && same(candles[s0 - 1])) s0--;
      let bbTop = -Infinity, bbBottom = Infinity;
      for (let q = s0; q <= k; q++) { const c = candles[q];
        bbTop = Math.max(bbTop, wicks ? c.h : Math.max(c.o, c.c)); bbBottom = Math.min(bbBottom, wicks ? c.l : Math.min(c.o, c.c)); }
      let best = null;
      for (const g of fvgs) {
        const m = g.i0 + 1;
        if (g.dir !== dir || m <= k || m < brk - 2 || m > brk + N) continue;
        const top = Math.min(bbTop, g.top), bottom = Math.max(bbBottom, g.bottom);
        if (top - bottom <= 0) continue;
        if (!best || Math.abs(m - brk) < Math.abs(best.m - brk)) best = { g, m, top, bottom };
      }
      if (!best) continue;
      const z = { dir, top: best.top, bottom: best.bottom, mid: (best.top + best.bottom) / 2,
        obI: k, obStart: s0, brk, fvgI: best.m, i0: s0, created: best.g.created,
        bbTop, bbBottom, fvgTop: best.g.top, fvgBottom: best.g.bottom, end: null, touched: null };
      for (let j = Math.max(best.g.created, brk) + 1; j < candles.length; j++) {
        const x = candles[j];
        if (z.touched == null && ((dir === 'bull' && x.l <= z.top) || (dir === 'bear' && x.h >= z.bottom))) z.touched = j;
        if ((dir === 'bull' && x.c < z.bottom) || (dir === 'bear' && x.c > z.top)) { z.end = j; break; }
      }
      out.push(z);
    }
    return out;
  }
// ===================== /flow-chart calc.js 그대로 (e99a059) =====================

export {atr,findFVG,findOB,findOBBaekdo,findOBWide,swings,findBBFVG,setOBMode,getOBMode};

/** flow-chart data.js loadAll()의 존 계산 부분과 같음.
 *  full: 봉 배열(오래된 → 최신, {t,o,h,l,c}), 마지막이 진행 중 봉일 수 있음. bars: 차트 표시 봉 수(기본 100).
 *  반환 인덱스는 full 기준(절대). ob/bbfvg = 차트가 받는 목록(무효화 안 됨·워밍업 범위), obAll/bbAll = 원본 전체. */
export function computeZones(full,{nowMs,tfMs,bars=100}={}){
  const n=full.length;
  if(!n)return {n:0,cut:0,lastClosed:-1,obAll:[],bbAll:[],ob:[],bbfvg:[]};
  const T=tfMs??(n>1?full[1].t-full[0].t:3600e3),now=nowMs??Date.now();
  const cut=Math.max(0,n-bars);
  const lastClosed=n-1-(full[n-1].t+T>now?1:0); // data.js: 진행 중인 마지막 봉은 OB 돌파·무효화 판정에서 제외
  const obAll=findOB(full,{lastClosed,mode:'baekdo'}),fvgAll=findFVG(full);
  const ob=obAll.filter(z=>z.end==null&&z.i0-cut>=-WARMUP);
  const bbAll=findBBFVG(full,{ob:obAll,fvg:fvgAll});
  const bbfvg=bbAll.filter(z=>z.end==null&&z.i0-cut>=-WARMUP);
  return {n,cut,lastClosed,tfMs:T,obAll,bbAll,ob,bbfvg};
}

/** flow-chart render.js의 표시 선택(가격 y축 범위 필터 제외). lastC = 마지막 봉 종가. */
export function selectShown(Z,full){
  const out={ob:[],bbfvg:[]};if(!Z||!Z.n)return out;
  const lastC=full[full.length-1].c;
  const live=Z.ob.filter(z=>z.end==null);
  for(const dir of ['bull','bear']){
    const z=live.filter(q=>q.dir===dir).sort((a,b)=>b.i0-a.i0||b.created-a.created)[0];
    if(z&&z.i0-Z.cut>=0)out.ob.push(z); // OB 봉이 표시 구간(마지막 bars개) 안에 있을 때만
  }
  out.bbfvg=Z.bbfvg.filter(z=>z.end==null).sort((a,b)=>Math.abs(a.mid-lastC)-Math.abs(b.mid-lastC)).slice(0,2);
  return out;
}

/** 감시용 존 레코드. id = 종목:종류:방향:시작 봉 시각(ms). touchFromT = 이 시각 '이후' 봉부터 터치로 인정(flow-chart touched와 같은 시작점). */
export function zoneRecord(sym,tf,kind,z,full){
  const t0=full[z.i0].t;
  const from=kind==='bbfvg'?Math.max(z.created,z.brk):z.brk;
  return {id:`${sym}:${kind}:${z.dir}:${t0}`,sym,tf,kind,dir:z.dir,top:z.top,bottom:z.bottom,t0,touchFromT:full[Math.min(from,full.length-1)].t};
}
