#!/usr/bin/env node
/* QA 진입점: node qa/run-all.cjs [html=cloud/index.html] [--only t90,t91]
   각 qa/tests/*.cjs 를 별도 프로세스로 돌리고, 마지막 JSON 출력을 qa/expect.cjs 의 검사로 판정.
   실패하면 1회 재시도(무거운 Chromium 동시 실행의 타이밍 흔들림 대비). 하나라도 최종 실패면 exit 1. */
const { spawn } = require('child_process'); const fs = require('fs'), path = require('path'), os = require('os');
const EXPECT = require('./expect.cjs');
const args = process.argv.slice(2); const oi = args.indexOf('--only');
const only = oi >= 0 ? args.splice(oi, 2)[1].split(',') : null;
const html = path.resolve(args[0] || path.join(__dirname, '..', 'cloud', 'index.html'));
const JOBS = +process.env.QA_JOBS || Math.max(1, Math.min(3, os.cpus().length - 1));
const TIMEOUT = +process.env.QA_TIMEOUT || 180e3;
const outRoot = process.env.QA_OUT || fs.mkdtempSync(path.join(os.tmpdir(), 'qa-'));
const names = Object.keys(EXPECT).filter(n => !only || only.includes(n));
function runOnce(n) {
  return new Promise(res => {
    const t0 = Date.now(), dir = path.join(outRoot, n); fs.mkdirSync(dir, { recursive: true });
    const env = { ...process.env, ...(EXPECT[n].env || {}) };
    const p = spawn(process.execPath, [path.join(__dirname, 'tests', n + '.cjs'), html, dir, 'ci'], { env });
    let out = '', err = ''; p.stdout.on('data', d => out += d); p.stderr.on('data', d => err += d);
    const k = setTimeout(() => { err += '\nTIMEOUT ' + TIMEOUT + 'ms'; p.kill('SIGKILL'); }, TIMEOUT);
    p.on('close', code => { clearTimeout(k); fs.writeFileSync(path.join(dir, 'stdout.txt'), out); fs.writeFileSync(path.join(dir, 'stderr.txt'), err);
      let whole; try { whole = JSON.parse(out); } catch {}
      const jsons = whole !== undefined ? [whole] : out.split('\n').map(l => l.trim()).filter(Boolean).map(l => { try { return JSON.parse(l); } catch { return undefined; } }).filter(x => x !== undefined);
      let fails = [];
      if (!jsons.length) fails.push('JSON 출력 없음 (exit ' + code + ') ' + err.split('\n').filter(Boolean).slice(-3).join(' | '));
      else if (code !== 0) fails.push('비정상 종료 exit ' + code + ': ' + err.split('\n').filter(l => /Error|Timeout|exceeded/.test(l)).slice(0, 2).join(' | '));
      else { try { fails = require('./check.cjs').run(n, EXPECT[n], jsons, err); } catch (e) { fails.push('검사 예외: ' + e.message); } }
      res({ n, ok: !fails.length, fails, sec: (Date.now() - t0) / 1000 }); });
  });
}
(async () => {
  console.log(`QA ${names.length}개 · html=${path.relative(process.cwd(), html)} · jobs=${JOBS} · out=${outRoot}`);
  const T0 = Date.now(), results = []; let i = 0;
  await Promise.all(Array.from({ length: JOBS }, async () => { while (i < names.length) { const n = names[i++];
    let r = await runOnce(n); if (!r.ok) { console.log(`  ↻ ${n} 재시도: ${r.fails[0]}`); const r2 = await runOnce(n); r2.retried = true; r2.first = r.fails; r = r2; }
    results.push(r); console.log(`${r.ok ? 'PASS' : 'FAIL'} ${n} (${r.sec.toFixed(1)}s${r.retried ? ', 재시도' : ''})${r.ok ? '' : '\n    - ' + r.fails.slice(0, 12).join('\n    - ')}`); } }));
  const bad = results.filter(r => !r.ok);
  console.log(`\n${bad.length ? 'FAILED' : 'ALL OK'}: ${results.length - bad.length}/${results.length} 통과 · ${((Date.now() - T0) / 1000).toFixed(0)}s` + (bad.length ? ' · 실패: ' + bad.map(r => r.n).join(', ') : ''));
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `### 매매일지 QA: ${bad.length ? '❌' : '✅'} ${results.length - bad.length}/${results.length}\n\n| 검사 | 결과 | 시간 |\n|---|---|---|\n` + results.sort((a, b) => a.n.localeCompare(b.n)).map(r => `| ${r.n} | ${r.ok ? 'PASS' : 'FAIL: ' + r.fails.slice(0, 3).join('; ').replace(/\|/g, '/')}${r.retried ? ' (재시도)' : ''} | ${r.sec.toFixed(0)}s |`).join('\n') + '\n');
  process.exit(bad.length ? 1 : 0);
})();
