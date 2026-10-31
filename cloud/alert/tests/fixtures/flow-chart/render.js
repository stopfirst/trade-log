/* render.js — 캔버스 렌더러 (화면 + PNG 내보내기 공용) */
(function () {
  'use strict';
  const FC = self.FC;
  const FONT = "'Pretendard','Noto Sans KR','Apple SD Gothic Neo','Malgun Gothic',system-ui,sans-serif";
  const COL = {
    up: '#5aa889', down: '#c8607e', grid: '#efeff2', axis: '#8a8f99', text: '#3b3f46',
    ema: { 20: '#2f86a6', 50: '#9a5fb0', 100: '#d08a3a', 200: '#4a5fb8' },
    asia: '#5b7fc7', london: '#3f9a6e', ny: '#d08a3a', pd: '#9aa0aa', mid: '#b8862f', tdo: '#d0688c',
    bbBull: '#3f7f5f', bbBear: '#b04a6a',
  };
  const SESSION_COL = { asia: COL.asia, london: COL.london, ny: COL.ny };
  const hexRgb = (h) => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16)).join(',');
  const RGB = { asia: hexRgb(COL.asia), london: hexRgb(COL.london), ny: hexRgb(COL.ny), pd: '128,134,146', mid: hexRgb(COL.mid), tdo: hexRgb(COL.tdo), bull: '80,160,125', bear: '200,96,126', bbBull: hexRgb(COL.bbBull), bbBear: hexRgb(COL.bbBear) };

  function xLabelIdx(n) { return [Math.round(n * 0.08), Math.round(n * 0.5), Math.round(n * 0.92) - 1].map(i => Math.max(0, Math.min(n - 1, i))); }

  // 크기가 그대로면 캔버스 버퍼를 다시 만들지 않고 지우기만 함 (모바일 스크롤 중 재할당 → 합성 잔상 방지)
  function setupCanvas(cv, cssW, cssH) {
    const dpr = Math.min(3, self.devicePixelRatio || 1);
    const w = Math.round(cssW * dpr), h = Math.round(cssH * dpr);
    if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
    if (cv.style.width !== cssW + 'px') cv.style.width = cssW + 'px';
    if (cv.style.height !== cssH + 'px') cv.style.height = cssH + 'px';
    const ctx = cv.getContext('2d');
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, w, h);
    ctx.setTransform(w / cssW, 0, 0, h / cssH, 0, 0); return ctx;
  }

  function idxOfTime(times, t, tfMs) {
    if (t < times[0]) return -1;
    for (let i = 0; i < times.length; i++) if (times[i] <= t && t < times[i] + tfMs) return i;
    return times.length - 1;
  }

  /* ---------- 메인 차트 ---------- */
  function drawMain(ctx, x0, y0, W, H, D, hover, opt) {
    opt = opt || {};
    const fs = opt.fs || 11;
    const C = D.candles, n = C.length;
    ctx.save(); ctx.translate(x0, y0);
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = COL.text; ctx.font = `${fs + 1}px ${FONT}`; ctx.textBaseline = 'top'; ctx.textAlign = 'left';
    ctx.fillText('가격·ICT', 4, 2);
    const narrow = !!opt.narrow;
    const show = Object.assign({ sess: true, pd: true, ob: true, fvg: true, tdo: true, bbfvg: true }, opt.show || {});
    const T = 26, B = 24, L = narrow ? 50 : 58;
    const lastC = C[n - 1].c, ref = Math.abs(lastC);

    // y 범위: 캔들 + 가까운 레벨(범위의 35% 이내)
    let lo = Math.min(...C.map(c => c.l)), hi = Math.max(...C.map(c => c.h));
    const rng = hi - lo || hi * 0.01;
    const levels = [];
    if (show.pd && D.pd) {
      levels.push({ v: D.pd.pdh, name: 'PDH', key: 'pd' });
      levels.push({ v: D.pd.pdl, name: 'PDL', key: 'pd' });
      if (D.pd.mid != null) levels.push({ v: D.pd.mid, name: narrow ? 'MID' : 'PD MID', key: 'mid' });
    }
    if (show.tdo && D.tdo) levels.push({ v: D.tdo.o, name: D.tdo.approx ? 'TDO≈' : 'TDO', key: 'tdo' });
    const sessList = [];
    if (show.sess) for (const k of ['asia', 'london', 'ny']) {
      const s = D.sessions && D.sessions[k]; if (!s) continue;
      const nm = (narrow && k === 'london' ? 'LDN' : s.name) + (s.live ? (narrow ? '(진행)' : ' (진행중)') : '');
      sessList.push({ k, s });
      levels.push({ v: s.h, name: nm + ' H', key: k, sess: s });
      levels.push({ v: s.l, name: nm + ' L', key: k, sess: s });
    }
    if (show.bbfvg) for (const z of (D.bbfvg || []).filter(z => z.end == null).sort((a, b) => Math.abs(a.mid - lastC) - Math.abs(b.mid - lastC)).slice(0, 1)) for (const v of [z.top, z.bottom]) levels.push({ v, rangeOnly: true }); // 가장 가까운 1개만 y범위에 반영
    for (const lv of levels) if (lv.v > hi && lv.v - hi < rng * 0.35) hi = lv.v; else if (lv.v < lo && lo - lv.v < rng * 0.35) lo = lv.v;
    const pad = (hi - lo) * 0.04; lo -= pad; hi += pad;
    const inR = (v) => v >= lo && v <= hi;

    // OB 표시
    //  백도식(기본): 방향별로 가장 최근(OB 봉이 가장 늦은) 유효 OB 1개씩 → OB 봉이 화면 안 + 화면 가격 범위 안일 때만 (최대 강세 1 + 약세 1)
    //  넓게(이전 방식): 살아있는 OB 중 현재가 위 2개 / 아래 2개(가까운 순) + 현재가를 품은 OB 1개
    const live = (D.ob || []).filter(z => z.end == null);
    const visOB = (z) => inR(z.top) || inR(z.bottom) || (z.top > hi && z.bottom < lo);
    const baekdo = live.length ? live.every(z => z.mode === 'baekdo') : FC.getOBMode() === 'baekdo';
    let obs = [];
    if (show.ob && baekdo) {
      for (const dir of ['bull', 'bear']) {
        const z = live.filter(q => q.dir === dir).sort((a, b) => b.i0 - a.i0 || b.created - a.created)[0];
        if (z && z.i0 >= 0 && visOB(z)) obs.push(z); // OB 봉이 화면 안에 있을 때만 (박스는 그 봉에서 시작)
      }
    } else if (show.ob) {
      const NOB = 2;
      const mid = (z) => Math.abs((z.top + z.bottom) / 2 - lastC);
      obs = [
        ...live.filter(z => z.bottom <= lastC && z.top >= lastC).sort((a, b) => mid(a) - mid(b)).slice(0, 1),
        ...live.filter(z => z.bottom > lastC).sort((a, b) => a.bottom - b.bottom).slice(0, NOB),
        ...live.filter(z => z.top < lastC).sort((a, b) => b.top - a.top).slice(0, NOB),
      ].filter(visOB);
    }

    // BB+FVG: 무효화되지 않은 것 중 현재가에 가까운 최대 2개 (화면 가격 범위 안)
    const bbs = !show.bbfvg ? [] : (D.bbfvg || []).filter(z => z.end == null)
      .filter(z => inR(z.top) || inR(z.bottom) || (z.top > hi && z.bottom < lo))
      .sort((a, b) => Math.abs(a.mid - lastC) - Math.abs(b.mid - lastC)).slice(0, 2);

    // 오른쪽 라벨 텍스트 → 폭 측정 → 오른쪽 여백(R) 결정
    const fmtLv = (v) => { const d = ref >= 10000 ? 0 : ref >= 100 ? 1 : ref >= 1 ? 3 : 5; return v.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d }); };
    const lfs = narrow ? fs - 1.5 : fs - 1;
    ctx.font = `${lfs}px ${FONT}`;
    const labels = [];
    for (const lv of levels) if (!lv.rangeOnly && inR(lv.v)) labels.push({ v: lv.v, text: `${lv.name} ${fmtLv(lv.v)}`, key: lv.key });
    const visMid = (z) => (Math.min(z.top, hi) + Math.max(z.bottom, lo)) / 2; // 화면에 보이는 부분의 중앙
    for (const z of obs) labels.push({ v: visMid(z), text: 'OB', rgbs: z.dir === 'bull' ? RGB.bull : RGB.bear, ob: true });
    for (const z of bbs) labels.push({ v: visMid(z), text: narrow ? 'BB+FVG' : `BB+FVG ${fmtLv(z.mid)}`, rgbs: z.dir === 'bull' ? RGB.bbBull : RGB.bbBear, ob: true });
    const maxW = Math.max(0, ...labels.map(lb => ctx.measureText(lb.text).width));
    const R = Math.round(Math.max(narrow ? 40 : 56, Math.min(W * (narrow ? 0.36 : 0.26), maxW + 18)));
    const pw = W - L - R, ph = H - T - B;
    const step = pw / n;
    const X = (i) => L + (i + 0.5) * step;
    const Y = (v) => T + (hi - v) / (hi - lo) * ph;
    // 시각 → x (봉 안에서 비례 위치). 화면 왼쪽보다 이르면 null
    const XT = (t) => { const i = idxOfTime(D.times, t, D.tfMs); return i < 0 ? null : Math.min(L + pw, X(i) - step / 2 + Math.max(0, Math.min(1, (t - D.times[i]) / D.tfMs)) * step); };

    // 그리드 + y축
    ctx.font = `${fs - 1}px ${FONT}`; ctx.textBaseline = 'middle';
    for (let g = 0; g <= 4; g++) {
      const v = hi - (hi - lo) * g / 4, y = Y(v);
      ctx.strokeStyle = COL.grid; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(L, y); ctx.lineTo(L + pw, y); ctx.stroke();
      ctx.fillStyle = COL.axis; ctx.textAlign = 'right';
      ctx.fillText(ref >= 10000 ? (v / 1000).toFixed(1) + 'k' : FC.fmtPrice(v, ref), L - 6, y);
    }
    ctx.save(); ctx.beginPath(); ctx.rect(L, T, pw, ph); ctx.clip();

    // FVG (점선 박스): 미충족 최근 N개 + 화면 안에서 메워진 최근 M개
    if (show.fvg) {
      const fvgs = [...D.fvg.filter(z => z.end == null).slice(narrow ? -3 : -4), ...D.fvg.filter(z => z.end != null && z.end >= 0 && z.i0 >= 0).slice(narrow ? -2 : -3)];
      for (const z of fvgs) {
        const xa = Math.max(L, X(z.i0) - step / 2), xb = z.end == null ? L + pw : X(z.end) + step / 2;
        const ya = Y(z.top), yb = Y(z.bottom);
        const c = z.dir === 'bull' ? RGB.bull : RGB.bear;
        ctx.fillStyle = `rgba(${c},0.07)`; ctx.fillRect(xa, ya, xb - xa, yb - ya);
        ctx.setLineDash([2, 2]); ctx.strokeStyle = `rgba(${c},0.55)`; ctx.lineWidth = 1; ctx.strokeRect(xa + 0.5, ya + 0.5, xb - xa - 1, yb - ya - 1); ctx.setLineDash([]);
      }
    }
    // OB (실선 박스, 오른쪽 끝까지)
    for (const z of obs) {
      const xa = Math.max(L, X(z.i0) - step / 2), xb = L + pw;
      let ya = Y(z.top), yb = Y(z.bottom);
      if (yb - ya < 3) { const m = (ya + yb) / 2; ya = m - 1.5; yb = m + 1.5; } // 너무 얇으면 최소 3px
      const c = z.dir === 'bull' ? RGB.bull : RGB.bear;
      ctx.fillStyle = `rgba(${c},0.13)`; ctx.fillRect(xa, ya, xb - xa, yb - ya);
      ctx.strokeStyle = `rgba(${c},0.75)`; ctx.lineWidth = 1; ctx.strokeRect(xa + 0.5, ya + 0.5, xb - xa - 1, yb - ya - 1);
    }
    // BB+FVG (OB/FVG 위): 연한 채움 + 진한 실선 테두리, FVG 가운데 봉부터 오른쪽 끝까지
    for (const z of bbs) {
      const xa = Math.max(L, X(z.i0) - step / 2), xb = L + pw;
      const ya = Y(z.top), yb = Y(z.bottom), hgt = Math.max(2, yb - ya), yy = hgt > yb - ya ? (ya + yb) / 2 - 1 : ya;
      const bull = z.dir === 'bull';
      ctx.fillStyle = bull ? '#dcefe3' : '#f8e1e9'; ctx.fillRect(xa, yy, xb - xa, hgt); // 불투명: 아래 OB/FVG 테두리를 가림
      ctx.strokeStyle = bull ? COL.bbBull : COL.bbBear; ctx.lineWidth = 1.25; ctx.setLineDash([]);
      ctx.strokeRect(Math.round(xa) + 0.5, Math.round(yy) + 0.5, Math.round(xb - xa) - 1, Math.max(1, Math.round(hgt) - 1));
    }
    // 전일 고저: 회색 파선, 화면 전체 폭
    if (show.pd && D.pd) for (const v of [D.pd.pdh, D.pd.pdl]) {
      if (!inR(v)) continue;
      const y = Math.round(Y(v)) + 0.5;
      ctx.strokeStyle = `rgba(${RGB.pd},0.95)`; ctx.setLineDash([5, 4]); ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(L, y); ctx.lineTo(L + pw, y); ctx.stroke(); ctx.setLineDash([]);
    }
    // 전일 MID: 굵은 금색 실선, 오늘(UTC 일봉) 시작부터 오른쪽 끝까지
    if (show.pd && D.pd && D.pd.mid != null && inR(D.pd.mid)) {
      const xa = XT(D.pd.end) ?? L, y = Y(D.pd.mid);
      ctx.strokeStyle = COL.mid; ctx.lineWidth = 1.75; ctx.setLineDash([]);
      ctx.beginPath(); ctx.moveTo(xa, y); ctx.lineTo(L + pw, y); ctx.stroke();
    }
    // TDO: 뉴욕 00:00 봉에 연한 세로 파선 + 그 봉부터 오른쪽 끝까지 얇은 로즈색 실선
    if (show.tdo && D.tdo) {
      const xt = XT(D.tdo.t), xa = xt ?? L;
      if (xt != null) {
        const xv = Math.round(xt) + 0.5;
        ctx.strokeStyle = `rgba(${RGB.tdo},0.45)`; ctx.lineWidth = 1; ctx.setLineDash([3, 4]);
        ctx.beginPath(); ctx.moveTo(xv, T); ctx.lineTo(xv, T + ph); ctx.stroke(); ctx.setLineDash([]);
      }
      if (inR(D.tdo.o)) {
        const y = Math.round(Y(D.tdo.o)) + 0.5;
        ctx.strokeStyle = COL.tdo; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(xa, y); ctx.lineTo(L + pw, y); ctx.stroke();
      }
    }
    // 세션: 자기 시간대 위에 연한 파선 박스 + 끝난 뒤 H/L을 오른쪽 끝까지 연장
    for (const { k, s } of sessList) {
      const c = RGB[k];
      const ei = idxOfTime(D.times, s.end, D.tfMs);
      let xb = L;
      if (ei >= 0) {
        const si = idxOfTime(D.times, s.start, D.tfMs);
        const xa = si < 0 ? L : X(si) - step / 2; xb = X(ei) + step / 2;
        const ya = Y(s.h), yb = Y(s.l);
        ctx.fillStyle = `rgba(${c},0.08)`; ctx.fillRect(xa, ya, xb - xa, yb - ya);
        ctx.strokeStyle = `rgba(${c},0.75)`; ctx.setLineDash([3, 3]); ctx.lineWidth = 1;
        ctx.strokeRect(Math.round(xa) + 0.5, Math.round(ya) + 0.5, Math.max(1, Math.round(xb - xa) - 1), Math.max(1, Math.round(yb - ya))); ctx.setLineDash([]);
      }
      if (xb < L + pw - 1) for (const v of [s.h, s.l]) {
        if (!inR(v)) continue;
        const y = Math.round(Y(v)) + 0.5;
        ctx.strokeStyle = `rgba(${c},0.9)`; ctx.setLineDash([4, 3]); ctx.lineWidth = 1.25;
        ctx.beginPath(); ctx.moveTo(xb, y); ctx.lineTo(L + pw, y); ctx.stroke(); ctx.setLineDash([]);
      }
    }
    // EMA
    for (const k of [200, 100, 50, 20]) {
      const e = D.emas[k]; ctx.strokeStyle = COL.ema[k]; ctx.lineWidth = 1.3; ctx.beginPath();
      let pen = false;
      for (let i = 0; i < n; i++) { if (e[i] == null) { pen = false; continue; } const x = X(i), y = Y(e[i]); if (!pen) { ctx.moveTo(x, y); pen = true; } else ctx.lineTo(x, y); }
      ctx.stroke();
    }
    // 캔들
    const cw = Math.max(1, Math.min(14, step * 0.62));
    for (let i = 0; i < n; i++) {
      const c = C[i], up = c.c >= c.o, col = up ? COL.up : COL.down, x = X(i);
      ctx.strokeStyle = col; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(Math.round(x) + 0.5, Y(c.h)); ctx.lineTo(Math.round(x) + 0.5, Y(c.l)); ctx.stroke();
      const yo = Y(c.o), yc = Y(c.c); ctx.fillStyle = col;
      ctx.fillRect(x - cw / 2, Math.min(yo, yc), cw, Math.max(1, Math.abs(yc - yo)));
    }
    // 크로스헤어
    if (hover != null && hover >= 0 && hover < n) {
      ctx.strokeStyle = 'rgba(60,64,72,0.35)'; ctx.setLineDash([3, 3]);
      ctx.beginPath(); ctx.moveTo(X(hover), T); ctx.lineTo(X(hover), T + ph); ctx.stroke(); ctx.setLineDash([]);
    }
    ctx.restore();

    // 오른쪽 라벨: 겹치면 펼치고, 실제 레벨까지 짧은 지시선(leader)을 그림
    const gap = lfs + 3;
    for (const lb of labels) lb.y = Y(lb.v);
    FC.layoutLabels(labels, gap, T - 8 + gap / 2, T + ph); // x축 날짜 라벨과 겹치지 않게 플롯 하단까지
    ctx.font = `${lfs}px ${FONT}`; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    const x0l = L + pw;
    for (const lb of labels) {
      const col = lb.ob ? `rgb(${lb.rgbs})` : `rgb(${RGB[lb.key]})`;
      const y = Math.round(lb.y) + 0.5, ly = Math.round(lb.ly) + 0.5;
      ctx.strokeStyle = col; ctx.lineWidth = 1; ctx.setLineDash([]);
      ctx.beginPath(); ctx.moveTo(x0l + 1, y);
      if (Math.abs(ly - y) < 1) ctx.lineTo(x0l + 9, y);
      else { ctx.lineTo(x0l + 3, y); ctx.lineTo(x0l + 8, ly); ctx.lineTo(x0l + 10, ly); }
      ctx.stroke();
      ctx.fillStyle = col; ctx.fillText(lb.text, x0l + 12, ly);
    }
    // x축
    ctx.fillStyle = COL.axis; ctx.textAlign = 'center'; ctx.textBaseline = 'top'; ctx.font = `${fs - 1}px ${FONT}`;
    for (const i of xLabelIdx(n)) ctx.fillText(FC.fmtKstAxis(D.times[i]), X(i), T + ph + 7);
    // 호버 정보
    if (hover != null && hover >= 0 && hover < n) {
      const c = C[hover], r = Math.abs(c.c);
      const s = `${FC.fmtKstAxis(c.t)}  O ${FC.fmtPrice(c.o, r)}  H ${FC.fmtPrice(c.h, r)}  L ${FC.fmtPrice(c.l, r)}  C ${FC.fmtPrice(c.c, r)}`;
      ctx.textAlign = 'right'; ctx.textBaseline = 'top'; ctx.fillStyle = c.c >= c.o ? COL.up : COL.down; ctx.font = `${fs - 1}px ${FONT}`;
      ctx.fillText(s, L + pw, 3);
    }
    ctx.restore();
    return { lo, hi, plotL: L, plotW: pw, step };
  }

  /* ---------- 미니 패널 ---------- */
  function drawMini(ctx, x0, y0, W, H, P, times, hover, opt) {
    opt = opt || {};
    const fs = opt.fs || 10, n = times.length;
    ctx.save(); ctx.translate(x0, y0);
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H);
    ctx.font = `${fs + 0.5}px ${FONT}`; ctx.textBaseline = 'top'; ctx.textAlign = 'left';
    ctx.fillStyle = P.id === 'liq' ? '#6b6f78' : P.color; ctx.fillText(P.title, 2, 2);
    const L = 62, R = 8, T = 20, B = 16, pw = W - L - R, ph = H - T - B;
    const step = pw / n, X = (i) => L + (i + 0.5) * step;
    let lo, hi;
    const V = P.values;
    if (P.kind === 'liq') { const m = Math.max(1, ...V.map(v => (v ? Math.max(v.l, v.s) : 0))); lo = -m; hi = m; }
    else {
      const vs = V.filter(v => v != null); lo = Math.min(...vs); hi = Math.max(...vs);
      if (P.kind === 'bar') { lo = Math.min(0, lo); hi = Math.max(0, hi); }
      if (hi === lo) { hi += 1; lo -= 1; }
    }
    const padv = (hi - lo) * 0.08, ylo = lo - padv, yhi = hi + padv;
    const Y = (v) => T + (yhi - v) / (yhi - ylo) * ph;
    // 축 라벨 (상/하)
    const fmt = (v) => P.unit === '%' ? v.toFixed(4) + '%' : FC.fmtBig(v, P.kind === 'liq');
    ctx.font = `${fs - 1}px ${FONT}`; ctx.fillStyle = COL.axis; ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    ctx.fillText(fmt(hi), L - 8, Y(hi)); ctx.fillText(fmt(lo), L - 8, Y(lo));
    ctx.strokeStyle = COL.grid; ctx.lineWidth = 1;
    for (const v of [hi, lo]) { ctx.beginPath(); ctx.moveTo(L, Math.round(Y(v)) + 0.5); ctx.lineTo(L + pw, Math.round(Y(v)) + 0.5); ctx.stroke(); }
    ctx.save(); ctx.beginPath(); ctx.rect(L, T - 2, pw, ph + 4); ctx.clip();
    const bw = Math.max(1, step * 0.6);
    if (P.kind === 'bar') {
      const y0v = Y(0);
      for (let i = 0; i < n; i++) { const v = V[i]; if (v == null) continue; ctx.fillStyle = v >= 0 ? COL.up : COL.down; const y = Y(v); ctx.fillRect(X(i) - bw / 2, Math.min(y, y0v), bw, Math.max(1, Math.abs(y - y0v))); }
    } else if (P.kind === 'liq') {
      const y0v = Y(0);
      ctx.strokeStyle = COL.grid; ctx.beginPath(); ctx.moveTo(L, y0v); ctx.lineTo(L + pw, y0v); ctx.stroke();
      for (let i = 0; i < n; i++) {
        const v = V[i]; if (!v) continue;
        if (v.s > 0) { ctx.fillStyle = COL.up; ctx.fillRect(X(i) - bw / 2, Y(v.s), bw, Math.max(1, y0v - Y(v.s))); }
        if (v.l > 0) { ctx.fillStyle = COL.down; ctx.fillRect(X(i) - bw / 2, y0v, bw, Math.max(1, Y(-v.l) - y0v)); }
      }
    } else {
      ctx.strokeStyle = P.color; ctx.lineWidth = 1.3; ctx.beginPath(); let pen = false;
      for (let i = 0; i < n; i++) { const v = V[i]; if (v == null) { pen = false; continue; } if (!pen) { ctx.moveTo(X(i), Y(v)); pen = true; } else ctx.lineTo(X(i), Y(v)); }
      ctx.stroke();
    }
    if (hover != null && hover >= 0 && hover < n) {
      ctx.strokeStyle = 'rgba(60,64,72,0.35)'; ctx.setLineDash([3, 3]); ctx.beginPath(); ctx.moveTo(X(hover), T - 2); ctx.lineTo(X(hover), T + ph + 2); ctx.stroke(); ctx.setLineDash([]);
    }
    ctx.restore();
    // 호버 값: 제목 오른쪽 빈 공간에 흰 바탕으로 한 번만 (제목·축 라벨과 겹치면 글자 축소)
    if (hover != null && hover >= 0 && hover < n && V[hover] != null) {
      const v = V[hover];
      const s = P.kind === 'liq' ? `롱 ${FC.fmtBig(-v.l)} / 숏 ${FC.fmtBig(v.s, true)}` : fmt(v);
      ctx.font = `${fs + 0.5}px ${FONT}`; const titleR = 2 + ctx.measureText(P.title).width + 8;
      let hf = fs; ctx.font = `${hf}px ${FONT}`; let tw = ctx.measureText(s).width;
      while (hf > 7 && L + pw - tw < titleR) { hf -= 0.5; ctx.font = `${hf}px ${FONT}`; tw = ctx.measureText(s).width; }
      ctx.fillStyle = '#fff'; ctx.fillRect(L + pw - tw - 3, 0, tw + 4, T - 3);
      ctx.textAlign = 'right'; ctx.textBaseline = 'top'; ctx.fillStyle = COL.text; ctx.fillText(s, L + pw, 2);
    }
    if (opt.showX !== false) {
      ctx.fillStyle = COL.axis; ctx.textAlign = 'center'; ctx.textBaseline = 'top'; ctx.font = `${fs - 1.5}px ${FONT}`;
      for (const i of xLabelIdx(n)) ctx.fillText(FC.fmtKstAxis(times[i]), X(i), T + ph + 4);
    }
    ctx.restore();
  }

  /* ---------- 헤더 (PNG 내보내기용) ---------- */
  function legendItems(D, yr) {
    const items = [];
    for (const k of [20, 50, 100, 200]) {
      const e = D.emas[k]; const last = e[e.length - 1]; let s = 'EMA ' + k;
      if (yr && last != null) { if (last > yr.hi) s += ' ↑' + FC.fmtPrice(last, last); else if (last < yr.lo) s += ' ↓' + FC.fmtPrice(last, last); }
      items.push({ text: s, col: COL.ema[k], dash: false });
    }
    return items;
  }
  const LEVEL_LEGEND = [{ text: '아시아 H/L', col: COL.asia, k: 'sess' }, { text: '런던 H/L', col: COL.london, k: 'sess' }, { text: '뉴욕 H/L', col: COL.ny, k: 'sess' }, { text: '전일 H/L', col: COL.pd, k: 'pd' },
    { text: '전일 MID', col: COL.mid, k: 'pd', solid: true }, { text: 'TDO', col: COL.tdo, k: 'tdo', solid: true },
    { text: 'BB+FVG', col: COL.bbBull, k: 'bbfvg', box: true }];
  const levelLegend = (show) => LEVEL_LEGEND.filter(it => !show || show[it.k] !== false);

  function drawLegendRow(ctx, x, y, items, dotted, fs) {
    ctx.font = `${fs}px ${FONT}`; ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
    for (const it of items) {
      if (it.box) { ctx.fillStyle = 'rgba(198,232,212,0.8)'; ctx.fillRect(x, y - 4, 12, 8); ctx.strokeStyle = it.col; ctx.lineWidth = 1; ctx.strokeRect(x + 0.5, y - 3.5, 11, 7); }
      else {
        ctx.strokeStyle = it.col; ctx.lineWidth = 1.6; ctx.setLineDash(dotted && !it.solid ? [4, 3] : []);
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 12, y); ctx.stroke(); ctx.setLineDash([]);
      }
      ctx.fillStyle = it.col; ctx.fillText(it.text, x + 16, y); x += 16 + ctx.measureText(it.text).width + 12;
    }
  }

  function drawCard(cv, D, meta) {
    const W = 1600, panels = D.panels;
    const H = 860, ctx = cv.getContext('2d');
    const sc = 2; cv.width = W * sc; cv.height = H * sc; ctx.setTransform(sc, 0, 0, sc, 0, 0);
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H);
    // 헤더
    ctx.fillStyle = COL.text; ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'left';
    ctx.font = `500 26px ${FONT}`; ctx.fillText(`${D.sym} · ${D.tfLabel}`, 28, 44);
    ctx.font = `13px ${FONT}`; ctx.fillStyle = COL.axis; ctx.fillText(FC.fmtKstStamp(D.fetchedAt), 28, 66);
    ctx.font = `12px ${FONT}`; ctx.textAlign = 'right'; ctx.fillStyle = '#9aa0aa'; ctx.fillText(meta.label || 'STOPFIRST', W - 28, 34);
    ctx.fillText('data: Binance · Coinbase · Hyperliquid · Coinalyze', W - 28, 54);
    ctx.strokeStyle = '#e6e6ea'; ctx.beginPath(); ctx.moveTo(20, 84.5); ctx.lineTo(W - 20, 84.5); ctx.stroke();
    // 메인
    const mainW = Math.round(W * 0.64), top = 96, mainH = H - top - 18;
    const yr = drawMain(ctx, 20, top, mainW - 30, mainH, D, null, { fs: 13, show: meta.show });
    drawLegendRow(ctx, 330, 30, legendItems(D, yr), false, 12);
    drawLegendRow(ctx, 330, 56, levelLegend(meta.show), true, 12);
    // 구분선
    ctx.strokeStyle = '#e6e6ea'; ctx.beginPath(); ctx.moveTo(mainW + 0.5, top); ctx.lineTo(mainW + 0.5, H - 18); ctx.stroke();
    // 미니 패널 (세로 가운데 정렬)
    const sideX = mainW + 16, sideW = W - sideX - 24;
    const ph = Math.min(126, Math.floor(mainH / Math.max(1, panels.length)));
    let y = top + Math.max(0, (mainH - ph * panels.length) / 2);
    for (const P of panels) {
      drawMini(ctx, sideX, y, sideW, ph - 6, P, D.times, null, { fs: 12 });
      ctx.strokeStyle = '#ececf0'; ctx.beginPath(); ctx.moveTo(sideX, y + ph - 2.5); ctx.lineTo(sideX + sideW, y + ph - 2.5); ctx.stroke();
      y += ph;
    }
    return cv;
  }

  self.FCRender = { drawMain, drawMini, drawCard, setupCanvas, legendItems, LEVEL_LEGEND, levelLegend, COL };
})();
