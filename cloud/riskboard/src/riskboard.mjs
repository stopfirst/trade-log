// 시장 리스크 보드(riskboard) — 미국장 중 VIX 기간구조·VVIX·SKEW·MOVE·DXY·SPX로 단계를 매겨
// 단계가 바뀔 때, TRIGGER가 이어질 때, 장 마감 뒤 한 번 텔레그램으로 보냅니다.
// 텔레그램은 보내기만 합니다(getUpdates를 쓰지 않아 trade-alert 봇 명령과 충돌하지 않음).
//   node --env-file=.env src/riskboard.mjs            상시 실행(systemd)
//   node --env-file=.env src/riskboard.mjs --once     지금 보드를 화면에 출력(보내지 않음)
//   node --env-file=.env src/riskboard.mjs --send     지금 보드를 텔레그램으로 한 번 보냄
import fs from 'node:fs';
import path from 'node:path';
import { DEFAULTS, STAGES, STAGE_EMOJI, STAGE_KO, derive, rawStage, step, trend, render, esc } from './core.mjs';

const VERSION = '1.0.0';
const E = process.env;
const ARGS = new Set(process.argv.slice(2));
const T = { ...DEFAULTS };
for (const k of Object.keys(T)) if (E['RB_' + k] !== undefined && E['RB_' + k] !== '') T[k] = Number(E['RB_' + k]);
const POLL_MIN = Number(E.RB_POLL_MIN || 5);
const DOWN_CONFIRM = Number(E.RB_DOWN_CONFIRM || 3);
const PERSIST_MIN = Number(E.RB_PERSIST_MIN || 10);
const CLOSE_REPORT = (E.RB_CLOSE_REPORT ?? '1') !== '0';
const STATE_FILE = E.RB_STATE || '/var/lib/riskboard/state.json';
const TOKEN = E.RB_BOT_TOKEN || E.TELEGRAM_BOT_TOKEN;
const CHAT = E.RB_CHAT_ID || E.TELEGRAM_CHAT_ID;

const SYM = { VIX: '^VIX', VIX9D: '^VIX9D', VIX3M: '^VIX3M', VIX6M: '^VIX6M', VVIX: '^VVIX', SKEW: '^SKEW', MOVE: '^MOVE', DXY: 'DX-Y.NYB', SPX: '^GSPC' };
const log = (...a) => console.log(new Date().toISOString(), ...a);
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function yahoo(sym, interval, range) {
  let err;
  for (const host of ['query1', 'query2', 'query1']) {
    try {
      const r = await fetch(`https://${host}.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?interval=${interval}&range=${range}`,
        { headers: { 'User-Agent': 'Mozilla/5.0 (riskboard)' }, signal: AbortSignal.timeout(15000) });
      if (!r.ok) throw new Error(`${sym} HTTP ${r.status}`);
      const j = await r.json();
      const res = j?.chart?.result?.[0];
      if (!res) throw new Error(`${sym} 빈 응답`);
      return res;
    } catch (e) { err = e; await sleep(1500); }
  }
  throw err;
}

async function quotes() {
  const out = {};
  await Promise.all(Object.entries(SYM).map(async ([k, s]) => {
    const m = (await yahoo(s, '5m', '1d')).meta;
    const v = m.regularMarketPrice, prev = m.previousClose ?? m.chartPreviousClose;
    if (!Number.isFinite(v)) throw new Error(`${s} 가격 없음`);
    out[k] = { v, prev, t: m.regularMarketTime };
  }));
  return out;
}

let trendCache = { at: 0, val: null };
async function spxTrend() {
  if (Date.now() - trendCache.at < 30 * 60e3 && trendCache.val) return trendCache.val;
  const [d, w] = await Promise.all([yahoo('^GSPC', '1d', '1y'), yahoo('^GSPC', '1wk', '2y')]);
  const q = d.indicators.quote[0];
  const bars = d.timestamp.map((_, i) => ({ h: q.high[i], l: q.low[i], c: q.close[i] }))
    .filter(b => [b.h, b.l, b.c].every(Number.isFinite));
  const val = trend(bars, w.indicators.quote[0].close);
  trendCache = { at: Date.now(), val };
  return val;
}

// 시각
const fmt = (tz, d = new Date()) => new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false }).format(d);
const etParts = (d = new Date()) => {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false })
    .formatToParts(d).map(x => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, wd: p.weekday, min: (+p.hour % 24) * 60 + +p.minute };
};
const etDateOf = sec => etParts(new Date(sec * 1000)).date;

// 상태
function load() { try { return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')); } catch { return {}; } }
function save(s) {
  try { fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true }); fs.writeFileSync(STATE_FILE + '.tmp', JSON.stringify(s)); fs.renameSync(STATE_FILE + '.tmp', STATE_FILE); }
  catch (e) { log('상태 저장 실패', e.message); }
}

