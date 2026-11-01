/* 일지 칩 반응 속도 측정(CI 대상 아님, 수동): node qa/perf-chips.cjs <index.html> <라벨> [CPU 배율=1] [profile=0]
   - 모의 데이터: HL 거래 320건(진입 3·청산 3 체결, 메모·감정·차트 메모), 상세 = 최근 종료 거래 복기 탭(차트 SVG·매매일지 카드 열림). US 장면은 v99 진입 이유 칩.
   - 실제 마우스 클릭(page.click) → Event Timing(pointerdown·click 처리 시간) · 칩 클래스가 바뀐 시각(MutationObserver) · 그 다음 프레임 · 뒤 1.5초 long task 합.
   - 장면: (A) 칩 하나씩 2초 간격 (B) 칩 8개를 250ms 간격(일지 채우기) (C) 같은 칩 80ms 간격 5연타 (D) 메모 칸 40자 타이핑 (E) renderAll·renderDetail·v63PaintDetail·persist 직접 시간
   - CPU 배율은 CDP Emulation.setCPUThrottlingRate. 시계는 실제 시계(QA_REAL_CLOCK=1 권장). */
process.env.QA_REAL_CLOCK = process.env.QA_REAL_CLOCK || '1';
const { chromium } = require('./lib/pw.cjs'); const fs = require('fs'), path = require('path'), http = require('http');
const [, , htmlPath, label = 'x', cpuArg = '1', profArg = '0'] = process.argv; const CPU = +cpuArg, PROF = profArg === '1';
const html = fs.readFileSync(htmlPath);
const srv = http.createServer((q, r) => { r.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); r.end(html); }).listen(0);
const init = () => {
  const J = (v, s = 200) => new Response(JSON.stringify(v), { status: s, headers: { 'Content-Type': 'application/json' } });
  window.fetch = async (u, o = {}) => { u = String(u); if (u.startsWith('https://api.hyperliquid.xyz')) { let b = {}; try { b = JSON.parse(o.body || '{}'); } catch {}
    if (b.type === 'candleSnapshot') { const iv = { '1m': 6e4, '3m': 18e4, '5m': 3e5, '15m': 9e5, '30m': 18e5, '1h': 36e5, '4h': 144e5, '1d': 864e5 }[b.req.interval] || 36e5, out = []; let p = 100;
      for (let t = Math.floor(b.req.startTime / iv) * iv, i = 0; t <= b.req.endTime && i < 500; t += iv, i++) { const o2 = p, c = p + Math.sin(i / 2.3) * 0.9 + (i % 50 < 25 ? 0.2 : -0.2); out.push({ t, o: String(o2), c: String(c), h: String(Math.max(o2, c) + 0.5), l: String(Math.min(o2, c) - 0.5), v: String(1000 + i % 97 * 13) }); p = c; } return J(out); }
    if (b.type === 'spotMetaAndAssetCtxs') return J([{ universe: [], tokens: [] }, []]); return J([]); } return J({ message: 'not found' }, 404); };
  window.__lt = []; window.__ev = []; window.__pd = [];
  try { new PerformanceObserver(l => { for (const e of l.getEntries()) __lt.push({ s: e.startTime, d: e.duration }); }).observe({ type: 'longtask', buffered: true }); } catch {}
  try { new PerformanceObserver(l => { for (const e of l.getEntries()) __ev.push({ n: e.name, s: e.startTime, ps: e.processingStart, pe: e.processingEnd, d: e.duration }); }).observe({ type: 'event', durationThreshold: 16, buffered: true }); } catch {}
  addEventListener('pointerdown', e => __pd.push(e.timeStamp), true);
};
const seedHL = async (N) => {
  const now = Date.now(), H = 3600e3;
  const ev = (id, ts, sh, px, fill) => { const d = new Date(ts).toISOString(); return { id, date: d.slice(0, 10), time: d.slice(11, 19), timestamp: ts, shares: sh, price: px, fee: 0.12, seq: ts / 1000, ...(fill ? { fillId: fill, sourceKey: 'hyperliquid:abc:' + fill, planKey: 'other', planned: '', actual: '', compliance: 'unreviewed' } : {}) }; };
  const coins = ['ETH', 'BTC', 'SOL', 'xyz:INTC', 'HYPE', 'xyz:NVDA'], E = ['차분', '조급', 'FOMO', '불안', '후회'];
  const mk = i => { const t0 = now - 3 * H - i * 13 * H, px = 100 + (i % 11) - 5, win = i % 3 !== 0, dir = i % 4 ? 'long' : 'short', s = dir === 'long' ? 1 : -1;
    const x = px + s * (win ? 2 + (i % 5) : -1.5), id = 'p' + i;
    return normaliseTrade({ schema: 5, currency: CURRENCY, market: MARKET, id, at: t0, name: coins[i % coins.length], direction: dir, date: new Date(t0).toISOString().slice(0, 10), stop: px - s * 1.5, stop0: px - s * 1.5, initialRisk: 22.5, riskR: 1, setup: ['눌림', '베이스 돌파', '미분류'][i % 3], leverage: 5, marginMode: 'isolated', process: i % 5 ? 'compliant' : 'violation', review: '복기 메모 ' + i, violations: i % 5 ? [] : ['추격'],
      entryNote: '진입 근거 ' + i, holdNote: i % 2 ? '보유 생각' : '', exitNote: i % 3 ? '청산 이유' : '', emo: { pre: [E[i % 5]], mid: [], post: i % 2 ? [E[(i + 2) % 5]] : [] }, grade: i % 4 ? ['A', 'B', 'C', 'D'][i % 4] : '',
      riskPlan: { target: px + s * 4 },
      chartNotes: i < 3 ? [{ id: 'n1' + i, kind: 'note', ts: t0 + 0.5 * H, px: px + 0.4, text: '메모', at: 1 }, { id: 'n2' + i, kind: 'hline', ts: null, px: px + 1, text: '저항', at: 2 }, { id: 'n3' + i, kind: 'trend', ts: t0, px: px - 0.5, ts2: t0 + 2 * H, px2: px + 1, text: '추세', at: 3 }] : [],
      entries: [ev(id + 'e0', t0, 6, px), ev(id + 'e1', t0 + 0.4 * H, 3, px + 0.1 * s), ev(id + 'e2', t0 + 0.8 * H, 3, px + 0.2 * s)],
      fills: [ev(id + 'f0', t0 + 1.4 * H, 4, x, 'f' + i + 'a'), ev(id + 'f1', t0 + 1.9 * H, 4, x, 'f' + i + 'b'), ev(id + 'f2', t0 + 2.4 * H, 4, x, 'f' + i + 'c')], funding: [], images: [] }); };
  Object.assign(state.settings, { account: 10000, limD: 3, limW: 6, limM: 10 });
  state.trades = Array.from({ length: N }, (_, i) => mk(i)); await persist(); setPage('dashboard'); renderAll(); return state.trades.length;
};
const CHIPS = [
  ['감정(v85)', '[data-v71="pre"][data-v71-val="확신"]'], ['사후 등급(v85)', '[data-v71="grade"][data-v71-val="C"]'],
  ['가격 반응(v92)', '[data-v92="react"]'], ['진입 TF(v92)', '[data-v92="tfIn"][data-v92-val="1h"]'], ['청산 TF(v92)', '[data-v92="tfOut"][data-v92-val="4h"]'],
  ['셋업(v63)', '[data-v63-set="setup"][data-v63-val="EP"]'], ['확신도(v63)', '[data-v63-set="conf"][data-v63-val="4"]'], ['감정 보유(v85)', '[data-v71="mid"][data-v71-val="인내"]']];
