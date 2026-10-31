/* 판정 도우미. 공통 검사 + qa/expect.cjs 의 개별 검사.
   공통: 페이지 오류(errors) 0, 넘침/잘림 목록(trunc·bad·overflow·trunc500) 비어 있음, over/docScroll false, 스크린샷 오류 없음.
   버전 문자열(APP_VER·data-v)은 보지 않음(ver·dv 키 무시) → 버전이 올라가도 그대로 통과. */
const IGN = new Set(['ver', 'dv']);
function walk(v, p, f) { if (v && typeof v === 'object') { for (const k of Object.keys(v)) { if (IGN.has(k)) continue; f(k, v[k], p + '.' + k); walk(v[k], p + '.' + k, f); } } }
function generic(jsons, spec) {
  const fails = [], skip = new Set(spec.skipGeneric || []);
  jsons.forEach((j, i) => walk(j, '#' + i, (k, v, p) => {
    if (skip.has(k)) return;
    if (k === 'errors' && Array.isArray(v) && v.length) fails.push(p + ' 페이지 오류: ' + v.slice(0, 2).join(' / '));
    if (['trunc', 'bad', 'trunc500', 'overflow'].includes(k) && Array.isArray(v) && v.length) fails.push(p + ' 넘침: ' + v.slice(0, 3).join(', '));
    if (['over', 'overflow', 'docScroll'].includes(k) && v === true) fails.push(p + ' 가로 넘침');
    if (k === 'shotErr' && v) fails.push(p + ' 스크린샷 실패: ' + String(v).slice(0, 80));
    if (k === 'err' && typeof v === 'string' && v && !skip.has('err')) fails.push(p + ' 오류 문구: ' + v.slice(0, 80));
  }));
  return fails;
}
function get(o, p) { return p.split('.').reduce((a, k) => a == null ? a : a[k], o); }
function run(n, spec, jsons, stderr) {
  const fails = generic(jsons, spec), last = jsons[jsons.length - 1];
  const A = {
    eq(p, want, o = last) { const got = get(o, p); if (JSON.stringify(got) !== JSON.stringify(want)) fails.push(`${p}: ${JSON.stringify(got)} ≠ 기대 ${JSON.stringify(want)}`); },
    near(p, want, tol = 1e-6, o = last) { const got = get(o, p); if (typeof got !== 'number' || Math.abs(got - want) > tol) fails.push(`${p}: ${JSON.stringify(got)} ≠ 기대 ≈${want}`); },
    ok(p, o = last) { const got = get(o, p); if (!got) fails.push(`${p}: 값 없음/거짓 (${JSON.stringify(got)})`); },
    has(p, sub, o = last) { const got = get(o, p); const s = typeof got === 'string' ? got : JSON.stringify(got); if (!s || !s.includes(sub)) fails.push(`${p}: '${sub}' 없음 (${String(s).slice(0, 120)})`); },
    no(p, o = last) { const got = get(o, p); if (got) fails.push(`${p}: 비어 있어야 함 (${JSON.stringify(got).slice(0, 120)})`); },
    fail(m) { fails.push(m); },
  };
  if (spec.check) spec.check(A, last, jsons);
  return fails;
}
module.exports = { run };