async function tg(text) {
  if (!TOKEN || !CHAT) throw new Error('TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID 없음');
  const send = async body => {
    const r = await fetch(`https://api.telegram.org/bot${TOKEN}/sendMessage`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ chat_id: CHAT, disable_web_page_preview: true, ...body }), signal: AbortSignal.timeout(15000) });
    const j = await r.json().catch(() => ({}));
    if (!j.ok) throw new Error(`텔레그램 ${r.status} ${j.description || ''}`);
  };
  try { await send({ text: `<pre>${esc(text)}</pre>`, parse_mode: 'HTML' }); }
  catch (e) { log('HTML 실패, 일반 글로 재시도', e.message); await send({ text }); }
}

async function board(stage, title, footer) {
  const q = await quotes();
  const d = derive(q);
  const raw = rawStage(d, T);
  let t = null; try { t = await spxTrend(); } catch (e) { log('SPX 추세 실패', e.message); }
  const now = new Date();
  const text = render({ d, raw, stage: stage ?? raw.stage, title: title ?? '', trend: t, kst: fmt('Asia/Seoul', now), et: fmt('America/New_York', now), footer, T });
  return { q, d, raw, text };
}

const ttl = s => `${STAGE_EMOJI[s]} ${s}${s === 'TRIGGER' ? '' : ' (' + STAGE_KO[s] + ')'}`;
const LIVE = '📡 장중 실시간 · Yahoo 시세(지연 가능)';
const CLOSE = '📌 종가 기준 구조 확인용';

async function tick(S) {
  const et = etParts();
  const weekday = !['Sat', 'Sun'].includes(et.wd);
  const inSession = weekday && et.min >= 9 * 60 + 30 && et.min < 16 * 60;
  const nowMs = Date.now();

  if (inSession && nowMs - (S.lastPoll || 0) >= POLL_MIN * 60e3 - 5e3) {
    S.lastPoll = nowMs;
    const b0 = await board(null, '', LIVE);
    if (etDateOf(b0.q.SPX.t) !== et.date) { log('오늘 장 데이터 없음(휴장?) — 건너뜀'); return; }
    const first = !S.stage;
    const { state, changed } = step(S.stage ? { stage: S.stage, since: S.since, lowerCount: S.lowerCount, lowerMax: S.lowerMax, persistSent: S.persistSent } : { stage: b0.raw.stage, since: nowMs }, b0.raw.stage, nowMs, DOWN_CONFIRM);
    Object.assign(S, state);
    log(`raw=${b0.raw.stage} stage=${S.stage} VIX/3M=${b0.d.ratio.toFixed(3)} VVIX=${b0.d.vvix} SPX%=${b0.d.spxPct.toFixed(2)}`);
    if (first) {
      const b = await board(S.stage, `▶ 시작 · ${ttl(S.stage)}`, LIVE); await tg(b.text);
    } else if (changed) {
      const b = await board(S.stage, `🔄 ${ttl(changed.from)} → ${ttl(changed.to)}`, LIVE); await tg(b.text);
    } else if (S.stage === 'TRIGGER' && !S.persistSent && nowMs - S.since >= PERSIST_MIN * 60e3) {
      S.persistSent = true;
      const b = await board(S.stage, `🔁 TRIGGER ${PERSIST_MIN}분 지속`, LIVE); await tg(b.text);
    }
    save(S);
    return;
  }

  if (CLOSE_REPORT && weekday && et.min >= 16 * 60 + 15 && S.closeSent !== et.date) {
    const b = await board(S.stage || null, '', CLOSE);
    S.closeSent = et.date; save(S);
    if (etDateOf(b.q.SPX.t) !== et.date) { log('오늘 휴장 — 마감 보고 없음'); return; }
    const stg = S.stage || b.raw.stage;
    const b2 = await board(stg, `📌 마감 · ${ttl(stg)}${b.raw.stage !== stg ? ` (지표만 보면 ${b.raw.stage})` : ''}`, CLOSE);
    await tg(b2.text);
  }
}

async function main() {
  if (ARGS.has('--once') || ARGS.has('--send')) {
    const S = load();
    const b0 = await board(null, '', LIVE);
    const stg = S.stage || b0.raw.stage;
    const b = await board(stg, `🧪 지금 · ${ttl(stg)}${b0.raw.stage !== stg ? ` (지표만 보면 ${b0.raw.stage})` : ''}`, LIVE);
    console.log(b.text);
    if (ARGS.has('--send')) { await tg(b.text); console.log('\n텔레그램으로 보냈습니다.'); }
    return;
  }
  log(`riskboard ${VERSION} 시작 · ${POLL_MIN}분 간격 · 하향 확인 ${DOWN_CONFIRM}회 · 상태 ${STATE_FILE}`);
  if (!TOKEN || !CHAT) log('경고: 텔레그램 토큰/채팅 ID 없음');
  const S = load();
  for (let n = 1; ; n++) {
    try { await tick(S); } catch (e) { log('오류', e.message); }
    if (E.RB_MAX_TICKS && n >= +E.RB_MAX_TICKS) break;
    await sleep(+(E.RB_TICK_MS || 60e3));
  }
}
main().catch(e => { console.error(e); process.exit(1); });