async function arm(A, sel) { return A.evaluate(sel => { const q = () => document.querySelector(sel); const el0 = q(); if (!el0) return false; const on0 = el0.classList.contains('on');
  window.__m = { on0, at: null, fr: null }; const mo = new MutationObserver(() => { const e = q(); if (!window.__m.at && e && e.classList.contains('on') !== on0) { window.__m.at = performance.now(); requestAnimationFrame(() => { window.__m.fr = performance.now(); }); mo.disconnect(); } });
  mo.observe(document.documentElement, { subtree: true, attributes: true, attributeFilter: ['class'], childList: true }); window.__mo = mo; return true; }, sel); }
async function read(A, win) { return A.evaluate(win => { const pd = __pd[__pd.length - 1] || 0, m = window.__m || {}; try { window.__mo && window.__mo.disconnect(); } catch {}
  const lt = __lt.filter(x => x.s >= pd - 5 && x.s < pd + win); const evs = __ev.filter(x => x.s >= pd - 5 && x.s < pd + win);
  return { toClass: m.at ? +(m.at - pd).toFixed(1) : null, toFrame: m.fr ? +(m.fr - pd).toFixed(1) : null, inp: evs.length ? Math.max(...evs.map(x => x.d)) : 0, ltN: lt.length, ltSum: +lt.reduce((s, x) => s + x.d, 0).toFixed(0), ltMax: +(lt.length ? Math.max(...lt.map(x => x.d)) : 0).toFixed(0) }; }, win); }
