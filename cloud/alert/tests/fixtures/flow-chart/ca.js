/* ca.js — Coinalyze 호출 관리 (브라우저 + Node 공용)
 * - 전역 스로틀: 탭 간 공유(localStorage) 롤링 60초 30회 토큰 버킷, 탭 안에서는 순차 큐
 * - 429: Retry-After(초, 기본 10) 읽고 15초 이하면 1회 대기 후 재시도, 아니면 백오프 시각 저장 → 그때까지 호출 생략
 * - 응답 캐시: base+path+symbols+interval 별, max(60초, 봉 길이/2) 동안 재사용, 이후엔 마지막 봉 − 2봉부터만 증분 요청해 병합
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.FCCA = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const K_CALLS = 'fc_ca_calls_v1', K_BACKOFF = 'fc_ca_backoff_v1', K_PRE = 'fc_ca_c1|';
  const LIMIT = 30, WINDOW = 60e3, MAX_RETRY_WAIT_S = 15, DEFAULT_RA_S = 10, MAX_ENTRIES = 40, MAX_BARS = 2000;
  const SLIM = { '/ohlcv-history': ['t', 'c', 'v', 'bv'], '/liquidation-history': ['t', 'l', 's'] };

  /* ---------- 순수 함수 ---------- */
  function parseRetryAfter(h, nowMs) {
    if (h == null || h === '') return DEFAULT_RA_S;
    const n = Number(h);
    if (Number.isFinite(n)) return Math.max(0, Math.ceil(n));
    const d = Date.parse(h);
    if (Number.isFinite(d)) return Math.max(0, Math.ceil((d - (nowMs ?? Date.now())) / 1000));
    return DEFAULT_RA_S;
  }
  const freshMs = (tfMs) => Math.max(60e3, (tfMs || 0) / 2);

  // rows: [{symbol, history:[{t(초), ...}]}] — 같은 심볼·같은 t는 새 값이 이김, t 오름차순
  function mergeRows(oldRows, newRows) {
    const by = new Map();
    for (const r of [...(oldRows || []), ...(newRows || [])]) {
      const m = by.get(r.symbol) || new Map();
      for (const x of r.history || []) m.set(x.t, x);
      by.set(r.symbol, m);
    }
    return [...by].map(([symbol, m]) => ({ symbol, history: [...m.values()].sort((a, b) => a.t - b.t) }));
  }
  function trimRows(rows, fromS, maxBars = MAX_BARS) {
    return (rows || []).map(r => {
      let h = (r.history || []).filter(x => x.t >= fromS);
      if (h.length > maxBars) h = h.slice(h.length - maxBars);
      return { symbol: r.symbol, history: h };
    });
  }
  // 증분 기준: 이력이 있는 심볼들의 마지막 t 중 가장 이른 값
  function lastT(rows) {
    const ls = (rows || []).filter(r => r.history && r.history.length).map(r => r.history[r.history.length - 1].t);
    return ls.length ? Math.min(...ls) : null;
  }
  // → {mode:'fresh'} | {mode:'incr', from} | {mode:'full', from}
  function planFetch(entry, fromS, tfMs, nowMs) {
    const tfS = Math.round(tfMs / 1000);
    if (!entry || entry.from > fromS) return { mode: 'full', from: fromS };
    if (nowMs - entry.at < freshMs(tfMs)) return { mode: 'fresh' };
    const lt = lastT(entry.rows);
    if (lt == null || lt - 2 * tfS < fromS) return { mode: 'full', from: fromS };
    return { mode: 'incr', from: lt - 2 * tfS };
  }
  function slimRows(path, rows) {
    const keys = SLIM[path];
    return (rows || []).map(r => ({ symbol: r.symbol, history: (r.history || []).map(x => {
      if (!keys) return x; const o = {}; for (const k of keys) if (x[k] != null) o[k] = x[k]; return o;
    }) }));
  }
  // 롤링 윈도 토큰 버킷: 0이면 1회 예약 완료, 아니면 기다릴 ms
  function reserve(storage, nowMs, limit = LIMIT, windowMs = WINDOW) {
    let ts = [];
    try { ts = JSON.parse(storage.getItem(K_CALLS) || '[]'); } catch (e) { ts = []; }
    ts = (Array.isArray(ts) ? ts : []).filter(t => nowMs - t < windowMs && t <= nowMs + 1000).sort((a, b) => a - b);
    if (ts.length >= limit) return Math.max(1, ts[ts.length - limit] + windowMs - nowMs);
    ts.push(nowMs);
    try { storage.setItem(K_CALLS, JSON.stringify(ts)); } catch (e) { /* ignore */ }
    return 0;
  }
  const cacheKey = (base, path, symbols, interval) => K_PRE + [base, path, symbols, interval].join('|');

  /* ---------- 클라이언트 ---------- */
  function createClient(env) {
    const E = Object.assign({
      storage: typeof localStorage !== 'undefined' ? localStorage : null,
      now: () => Date.now(),
      sleep: (ms) => new Promise(r => setTimeout(r, ms)),
      fetchJSON: null, // (url) => Promise<json>; 실패 시 err.status, err.retryAfter
      maxWaitMs: 15e3,
    }, env || {});
    const S = E.storage;
    let queue = Promise.resolve();
    const inflight = new Map();
    const stats = { calls: 0 };

    const backoffUntil = () => { try { return +(S.getItem(K_BACKOFF) || 0); } catch (e) { return 0; } };
    const backoffLeftS = () => Math.max(0, Math.ceil((backoffUntil() - E.now()) / 1000));
    const setBackoff = (untilMs) => { try { if (untilMs > backoffUntil()) S.setItem(K_BACKOFF, String(untilMs)); } catch (e) { /* ignore */ } };
    const limitErr = (msg, waitS, extra) => Object.assign(new Error(msg), { status: 429, limited: true, waitS }, extra || {});

    async function doCall(url, retried) {
      if (!retried) {
        const left = backoffLeftS();
        if (left > 0) throw limitErr(`HTTP 429 (요청 한도 초과) · ${left}초 후 재시도`, left, { backoff: true });
      }
      const deadline = E.now() + E.maxWaitMs;
      for (;;) {
        const w = reserve(S, E.now());
        if (!w) break;
        if (E.now() + w > deadline) throw limitErr(`요청 한도 보호(분당 ${LIMIT}회) · ${Math.ceil(w / 1000)}초 후 재시도`, Math.ceil(w / 1000), { throttled: true });
        await E.sleep(w);
      }
      stats.calls++;
      try { return await E.fetchJSON(url); }
      catch (e) {
        if (e.status !== 429) throw e;
        const ra = parseRetryAfter(e.retryAfter, E.now());
        setBackoff(E.now() + ra * 1000);
        if (!retried && ra <= MAX_RETRY_WAIT_S) { await E.sleep(ra * 1000); return doCall(url, true); }
        e.limited = true; e.waitS = ra; throw e;
      }
    }
    // 순차 큐 + 같은 URL 중복 요청 합치기
    function call(url, dedupeKey) {
      const k = dedupeKey || url;
      if (inflight.has(k)) return inflight.get(k);
      const p = queue.then(() => doCall(url, false));
      queue = p.catch(() => {});
      inflight.set(k, p);
      const clear = () => inflight.delete(k);
      p.then(clear, clear);
      return p;
    }
    function buildUrl(base, path, params, apiKey) {
      const qs = new URLSearchParams(params || {});
      if (apiKey) qs.set('api_key', apiKey); // 쿼리 파라미터 → preflight 없는 단순 GET
      const s = qs.toString();
      const pub = new URLSearchParams(params || {}).toString();
      return { url: base + path + (s ? '?' + s : ''), key: base + path + '?' + pub };
    }
    function get(base, path, params, apiKey) { const u = buildUrl(base, path, params, apiKey); return call(u.url, u.key); }

    /* 캐시 저장소 */
    function readEntry(key) { try { return JSON.parse(S.getItem(key) || 'null'); } catch (e) { return null; } }
    function evict(keep) {
      const ks = [];
      for (let i = 0; i < S.length; i++) { const k = S.key(i); if (k && k.startsWith(K_PRE)) ks.push(k); }
      const ents = ks.map(k => ({ k, at: (readEntry(k) || {}).at || 0 })).sort((a, b) => b.at - a.at);
      for (const x of ents.slice(keep)) S.removeItem(x.k);
    }
    function writeEntry(key, entry) {
      const s = JSON.stringify(entry);
      try { S.setItem(key, s); }
      catch (e) { try { evict(Math.floor(MAX_ENTRIES / 4)); S.setItem(key, s); } catch (e2) { return; } }
      try { evict(MAX_ENTRIES); } catch (e) { /* ignore */ }
    }

    /* 이력 엔드포인트 (캐시 + 증분)
     * o: {base, apiKey, path, symbols(문자열), interval, params, fromS, toS, tfMs, cacheOnly}
     * → {rows, state:'fresh'|'net'|'stale', at, err?} | null(cacheOnly인데 캐시 없음) ; 캐시 없는 실패는 throw */
    async function history(o) {
      const key = cacheKey(o.base, o.path, o.symbols, o.interval);
      const entry = readEntry(key);
      const covered = entry && entry.from <= o.fromS;
      const plan = planFetch(entry, o.fromS, o.tfMs, E.now());
      if (plan.mode === 'fresh') return { rows: trimRows(entry.rows, o.fromS), state: 'fresh', at: entry.at };
      if (o.cacheOnly) return covered ? { rows: trimRows(entry.rows, o.fromS), state: 'stale', at: entry.at } : null;
      try {
        const resp = await get(o.base, o.path, Object.assign({ symbols: o.symbols, interval: o.interval, from: plan.from, to: o.toS }, o.params || {}), o.apiKey);
        const fresh = slimRows(o.path, Array.isArray(resp) ? resp : []);
        const keepFrom = plan.mode === 'incr' ? Math.min(entry.from, o.fromS) : o.fromS;
        const merged = trimRows(plan.mode === 'incr' ? mergeRows(entry.rows, fresh) : fresh, keepFrom);
        const at = E.now();
        writeEntry(key, { at, from: keepFrom, rows: merged });
        return { rows: trimRows(merged, o.fromS), state: 'net', at };
      } catch (err) {
        if (covered) return { rows: trimRows(entry.rows, o.fromS), state: 'stale', at: entry.at, err };
        throw err;
      }
    }

    return { get, call, history, backoffLeftS, setBackoff, stats, _readEntry: readEntry };
  }

  return { createClient, parseRetryAfter, freshMs, mergeRows, trimRows, lastT, planFetch, slimRows, reserve, cacheKey,
    LIMIT, WINDOW, K_CALLS, K_BACKOFF, K_PRE };
});
