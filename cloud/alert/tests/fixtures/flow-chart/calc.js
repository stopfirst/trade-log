/* calc.js — 순수 계산 함수 (브라우저 + Node 공용)
 * candle: {t (ms, 봉 시작), o, h, l, c, v (base), qv (quote), tbq (taker buy quote), tbv (taker buy base)}
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.FC = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* ---------- EMA ---------- */
  // 표준 EMA: alpha = 2/(n+1), 첫 n개 SMA로 시드. 시드 이전은 null.
  function ema(values, n) {
    const out = new Array(values.length).fill(null);
    if (values.length < n) return out;
    let sum = 0;
    for (let i = 0; i < n; i++) sum += values[i];
    let prev = sum / n;
    out[n - 1] = prev;
    const a = 2 / (n + 1);
    for (let i = n; i < values.length; i++) {
      prev = values[i] * a + prev * (1 - a);
      out[i] = prev;
    }
    return out;
  }

  /* ---------- ATR (Wilder) ---------- */
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

  /* ---------- 시간대 ---------- */
  const _fmtCache = {};
  function tzParts(ms, tz) {
    let f = _fmtCache[tz];
    if (!f) {
      f = _fmtCache[tz] = new Intl.DateTimeFormat('en-US', {
        timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit'
      });
    }
    const p = {};
    for (const x of f.formatToParts(new Date(ms))) if (x.type !== 'literal') p[x.type] = +x.value;
    if (p.hour === 24) p.hour = 0;
    return p; // {year, month, day, hour, minute, second}
  }
  const KST_OFFSET = 9 * 3600e3;
  function kstParts(ms) { // KST는 서머타임 없음 → 고정 +9
    const d = new Date(ms + KST_OFFSET);
    return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate(),
      hour: d.getUTCHours(), minute: d.getUTCMinutes(), second: d.getUTCSeconds() };
  }
  const p2 = (n) => String(n).padStart(2, '0');
  function fmtKstAxis(ms) { const p = kstParts(ms); return `${p2(p.month)}/${p2(p.day)}, ${p2(p.hour)}:${p2(p.minute)}`; }
  function fmtKstStamp(ms) { const p = kstParts(ms); return `${p.year}. ${p2(p.month)}. ${p2(p.day)}. ${p2(p.hour)}:${p2(p.minute)}:${p2(p.second)} KST`; }

  /* ---------- 세션 (ICT 킬존, 뉴욕 현지시간 기준 · DST 자동 반영) ----------
   * 아시아 20:00–24:00 ET, 런던 02:00–05:00 ET, 뉴욕 07:00–10:00 ET
   * (EDT 기간 KST: 아시아 09–13시, 런던 15–18시, 뉴욕 20–23시 / EST 기간은 각 +1시간)
   * 봉의 시작 시각이 [시작, 끝) 안에 있으면 그 세션에 포함. 15분봉으로 계산하는 것을 권장. */
  const SESSIONS = [
    { key: 'asia', name: 'ASIA', start: 20, end: 24 },
    { key: 'london', name: 'LONDON', start: 2, end: 5 },
    { key: 'ny', name: 'NY', start: 7, end: 10 },
  ];
  function sessionOf(ms) {
    const p = tzParts(ms, 'America/New_York');
    const hm = p.hour + p.minute / 60;
    for (const s of SESSIONS) if (hm >= s.start && hm < s.end) return { s, p };
    return null;
  }
  /* 각 세션의 "가장 최근 인스턴스"의 고가/저가.
   * - 지금 세션이 진행 중이면 그 진행 중 인스턴스(live=true, 지금까지의 고가/저가)를,
   *   아니면 가장 최근에 끝난 인스턴스(live=false)를 돌려줍니다.
   * - 경계는 끝 미포함 [시작, 끝): 15분봉 기준 아시아(EDT)는 KST 09:00~12:45 시작 봉 16개.
   * 반환: {key, name, id, start(첫 봉 시각), end(마지막 봉 시각), schedStart, schedEnd(예정 종료 ms), h, l, live}
   * nowMs를 주지 않으면 마지막 봉 시작 시각을 '지금'으로 봅니다. */
  function sessionLevels(candles, nowMs) {
    const res = {};
    let cur = null;
    const last = {};
    for (const c of candles) {
      const so = sessionOf(c.t);
      if (!so) { cur = null; continue; }
      const id = so.s.key + ':' + so.p.year + '-' + so.p.month + '-' + so.p.day;
      if (!cur || cur.id !== id) {
        const hm = so.p.hour + so.p.minute / 60 + so.p.second / 3600;
        const schedStart = Math.round(c.t - (hm - so.s.start) * 3600e3);
        cur = { key: so.s.key, name: so.s.name, id, start: c.t, end: c.t, schedStart,
          schedEnd: schedStart + (so.s.end - so.s.start) * 3600e3, h: c.h, l: c.l };
        last[so.s.key] = cur;
      } else {
        cur.h = Math.max(cur.h, c.h); cur.l = Math.min(cur.l, c.l); cur.end = c.t;
      }
    }
    const now = nowMs ?? (candles.length ? candles[candles.length - 1].t : 0);
    for (const k of Object.keys(last)) { last[k].live = now < last[k].schedEnd; res[k] = last[k]; }
    return res;
  }

  /* ---------- 전일 고가/저가 (UTC 일봉 = KST 09:00 기준) ---------- */
  function prevDayLevels(candles, nowMs) {
    const day = 86400e3;
    const todayStart = Math.floor((nowMs ?? candles[candles.length - 1].t) / day) * day;
    const yStart = todayStart - day;
    let h = -Infinity, l = Infinity, n = 0;
    for (const c of candles) if (c.t >= yStart && c.t < todayStart) { h = Math.max(h, c.h); l = Math.min(l, c.l); n++; }
    if (!n) return null;
    return { pdh: h, pdl: l, mid: (h + l) / 2, start: yStart, end: todayStart };
  }

  /* ---------- TDO (True Day Open = 뉴욕 00:00 시가) ----------
   * nyMidnight(ms): ms 이하의 가장 최근 뉴욕 자정(America/New_York, DST 자동 반영).
   *   EDT(UTC−4) → 04:00 UTC = KST 13:00, EST(UTC−5) → 05:00 UTC = KST 14:00. */
  function nyMidnight(ms) {
    const p = tzParts(ms, 'America/New_York');
    let t = ms - ((p.hour * 60 + p.minute) * 60 + p.second) * 1000 - (((ms % 1000) + 1000) % 1000);
    // DST 전환일 보정: 그 시각이 실제로 뉴욕 00:00이 될 때까지 ±1시간
    for (let k = 0; k < 3; k++) {
      const q = tzParts(t, 'America/New_York');
      if (q.hour === 0 && q.minute === 0) break;
      t += (q.hour >= 12 ? 1 : -1) * 3600e3;
    }
    return t > ms ? nyMidnight(t - 1) : t;
  }
  /* trueDayOpen: 뉴욕 자정을 포함하는 봉의 시가.
   * 봉 시작이 자정과 정확히 같으면 approx=false, 자정을 품은 봉(예: EST 기간 4시간봉)이면 approx=true.
   * 반환 {t(뉴욕 자정 ms), barT(그 봉 시작), o, approx} · 데이터에 없으면 null */
  function trueDayOpen(candles, nowMs, tfMs) {
    if (!candles || !candles.length) return null;
    const now = nowMs ?? candles[candles.length - 1].t;
    const tf = tfMs ?? (candles.length > 1 ? candles[1].t - candles[0].t : 0);
    const t0 = nyMidnight(now);
    for (const c of candles) if (c.t <= t0 && t0 < c.t + tf) return { t: t0, barT: c.t, o: c.o, approx: c.t !== t0 };
    return null;
  }

  /* ---------- CVD ----------
   * delta = 테이커 매수 − 테이커 매도 = 2·buy − total. 누적합(첫 봉에서 0부터 시작하지 않고 첫 봉 delta부터). */
  function cvdFromBuyTotal(buy, total) {
    const out = []; let s = 0;
    for (let i = 0; i < buy.length; i++) {
      if (buy[i] == null || total[i] == null) { out.push(null); continue; }
      s += 2 * buy[i] - total[i]; out.push(s);
    }
    return out;
  }
  // 근사 CVD(테이커 데이터 없을 때): 양봉이면 +거래대금, 음봉이면 −거래대금, 도지는 0
  function cvdApprox(candles) {
    const out = []; let s = 0;
    for (const c of candles) { const q = c.qv ?? c.v * c.c; s += Math.sign(c.c - c.o) * q; out.push(s); }
    return out;
  }

  /* ---------- FVG (3봉 공정가치갭) ----------
   * 강세: low[i+1] > high[i-1] → 구간 [high[i-1], low[i+1]] (i = 가운데 봉)
   * 약세: high[i+1] < low[i-1] → 구간 [high[i+1], low[i-1]]
   * 최소 크기: 갭 ≥ minAtr × ATR14 (기본 0.1)
   * 메움(fill): 이후 봉이 갭 반대편 끝까지 닿으면 (강세: low ≤ 하단, 약세: high ≥ 상단) 그 봉에서 종료 */
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

  /* ---------- 오더블록 (OB) ----------
   * 방식 2가지 (opts.mode, 기본은 setOBMode()로 정한 값 = 'baekdo')
   *
   * [백도식 'baekdo' — 기본] 구조 돌파(BOS/CHoCH) 기준
   *  1) 스윙: 프랙탈. 고가[s]가 왼쪽 k봉보다 크고(>) 오른쪽 k봉 이상(≥)이면 스윙 고점 (기본 k=2, opts.swing). s+k봉 마감 후 확정.
   *  2) 구조(추세) 상태: 돌파가 날 때마다 추세 = 그 방향, 보호 극점 = 그 돌파 레그의 원점 m(강세: 최저가 봉, 약세: 최고가 봉).
   *     - 추세 방향(또는 추세 없음) 돌파 = BOS: 종가가 아직 넘지 않은 가장 최근 확정 스윙(강세: 고가, 약세: 저가)을 넘음.
   *     - 추세 반대 돌파 = CHoCH: 종가가 보호 극점(상승 추세 → 보호 저점의 저가, 하락 추세 → 보호 고점의 고가)을 넘을 때만.
   *       그 사이의 내부 스윙 돌파는 구조 돌파가 아님(OB 없음, 그 스윙은 소진).
   *  3) 강세 OB(돌파 봉 i, 깨진 점 s): 레그 원점 m = [s, i] 최저가 봉. OB = [m−3, i−1] 안의 마지막 음봉 j 중
   *     저가가 레그 하단 1/3 안에 있는 것(저가[j] − 저가[m] ≤ (최고가[m..i] − 저가[m]) / 3) = 상승 직전 마지막 음봉.
   *     변위 조건: 최고가[j..i] − 저가[j] ≥ disp × ATR14(기본 1.5) 이거나, j 이후~i 사이에 강세 FVG가 있을 것.
   *     구간 = 그 봉의 몸통 [min(시가,종가), max(시가,종가)]. 몸통 < 0.1×ATR(도지)이면 바깥쪽 꼬리까지(강세: 하단 = 저가).
   *  4) 약세는 대칭(하락 직전 마지막 양봉, 도지는 위 꼬리까지).
   *  5) 무효화: 돌파 봉 다음부터 마감된 봉의 종가가 구간 반대편을 넘으면(강세: 종가 < 하단) end = 그 봉. 첫 터치는 touched.
   *     opts.lastClosed(기본 마지막 봉) 이후의 진행 중인 봉은 돌파·무효화 판정에 쓰지 않음. 한 스윙은 한 번만 돌파.
   *
   * [넓게 'wide' — 이전 방식] 음봉 j 다음 봉 j+1이 양봉이고, j+1..j+3 중 어떤 종가가 high[j]를 상향 돌파하며,
   *          max(high[j+1..j+3]) − low[j] ≥ disp × ATR14 (기본 1.5) → 구간 [low[j], high[j]] (꼬리 전체)
   *   약세 OB: 양봉 j, j+1 음봉, j+1..j+3 중 종가가 low[j] 하향 돌파, high[j] − min(low[j+1..j+3]) ≥ disp × ATR
   *   무효화: 이후 종가가 구간을 반대로 이탈(강세: close < low[j], 약세: close > high[j]) → end = 그 봉
   *   BB+FVG(브레이커)는 항상 이 넓은 후보를 씁니다(findBBFVG 참고). */
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


  /* ---------- BB+FVG (브레이커 블록 + FVG 겹침, 일명 Unicorn) ----------
   * 1) 브레이커: 실패한 OB. findOBWide(넓게)의 OB가 종가로 반대편 돌파되면(=OB 무효화 봉 brk) 방향이 뒤집혀 브레이커가 됨.
   *    약세 OB(하락 직전 양봉) → 이후 종가 > 고가 ⇒ 강세 브레이커 / 강세 OB(상승 직전 음봉) → 종가 < 저가 ⇒ 약세 브레이커
   *    브레이커 구간 = 그 OB 봉의 몸통 [min(시가,종가), max(시가,종가)] (opts.wicks=true면 꼬리 포함 고가~저가)
 *    OB 봉 바로 앞에 같은 색 봉이 이어지면 그 묶음(최대 3개, opts.maxRun) 몸통 전체를 구간으로 봄 (ICT 'series of candles')
   * 2) 돌파 변위 안의 같은 방향 FVG: 가운데 봉 m이 OB 봉 이후이고 brk−2 ≤ m ≤ brk+N (기본 N=10)
   * 3) BB+FVG = 브레이커 구간 ∩ FVG 구간 (겹침 > 0일 때만). 한 브레이커당 돌파에 가장 가까운 FVG 1개.
   * 무효화: FVG 생성 다음 봉부터 종가가 구간 반대편 끝을 넘으면(강세: 종가 < 하단, 약세: 종가 > 상단) end = 그 봉.
   * 터치(touched): 꼬리가 구간 안쪽 끝에 닿은 첫 봉(강세: 저가 ≤ 상단, 약세: 고가 ≥ 하단) — 표시용, 유지. */
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


  /* ---------- 오른쪽 라벨 겹침 방지 ----------
   * items: [{y, ...}] (y = 실제 레벨의 화면 y). 각 라벨에 ly(표시 y)를 넣어 돌려줍니다.
   * 위→아래 순서를 유지하면서 최소 간격 gap을 보장하고 [top, bottom] 안에 머물게 합니다.
   * 원래 y에서 가장 덜 움직이도록 겹치는 묶음은 중심을 기준으로 펼칩니다. */
  function layoutLabels(items, gap, top, bottom) {
    const a = items.slice().sort((p, q) => p.y - q.y);
    // 묶음(cluster) 단위로 펼치기: 겹치는 이웃을 합쳐 평균 y 중심으로 균등 배치
    let groups = a.map(it => ({ items: [it], c: it.y }));
    const span = (g) => (g.items.length - 1) * gap;
    const topOf = (g) => g.c - span(g) / 2;
    let merged = true;
    while (merged) {
      merged = false;
      for (let i = 1; i < groups.length; i++) {
        const g0 = groups[i - 1], g1 = groups[i];
        if (topOf(g1) - (topOf(g0) + span(g0)) < gap) {
          const its = g0.items.concat(g1.items);
          const c = its.reduce((s, it) => s + it.y, 0) / its.length;
          groups.splice(i - 1, 2, { items: its, c }); merged = true; break;
        }
      }
    }
    for (const g of groups) { let y = topOf(g); for (const it of g.items) { it.ly = y; y += gap; } }
    // 경계 안으로: 아래로 넘치면 위로 밀고, 위로 넘치면 아래로 밀기
    for (let i = a.length - 1; i >= 0; i--) { const lim = i === a.length - 1 ? bottom : a[i + 1].ly - gap; if (a[i].ly > lim) a[i].ly = lim; }
    for (let i = 0; i < a.length; i++) { const lim = i === 0 ? top : a[i - 1].ly + gap; if (a[i].ly < lim) a[i].ly = lim; }
    return a;
  }

  /* ---------- 시계열 정렬 ---------- */
  // 다른 소스 시리즈 {t, ...}를 기준 봉 시각에 맞춰 값 배열로 (없으면 null)
  function alignTo(times, series, key) {
    const m = new Map(series.map(x => [x.t, x[key]]));
    return times.map(t => (m.has(t) ? m.get(t) : null));
  }
  // 하위 봉을 상위 봉 버킷으로 합산 (예: 1h → 4h). 버킷은 UTC 기준 tfMs 정렬.
  function resample(candles, tfMs) {
    const out = []; let cur = null;
    for (const c of candles) {
      const b = Math.floor(c.t / tfMs) * tfMs;
      if (!cur || cur.t !== b) { cur = { t: b, o: c.o, h: c.h, l: c.l, c: c.c, v: c.v }; out.push(cur); }
      else { cur.h = Math.max(cur.h, c.h); cur.l = Math.min(cur.l, c.l); cur.c = c.c; cur.v += c.v; }
    }
    return out;
  }

  /* ---------- 숫자 포맷 ---------- */
  function fmtBig(x, sign) {
    if (x == null || !isFinite(x)) return '–';
    const a = Math.abs(x); let s;
    if (a >= 1e9) s = (a / 1e9).toFixed(2) + 'B';
    else if (a >= 1e6) s = (a / 1e6).toFixed(2) + 'M';
    else if (a >= 1e3) s = (a / 1e3).toFixed(2) + 'K';
    else s = a.toFixed(2);
    return (x < 0 ? '-' : (sign && x > 0 ? '+' : '')) + s;
  }
  function fmtPrice(x, ref) {
    if (x == null || !isFinite(x)) return '–';
    const r = Math.abs(ref ?? x);
    const d = r >= 10000 ? 1 : r >= 100 ? 2 : r >= 1 ? 3 : 5;
    return x.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
  }

  return { ema, atr, tzParts, kstParts, fmtKstAxis, fmtKstStamp, SESSIONS, sessionOf, sessionLevels,
    prevDayLevels, nyMidnight, trueDayOpen, layoutLabels, cvdFromBuyTotal, cvdApprox, findFVG, findOB, findOBWide, findOBBaekdo, swings, setOBMode, getOBMode, findBBFVG, alignTo, resample, fmtBig, fmtPrice };
});
