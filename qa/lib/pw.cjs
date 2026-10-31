/* QA 공통 래퍼: playwright-core chromium 을 감싸서
   - CHROME_PATH(있으면) 로 브라우저 경로 지정, 없으면 Playwright 가 설치한 chromium-headless-shell 사용
   - 모든 context 에 고정 시계(QA_NOW, 기본 2026-10-31T03:00:00Z = 토 12:00 KST)를 설치하고 흐르게 둠(resume)
     → '어제/이번 주' 기준 시드가 실행 날짜와 상관없이 같은 결과 (토요일이라 복기 탭 기본 주 = 이번 주, 어제도 같은 주)
     (QA_REAL_CLOCK=1 이면 끔: 스스로 clock.install 하는 t64·t82)
   - browser.close() 뒤 프로세스 종료(일부 스크립트가 http 서버를 닫지 않음)
   - 외부 네트워크 차단: 127.0.0.1 외 요청은 abort (HL·Supabase 는 각 스크립트의 fetch 모의가 처리) */
const pw = require('playwright-core');
const NOW = Date.parse(process.env.QA_NOW || '2026-10-31T03:00:00Z');
const real = !!process.env.QA_REAL_CLOCK;
const chromium = Object.create(pw.chromium);
chromium.launch = async (opts = {}) => {
  const o = { ...opts };
  if (process.env.CHROME_PATH) o.executablePath = process.env.CHROME_PATH; else delete o.executablePath;
  const browser = await pw.chromium.launch(o);
  const newContext = browser.newContext.bind(browser);
  browser.newContext = async (copts) => {
    const ctx = await newContext(copts);
    await ctx.route(/^(?!https?:\/\/(127\.0\.0\.1|localhost)[:/]).*/, r => {
      const u = r.request().url();
      if (u.startsWith('data:') || u.startsWith('blob:')) return r.continue();
      (globalThis.__qaBlocked = globalThis.__qaBlocked || new Set()).add(new URL(u).host);
      return r.abort();
    });
    if (!real) {
      await ctx.clock.install({ time: NOW });
      const np = ctx.newPage.bind(ctx);
      ctx.newPage = async () => { const p = await np(); await p.clock.resume(); return p; };
    }
    return ctx;
  };
  const close = browser.close.bind(browser);
  browser.close = async () => { await close(); setTimeout(() => process.exit(process.exitCode || 0), 100); };
  return browser;
};
process.on('exit', () => { if (globalThis.__qaBlocked && globalThis.__qaBlocked.size) console.error('QA blocked external hosts: ' + [...globalThis.__qaBlocked].join(',')); });
module.exports = { ...pw, chromium };
