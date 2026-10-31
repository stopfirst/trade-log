/* 각 검사 스크립트(qa/tests/<이름>.cjs)의 기대값.
   공통 검사(qa/check.cjs): 페이지 오류 0 · 넘침/잘림 0 · 스크린샷 오류 없음 · 정상 종료.
   APP_VER / data-v 같은 버전 표시는 일부러 보지 않음 → 버전이 올라가도 그대로 쓸 수 있음.
   모든 데이터는 스크립트 안의 모의 값(가짜 주소 0xabc / 0x1111…, 가짜 체결·봉). 실제 계정 데이터 없음. */
const W = ['w1440', 'w390'];
module.exports = {
  /* v43/v56 손익비 도구 → 스탑·1R 자동 채움, 사용자가 고친 값 유지 */
  t56: { check(A) { A.eq('done', true); A.eq('manual', { stop0: 99.6, ir: 28 }); A.eq('rr.stop', 98.8); A.eq('rr.stop0', 98.8); A.eq('rr.ir', 60); A.near('rr.plan.rr', 2.5, 1e-6);
    A.eq('userEdit.stop0', 98.5); A.eq('rr2', { stop: 98.9, stop0: 98.5 }); A.eq('first', [100, 30, 'long']); } },
  /* v57 현물 포함 계좌 총액 카드 (현물 모의 가격) */
  t57: { check(A) { A.near('basis', 1796.14, 1e-6); A.has('card', '1,796.14 USDC'); A.has('card', '현물 UBTC 0.01'); } },
  /* v58/v59 HL 잔고 + 현물 합산 (가짜 주소 0x1111…) */
  t59: { check(A) { A.near('spot.usd', 2804.7977727138, 1e-6); A.has('card', '59,383.77 USDC'); A.has('card', '거래계좌 56,578.97'); } },
  /* v60 거래기록 가져오기 · 손익비 상자 롱/숏 */
  t60: { check(A, o) { const s = Object.assign({}, ...o.scenes); A.eq('direct.n', 2, s); A.eq('click.called', 1, s); A.eq('click.label', '거래기록 가져오기', s);
    A.eq('rrl.stop', 99.36, s); A.eq('rrl.target', 101.28, s); A.eq('second.n', 1, s); A.eq('rrs.rr', [['long', 100, 99.360436, 101.27913], ['short', 100, 100.63956, 98.720872]], s); } },
  /* v61 차트 사각형 그리기·크기·이동·삭제, 추세선 이동 (마지막 추세선 팝업 확인은 대상 요소가 앞 장면에서 지워져 건너뜀) */
  t61: { check(A, o) { const s = Object.assign({}, ...o.scenes); A.eq('prev', true, s); A.eq('mode', 'rect', s); A.eq('popAfterDrag', false, s); A.eq('pop', ['삭제', '닫기'], s);
    A.eq('afterDel', [], s); A.eq('others', 3, s); A.ok('trend.after', s); } },
  /* v63 주간 리뷰(v91: 복기 탭으로 이동) · 거래 채점 · 셋업/확신/컨디션 저장 */
  t63: { check(A, o) { for (const i of [0, 5]) { const w = o.scenes[i]; A.eq('week.page', 'page-weekly', w); A.has('week.txt', '승률 33%', w); A.has('week.txt', '-4.86R', w); A.has('week.txt', '−338.88', w); }
    for (const i of [2, 7]) A.has('card', '90/100', o.scenes[i]); for (const i of [3, 8]) { A.eq('after.setup', '눌림', o.scenes[i]); A.eq('after.conf', 4, o.scenes[i]); A.eq('after.cond', '좋음', o.scenes[i]); A.eq('after.score', 100, o.scenes[i]); } } },
  /* v64 일 손실 한도 · 사용자 수정 유지 (스크립트가 스스로 시계를 고정) */
  t64: { env: { QA_REAL_CLOCK: '1' }, check(A) { for (const k of ['today', 'tomorrow']) { A.eq(k + '.limD', 2.5); A.eq(k + '.riskMax', 2.5); A.eq(k + '.flag', true); A.eq(k + '.afterUserEdit', 2); } } },
  /* v65 지그재그 그리기: 완료/취소/그만, 끌기 */
  t65: { check(A) { for (const w of W) { A.eq(w + '.pend', 4); A.eq(w + '.act', ['완료', '한 점 취소', '그만']); A.eq(w + '.afterUndo', 3); A.eq(w + '.saved', [4]); A.eq(w + '.dragChanged', true); A.eq(w + '.clickFinish', 2); A.eq(w + '.pop', ['변동폭 보이기', '삭제', '닫기']); } } },
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
  t90: { check(A) { for (const k of ['HL1440', 'HL390', 'US1440', 'US390']) { A.eq(k + '.R1', 99.9); A.eq(k + '.adds.length', 2); A.eq(k + '.adds.0.tag', 'pyr'); A.eq(k + '.adds.0.avg1', 101.6); A.eq(k + '.adds.0.totRisk', 18.4);
    A.eq(k + '.adds.1.tag', 'avg'); A.eq(k + '.adds.1.totRisk', 16.4); A.eq(k + '.card', true); A.eq(k + '.notes', 2); A.eq(k + '.inJournal', true); A.eq(k + '.plainCard', false); A.eq(k + '.plainR', 50); A.eq(k + '.plainSame', true);
    A.has(k + '.reload.ta', '돌파 확인 후 1차 추매'); } A.eq('HL1440.chartMarks', ['추매1:v90-lab pyr', '추매2:v90-lab avg']); } },
  /* v75~v79 + v91 거래 상세: 순서·HL 스탑 동기화·목표 수정·메모·포지션 %·계획 vs 실제(분석 탭 접힘 펼쳐서) */
  t91: { check(A) { for (const w of W) { A.eq(w + '.sync.stop', 1.2346); A.eq(w + '.sync.ir', 987.654); A.eq(w + '.order2', ['v76-sec v76-review', 'v76-sec v76-manage', 'v75-more', 'deleteTrade']); A.eq(w + '.lev', true);
    A.eq(w + '.v77stop.tg', 150); A.eq(w + '.v77stop.tile', '150'); A.eq(w + '.hold.saved', '보유 테스트');
    A.has(w + '.v91.txt', '포지션 +153.8% · 증거금(3×) +461.4%'); A.eq(w + '.v91.n', 1); A.has(w + '.v79.t', '계획의 12%'); A.has(w + '.v79.dx', '계획보다 일찍 익절'); A.has(w + '.v79.v', '12%만 실현'); } } },
  /* v91 복기·분석 구조 덤프 · 곡선 폭 · 넘침 0 */
  tdump: { check(A) { for (const w of W) { A.eq(w + '.open.open', true); A.eq(w + '.open.over', 0); A.ok(w + '.open.curveW'); A.has(w + '.dump.analysis', '핵심 지표'); A.has(w + '.v91.txt', '포지션 +153.8%'); A.has(w + '.v79.t', '계획의 12%'); } } },
};