const med = a => { a = a.filter(Number.isFinite).sort((x, y) => x - y); return a.length ? a[Math.floor((a.length - 1) / 2)] : null; };
(async () => {
  const browser = await chromium.launch({ args: ['--no-sandbox'] }); const out = { label, cpu: CPU, errors: [] };
  const URL0 = 'http://127.0.0.1:' + srv.address().port + '/';
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, bypassCSP: true, timezoneId: 'Asia/Seoul', locale: 'ko-KR' }); await ctx.addInitScript(init);
  const A = await ctx.newPage(); A.on('pageerror', e => out.errors.push(e.message)); await A.goto(URL0 + '?journal=hyperliquid'); await A.waitForFunction(() => window.journalReady, null, { timeout: 30000 }); await A.waitForTimeout(1500);
  out.n = await A.evaluate(seedHL, 320); await A.waitForTimeout(2500);
  const cdp = await ctx.newCDPSession(A);
  const tid = await A.evaluate(() => { const c = state.trades.map(t => ({ t, c: calcTrade(t) })).filter(x => x.c.done).sort((a, b) => b.t.at - a.t.at)[0]; return c.t.id; });
  await A.evaluate(id => openTrade(id, 'review'), tid); await A.waitForTimeout(3000);
  out.detail = await A.evaluate(() => ({ svg: document.querySelectorAll('#tradeDialog svg').length, rects: document.querySelectorAll('#tradeDialog svg rect,#tradeDialog svg line,#tradeDialog svg path').length, dom: document.getElementsByTagName('*').length, chips: document.querySelectorAll('#tradeDialog .v63-chip').length }));
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: CPU });
  if (PROF) { await cdp.send('Profiler.enable'); await cdp.send('Profiler.setSamplingInterval', { interval: 200 }); await cdp.send('Profiler.start'); }
  // (A) 하나씩
  out.A = [];
  for (const [nm, sel] of CHIPS) { if (!(await A.locator(sel).count())) { out.A.push({ nm, missing: true }); continue; } await A.locator(sel).first().scrollIntoViewIfNeeded(); await A.waitForTimeout(300); if (!(await arm(A, sel))) { out.A.push({ nm, missing: true }); continue; }
    await A.click(sel); await A.waitForTimeout(1500 * Math.max(1, CPU / 2)); out.A.push({ nm, ...(await read(A, 1500 * Math.max(1, CPU / 2))) }); await A.waitForTimeout(500); }
  // (B) 250ms 간격 연속(일지 채우기)
  await A.waitForTimeout(1500); out.B = [];
  const seq = [CHIPS[0][1].replace('확신', '집중'), '[data-v92="tfIn"][data-v92-val="4h"]', CHIPS[2][1], '[data-v63-set="cond"][data-v63-val="나쁨"]', CHIPS[1][1].replace('"C"', '"B"'), '[data-v92="tfOut"][data-v92-val="1d"]', CHIPS[6][1].replace('"4"', '"2"'), '[data-v71="post"][data-v71-val="만족"]'];
  for (const sel of seq) { const s = (await A.locator(sel).count()) ? sel : null; if (!s) { out.B.push({ sel, missing: true }); continue; } await A.locator(s).first().scrollIntoViewIfNeeded(); await arm(A, s); const box = await A.locator(s).first().boundingBox(); if (!box) { out.B.push({ sel, hidden: true }); continue; }
    await A.mouse.click(box.x + box.width / 2, box.y + box.height / 2); await A.waitForTimeout(250); out.B.push({ sel, ...(await read(A, 250)) }); }
  await A.waitForTimeout(2500);
  // (C) 같은 칩 5연타 80ms
  const cs = '[data-v92="react"]'; await A.locator(cs).scrollIntoViewIfNeeded(); await A.waitForTimeout(300); const before = await A.evaluate(id => !!state.trades.find(x => x.id === id).react, tid); out.C = { before, clicks: [] };
  for (let i = 0; i < 5; i++) { await arm(A, cs); const b = await A.locator(cs).first().boundingBox(); await A.mouse.click(b.x + b.width / 2, b.y + b.height / 2); await A.waitForTimeout(80); out.C.clicks.push(await read(A, 80)); }
  await A.waitForTimeout(3000); out.C.ui = await A.evaluate(cs => document.querySelector(cs).classList.contains('on'), cs); out.C.state = await A.evaluate(id => !!state.trades.find(x => x.id === id).react, tid);
  out.C.saved = await A.evaluate(async id => { const s = await v83Read(); return !!s.trades.find(x => x.id === id).react; }, tid); out.C.toasts = await A.evaluate(() => [...document.querySelectorAll('.toast,#toast')].map(x => x.textContent).join('|'));
  // (D) 타이핑
  const ta = '[data-v71-area="holdNote"]'; await A.locator(ta).scrollIntoViewIfNeeded(); await A.click(ta); await A.evaluate(() => { window.__t0 = performance.now(); });
  await A.keyboard.type('가격 반응 확인 후 진입, 손절은 직전 저점 아래 1틱으로 유지함 ABC', { delay: 35 });
  out.D = await A.evaluate(() => { const ev = __ev.filter(x => x.s >= __t0 && /key|input/.test(x.n)); const lt = __lt.filter(x => x.s >= __t0); return { evN: ev.length, evMax: ev.length ? Math.max(...ev.map(x => x.d)) : 0, ltN: lt.length, ltSum: +lt.reduce((s, x) => s + x.d, 0).toFixed(0) }; });
  await A.click('#tradeDialog .v63-head b'); await A.waitForTimeout(2000);
  out.D.saved = await A.evaluate(async id => { const s = await v83Read(); return (s.trades.find(x => x.id === id).holdNote || '').length; }, tid);
  // 스크롤 튐: 상세 스크롤 위치를 둔 채 칩 클릭 → 저장 뒤 위치 변화
  out.scroll = await A.evaluate(async () => { const d = $('tradeDialog'), el = document.querySelector('[data-v92="tfIn"][data-v92-val="ltf"]'); el.scrollIntoView({ block: 'center' }); const y0 = d.scrollTop, r0 = el.getBoundingClientRect().top; el.click(); await new Promise(r => setTimeout(r, 2500)); const el2 = document.querySelector('[data-v92="tfIn"][data-v92-val="ltf"]'); return { dy: d.scrollTop - y0, dTop: Math.round(el2.getBoundingClientRect().top - r0) }; });
  if (PROF) { const { profile } = await cdp.send('Profiler.stop'); const self = {}, dt = {}; profile.samples.forEach((id, i) => { dt[id] = (dt[id] || 0) + (profile.timeDeltas[i] || 0); });
    profile.nodes.forEach(nd => { const k = (nd.callFrame.functionName || '(anon)') + ':' + nd.callFrame.lineNumber; self[k] = (self[k] || 0) + (dt[nd.id] || 0) / 1000; });
    out.prof = Object.entries(self).filter(e => !/idle|program|garbage/.test(e[0])).sort((a, b) => b[1] - a[1]).slice(0, 30).map(([k, v]) => k + ' ' + v.toFixed(0)); }
  // (E) 직접 비용(ms, 3회 중앙값)
  out.E = await A.evaluate(async () => { const T = async f => { const a = []; for (let i = 0; i < 3; i++) { const t = performance.now(); await f(); a.push(performance.now() - t); } a.sort((x, y) => x - y); return +a[1].toFixed(1); };
    return { renderAll: await T(() => renderAll()), renderDetail: await T(() => renderDetail()), v63PaintDetail: await T(() => v63PaintDetail()), persist: await T(() => persist()), cloneState: await T(() => clone(state)) }; });
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  // US: v99 진입 이유 칩
  try { const U = await ctx.newPage(); U.on('pageerror', e => out.errors.push('US ' + e.message)); await U.goto(URL0 + '?journal=us'); await U.waitForFunction(() => window.journalReady, null, { timeout: 30000 }); await U.waitForTimeout(1200);
    await U.evaluate(async N => { const ev = (id, date, time, sh, px) => ({ id, date, time, shares: sh, price: px, fee: 0, seq: Date.parse(date + 'T' + time + 'Z') / 1000 });
      const nm = ['AAPL', 'TSLA', 'NVDA', 'MSFT', 'META'], T = []; const base = Date.parse('2026-10-30T00:00:00Z');
      for (let i = 0; i < N; i++) { const d = new Date(base - Math.floor(i / 4) * 864e5).toISOString().slice(0, 10), hh = 9 + (i % 4) * 1.5, h = String(Math.floor(hh)).padStart(2, '0'), m = hh % 1 ? '30' : '00', loss = i % 2 === 0;
        T.push(normaliseTrade({ schema: 5, currency: CURRENCY, market: MARKET, id: 'u' + i, at: Date.parse(d + 'T' + h + ':' + m + ':00Z'), name: nm[i % 5], direction: 'long', date: d, stop: 98, stop0: 98, initialRisk: 20, riskR: 1, setup: '미분류', process: 'compliant', review: '', violations: [],
          entries: [ev('u' + i + 'e', d, h + ':' + m + ':00', 10, 100)], fills: [ev('u' + i + 'f', d, h + ':' + (m === '00' ? '20' : '50') + ':00', 10, loss ? 97 : 103)], funding: [], images: [] })); }
      Object.assign(state.settings, { account: 10000 }); state.trades = T; await persist(); setPage('records'); renderAll(); }, 320);
    await U.waitForTimeout(6000); const cdpU = await ctx.newCDPSession(U); await cdpU.send('Emulation.setCPUThrottlingRate', { rate: CPU });
    out.US = []; for (let i = 0; i < 3; i++) { const sel = '[data-v99why="strong"]'; const cnt = await U.locator(sel).count(); if (!cnt) { out.US.push({ missing: true }); break; }
      await U.locator(sel).first().scrollIntoViewIfNeeded(); await U.waitForTimeout(400); await arm(U, sel); const b = await U.locator(sel).first().boundingBox(); await U.mouse.click(b.x + b.width / 2, b.y + b.height / 2); await U.waitForTimeout(1500 * Math.max(1, CPU / 2)); out.US.push(await read(U, 1500 * Math.max(1, CPU / 2))); await U.waitForTimeout(600); }
    await cdpU.send('Emulation.setCPUThrottlingRate', { rate: 1 }); } catch (e) { out.US = 'ERR ' + e.message; }
  const S = a => ({ toClass: med(a.map(x => x.toClass)), toFrame: med(a.map(x => x.toFrame)), inpMax: Math.max(0, ...a.map(x => x.inp || 0)), ltSumMax: Math.max(0, ...a.map(x => x.ltSum || 0)), ltMax: Math.max(0, ...a.map(x => x.ltMax || 0)) });
  out.sum = { A: S(out.A.filter(x => !x.missing)), B: S(out.B.filter(x => !x.missing && !x.hidden)), C: S(out.C.clicks), US: Array.isArray(out.US) ? S(out.US.filter(x => !x.missing)) : null };
  console.log(JSON.stringify(out)); await browser.close(); srv.close();
})();
