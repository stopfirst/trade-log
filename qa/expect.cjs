/* 각 검사 스크립트(qa/tests/<이름>.cjs)의 기대값.
   공통 검사(qa/check.cjs): 페이지 오류 0 · 넘침/잘림 0 · 스크린샷 오류 없음 · 정상 종료.
   APP_VER / data-v 같은 버전 표시는 일부러 보지 않음 → 버전이 올라가도 그대로 쓸 수 있음.
   모든 데이터는 스크립트 안의 모의 값(가짜 주소 0xabc / 0x1111…, 가짜 체결·봉). 실제 계정 데이터 없음. */
const W = ['w1440', 'w390'];
module.exports = {
  /* v43/v56 손익비 도구 → 스탑·1R 자동 채움, 사용자가 고친 값 유지 */
  t56: { check(A) { A.eq('done', true); A.eq('a', { stop0: 99.2, ir: 44, auto: true }); A.eq('manual', { stop0: 99.2, ir: 44 }); /* v112: 추적 손절(손으로 현재 스탑 변경)은 최초 손절을 안 바꿈 — 캐시 경쟁 없이 결정적 */ A.eq('rr.stop', 98.8); A.eq('rr.stop0', 98.8); A.eq('rr.ir', 60); A.near('rr.plan.rr', 2.5, 1e-6);
    A.eq('userEdit.stop0', 98.5); A.eq('rr2', { stop: 98.9, stop0: 98.5 }); A.eq('first', [100, 30, 'long']); } },
  /* v57 현물 포함 계좌 총액 카드 (현물 모의 가격) */
  t57: { check(A) { A.near('basis', 1796.14, 1e-6); A.has('card', '1,796.14 USDC'); A.has('card', '현물 UBTC 0.01'); } },
  /* v58/v59 HL 잔고 + 현물 합산 (가짜 주소 0x1111…) */
  t59: { check(A) { A.near('spot.usd', 2804.7977727138, 1e-6); A.has('card', '59,383.77 USDC'); A.has('card', '거래계좌 56,578.97'); } },
  /* v60 거래기록 가져오기 · 손익비 상자 롱/숏 */
  t60: { check(A, o) { const s = Object.assign({}, ...o.scenes); A.eq('direct.n', 2, s); A.eq('click.called', 1, s); A.eq('click.label', '거래기록 가져오기', s);
    A.eq('rrl.stop', 99.36, s); A.eq('rrl.target', 101.28, s); A.eq('second.n', 1, s); A.eq('rrs.rr', [['long', 100, 99.360436, 101.27913], ['short', 100, 100.63956, 98.720872]], s); } },
  /* v61 차트 사각형 그리기·크기·이동·삭제, 추세선 이동 (마지막 추세선 팝업 확인은 대상 요소가 앞 장면에서 지워져 건너뜀) */
  t61: { check(A, o) { const s = Object.assign({}, ...o.scenes); A.eq('prev', true, s); A.eq('mode', 'view', s); /* v103: 그린 뒤 보기 */ A.eq('popAfterDrag', false, s); A.eq('pop', ['삭제', '닫기'], s);
    A.eq('afterDel', [], s); A.eq('others', 3, s); A.ok('trend.after', s); } },
  /* v63 주간 리뷰(v91: 복기 탭으로 이동) · 거래 채점 · 셋업/확신/컨디션 저장 */
  t63: { check(A, o) { for (const i of [0, 5]) { const w = o.scenes[i]; A.eq('week.page', 'page-weekly', w); A.has('week.txt', '승률 33%', w); A.has('week.txt', '-4.86R', w); A.has('week.txt', '−338.88', w); }
    for (const i of [2, 7]) A.has('card', '90/100', o.scenes[i]); for (const i of [3, 8]) { A.eq('after.setup', '눌림', o.scenes[i]); A.eq('after.conf', 4, o.scenes[i]); A.eq('after.cond', '좋음', o.scenes[i]); A.eq('after.score', 100, o.scenes[i]); } } },
  /* v64 일 손실 한도 · 사용자 수정 유지 (스크립트가 스스로 시계를 고정) */
  t64: { env: { QA_REAL_CLOCK: '1' }, check(A) { for (const k of ['today', 'tomorrow']) { A.eq(k + '.limD', 2.5); A.eq(k + '.riskMax', 2.5); A.eq(k + '.flag', true); A.eq(k + '.afterUserEdit', 2); } } },
  /* v65 지그재그 그리기: 완료/취소/그만, 끌기 */
  t65: { check(A) { for (const w of W) { A.eq(w + '.pend', 4); A.eq(w + '.act', ['완료', '한 점 취소', '그만']); A.eq(w + '.afterUndo', 3); A.eq(w + '.saved', [4]); A.eq(w + '.dragChanged', true); A.eq(w + '.clickFinish', 2); A.eq(w + '.escMode', 'view'); A.eq(w + '.pop', ['변동폭 보이기', '삭제', '닫기']); } } },
  /* v66 수동 기준액 */
  t66: { check(A) { A.eq('before', { b: 10000, u: 10000 }); A.eq('after.b', 20000); A.has('after.tile', '20,000.00'); } },
  /* v67 전일 마감(현물 계산 중) */
  t67: { check(A) { A.eq('r.pending', true); A.eq('r.v1', 1000); A.has('r.text', '전일 마감 1,000.00 USDC'); A.eq('r.denom', 1000); } },
  /* v69 손익비 SL = HL 스탑 고정, TP 만 끌기, 다시 맞추기 */
  t69: { check(A) { for (const w of W) { A.eq(w + '.rr.0.sl', 99.5); A.eq(w + '.rr.0.tp', 101.9); A.eq(w + '.rr.0.lock', true); A.eq(w + '.handles', ['tp', 'w']); A.eq(w + '.lockTxt', true);
    A.eq(w + '.afterMove.0.sl', 99.5); A.eq(w + '.resync.0.sl', 99.8); const tp = A.ok(w + '.afterTp.0.tp'); } } },
  /* v69b 지그재그 오른쪽 클릭 끝내기 · 변동폭 라벨 */
  t69b: { check(A) { for (const w of W) { A.eq(w + '.pend3', 3); A.eq(w + '.afterRight', 0); A.eq(w + '.zz', [3]); A.eq(w + '.lb0', 0); A.eq(w + '.lb1', 2); A.eq(w + '.zz2', [3, 2]); A.eq(w + '.noop', true); } } },
  /* v71 거래 일지 카드 · 핵심 지표 */
  t71: { check(A) { for (const w of W) { A.eq(w + '.card', true); A.eq(w + '.rr', ['—', '-4R']); A.eq(w + '.saved.grade', 'B'); A.eq(w + '.saved.exit', '손절가 도달'); A.has(w + '.stats', '33.3%'); A.has(w + '.stats', '−$112.96 · -1.62R'); } } },
  /* v73 최초 1R 서명·다중 진입 */
  t73: { check(A) { for (const w of W) { A.eq(w + '.t', [{ id: 'loss', m: 'HL', ne: 1, stop0: 90, stop: 90, ir: 100, R: -4.0024, sig: '90|10.00000000|100.0000000' }, { id: 'tg', m: 'HL', ne: 1, stop0: 98.5, stop: 99, ir: 0.15, R: -1.06666666667, sig: '98.5|0.1000000000|100.0000000' }]);
    A.eq(w + '.multi.f', 1); A.eq(w + '.px', [0.66374, 0.71315, 105235, 12.346]); } } },
  /* v81 HL 429 재시도 · 곡선 도구 */
  t81: { check(A) { for (const w of W) { A.eq(w + '.c429', 1); A.eq(w + '.btn', true); A.eq(w + '.preview', true); A.ok(w + '.after.0'); A.ok(w + '.path'); } } },
  /* v82 손실 한도 날짜 경계 (스크립트가 스스로 시계를 고정) */
  t82: { env: { QA_REAL_CLOCK: '1' }, check(A) { A.eq('today.flag', false); A.eq('today.limD', 2.5); A.eq('before9.flag', false); A.eq('tomorrow.flag', true); A.eq('tomorrow.limD', 2); A.eq('today.afterUserEdit', 1.5); } },
  /* v83 두 창 동시 편집 병합(모의 클라우드) */
  t83: { check(A) { A.eq('saveB', true); A.eq('B.ls', ['loss:A창 메모', 'big:', 'tg:B창 메모']); A.eq('B.limW', 5); A.eq('Amem.r', ['loss:A창 메모', 'big:', 'tg:B창 메모']); A.eq('saveA', true); A.eq('Bpull', 'A 두번째'); A.eq('saveB2', true); A.eq('errA', ''); A.eq('errB', ''); A.eq('errB2', ''); } },
  /* v85 감정 칩 저장 */
  t85: { check(A) { for (const w of W) { A.eq(w + '.uiNow', '조급,지루함,인내,불안,후회,옛값,C 아쉬움'); A.eq(w + '.saved', '{"pre":["지루함","조급"],"mid":["불안","인내"],"post":["옛값","후회"]} C'); A.eq(w + '.rows.length', 3); } } },
  /* v86 캘린더 계좌 대비 % */
  t86: { check(A) { for (const w of W) { A.eq(w + '.cells', ['-3.39%']); A.eq(w + '.week', ['0.00% · 0T', '0.00% · 0T', '0.00% · 0T', '0.00% · 0T', '-3.39% · 3T']); A.has(w + '.meta', '−338.88 · -3.39%'); } } },
  /* v87/v88 계좌잔액 상세: 현물 포함·현물/트레이딩 나누기 */
  t88: { check(A) { for (const w of W) { A.has(w + '.html', '계좌잔액30,447.01 USDC'); A.has(w + '.html', '−6,352.99 USDC (−17.26%)'); A.has(w + '.html', '종가 계좌잔액36,800.00 USDC'); } } },
  /* v89 미보유(전량 매도) 현물 페어 포함 · 500px 폭 */
  t89w: { check(A) { for (const w of W) { const r = w + '.res.'; A.eq(r + 'start', 56414); A.eq(r + 'parts', ['UBTC:0.8002@70000', 'HYPE:10@40']); A.eq(r + 'flow', 13550); A.eq(r + 'spotChg', 1036); A.eq(r + 'start0', 400);
    A.eq(r + 'tileText', ['전체 변동 +779.96 USDC · +1.53%', '현물 −13,950.00 USDC · −27.35% 트레이딩 +14,729.96 USDC · +28.88%', '매매/펀딩 −22.80 · −63.54 · 44건']); A.eq(r + 'calText', ['현물 −13,950.00 USDC · −45.89% 트레이딩 +14,329.96 USDC · +47.14%']); A.eq(r + 'tile', true); } } },
  /* v90 추매/피라미딩 기록·사유 칸 (HL·US × 1440·390) */
  t90: { check(A) { for (const k of ['HL1440', 'HL390', 'US1440', 'US390']) { A.eq(k + '.R1', 22.4); A.eq(k + '.adds.length', 2); A.eq(k + '.adds.0.tag', 'pyr'); A.eq(k + '.adds.0.avg1', 101.6); A.eq(k + '.adds.0.totRisk', 18.4);
    A.eq(k + '.adds.1.tag', 'avg'); A.eq(k + '.adds.1.totRisk', 16.4); A.eq(k + '.card', true); A.eq(k + '.notes', 2); A.eq(k + '.inJournal', true); A.eq(k + '.plainCard', false); A.eq(k + '.plainR', 50); A.eq(k + '.plainSame', true);
    A.has(k + '.reload.ta', '돌파 확인 후 1차 추매'); } A.eq('HL1440.chartMarks', ['추매1:v90-lab pyr', '추매2:v90-lab avg']); } },
  /* v93 HL 체결 실시간(모의 WebSocket): 스냅샷=병합만, 새 체결 즉시 반영, tid 중복 없음, 끊김→폴백·백오프 재연결, 탭 1개만 연결·넘겨받기, 헤더 넘침 없음 */
  t93: { check(A, o) { A.eq('before.ws', 0); A.eq('conn.ws', 1); A.eq('conn.url', 'wss://api.hyperliquid.xyz/ws'); A.eq('conn.sub', [{ type: 'userFills', user: '0x1111111111111111111111111111111111111111', aggregateByTime: false }]); A.eq('afterSnap.j.n', 0); A.eq('afterSnap.mem', 1);
    A.eq('afterFill.j.ids', ['5001', '5002', '5003']); A.eq('afterFill.j.open', [true]); A.has('afterFill.toast', '신규 체결 3건'); A.eq('dup.j.ids', ['5001', '5002', '5003']); A.eq('dup.j.uniq', 3); A.eq('dup.cacheN', 3); A.eq('dup.cacheUniq', 3); A.eq('dup.cursor', 3);
    A.eq('w1440.on', true); A.eq('w390.on', true); A.eq('w390.shown', true); A.eq('v89.calls', 0); A.eq('v89.ret', false); A.eq('down', { live: false, on: false, polled: true, timer: true }); A.eq('v89down.calls', 1); { const n = o.backoff && o.backoff.tries; if (!(n >= 2 && n <= 3)) A.fail('backoff.tries: ' + n + ' (6.4초 동안 1·2(·4)초 백오프 → 2~3번 기대)'); } A.eq('backoff.live', false);
    A.eq('fallback.ids', ['5001', '5002', '5003', '5004']); A.eq('fallback.open', [false]); A.eq('re.on', true); A.eq('re.open', 1); A.eq('re.j.uniq', 4);
    A.eq('tab2.ws', 0); A.eq('tab2.leader', false); A.eq('tab2.on', true); A.eq('tab2.mem', true); A.eq('tab2.j.uniq', 5); A.eq('tab2.j.n', 2); A.eq('tab1.uniq', 5); A.eq('tab2b', { ws: 1, leader: true });
    for (const k of ['connectMs', 'applyMs', 'reconnMs', 'tab1Ms', 'tab2Ms', 'takeoverMs']) { const v = o[k]; if (!(v >= 0 && v < 3000)) A.fail(k + ': ' + v + 'ms (3초 안 반영 기대)'); } } },
  /* v75~v79 + v91 거래 상세: 순서·HL 스탑 동기화·목표 수정·메모·포지션 %·계획 vs 실제(분석 탭 접힘 펼쳐서) */
  t91: { check(A) { for (const w of W) { A.eq(w + '.sync.stop', 1.2346); A.eq(w + '.sync.ir', 987.654); A.eq(w + '.order2', ['v76-sec v76-review', 'v76-sec v76-manage', 'v75-more', 'deleteTrade']); A.eq(w + '.lev', true);
    A.eq(w + '.v77stop.tg', 150); A.eq(w + '.v77stop.tile', '150'); A.eq(w + '.hold.saved', '보유 테스트');
    A.has(w + '.v91.txt', '포지션 +1.5% · 증거금(3×) +4.6%'); /* v105: 분모 = 진입 금액 4,012(전엔 진입 수량 40 → +153.8%) */ A.eq(w + '.v91.n', 1); A.has(w + '.v79.t', '계획의 12%'); A.has(w + '.v79.dx', '계획보다 일찍 익절'); A.has(w + '.v79.v', '12%만 실현'); } } },
  /* v91 복기·분석 구조 덤프 · 곡선 폭 · 넘침 0 */
  tdump: { check(A) { for (const w of W) { A.eq(w + '.open.open', true); A.eq(w + '.open.over', 0); A.ok(w + '.open.curveW'); A.has(w + '.dump.analysis', '핵심 지표'); A.has(w + '.v91.txt', '포지션 +1.5%'); A.has(w + '.v79.t', '계획의 12%'); } } },
  /* v94 첫 로딩: CSP 그대로 로딩, 첫 그리기 때 분석·새 기록 미리보기·캘린더 기준 달을 한가할 때로 미룸 → 결과는 일반 renderAll과 같음, 바로 화면 이동·새 기록 열기 시 먼저 처리 */
  t94: { check(A, o) { for (const k of ['hl', 'hl390', 'us']) { A.eq(k + '.n', 300); A.eq(k + '.at.pend', ['ana', 'cal']); /* v112: 닫힌 새 기록 창 미리보기는 renderAll 안에서 건너뜀(열 때 openNew가 계산 → imm.newTrade.qty) */ A.eq(k + '.at.dash', true); A.eq(k + '.at.v63', false);
    A.eq(k + '.after.flushed', 'idle'); A.eq(k + '.after.cal', '2026-09'); A.eq(k + '.after.latest', '2026-09'); A.eq(k + '.after.v63', true); A.eq(k + '.after.v71', true); A.eq(k + '.after.page', 'dashboard');
    A.eq(k + '.same.ana', true); A.eq(k + '.same.wk', true); A.eq(k + '.same.size', true); A.eq(k + '.csp', []); if (!(o[k] && o[k].flushWait >= 0)) A.fail(k + '.flushWait: 미룬 일이 5초 안에 처리되지 않음'); }
    for (const k of ['hl', 'us']) { A.eq(k + '.imm.analysis.act', { pend: false, flushed: 'setPage', v63: true, v71: true, page: 'analysis' }); A.eq(k + '.imm.weekly.act', { pend: false, flushed: 'setPage', v63: true, page: 'weekly' });
      A.eq(k + '.imm.calendar.act', { pend: false, flushed: 'setPage', cal: '2026-09', page: 'calendar' }); A.eq(k + '.imm.newTrade.act', { pend: false, flushed: 'openNew', open: true, qty: true });
      for (const nm of ['analysis', 'weekly', 'calendar', 'newTrade']) A.eq(k + '.imm.' + nm + '.at', ['ana', 'cal']); }
    A.eq('console', []); } },
  /* v95 투자 휴식 권고: 3거래일 연속 실현 손실 → 대시보드 맨 위 배너(무거래일 건너뜀·플러스/0원 끊김·4연속·× 닫기 유지·새 손실일 재표시), HL·US × 1440·390 */
  t95: { check(A) { for (const k of ['HL1440', 'HL390', 'US1440', 'US390']) { const T = k.startsWith('HL') ? '10/31' : '10/30', TD = k.startsWith('HL') ? '2026-10-31' : '2026-10-30';
    A.eq(k + '.today', TD); A.eq(k + '.s1.vis', true); A.eq(k + '.s1.first', true); A.eq(k + '.s1.title', '투자 휴식 권고 (3거래일 연속 손실)'); A.eq(k + '.s1.days', ['10/27 −0.50%', '10/28 −1.00%', '10/29 −0.20%']);
    A.eq(k + '.gap.vis', true); A.eq(k + '.gap.days', ['10/26 −0.50%', '10/27 −0.50%', '10/29 −0.50%']); A.eq(k + '.plus.vis', false); A.eq(k + '.zero.vis', false);
    A.eq(k + '.four.title', '투자 휴식 권고 (4거래일 연속 손실)'); A.eq(k + '.four.days', ['10/26 −0.50%', '10/27 −0.50%', '10/28 −1.00%', '10/29 −0.20%']);
    A.eq(k + '.d0.vis', true); A.eq(k + '.d1.vis', false); A.eq(k + '.d1.dis', '2026-10-29'); A.eq(k + '.d2.vis', false); A.eq(k + '.d3.vis', false); A.eq(k + '.d3.dis', '2026-10-29');
    A.eq(k + '.d4.vis', true); A.eq(k + '.d4.first', true); A.eq(k + '.d4.last', TD); A.eq(k + '.d4.title', '투자 휴식 권고 (4거래일 연속 손실)'); A.eq(k + '.d4.days', ['10/27 −0.50%', '10/28 −1.00%', '10/29 −0.20%', T + ' −0.40%']); } } },
  /* v96 트레이딩뷰식 차트: 십자선·OHLC 범례·축 끌기 배율·더블클릭 리셋·체결 마커·말풍선·거래량 토글·가로선 도구·터치 길게 누르기 */
  t96: { check(A) { for (const w of W) { A.eq(w + '.mk', { n: 4, buy: 2, sell: 2 }); A.eq(w + '.tags', ['entry', 'last', 'stop', 'target']); A.eq(w + '.ticks.p', true); A.has(w + '.tip', '매수'); A.has(w + '.tip', '수량 30');
    A.eq(w + '.xh', { lines: 2, px: true, tl: true }); A.eq(w + '.leg', { o: true, pct: true, col: true }); A.eq(w + '.yzoom', true); A.eq(w + '.ysame', true); A.eq(w + '.yreset', true);
    A.eq(w + '.xzoom', true); A.eq(w + '.xright', true); A.eq(w + '.xreset', true); A.eq(w + '.vol0', true); A.eq(w + '.vol1', 0); A.eq(w + '.volLs', '0'); A.eq(w + '.vol2', true); A.eq(w + '.hline', 1);
    A.eq(w + '.touch', { on: true, moved: true, kept: true, off: true, pop: false }); } } },
  /* v97 투자 휴식 권고 배너가 재렌더(v12 order:8)·HL 동기화 뒤에도 맨 위 유지, × 만으로 숨김, 실제 연속 손실이 끊기면 숨김, v95Debug */
  t97: { check(A) { for (const k of ['HL1440', 'HL390', 'US1440', 'US390']) { const top = { vis: true, n: 3, firstVisual: true, top: 0 };
    for (const s of ['load', 't2s', 'sync', 'back']) { for (const [f, v] of Object.entries(top)) A.eq(k + '.' + s + '.' + f, v); A.eq(k + '.' + s + '.dis', null); }
    A.eq(k + '.trades', k.startsWith('HL') ? 4 : 3); A.eq(k + '.dbg', { status: 'shown', run: 3, journal: k.startsWith('HL') ? 'hyperliquid' : 'us', days: 3, lastLoss: true, pct: -0.2, memo: false, first: 0 });
    A.eq(k + '.x.vis', false); A.eq(k + '.x.dis', '2026-10-29'); A.eq(k + '.x2.vis', false); A.eq(k + '.xdbg', 'dismissed');
    A.eq(k + '.flip.vis', false); A.eq(k + '.flip.dis', null); A.eq(k + '.fdbg', { status: 'no-streak', run: 0, lastPlus: true }); } } },
  /* v98 보유 비중 HL 전체 계좌(USDC 1,000 + 현물 500) 기준 · 현물 조각 · 청산 % 분모 · 현물 계산 중/실패면 USDC 기준 · US 그대로 */
  t98: { check(A) { for (const k of ['HL1440', 'HL390']) { const P = (s, f, v) => A.eq(k + '.' + s + '.' + f, v);
    P('ok', 'center', ['전체 계좌', '1,500.00', '현물 포함']); P('ok', 'rows', { 'p:ETH': ['13.3%', '200.00'], 'p:BTC': ['6.7%', '100.00'], spot: ['33.3%', '500.00'], free: ['46.7%', '700.00'] });
    A.has(k + '.ok.meta', '사용 증거금 ÷ 전체 계좌(현물 포함)'); P('ok', 'note', '전체 계좌 = USDC 1,000.00 + 현물 500.00'); P('ok', 'spotSub', '현물 평가액 · UBTC'); P('ok', 'freeSub', 'USDC − 사용 증거금 합');
    P('ok', 'liqTotal', '계좌 −38.00%'); P('ok', 'ethLiq', 32.67); A.has(k + '.ok.liqNote', '분모 전체 계좌(현물 포함) $1,500.00');
    P('notional', 'rows', { 'p:ETH': ['133.3%', '2,000.00'], 'p:BTC': ['66.7%', '1,000.00'], spot: ['33.3%', '500.00'] }); A.has(k + '.notional.meta', '포지션 규모 ÷ 전체 계좌(현물 포함)'); A.has(k + '.notional.expoSub', '÷ 전체 계좌 1,500.00');
    for (const s of ['pending', 'fail']) { P(s, 'center', ['BALANCE (USDC)', '1,000.00', '현물 계산 중']); P(s, 'rows', { 'p:ETH': ['20%', '200.00'], 'p:BTC': ['10%', '100.00'], free: ['70%', '700.00'] }); P(s, 'spotRow', false);
      A.has(k + '.' + s + '.meta', 'BALANCE(USDC) · 현물 계산 중'); A.has(k + '.' + s + '.note', '현물 계산 중'); P(s, 'ethLiq', 49); P(s, 'liqTotal', '계좌 −57.00%'); }
    A.eq(k + '.failErr', true); } A.eq('US', { card: true, v98: false, spotWord: false }); } },
  /* v99 복수매매 감지: 쿨다운(정확히 15분 포함·15분 1초 제외·UTC 날짜 넘김) · US 갈아타기(ET 날짜) · 3연패 후 진입 · 위험 키움(쿨다운 안 / 같은 날 다음 거래) · 이익 청산 뒤 미표시 · 월간 집계 · 칩 저장 · 설정 */
  t99: { check(A) {
    for (const k of ['HL1440', 'HL390']) { const P = (p, v) => A.eq(k + '.' + p, v);
      P('n', 12); P('dbg.S2', { gap: 5, f: ['revenge'] }); P('dbg.P2.f', []); P('dbg.F2.f', []); P('dbg.F3.f', []); P('dbg.G', { gap: 10, f: ['revenge'] }); P('dbg.A.f', []);
      P('dbg.B', { gap: 15, f: ['revenge', 'riskup'] }); P('dbg.C', { gap: 15.02, f: [] }); P('dbg.D', { gap: 60, f: ['maxloss', 'riskup'] });
      P('rec.B', { gap: '직전 손실 후 15분', b: ['복수매매 의심', '위험 키움!'], why: [] }); P('rec.C', { gap: '직전 손실 후 15분', b: [], why: [] }); P('rec.D.b', ['3연패 후 진입', '위험 키움!']);
      P('rec.G.b', ['복수매매 의심']); P('rec.A', undefined); P('rec.P2', undefined); P('rec.F3.gap', '직전 손실 후 10시간');
      P('link', { proc: '규칙 위반', procOk: '규칙 준수', tags: ['복수매매 의심', '위험 키움'], det: ['v99revenge', 'v99riskup'] });
      P('detail', { gap: '직전 손실 후 15분', b: ['복수매매 의심', '위험 키움'], why: 0, auto: ['복수매매 의심', '위험 키움'] });
      P('ana.cost', ['복수매매 의심', '위험 키움', '3연패 후 진입']); P('ana.pat', ['표시 없음:8', '복수매매 의심:3', '3연패 후 진입:1', '위험 키움:2']);
      P('m10', { open: true, month: '2026년 10월', flagged: '3건', total: '−90.00', without: '−120.00', meta: '10월 표시 3건 · 위반 3건',
        rows: { revenge: ['복수매매 의심', '2', '−50.00', '50%'], maxloss: ['3연패 후 진입', '1', '+80.00', '100%'], riskup: ['위험 키움', '2', '−20.00', '50%'], v111order: ['주문 실수', '0', '—', '—'] /* v111: HL 월간 표 '주문 실수' 줄 */ }, why: null, prev: false, next: true, empty: null });
      P('m9.month', '2026년 9월'); P('m9.flagged', '1건'); P('m9.total', '−60.00'); P('m9.without', '−50.00'); P('m9.rows.revenge', ['복수매매 의심', '1', '−10.00', '0%']); P('m9.prev', true); P('m9.next', false); P('mBack', '2026년 10월');
      P('set0', { cool: '', max: '', ph: '기본 15', vis: true });
      P('set1', { cool: 20, max: 2, dbg: { S2: ['revenge'], F3: ['maxloss'], G: ['revenge'], B: ['revenge', 'riskup'], C: ['revenge', 'maxloss'], D: ['maxloss', 'riskup'] } });
      P('setInvalid', 20); P('setClr', [false, 15]); }
    for (const k of ['US1440', 'US390']) { const P = (p, v) => A.eq(k + '.' + p, v);
      P('n', 6); P('et', [true, true]); P('dbg.U2', { gap: 15, f: ['revenge', 'switch(표시)'] }); P('dbg.U3.f', []); P('dbg.U4', { gap: 300, f: ['switch(표시)'] }); P('dbg.U8', { gap: 20, f: ['switch(표시)'] });
      P('rec.U2', { gap: '직전 손실 후 15분', b: ['복수매매 의심', '갈아타기~'], why: ['미리 정한 가격', '강해 보여서'] }); P('rec.U3', { gap: '직전 손실 후 3시간', b: [], why: [] }); P('rec.U8.b', ['갈아타기~']);
      P('link', { proc: '규칙 위반', procOk: '규칙 준수', tags: ['복수매매 의심'], det: ['v99revenge'] }); P('detail.b', ['복수매매 의심', '갈아타기']); P('detail.why', 2);
      P('ana.pat', ['표시 없음:3', '복수매매 의심:1', '갈아타기:3']);
      P('m10.flagged', '3건'); P('m10.total', '−$30.00'); P('m10.without', '−$70.00'); P('m10.meta', '10월 표시 3건 · 위반 1건'); P('m10.rows.switch', ['갈아타기', '3', '+$30.00', '67%']); P('m10.why', '강해 보여서 0 · 미리 정한 가격 0 · 미답 3');
      P('chipN', 1); P('chip0', { why: 'strong', dlg: false, b: ['갈아타기 · 강해 보여서'], on: ['강해 보여서'] }); P('chip1', { proc: '규칙 위반', saved: true }); P('chip2', { why: 'strong' });
      P('m10b.without', '−$50.00'); P('m10b.meta', '10월 표시 3건 · 위반 2건'); P('m10b.why', '강해 보여서 1 · 미리 정한 가격 0 · 미답 2'); P('chip3', { why: null, proc: '규칙 준수' });
      P('set1', { cool: 20, max: 2, dbg: { U2: ['revenge', 'switch(표시)'], U4: ['switch(표시)'], U8: ['revenge', 'switch(표시)'] } }); P('setInvalid', 20); P('setClr', [false, 15]); } } },
  /* v100 일지 칩 반응 속도: 칩 10종 같은 작업 안 반영 · 마우스 클릭→다음 프레임 <50ms · 클릭 뒤 350ms 안 80ms 넘는 long task 0 · 저장 중 5연타 모두 반영(다시 시도 알림 없음) · 잠금 중 타이핑 유지 · 저장본=state=화면 · 창 열린 동안 renderAll 0 · 새로고침 유지 · US v99 칩은 목록만 다시 그림 */
  t100: { check(A, o) { const want = '{"react":true,"tfIn":"1h","tfOut":"ltf","setup":"EP","conf":2,"cond":"좋음","grade":"B","emo":{"pre":["확신"],"mid":["인내"],"post":["만족"]},"stopNote":"직전 저점 아래 ABC"}';
    for (const w of W) { const P = (p, v) => A.eq(w + '.' + p, v);
      P('n', 320); P('detail', { chart: true, v92: true, v63: true, v71: true });
      P('sync', { pre: true, grade: true, react: true, tfIn: true, tfOut: true, setup: true, conf: true, cond: true, mid: true, post: true });
      P('frameOk', true); P('lt80', 0); P('busy', { react: true, uiReact: true, tfIn: '1h', toast: false }); P('typed', '직전 저점 아래 ABC');
      P('check.stopLi', true); P('check.n', '5/5'); P('check.want', '5/5'); A.ok(w + '.score.ui'); P('score.ui', o[w] && o[w].score && o[w].score.want);
      P('match', { savedState: true, uiState: true }); P('scroll', 0); P('renderWhileOpen', 0); P('renderAfterClose', { full: true, dirty: false, pending: 0 });
      P('savedFinal', true); P('reload', true); P('stateSum', want); }
    A.eq('US', { chip: true, saved: 'strong', proc: '규칙 위반', recordsOnly: true, badge: '갈아타기 · 강해 보여서' }); } },
  /* v101 일지 저장 유실: 칩 6종·텍스트칸 5종 × 입력 0.1초 뒤 (t101) 닫기 버튼·Esc·다른 거래 열기 (t101b) 새로고침·숨김/pagehide (t101d) 저장 못 끝낸 채 새로고침 → 다음 실행에서 11칸 되살림 (t101c) 다른 창 저장·원격 반영 → state·저장본(v83Read)·다시 연 화면 모두 값 유지.
     t101 추가: 입력 중 renderDetail·v63PaintDetail 뒤 값·포커스 유지, 저장 2번 실패 → 알림 + 재시도 3번째에 저장(값 안 되돌림) */
  t101: { check(A) { A.eq('n', 33); A.eq('okN', 33); A.eq('repaint', { val: '입력 중 다시 그리기 끝', focus: true }); A.eq('repaintSaved', '입력 중 다시 그리기 끝');
    A.eq('failRetry', { toast: true, state: true, saved: true, tries: 3 }); } },
  t101b: { check(A) { A.eq('n', 22); A.eq('okN', 22); } },
  t101d: { check(A) { A.eq('n', 11); A.eq('okN', 11); A.eq('rec_kill', 11); } },
  t101c: { check(A) { A.eq('n', 22); A.eq('okN', 22); } },
  /* v102 '복기 저장'이 일지 글을 지우던 버그: 글칸 5종 × (칸 밖 안 누름·누름) + 칩 5종 + 전부 + 복기 폼 자체 값 + 정정 칸↔왜 샀나 동기화 + 셋업 칩 뒤 선택 + 계획·기준값·스탑·추매 사유 저장 + state 교체 뒤 저장 + 다른 폼 저장 실패 → state·저장본·다시 연 화면·새로고침 모두 유지 */
  t102: { check(A) { A.eq('n', 26); A.eq('okN', 26); A.eq('reloadN', 26); A.eq('reloadOk', 26); A.eq('foldSynced', '왜 샀나 먼저'); A.eq('cardSynced', '정정 칸 나중'); A.eq('selSynced', 'EP');
    A.eq('swapPlan', { state: '교체 뒤 실패 조건', saved: '교체 뒤 실패 조건' }); } },
  /* v103 차트 그리기 도구: 하나 그리면·취소하면 '보기'(버튼 강조 포함), 그리는 도중 유지, 끌기 편집은 모드 그대로, 그린 것 저장 / 셋업 '빗각' 선택지·저장·새로고침·분석 */
  t103: { check(A) { const V = { mode: 'view', on: 'view', pend: false };
    for (const w of ['w1440', 'w390']) { A.eq(w + '.note', { ...V, added: 1 }); for (const k of ['noteEsc', 'noteEmpty', 'trendEsc']) A.eq(w + '.' + k, { ...V, added: 0 });
      A.eq(w + '.noteSwitch', { mode: 'trend', on: 'trend', pend: false, added: 0 }); A.eq(w + '.trendMid.mode', 'trend'); A.eq(w + '.trendMid.pend', true); A.eq(w + '.trend', { ...V, added: 1 });
      A.eq(w + '.dialogOpen', true); A.eq(w + '.overflow', false); }
    A.eq('w390.final', ['note', 'trend']); A.eq('w390.stored', ['note', 'trend']);
    const w = 'w1440'; for (const k of ['hline', 'rect', 'zz', 'zzEnter', 'cv', 'rrl', 'rrs']) A.eq(w + '.' + k, { ...V, added: 1 });
    for (const k of ['zzStop', 'cvEsc']) A.eq(w + '.' + k, { ...V, added: 0 });
    for (const [k, m] of [['hlineMid', 'hline'], ['rectMid', 'rect'], ['zzMid', 'zz'], ['zzUndo', 'zz'], ['cvMid', 'cv']]) { A.eq(w + '.' + k + '.mode', m); A.eq(w + '.' + k + '.pend', true); }
    const all = ['cv', 'hline', 'note', 'rect', 'rr', 'rr', 'trend', 'zz', 'zz']; A.eq(w + '.final', all); A.eq(w + '.stored', all);
    A.eq(w + '.dragNote', { found: true, moved: true, mode: 'note', n: 9 }); A.eq(w + '.dragZz', { found: true, moved: true, mode: 'view', n: 9 });
    A.eq('setup.options', ['미분류', '베이스 돌파', 'EP', '눌림', '평균회귀', '빗각', '기타']); for (const k of ['newSetup', 'filter', 'chip', 'select', 'analysis']) A.eq('setup.' + k, true);
    for (const k of ['before', 'after', 'stored']) A.eq('setup.' + k, ['loss', 'tg']); A.eq('setup.others', ['big:미분류']);
    /* 손익비 상자 → 최초 손절·목표·1R·계획 손익비(HL SL 없이 끝난 숏), 끌면 따라감, 손으로 고친 최초 손절·사용자 목표·HL 최초 손절은 그대로 */
    A.eq('rr.pre.stop0', null); A.eq('rr.pre.r1', null);
    A.eq('rr.open', { stop0: 2315.5, src: 'chart', stop: 2315.5, target: 2298.8, r1: 18.026, plan: 2.34, R: 2.289, planRR: 2.34, rrOk: true }); A.eq('rr.text', { noPlan: false, r1: true });
    A.eq('rr.drag.stop0', 2316.5); A.eq('rr.drag.stop', 2316.5); A.eq('rr.drag.r1', 21.6312); A.eq('rr.drag.plan', 1.95);
    A.eq('rr.manual.stop0', 2318); A.eq('rr.manual.src', null);
    A.eq('rr.user.stop0', 2320); A.eq('rr.user.target', 2290); A.eq('rr.user.src', null); A.eq('rr.hl.stop0', 2316); A.eq('rr.hl.src', null); A.eq('rr.hl.target', 2298.8);
    A.eq('rr.reload.es.stop0', 2318); A.eq('rr.reload.es.r1', 27.039); A.eq('rr.reload.eu.target', 2290); A.eq('rr.reload.eh.stop0', 2316); } },
  /* v104 HL 요청 한도: 탭 2개 분당 가중치(v103 실측 ≈632), 숨은 탭 0, 계속 429면 재시도 폭주 없음, 차트 첫 표시·IndexedDB 봉 캐시·429 중 이전 봉+안내 */
  t104: { check(A, o) { if (!(o.dash && o.dash.perMin <= 150)) A.fail('dash.perMin ' + (o.dash && o.dash.perMin) + ' > 150'); A.eq('hidden.n', 0);
    if (!(o.r429 && o.r429.n <= 12)) A.fail('r429.n ' + (o.r429 && o.r429.n) + ' > 12'); if (!(o.r429 && o.r429.cool >= 2)) A.fail('r429.cool < 2');
    for (const k of ['first', 'open']) if (!(o.chart && o.chart[k] >= 0 && o.chart[k] <= 1500)) A.fail('chart.' + k + ' ' + (o.chart && o.chart[k]) + 'ms');
    if (!(o.chart && o.chart.r429 >= 0 && o.chart.r429 <= 1500)) A.fail('chart.r429 ' + (o.chart && o.chart.r429)); A.has('chart.note', '속도 제한'); A.eq('chart.stillSvg', true);
    if (!(o.chart && o.chart.reload >= 0 && o.chart.reload <= 1500)) A.fail('chart.reload'); A.eq('chart.reloadReq', 0); } },
  /* v105 손익비 상자: 끈 뒤 10초 외부 갱신에도 좌표 불변·끄는 중 다시 그리기 무시·HL SL 유지, 라벨 호버/탭 때만, xyz 포지션 %, 타이핑 지연 */
  t105: { check(A, o) { const b = o.box || {}; A.eq('box.lab0', '0'); A.eq('box.lab1', '1'); A.eq('box.lab2', '0'); A.eq('box.tpMoved', 30); A.eq('box.slShift', 0); A.eq('box.enShift', 0);
    if (!(b.after10 <= 1)) A.fail('box.after10 ' + b.after10 + 'px'); if (!(Math.abs(b.slRelease) <= 2)) A.fail('box.slRelease ' + b.slRelease); if (!(b.slOthers <= 1)) A.fail('box.slOthers ' + b.slOthers);
    if (!(Math.abs(b.midDragDy) <= 2)) A.fail('box.midDragDy ' + b.midDragDy); A.eq('box.stopAfter', 2280);
    A.eq('touch.lab0', '0'); A.eq('touch.lab1', '1'); A.eq('touch.lab2', '0');
    A.near('xyz.p', 0.1332, 0.0005); A.eq('xyz.base', 111440); A.eq('xyz.base2', 55720); A.has('xyz.txt', '포지션 +0.13%');
    const t = o.type || {}; if (!(t.n >= 15 && t.avg < 16 && t.max < 50)) A.fail('type ' + JSON.stringify(t)); A.has('type.saved', '가격 반응 확인 후 진입 ABC def');
    /* v106 일지 빈 칸 */ A.eq('gaps.list', ['gB']); A.eq('gaps.rrBad.bad', true); A.eq('gaps.x', 1); A.eq('gaps.after', { shown: false, hide: true }); A.eq('gaps.saved', true); A.has('gaps.box', 'bad'); A.has('gaps.box', '미달'); } },
  /* v107 HL 계좌 총액: v104 캐시를 거쳐도 잔고 갱신 성공(통합 계정 USDC total), 미실현 변화 따라감, dex 이중 합산 없음, 갱신 실패 시 '⚠ N분 전 값', v107Debug 차이 0 */
  t107: { skipGeneric: ['err'], check(A, o) { A.eq('first.eq', 18000); A.eq('first.err', null); A.eq('first.mode', 'unifiedAccount'); A.eq('first.basis', 50700); A.has('first.tile', '50,700.00');
    A.eq('second.eq', 18250); A.eq('second.err', null); A.has('second.tile', '50,950.00'); A.eq('absNet', 1);
    A.eq('dbg.HL정의총액', 50950); A.eq('dbg.앱표시총액', 50950); A.eq('dbg.차이', 0); A.eq('dbg.스테이킹_참고', 800);
    A.eq('stale.err', 'HL 500'); A.has('stale.tile', '⚠ 거래계좌 10분 전 값'); A.eq('recovered.err', null); if (/⚠ 거래계좌/.test((o.recovered || {}).tile || '')) A.fail('recovered.tile still warns'); } },
  /* v108 일지 빈 칸: 1440·390 같은 판정, 카드에 '이 기기 일지 기준 · 앱 버전'(모바일에서도 보임), 클라우드 새 저장본 안내(revision만 조회), 설정 열기 */
  t108: { check(A) { for (const w of W) { A.eq(w + '.list', ['gB']); A.eq(w + '.src.vis', true); A.eq(w + '.src.hasVer', true); A.has(w + '.src.txt', '이 기기에 저장된 HL 일지 기준'); A.eq(w + '.cloud0', false);
    A.eq(w + '.cl.shown', true); A.has(w + '.cl.txt', '버전 7'); A.eq(w + '.cl.urls', ['select=revision,updated_at']); A.eq(w + '.cl.afterSame', false); A.eq(w + '.cl.again', true);
    A.eq(w + '.page', 'settings'); A.eq(w + '.dbg', { journal: 'HL', local: 5, cloud: 7, gaps: ['gB'], hidden: ['gC'] }); } } },
  /* v110 PC·모바일 자동 동기화(모의 클라우드 · 두 컨텍스트 1440/390): 첫 병합 · 다른 칸 둘 다 · 같은 칸 최신 + 진 값 사본 '충돌 1건' → 진 값으로 바꾸기 양쪽 반영 · 그림 양쪽(V100 경로) ·
     입력 중 칸·포커스 유지(진 값 사본) · kPEPE 체결 지연·순서 뒤바뀜(POSITION_GAP 보류)에도 롱 메모·그림 유지 → 숏 '뒤집힘' 링크 · 예전 사본 1회 되살림 · v83 두 창 칸 병합 · 로컬 기록 되살리기 · 디바운스 자동 저장 · 포커스 자동 받기 */
  t110: { check(A) { A.eq('s0.mobTrades', ['gA', 'gB', 'gC']); A.eq('s0.cas0', [0, 1]);
    const both = ['PC 진입 근거', '모바일 스탑 이유']; A.eq('s1.pc', both); A.eq('s1.mob', both); A.eq('s1.saved', both); A.eq('s1.cloud', both);
    A.eq('s2.pc', '모바일 청산'); A.eq('s2.mob', '모바일 청산'); A.eq('s2.pcChip', { txt: '충돌 1건', vis: true }); A.eq('s2.mobChip', { txt: '충돌 1건', vis: true });
    A.eq('s2.conf', [{ tradeId: 'gB', field: 'exitNote', kept: '모바일 청산', lost: 'PC 청산' }]); A.eq('s2.pop.vis', true); A.has('s2.pop.txt', 'PC 청산');
    A.eq('s2.useLocal', 'PC 청산'); A.eq('s2.pcLeft', 0); A.eq('s2.mobAfter', 'PC 청산'); A.eq('s2.mobLeft', 0);
    A.eq('s3.pcDraw', { v100: 1, saved: ['p1'] }); A.eq('s3.mobDraw', { v100: 1, saved: ['m1'] }); A.eq('s3.pc', ['m1', 'p1']); A.eq('s3.mob', ['m1', 'p1']); A.eq('s3.cloud', ['m1', 'p1']);
    const typed = 'PC 진입 근거 + 모바일 입력 중'; A.eq('s4.typing', { val: typed, focus: true, state: typed }); A.eq('s4.mob', typed + ' 끝'); A.eq('s4.pc', typed + ' 끝'); A.eq('s4.cloud', typed + ' 끝'); A.eq('s4.conf', ['PC 새 근거']);
    A.eq('s5.a.0.e', 20); A.eq('s5.b', [{ id: 'auto:hyperliquid:a8a32d43f025ad68:7000000:long', dir: 'long', st: 'OPEN', held: true, e: 20, f: 0, note: 'kPEPE 롱 근거', chart: ['k1'] }]);
    A.eq('s5.c', [{ id: 'auto:hyperliquid:a8a32d43f025ad68:7000000:long', dir: 'long', st: 'CLOSED', held: false, e: 20, f: 15, note: 'kPEPE 롱 근거', chart: ['k1'] }, { id: 'auto:hyperliquid:a8a32d43f025ad68:7000034:short', dir: 'short', st: 'CLOSED', held: false, e: 24, f: 21, note: '', chart: [] }]);
    A.eq('s5.gapSeen', 1); A.has('s5.flip.txt', '같은 주문으로 청산된 직전 롱'); A.eq('s5.flip.vis', true); A.eq('s5.opened', 'auto:hyperliquid:a8a32d43f025ad68:7000000:long'); A.has('s5.back', '숏으로 뒤집힘');
    A.eq('s5.tag', false); /* v111: 같은 주문 반전 거래는 '뒤집힘' 대신 '주문 실수' 배지(t111) */ A.eq('s5.tagLong', false); A.eq('s5.once', { n1: 2, n2: 0, entryNote: '예전 근거', stopNote: '지금 글', chart: ['o1'], flag: ['z1'] }); A.eq('s5.mob', { note: 'kPEPE 롱 근거', chart: ['k1'], st: 'CLOSED' });
    A.eq('s6.save2', true); A.eq('s6.stored', { hold: 'A창 글', fills: 2, sh: 11, chart: ['m1', 'p1'] }); A.eq('s6.typingBlur', false); A.eq('s6.pcMem', { hold: 'A창 글', fills: 2 });
    A.ok('s7.list'); A.eq('s7.opts', ['review']); A.eq('s7.after', '되살릴 사후 메모'); A.ok('s7.snaps'); A.eq('s7.box.replace', true); A.eq('s7.box.auto', true);
    A.eq('s8.pushed', true); A.eq('s8.cloud', '자동 저장 확인'); A.eq('s8.pc', '자동 저장 확인'); A.has('s8.headPc.txt', '동기화됨'); A.has('s8.headMob.txt', '동기화됨'); A.eq('s8.headMob.vis', true);
    A.eq('dbg.pc.ready', true); A.eq('dbg.pc.lastErr', ''); A.eq('dbg.mob.ready', true); A.eq('dbg.mob.lastErr', ''); A.eq('cas.bad', 0); } },
  /* v109 차트 그리기 자석(끔→약→강 순환·기기 저장, 강 = 가장 가까운 O·H·L·C·봉 가운데, 약 = 12px 안만, 끔 = 그대로, Ctrl 반전, 끌기 3종, 모바일 탭) · 위험 % 분모(현물 조회 전 보류·계산 중 지금 계좌·마감 현물 포함·상세 다시 그림) */
  t109: { check(A, o) { for (const w of W) { A.eq(w + '.btn0.txt', '자석 끔'); A.eq(w + '.cyc', ['weak', 'strong', 'off'].map((m, i) => ({ mode: m, eff: m, txt: '자석 ' + ['약', '강', '끔'][i], pressed: String(m !== 'off'), inTools: true, vis: true, store: m })));
    A.eq(w + '.strong', { a: true, b: true, aIsHigh: true, dpxA: 40, hint: true }); A.eq(w + '.weak', { farRaw: true, farNotSnap: true, nearSnap: true, nearDpx: true }); A.eq(w + '.off', { a: true, b: true, bNotSnap: true });
    A.eq(w + '.dragTrend', { found: true, snap: true }); A.eq(w + '.dragBox', { found: true, snap: true, slOnly: true }); A.eq(w + '.dragRect', { found: true, snap: true }); A.eq(w + '.store', 'strong'); }
    A.eq('w1440.ctrlBtn.txt', '자석 강 (Ctrl)'); A.eq('w1440.ctrl', { a: true, b: true, btnAfter: '자석 끔' }); A.eq('w1440.dot', true);
    A.eq('risk.oldWay', 2.95); A.eq('risk.pending', { basis: null, pct: null, risk: null, codes: [], spot: 'pending', fallback: false, hold: true, detail: null });
    A.eq('risk.dlg0.m', null); A.eq('risk.afterSpot.dlg', '포지션 위험 2.88%'); A.eq('risk.afterSpot.redo', 1); A.eq('risk.afterClose', { dlg: '포지션 위험 2.89%', redo: 2 });
    A.eq('risk.computing.basis', 52010.92); A.eq('risk.computing.pct', 1.03); A.eq('risk.computing.codes', []); A.eq('risk.computing.fallback', true);
    A.eq('risk.closed.basis', 51863); A.eq('risk.closed.pct', 1.04); A.eq('risk.closed.codes', []); A.eq('risk.closed.fallback', false);
    A.eq('risk.zero.basis', 18240); A.eq('risk.noAddr.basis', 18240);
    /* 자동 감지 오감지 · 무시 */
    for (const w of ['dis1440', 'dis390']) { A.eq(w + '.before.chips', ['risk', 'v99revenge', 'v99riskup']); A.eq(w + '.before.x', 3); A.eq(w + '.before.proc', '규칙 위반');
      A.eq(w + '.afterRisk.chips', ['v99revenge', 'v99riskup']); A.eq(w + '.afterRisk.hid', '숨긴 감지 1개'); A.eq(w + '.afterRisk.ds', ['risk']); A.eq(w + '.afterRisk.score', 70);
      A.eq(w + '.afterAll', { chips: [], x: 0, hid: '숨긴 감지 3개', ds: ['risk', 'v99revenge', 'v99riskup'], proc: '미평가', tags: [], v99: [], score: 70, det: [], pre: [], dlgOpen: true });
      A.eq(w + '.stored', ['risk', 'v99revenge', 'v99riskup']); A.eq(w + '.reload.hid', '숨긴 감지 3개'); A.eq(w + '.reload.proc', '미평가');
      A.eq(w + '.saved', { proc: '규칙 위반', tags: ['과도한 위험 배정'], ds: ['risk', 'v99revenge', 'v99riskup'] });
      A.eq(w + '.unFound', true); A.eq(w + '.restored.chips', ['risk', 'v99revenge', 'v99riskup']); A.eq(w + '.restored.ds', null); A.eq(w + '.restored.proc', '규칙 위반');
      A.eq(w + '.restored.pre', ['계획 외 진입', '과도한 위험 배정']); A.eq(w + '.stored2', 'none'); A.eq(w + '.dialogs', []); } } },
  /* v111: 주문 실수(kPEPE 10-30 22:05:13 KST 한 주문 반전 = 실제 11-03 22:05 건 · ETH 4분59초 창 · BTC 5분1초 아님 · 서버 flip_alerts 병합 · × 숨김/다시 보기 · 월간) · 타이핑 중 미룸 · 자동 높이 · 복기 필요 기준 */
  t111: { check(A) {
    A.eq('m.trades', [{ dir: 'long', st: 'CLOSED' }, { dir: 'short', st: 'CLOSED' }]);
    A.eq('m.model', [{ coin: 'ETH', dir: 'short', kind: 'window', src: 'app', gap: 299, prevSize: 2, newSize: 2, oid: '91003', tid: '21', time: '13:04:59' }, { coin: 'kPEPE', dir: 'short', kind: 'order', src: 'app', gap: 0, prevSize: 4456063, newSize: 10020607, oid: '880004', tid: '7000034', time: '13:05:13' }]);
    A.eq('m.tagShort', { mis: 1, flip: 0 }); A.eq('m.tagLong', { mis: 0, flip: 0 }); A.eq('m.tagE2', { mis: 1, flip: 0 }); A.eq('m.tagB2', { mis: 0, flip: 0 });
    A.eq('m.pull', true); A.eq('m.model2.0.src', 'app+server'); A.eq('m.flipReads', 1); A.eq('m.listMis', true); A.eq('m.writes', []);
    A.eq('m.det', { mis: true, desc: '주문 실수한 주문으로 롱 4,456,063 청산 + 숏 10,020,607 진입 · 10/30 22:05:13 KST · reduce-only 아님', boxes: 1, hid: false, over: false });
    A.eq('m.afterX.det.mis', false); A.eq('m.afterX.det.hid', true); A.eq('m.afterX.dis', ['v111order']); A.eq('m.afterX.tag', { mis: 0, flip: 1 }); A.eq('m.saved', ['v111order']);
    A.eq('m.monthHidden.n', 1); A.eq('m.restored.det.mis', true); A.eq('m.restored.dis', null);
    A.eq('m.month', { row: ['주문 실수한 주문 반전 1 · 5분 안 1', '2', '−57.35', '50%'], n: 2, closed: 2, usd: -57.35, win: 50, meta: '10월 표시 3건 · 위반 3건 · 주문 실수 2건' }); A.eq('m.expectUsd', -57.35);
    A.eq('t.during', { same: true, focus: true, flush: 0, detail: 2, render: 1, sync: 1, syncRet: false, queued: ['flush', 'light:wB1', 'mirror', 'renderAll', 'renderDetail', 'sync'] });
    A.eq('t.after', { queued: [], redrawn: true, focus: true, val: '입력 중 다시 그리기 끝', saved: '입력 중 다시 그리기 끝', flushed: true });
    for (const w of ['a.pc', 'mob.auto']) for (const k of ['entry', 'review']) { A.eq(w + '.' + k + '.scroll', false); A.eq(w + '.' + k + '.tall', true); A.eq(w + '.' + k + '.auto', true); }
    A.eq('a.grow', { more: true, scroll: false }); A.eq('a.read', { len: 147, end: true });
    const no = { need: false, api: false, tg: false, v18: false };
    A.eq('r.r_none', { need: true, api: false, tg: false, v18: true }); A.eq('r.r_entryOnly', { need: true, api: false, tg: false, v18: true });
    for (const k of ['process', 'grade', 'emo', 'exitNote', 'postEval', 'review', 'open']) A.eq('r.r_' + k, no);
    A.eq('r.r_quick', { need: false, api: false, tg: true, v18: false }); A.eq('r.pendingIds', ['r_entryOnly', 'r_none']);
    A.eq('mob.det', { mis: true, over: false, doc: false }); A.eq('mob.afterTap', { dis: ['v111order'], hid: true }); A.eq('dialogs', 0); } },
  t112: { check(A) {
    A.eq('m.daily', { keys: ['2026-11-01', '2026-11-02', '2026-11-03'], conf: 0 });
    A.eq('m.nested', { d1: ['PC 잘한 점', '폰 실수', 3000], d2: '폰 11-02', wFocus: ['손절', 'PC 집중', '폰 집중'], w45: 'PC W45', conf: 0 });
    A.eq('m.sameField', { memo: '폰 메모', conf: [['dailyReviews.hl.2026-11-01.memo', '폰 메모', 'PC 메모', '__top']], label: '일간 복기 11-01 · 메모' });
    A.eq('m.execEdit', { price: 101.5, note: '폰 메모', conf: 0 }); A.eq('m.execEditRev', { price: 101.5, note: '폰 메모' }); A.eq('m.execDelete', { n: 1, review: '폰 복기' });
    A.eq('m.execBoth', { price: 102, conf: [['entries', 101]] }); A.eq('m.fillReview', { n: 2, comp: 'followed' });
    A.eq('m.arrays', { dis: ['limit', 'risk', 'v111order'], vio: ['물타기', '손절 미준수'], pre: ['FOMO', '조급', '차분'], conf: 0 }); A.eq('m.arraysNoBase', ['a', 'b']);
    A.eq('m.goals', ['2026-W44', '2026-W45', '2026-W46']); A.eq('m.delCache', ['a']); A.eq('m.canon', true); A.eq('m.strip', true);
    A.eq('i.first', 'pushed'); A.eq('i.detail.ta', true); A.eq('i.detail.card', true); A.eq('i.detail.mfe', true); A.eq('i.detail.v63x', true);
    A.eq('i.edit', 'same'); A.eq('i.poll', 'same'); A.eq('i.after.cas', 0); A.eq('i.after.rev', 0); A.eq('i.after.heads', 1); A.eq('i.after.fulls', 0); A.eq('i.after.fast', true); A.eq('i.after.clean', true); A.ok('i.after.cached');
    A.eq('i.real', { r: 'pushed', cas: 1, cloud: '실제 편집', v63x: false });
    A.eq('d.set', true); A.eq('d.ret', false); A.eq('d.after.baseReview', ''); A.eq('d.after.local', '안 올린 이 기기 글');
    A.eq('e.a', 'pushed'); A.eq('e.b', 'pushed'); A.eq('e.cloud', { a: 'A탭 글', b: 'B탭 글' }); A.eq('e.tabBase', true);
    A.eq('s.hold.day', true); A.eq('s.hold.hit', false); A.eq('s.hold.pct', null); A.eq('s.hold.mode', 'close'); A.eq('s.hold.why', 'spot'); A.has('s.hold.txt', '현물 계산 중');
    A.eq('s.panel', { hold: true, reached: false }); A.eq('s.pre', ['하루·이번 주·이번 달 손실 한도: HL 현물 계산 중이라 판정 보류 — 받으면 다시 계산해요.']);
    A.eq('s.limitOverrideHidden', true); A.eq('s.widget', { badge: '한도 계산 중', day: false }); A.eq('s.spot', { items: 1, st: 'held' });
    A.eq('s.after.hold', false); A.eq('s.after.hit', false); A.eq('s.after.pct', -1.5); A.eq('s.after.spot', 1000); A.eq('s.after.value', 2000); A.eq('s.after.panelHold', false); A.eq('s.after.txt', '전일 마감 2,000.00 USDC (현물 포함)'); } },
  /* v113 거래 기록 목록 경량화(화면 폭에 맞는 목록 하나 · 처음 표 100/카드 50 · 끝 근처 자동/더 보기, 건수는 전체) + 동기화·HL 요청 멈춤 방지(시간 제한·실패 칩 재시도) */
  t113: { check(A) {
    const row = (rows, cards, more, count) => ({ rows, cards, visRows: rows, visCards: cards, more, count });
    A.eq('L.n', 300); A.eq('L.first', row(100, 0, true, '300건')); A.eq('L.order', true); A.eq('L.countAll', true); A.eq('L.same0', []); A.eq('L.same1', []);
    A.eq('L.more1', row(200, 0, true, '300건')); A.eq('L.v99.ok', true); A.ok('L.v99.want'); A.eq('L.keep', row(200, 0, true, '300건')); A.eq('L.del', row(200, 0, true, '299건'));
    A.eq('L.scroll', row(299, 0, false, '299건')); A.eq('L.auto', true); A.eq('L.search', row(74, 0, false, '74건')); A.eq('L.btcAll', 74); A.eq('L.clear', row(100, 0, true, '299건'));
    A.eq('L.toMob', row(0, 100, true, '299건')); A.eq('L.toPc', row(100, 0, true, '299건'));
    A.eq('M.first', row(0, 50, true, '300건')); A.eq('M.more', row(0, 100, true, '300건')); A.eq('M.v99', true); A.eq('M.toPc', row(100, 0, true, '300건')); A.eq('M.back', row(0, 100, true, '300건'));
    A.eq('N.first', 'pushed'); A.eq('N.ok0', true); A.has('N.busyChip', '받는 중 '); A.eq('N.failChip', '받기 실패 · 다시 시도'); A.eq('N.failBusy', false); A.has('N.err1', '시간 초과');
    A.eq('N.page', 'dashboard'); A.eq('N.retryChip', true); A.eq('N.retryTap', 1);
    A.eq('N.dead', { r: false, busy: false, st: 'fail', wd: 1 }); A.eq('N.deadChip', '받기 실패 · 다시 시도');
    A.eq('N.lock', { r: 'same', skip: 1, fast: true }); A.eq('N.q', { r: 'same', to: 1 });
    A.eq('N.offChip', '오프라인'); A.eq('N.offSync', false); A.eq('N.onChip', true);
    A.eq('N.vis0.busy', true); A.eq('N.vis.busy', false); A.eq('N.vis.visAbort', 1); A.eq('N.vis.ok', true);
    A.has('N.slowChip', '받는 중 '); A.eq('N.slow.ok', true); A.eq('N.slow.other', true);
    A.eq('H.to', true); A.eq('H.spotBusy', false); A.eq('H.inflight', 0); A.eq('H.queue', 0); A.eq('H.next', true); A.eq('H.spotOk', true);
    A.eq('H.v62busy0', true); A.eq('H.v62busy', false); A.eq('H.v62ms', true); A.eq('H.pend0', true); A.eq('H.stale', true); A.eq('H.reset', true); } },
  t114: { check(A, L) {
    if (!(L.F && L.F.ms < 600)) A.fail('F.ms 펀딩 검토 600ms 넘음: ' + (L.F && L.F.ms));
    A.eq('F.rows', 200); A.eq('F.errors', []); A.eq('F.status', 'MATCH'); A.eq('F.cand', 180); A.eq('F.frN', true);
    A.eq('D.open', { vis: true, page: 'dashboard', over: false, docScroll: false }); A.eq('D.has', []);
    A.eq('D.copy.secret', false); A.eq('D.copy.addr', false); A.eq('D.copy.warn', true); A.eq('D.copy.hidden', true); A.eq('D.closed', true); A.eq('D.ver', true); A.eq('D.btn', true);
    A.has('D.busyChip', '받는 중 '); A.eq('D.busyPanel.vis', true); A.eq('D.busyPanel.page', 'dashboard'); A.eq('D.busyPanel.stage', true); A.eq('D.busyPanel.busy', true);
    A.eq('D.released', { busy: false, chip: '받기 실패 · 다시 시도', fix: true });
    A.eq('W.busy0', true); A.eq('W.sync', { busy: false, st: 'fail', fix: true });
    A.eq('W.hl', { pend: 1, busy0: true, busy: false, left: 0, done: true }); A.eq('W.leak.got', true); A.eq('W.leak.inflight', 0);
    A.eq('W.spot', { busy: false, balKick: 1, stale: true }); A.eq('W.lead', { leader: true, steal: 1 }); A.eq('W.warn', { secret: false, hidden: true });
    A.eq('B', { prev: true, closed: true, hasVer: true, boot: true, row: true }); } },
  t116: { check(A) {
    A.eq('T', { delay: true, st: 'ok', hlcBusy: false, addr: true, hlb: true, leader: true, hlTO: true, hung: 1, rescued: true, abort: true, diag: { sec: true, lag: true, secret: false }, chip: true, sec: true });
    A.eq('L.found', true); A.eq('L.loopOk', true); A.eq('L.still', true); A.eq('L.auto', true); A.eq('L.closed', true); A.eq('L.user', true);
    A.eq('S', { burst: true, mid: true, skip: true, last: true }); } },
  t115: { check(A) {
    A.eq('G', { st: 'ok', hlcBusy: false, addr: true, hlb: true, hlN: true, leader: true, steal: true, tokenTO: true, syncTO: true, warn: true, bar: true, fresh: true, diag: { sec: true, lock: true, rev: true, secret: false }, over: false, sec: true, tok: true });
    A.eq('H', { leader: false, steal: 0, peer: true, pLeader: true });
    A.eq('I', { ok: true, ms: true, save: true, hang: true, co: true, busy: false, after: { qa: 2, hang: false, save: true } });
    A.eq('S', { safe: true, bar: true, hl: 0, sync: false, over: false, diag: true, url: 'ok', cloud: 0 });
    A.eq('R', { n1: 1, v1: '왜 샀나 QA', n2: 0, v2: '', skip: true }); A.eq('C', { box: true, st: true, toastTop: true, over: false }); A.eq('A', { bar: true, btn: true, hid: true }); } },
};
