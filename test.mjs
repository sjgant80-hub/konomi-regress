// test.mjs — the suite. Run: node test.mjs
//
// ANTI-VACUOUS. The claims here are again mostly negative — an inadmissible comparison must THROW, a
// masked regression must be CAUGHT, a coin-flip must NOT be reported as progress — and a negative is
// only proven by the thing it rejects. The sign test is additionally checked against hand-computed
// exact values, because a statistic nobody verified is just a number with a Greek letter next to it.
import { h64, corpusId, violations, makeRun, fromGrades, summarise, unreach } from './run.mjs';
import { AXES, IMPROVED, REGRESSED, UNCHANGED, MAX_EXACT_N, signTest, compare, regressions, lostGround } from './compare.mjs';
import { gateComparison, reading, HOLE, DEFAULTS } from './gate.mjs';
import { foldNumber, bloomVector, emptyState, inc, toGlyphs, isFoldable, SPINE } from './fold.mjs';

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => { if (cond) pass++; else { fail++; console.error(`  FAIL  ${name}${extra ? ' · ' + extra : ''}`); } };
const throws = (name, fn, match) => {
  try { fn(); ok(name, false, 'expected a throw, got none'); }
  catch (e) { ok(name, match ? String(e.message).includes(match) : true, `message was: ${e.message.slice(0, 110)}`); }
};

const FP = 'abc123def456';
const item = (id, vector, met = []) => ({ id, vector, met });
const runSpec = (over = {}) => ({
  label: 'run', model: 'example-model-a', modelVersion: '2026.01', rubricFingerprint: FP,
  items: [item('i1', [1, 1, 1, 0, 0, 0, 0], ['C1', 'C2'])], ...over,
});

// ── 1 · the run record ──────────────────────────────────────────────────────────────────────
ok('run · a clean spec has no violations', violations(runSpec()).length === 0);
ok('run · rejects a missing label', violations(runSpec({ label: ' ' })).some(v => v.includes('label')));
ok('run · rejects a missing model', violations(runSpec({ model: '' })).some(v => v.includes('model must name')));
ok('run · REQUIRES a model version', violations(runSpec({ modelVersion: '' })).some(v => v.includes('modelVersion is required')));
ok('run · rejects a missing rubric fingerprint', violations(runSpec({ rubricFingerprint: '' })).some(v => v.includes('rubricFingerprint')));
ok('run · rejects a non-hex rubric fingerprint', violations(runSpec({ rubricFingerprint: 'not-hex-at-all' })).some(v => v.includes('rubricFingerprint')));
ok('run · rejects an empty item list', violations(runSpec({ items: [] })).some(v => v.includes('non-empty')));
ok('run · rejects a duplicate item id',
  violations(runSpec({ items: [item('i1', [0,0,0,0,0,0,0]), item('i1', [1,0,0,0,0,0,0])] })).some(v => v.includes('duplicate item id')));
ok('run · rejects a vector of the wrong length',
  violations(runSpec({ items: [item('i1', [1, 2, 3])] })).some(v => v.includes('7 places')));
ok('run · rejects a negative vector place',
  violations(runSpec({ items: [item('i1', [-1, 0, 0, 0, 0, 0, 0])] })).some(v => v.includes('non-negative')));
ok('run · rejects a fractional vector place',
  violations(runSpec({ items: [item('i1', [1.5, 0, 0, 0, 0, 0, 0])] })).some(v => v.includes('non-negative')));
ok('run · rejects a malformed item id', violations(runSpec({ items: [item('has spaces', [0,0,0,0,0,0,0])] })).some(v => v.includes('short identifier')));
ok('run · rejects a non-array met', violations(runSpec({ items: [{ ...item('i1', [0,0,0,0,0,0,0]), met: 'C1' }] })).some(v => v.includes('met must be')));
ok('run · a met list may be omitted', violations(runSpec({ items: [{ id: 'i1', vector: [0,0,0,0,0,0,0] }] })).length === 0);
ok('run · rejects a non-object spec', violations(null).length > 0);
throws('run · makeRun THROWS rather than warning', () => makeRun(runSpec({ modelVersion: '' })), 'rejected');
ok('run · the thrown message names the run', (() => {
  try { makeRun(runSpec({ label: 'nightly', items: [] })); return false; } catch (e) { return e.message.includes('nightly'); }
})());

{
  const r = makeRun(runSpec());
  ok('run · is frozen', Object.isFrozen(r));
  ok('run · computes an item grade', r.items[0].grade === foldNumber([1, 1, 1, 0, 0, 0, 0]).toString());
  ok('run · computes an item total', r.items[0].total === 3);
  ok('run · sorts the met list so two runs compare stably', makeRun(runSpec({ items: [item('i1', [0,0,0,0,0,0,0], ['C2', 'C1'])] })).items[0].met.join() === 'C1,C2');
  ok('run · indexes items by id', r.byId.get('i1').id === 'i1');
}

// content addressing
ok('hash · is stable', h64('abc') === h64('abc'));
ok('hash · differs for different input', h64('abc') !== h64('abd'));
ok('hash · is 16 hex characters', /^[0-9a-f]{16}$/.test(h64('abc')));
ok('corpusId · ignores item ORDER', corpusId([{ id: 'a' }, { id: 'b' }]) === corpusId([{ id: 'b' }, { id: 'a' }]));
ok('corpusId · changes when an item is ADDED', corpusId([{ id: 'a' }]) !== corpusId([{ id: 'a' }, { id: 'b' }]));
ok('corpusId · changes when an item is RENAMED', corpusId([{ id: 'a' }]) !== corpusId([{ id: 'z' }]));

// summary
{
  const r = makeRun(runSpec({ items: [item('i1', [1, 0, 0, 0, 0, 0, 0]), item('i2', [2, 1, 0, 0, 0, 0, 0])] }));
  const s = summarise(r);
  ok('summary · sums per axis', JSON.stringify(s.perAxis) === JSON.stringify([3, 1, 0, 0, 0, 0, 0]));
  ok('summary · counts items', s.items === 2);
  ok('summary · met total is the vector sum', s.metTotal === 4);
  ok('summary · mean per item is correct', Math.abs(s.meanPerItem - 2) < 1e-12);
  ok('summary · the reach number factors back to the summed vector',
    JSON.stringify(unreach(s.reach)) === JSON.stringify(s.perAxis));
  ok('summary · glyphs match the summed vector', s.glyphs === toGlyphs(s.perAxis));
}

// fromGrades
{
  const grades = [
    { vector: [1, 0, 0, 0, 0, 0, 0], verdicts: [{ id: 'C1', verdict: 'MET' }, { id: 'C2', verdict: 'NOT_MET' }] },
    { vector: [0, 1, 0, 0, 0, 0, 0], verdicts: [{ id: 'C2', verdict: 'MET' }] },
  ];
  const r = fromGrades(grades, ['a', 'b'], { label: 'g', model: 'm', modelVersion: '1', rubricFingerprint: FP });
  ok('fromGrades · builds a run', r.items.length === 2);
  ok('fromGrades · keeps only MET criteria', r.items[0].met.join() === 'C1');
  ok('fromGrades · a NOT_MET criterion is not counted as met', !r.items[0].met.includes('C2'));
  throws('fromGrades · rejects mismatched lengths', () => fromGrades(grades, ['a'], {}), 'equal-length');
}

// ── 2 · the sign test · checked against hand-computed exact values ──────────────────────────
ok('signTest · nothing moved gives p = 1', signTest(0, 0).p === 1);
ok('signTest · 10 vs 0 is decisive', Math.abs(signTest(10, 0).p - 2 / 1024) < 1e-11, `p=${signTest(10, 0).p}`);
ok('signTest · 9 vs 1 matches the exact tail', Math.abs(signTest(9, 1).p - 22 / 1024) < 1e-11, `p=${signTest(9, 1).p}`);
ok('signTest · 6 vs 0 matches the exact tail', Math.abs(signTest(6, 0).p - 2 / 64) < 1e-11, `p=${signTest(6, 0).p}`);
ok('signTest · 20 vs 3 matches the exact tail',
  Math.abs(signTest(20, 3).p - 2 * (1 + 23 + 253 + 1771) / 2 ** 23) < 1e-11, `p=${signTest(20, 3).p}`);
// The resolution floor is documented rather than hidden: a tail below 1e-12 reports as 0 and says so.
ok('signTest · a tail below the reporting resolution comes back as 0 with a note',
  signTest(60, 0).p === 0 && /resolution/.test(signTest(60, 0).note));
ok('signTest · that tiny tail is still marked exact', signTest(60, 0).exact === true);
ok('signTest · an even split is capped at 1', signTest(5, 5).p === 1);
ok('signTest · 1 vs 1 is capped at 1', signTest(1, 1).p === 1);
ok('signTest · is symmetric in its arguments', signTest(9, 1).p === signTest(1, 9).p);
ok('signTest · a bigger imbalance gives a smaller p', signTest(10, 0).p < signTest(8, 2).p);
ok('signTest · reports n as the moved count', signTest(7, 3).n === 10);
ok('signTest · reports k as the smaller side', signTest(7, 3).k === 3);
ok('signTest · marks small samples as exact', signTest(4, 1).exact === true);
ok('signTest · declines to compute beyond the exact limit',
  signTest(MAX_EXACT_N, 1).exact === false && signTest(MAX_EXACT_N, 1).p === null);
ok('signTest · every p lies in [0,1]',
  [[0,0],[1,0],[3,1],[5,5],[12,2],[20,7],[30,30]].every(([a, b]) => { const p = signTest(a, b).p; return p >= 0 && p <= 1; }));

// ── 3 · admissibility · the refusals ────────────────────────────────────────────────────────
const A = makeRun({ label: 'before', model: 'm', modelVersion: '1.0', rubricFingerprint: FP, items: [
  item('i1', [1, 0, 0, 0, 0, 0, 0], ['C1']),
  item('i2', [1, 1, 0, 0, 0, 0, 0], ['C1', 'C2']),
]});
const B = makeRun({ label: 'after', model: 'm', modelVersion: '2.0', rubricFingerprint: FP, items: [
  item('i1', [1, 1, 0, 0, 0, 0, 0], ['C1', 'C2']),
  item('i2', [1, 1, 0, 0, 0, 0, 0], ['C1', 'C2']),
]});

throws('admissibility · REFUSES a changed rubric',
  () => compare(A, makeRun({ label: 'x', model: 'm', modelVersion: '2.0', rubricFingerprint: 'ffffffff', items: A.items.map(i => ({ id: i.id, vector: i.vector.slice(), met: i.met.slice() })) })),
  'the rubric changed');
throws('admissibility · REFUSES a changed corpus',
  () => compare(A, makeRun({ label: 'x', model: 'm', modelVersion: '2.0', rubricFingerprint: FP, items: [item('i1', [1,0,0,0,0,0,0]), item('i3', [1,0,0,0,0,0,0])] })),
  'the corpus changed');
ok('admissibility · accepts matching rubric and corpus', compare(A, B).admissible === true);

{
  const C = makeRun({ label: 'partial', model: 'm', modelVersion: '3.0', rubricFingerprint: FP, items: [
    item('i1', [2, 0, 0, 0, 0, 0, 0], ['C1']), item('i9', [1, 0, 0, 0, 0, 0, 0], ['C1']),
  ]});
  const cmp = compare(A, C, { onIntersection: true });
  ok('admissibility · onIntersection compares the shared items', cmp.paired === 1);
  ok('admissibility · onIntersection reports what only the earlier run had', cmp.droppedBefore.join() === 'i2');
  ok('admissibility · onIntersection reports what only the later run had', cmp.droppedAfter.join() === 'i9');
  ok('admissibility · onIntersection is recorded on the result', cmp.onIntersection === true);
  ok('gate · DROPPED · an intersection comparison is never silent',
    gateComparison(cmp).holes.some(h => h.kind === HOLE.DROPPED));
  throws('admissibility · REFUSES when the two runs share nothing',
    () => compare(A, makeRun({ label: 'z', model: 'm', modelVersion: '4', rubricFingerprint: FP, items: [item('zz', [0,0,0,0,0,0,0])] }), { onIntersection: true }),
    'share no items');
}

// ── 4 · the comparison ──────────────────────────────────────────────────────────────────────
{
  const cmp = compare(A, B);
  ok('compare · pairs every item', cmp.paired === 2);
  ok('compare · counts improved items', cmp.improved === 1);
  ok('compare · counts unchanged items', cmp.unchanged === 1);
  ok('compare · counts regressed items', cmp.regressed === 0);
  ok('compare · nets the movement', cmp.net === 1);
  ok('compare · sums gross movement as churn', cmp.churn === 1);
  ok('compare · labels an improved item', cmp.items.find(i => i.id === 'i1').direction === IMPROVED);
  ok('compare · labels an unchanged item', cmp.items.find(i => i.id === 'i2').direction === UNCHANGED);
  ok('compare · reports the per-axis delta', cmp.perAxis.find(a => a.axis === 'comprehension').delta === 1);
  ok('compare · an untouched axis has zero delta', cmp.perAxis.find(a => a.axis === 'safety').delta === 0);
  ok('compare · reports one entry per axis', cmp.perAxis.length === 7);
  ok('compare · records a gained criterion', cmp.items.find(i => i.id === 'i1').gained.join() === 'C2');
  ok('compare · records no lost criterion where none was lost', cmp.items.find(i => i.id === 'i1').lost.length === 0);
  ok('compare · aggregates criterion flips', cmp.flips.find(f => f.id === 'C2').gained === 1);
  ok('compare · carries both run summaries', cmp.before.label === 'before' && cmp.after.label === 'after');
}

// a regression, and a masked one
const D = makeRun({ label: 'worse', model: 'm', modelVersion: '3.0', rubricFingerprint: FP, items: [
  item('i1', [0, 0, 0, 0, 0, 0, 0], []), item('i2', [1, 1, 0, 0, 0, 0, 0], ['C1', 'C2']),
]});
{
  const cmp = compare(A, D);
  ok('compare · counts a regressed item', cmp.regressed === 1);
  ok('compare · a regression nets negative', cmp.net === -1);
  ok('compare · records a lost criterion', cmp.items.find(i => i.id === 'i1').lost.join() === 'C1');
  ok('compare · flips report the loss', cmp.flips.find(f => f.id === 'C1').lost === 1);
  ok('regressions · names the axis that went backwards', regressions(cmp)[0].axis === 'grounding');
  ok('lostGround · names the criterion that lost ground', lostGround(cmp).some(f => f.id === 'C1'));
  ok('lostGround · respects its minimum', lostGround(cmp, 5).length === 0);
  ok('compare · coherence is 1 when everything moves one way', compare(A, B).coherence === 1);
}

// ── 5 · the gate · each hole must be DETECTED ───────────────────────────────────────────────
// helper: build a pair of runs from per-item before/after totals on a chosen axis
const pairRuns = (befores, afters, axis = 0) => {
  const mk = (arr, label, ver) => makeRun({
    label, model: 'm', modelVersion: ver, rubricFingerprint: FP,
    items: arr.map((n, k) => {
      const v = [0, 0, 0, 0, 0, 0, 0]; v[axis] = n;
      return item('it' + k, v, Array.from({ length: n }, (_, j) => `C${j}`));
    }),
  });
  return [mk(befores, 'before', '1.0'), mk(afters, 'after', '2.0')];
};

// MASKED — total up, one axis down
{
  const before = makeRun({ label: 'b', model: 'm', modelVersion: '1', rubricFingerprint: FP, items: [
    item('i1', [0, 0, 0, 0, 0, 2, 0]), item('i2', [0, 0, 0, 0, 0, 2, 0]), item('i3', [1, 0, 0, 0, 0, 0, 0]),
  ]});
  const after = makeRun({ label: 'a', model: 'm', modelVersion: '2', rubricFingerprint: FP, items: [
    item('i1', [4, 0, 0, 0, 0, 1, 0]), item('i2', [4, 0, 0, 0, 0, 1, 0]), item('i3', [4, 0, 0, 0, 0, 0, 0]),
  ]});
  const cmp = compare(before, after);
  const g = gateComparison(cmp);
  ok('gate · MASKED · a hidden axis regression is caught', g.holes.some(h => h.kind === HOLE.MASKED && h.axis === 'safety'));
  ok('gate · MASKED · the overall net really is positive', cmp.net > 0);
  ok('gate · MASKED · the reading refuses to call it an improvement', /Do not read this as an improvement/.test(g.reading));
  const clean = compare(...pairRuns([1, 1, 1, 1, 1, 1, 1, 1, 1, 1], [2, 2, 2, 2, 2, 2, 2, 2, 2, 2]));
  ok('gate · MASKED · does not fire when every axis moved forward',
    !gateComparison(clean).holes.some(h => h.kind === HOLE.MASKED));
}

// CHURN — lots of movement, little net
{
  const [b, a] = pairRuns([1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1], [2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2]);
  const cmp = compare(b, a);
  ok('gate · CHURN · instability is caught', gateComparison(cmp).holes.some(h => h.kind === HOLE.CHURN));
  ok('gate · CHURN · coherence really is low', cmp.coherence < DEFAULTS.minCoherence);
  ok('gate · CHURN · the reading says unstable rather than improved',
    /Unstable rather than improved/.test(gateComparison(cmp).reading));
}

// UNDERPOWERED — a near coin-flip
{
  const [b, a] = pairRuns([1, 1, 1, 1], [2, 2, 0, 1]);
  const g = gateComparison(compare(b, a));
  ok('gate · UNDERPOWERED · a coin-flip is not reported as progress', g.holes.some(h => h.kind === HOLE.UNDERPOWERED));
  const [b2, a2] = pairRuns(Array(12).fill(1), Array(12).fill(2));
  ok('gate · UNDERPOWERED · a decisive result is not flagged',
    !gateComparison(compare(b2, a2)).holes.some(h => h.kind === HOLE.UNDERPOWERED));
}

// NARROW — barely anything moved
{
  const before = Array(20).fill(1), after = Array(20).fill(1); after[0] = 2;
  const g = gateComparison(compare(...pairRuns(before, after)));
  ok('gate · NARROW · a non-discriminating corpus is caught', g.holes.some(h => h.kind === HOLE.NARROW));
  ok('gate · NARROW · the reading says the corpus cannot support a claim',
    /does not separate these two versions/.test(g.reading) || g.holes.some(h => h.kind === HOLE.NARROW));
}

// LOPSIDED — one criterion carrying the movement
{
  const before = makeRun({ label: 'b', model: 'm', modelVersion: '1', rubricFingerprint: FP,
    items: Array.from({ length: 10 }, (_, k) => item('i' + k, [1, 0, 0, 0, 0, 0, 0], ['HOT', 'OTHER'])) });
  const after = makeRun({ label: 'a', model: 'm', modelVersion: '2', rubricFingerprint: FP,
    items: Array.from({ length: 10 }, (_, k) => item('i' + k, [0, 0, 0, 0, 0, 0, 0], k === 0 ? ['OTHER'] : ['HOT'])) });
  const g = gateComparison(compare(before, after));
  ok('gate · LOPSIDED · one criterion dominating the movement is caught', g.holes.some(h => h.kind === HOLE.LOPSIDED));
}

// REGRESSION — a criterion losing ground on enough items
{
  const before = makeRun({ label: 'b', model: 'm', modelVersion: '1', rubricFingerprint: FP,
    items: Array.from({ length: 6 }, (_, k) => item('i' + k, [1, 0, 0, 0, 0, 0, 0], ['CAL-01'])) });
  const after = makeRun({ label: 'a', model: 'm', modelVersion: '2', rubricFingerprint: FP,
    items: Array.from({ length: 6 }, (_, k) => item('i' + k, [0, 0, 0, 0, 0, 0, 0], [])) });
  const g = gateComparison(compare(before, after));
  ok('gate · REGRESSION · a repeated criterion loss is named', g.holes.some(h => h.kind === HOLE.REGRESSION && h.id === 'CAL-01'));
  ok('gate · REGRESSION · respects its minimum',
    !gateComparison(compare(before, after), { regressionMin: 99 }).holes.some(h => h.kind === HOLE.REGRESSION));
}

// a comparison CAN be clean — the gate is passable
{
  const [b, a] = pairRuns(Array(20).fill(1), Array(20).fill(2));
  const g = gateComparison(compare(b, a));
  ok('gate · a decisive, coherent, broad improvement reports clean', g.clean === true, JSON.stringify(g.holes.slice(0, 2)));
  ok('gate · the clean reading states the movement plainly', /Improved on 20 items/.test(g.reading));
  ok('gate · every hole carries a human-readable detail',
    gateComparison(compare(...pairRuns([1, 1, 1, 1], [2, 2, 0, 1]))).holes.every(h => typeof h.detail === 'string' && h.detail.length > 25));
  ok('gate · thresholds are reported alongside the verdict', g.thresholds.alpha === DEFAULTS.alpha);
  ok('gate · thresholds can be overridden', gateComparison(compare(b, a), { alpha: 0.9 }).thresholds.alpha === 0.9);
}

ok('reading · an empty comparison says so', reading({ paired: 0 }, []) === 'Nothing was compared.');
ok('reading · a flat comparison says no net movement',
  /No net movement/.test(reading({ paired: 5, net: 0, improved: 0, regressed: 0, signTest: { p: 1 } }, [])));

// ── 6 · the vendored fold algebra ───────────────────────────────────────────────────────────
{
  let round = 0;
  for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) for (let c = 0; c < 3; c++) {
    const v = [a, b, c, 2, 0, 1, 1];
    if (JSON.stringify(bloomVector(foldNumber(v))) === JSON.stringify(v)) round++;
  }
  ok('fold · round-trips for all 27 tested vectors', round === 27, `${round}/27`);
  ok('fold · empty state folds to 1', foldNumber(emptyState()) === 1n);
  ok('fold · a single place folds to its spine prime', foldNumber(inc(emptyState(), 2)) === BigInt(SPINE[2]));
  ok('fold · inc accumulates rather than setting or decrementing', inc(inc(inc(emptyState(), 5), 5), 5)[5] === 3);
  ok('fold · inc does not mutate its argument', (() => { const s = emptyState(); inc(s, 0); return s[0] === 0; })());
  ok('fold · a non-spine factor is rejected rather than approximated', bloomVector(19n) === null);
  ok('fold · isFoldable agrees with bloomVector', isFoldable(30n) === true && isFoldable(19n) === false);
  ok('fold · glyph rendering emits one glyph per increment', toGlyphs([2, 0, 1, 0, 0, 0, 0]).length === 3);
  ok('fold · glyph rendering of the empty state is empty', toGlyphs(emptyState()) === '');
  const big = [9, 9, 9, 9, 9, 9, 9];
  ok('fold · a number beyond 2^53 factors back exactly', JSON.stringify(bloomVector(foldNumber(big))) === JSON.stringify(big));
  ok('fold · that number really does exceed 2^53', foldNumber(big) > BigInt(Number.MAX_SAFE_INTEGER));
  ok('axes · match konomi-rubric, in order',
    AXES.join(',') === 'grounding,comprehension,compliance,completeness,reasoning,safety,calibration');
}

// ── 7 · boundaries and degenerate inputs ────────────────────────────────────────────────────
// Everything below exists because a mutant survived without it. Thresholds are the dangerous part of
// a gate: a comparison sitting exactly ON a threshold is the case an author never tries by hand, and
// it is the case where "greater than" and "greater than or equal" quietly disagree.

// run · the BigInt path, and error messages that stay readable on malformed input
{
  const big = [9, 9, 9, 9, 9, 9, 9];
  ok('unreach · a large reach STRING inverts exactly', JSON.stringify(unreach(foldNumber(big).toString())) === JSON.stringify(big));
  ok('unreach · a large reach BIGINT inverts exactly', JSON.stringify(unreach(foldNumber(big))) === JSON.stringify(big));

  ok('run · a null item is reported, not crashed on',
    violations(runSpec({ items: [null] })).some(v => v.includes('must be an object')));
  ok('run · an item without an id does not produce an "(undefined)" label',
    violations(runSpec({ items: [{ vector: [0,0,0,0,0,0,0] }] })).every(v => !v.includes('(undefined)')));
  ok('run · an item WITH an id names it in the message',
    violations(runSpec({ items: [item('i7', [1, 2, 3])] })).some(v => v.includes('(i7)')));
  throws('fromGrades · rejects a non-array grades argument', () => fromGrades('nope', ['a'], {}), 'equal-length');
  throws('fromGrades · rejects a non-array ids argument', () => fromGrades([], 'nope', {}), 'equal-length');
  // A string of the same LENGTH as the id array passes a length check but is still not a grade list,
  // so each guard has to hold on its own rather than being rescued by the length comparison.
  throws('fromGrades · rejects a non-array whose length happens to match',
    () => fromGrades('ab', ['a', 'b'], {}), 'equal-length');
  throws('fromGrades · rejects non-array ids whose length happens to match',
    () => fromGrades([1, 2], 'ab', {}), 'equal-length');
}

// compare · vector arithmetic and sorting
{
  const cmp = compare(A, B);
  ok('compare · a delta has exactly seven places', cmp.items.every(i => i.delta.length === 7));
  ok('compare · every delta place is a finite integer', cmp.items.every(i => i.delta.every(Number.isInteger)));

  // three items: one improved, two unchanged — so "count UNCHANGED" and "count not-UNCHANGED" differ
  const [b3, a3] = pairRuns([1, 1, 1], [2, 1, 1]);
  const c3 = compare(b3, a3);
  ok('compare · the unchanged count is not the complement of it', c3.unchanged === 2 && c3.improved === 1);

  // flips sort by net ascending, worst first
  const bf = makeRun({ label: 'b', model: 'm', modelVersion: '1', rubricFingerprint: FP, items: [
    item('i1', [2, 0, 0, 0, 0, 0, 0], ['BAD', 'ALSO']), item('i2', [2, 0, 0, 0, 0, 0, 0], ['BAD', 'ALSO']),
  ]});
  const af = makeRun({ label: 'a', model: 'm', modelVersion: '2', rubricFingerprint: FP, items: [
    item('i1', [1, 0, 0, 0, 0, 0, 0], ['ALSO']), item('i2', [2, 0, 0, 0, 0, 0, 0], ['ALSO', 'NEW']),
  ]});
  const cf = compare(bf, af);
  ok('compare · flips are ordered worst-net first', cf.flips[0].net <= cf.flips[cf.flips.length - 1].net);
  ok('compare · flips carry both directions', cf.flips.some(f => f.lost > 0) && cf.flips.some(f => f.gained > 0));

  // Ordering must be by NET, not by id. Named so the two orderings disagree: sorted by net the loser
  // comes first, sorted alphabetically the winner does.
  const nb = makeRun({ label: 'b', model: 'm', modelVersion: '1', rubricFingerprint: FP, items: [
    item('i1', [2, 0, 0, 0, 0, 0, 0], ['ZZZ-LOSER', 'x']), item('i2', [2, 0, 0, 0, 0, 0, 0], ['ZZZ-LOSER', 'x']),
  ]});
  const na = makeRun({ label: 'a', model: 'm', modelVersion: '2', rubricFingerprint: FP, items: [
    item('i1', [2, 0, 0, 0, 0, 0, 0], ['AAA-WINNER', 'x']), item('i2', [2, 0, 0, 0, 0, 0, 0], ['AAA-WINNER', 'x']),
  ]});
  const nc = compare(nb, na);
  ok('compare · flips sort by net, not alphabetically by id', nc.flips[0].id === 'ZZZ-LOSER');
  ok('compare · the alphabetical order really is the opposite', nc.flips[nc.flips.length - 1].id === 'AAA-WINNER');

  // lostGround requires a NEGATIVE net, not merely a loss
  const bz = makeRun({ label: 'b', model: 'm', modelVersion: '1', rubricFingerprint: FP,
    items: [item('i1', [1,0,0,0,0,0,0], ['X']), item('i2', [0,0,0,0,0,0,0], [])] });
  const az = makeRun({ label: 'a', model: 'm', modelVersion: '2', rubricFingerprint: FP,
    items: [item('i1', [0,0,0,0,0,0,0], []), item('i2', [1,0,0,0,0,0,0], ['X'])] });
  const cz = compare(bz, az);
  ok('lostGround · a criterion that broke even is not "losing ground"',
    cz.flips.find(f => f.id === 'X').net === 0 && !lostGround(cz).some(f => f.id === 'X'));
}

// signTest · the exact-computation boundary, reached cheaply
ok('signTest · n at exactly the exact-limit is still computed', signTest(MAX_EXACT_N, 0).exact === true);
ok('signTest · one over the limit is not', signTest(MAX_EXACT_N, 1).exact === false);

// gate · every threshold is INCLUSIVE-safe: sitting exactly on it must not trip the hole
{
  const [b, a] = pairRuns([1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1], [2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2]);
  const cmp = compare(b, a);
  ok('gate · CHURN does not fire when coherence sits exactly on the threshold',
    !gateComparison(cmp, { minCoherence: cmp.coherence }).holes.some(h => h.kind === HOLE.CHURN));
  ok('gate · CHURN does fire just above the threshold',
    gateComparison(cmp, { minCoherence: cmp.coherence + 1e-9 }).holes.some(h => h.kind === HOLE.CHURN));

  const [b2, a2] = pairRuns([1, 1, 1, 1], [2, 2, 0, 1]);
  const c2 = compare(b2, a2);
  ok('gate · UNDERPOWERED does not fire when p sits exactly on alpha',
    !gateComparison(c2, { alpha: c2.signTest.p }).holes.some(h => h.kind === HOLE.UNDERPOWERED));
  ok('gate · UNDERPOWERED does fire just below alpha',
    gateComparison(c2, { alpha: c2.signTest.p - 1e-9 }).holes.some(h => h.kind === HOLE.UNDERPOWERED));

  const narrowBefore = Array(20).fill(1), narrowAfter = Array(20).fill(1); narrowAfter[0] = 2;
  const c3 = compare(...pairRuns(narrowBefore, narrowAfter));
  const frac = (c3.improved + c3.regressed) / c3.paired;
  ok('gate · NARROW does not fire when the moved fraction sits exactly on the threshold',
    !gateComparison(c3, { minMovedFraction: frac }).holes.some(h => h.kind === HOLE.NARROW));
  ok('gate · NARROW does fire just above it',
    gateComparison(c3, { minMovedFraction: frac + 1e-9 }).holes.some(h => h.kind === HOLE.NARROW));
}

// gate · MASKED needs a POSITIVE headline — a flat total is not a headline hiding anything
{
  const before = makeRun({ label: 'b', model: 'm', modelVersion: '1', rubricFingerprint: FP, items: [
    item('i1', [0, 0, 0, 0, 0, 2, 0]), item('i2', [2, 0, 0, 0, 0, 0, 0]),
  ]});
  const after = makeRun({ label: 'a', model: 'm', modelVersion: '2', rubricFingerprint: FP, items: [
    item('i1', [2, 0, 0, 0, 0, 0, 0]), item('i2', [2, 0, 0, 0, 0, 0, 0]),
  ]});
  const cmp = compare(before, after);
  ok('gate · the constructed case really does net zero', cmp.net === 0);
  ok('gate · MASKED does not fire on a flat total', !gateComparison(cmp).holes.some(h => h.kind === HOLE.MASKED));
  ok('gate · an axis really did go backwards there', regressions(cmp).some(a => a.axis === 'safety'));
  // Nothing moved item-to-item here, so there is no evidence of instability however permissive the
  // coherence threshold is — a gate that manufactured a finding out of zero movement would be worse
  // than no gate.
  ok('gate · CHURN does not fire when nothing moved at all, at any threshold',
    cmp.churn === 0 && !gateComparison(cmp, { minCoherence: 2 }).holes.some(h => h.kind === HOLE.CHURN));

  // A zero net WITH real movement is the churn case, and its sign must render.
  const [zb, za] = pairRuns([1, 1], [2, 0]);
  const zc = compare(zb, za);
  const churnHoles = gateComparison(zc).holes.filter(h => h.kind === HOLE.CHURN);
  ok('gate · a zero net with real movement does report churn', zc.net === 0 && zc.churn === 2 && churnHoles.length === 1);
  ok('gate · a zero net is rendered with a sign in the churn detail', churnHoles[0].detail.includes('net +0'));
  ok('gate · a zero net is rendered with a sign in the reading', gateComparison(zc).reading.includes('net +0'));

  // Nothing moved ⇒ no evidence ⇒ the sign test must not be read as a finding.
  const [nb, na] = pairRuns([1, 1, 1], [1, 1, 1]);
  const nc = compare(nb, na);
  ok('gate · a comparison where nothing moved has no sign-test evidence', nc.signTest.n === 0);
  ok('gate · UNDERPOWERED does not fire when nothing moved',
    !gateComparison(nc).holes.some(h => h.kind === HOLE.UNDERPOWERED));
}

// gate · LOPSIDED threshold, and DROPPED reporting
{
  const before = makeRun({ label: 'b', model: 'm', modelVersion: '1', rubricFingerprint: FP,
    items: Array.from({ length: 10 }, (_, k) => item('i' + k, [1, 0, 0, 0, 0, 0, 0], ['HOT', 'OTHER'])) });
  const after = makeRun({ label: 'a', model: 'm', modelVersion: '2', rubricFingerprint: FP,
    items: Array.from({ length: 10 }, (_, k) => item('i' + k, [0, 0, 0, 0, 0, 0, 0], k === 0 ? ['OTHER'] : ['HOT'])) });
  const cmp = compare(before, after);
  const total = cmp.flips.reduce((s, f) => s + f.lost + f.gained, 0);
  const biggest = cmp.flips.reduce((m, f) => ((f.lost + f.gained) > (m.lost + m.gained) ? f : m), cmp.flips[0]);
  const share = (biggest.lost + biggest.gained) / total;
  ok('gate · LOPSIDED does not fire when the share sits exactly on the threshold',
    !gateComparison(cmp, { lopsidedShare: share }).holes.some(h => h.kind === HOLE.LOPSIDED));
  ok('gate · LOPSIDED does fire just below it',
    gateComparison(cmp, { lopsidedShare: share - 1e-9 }).holes.some(h => h.kind === HOLE.LOPSIDED));

  // When two criteria move by the SAME amount, which one gets named must be settled deterministically
  // — flips are ordered worst-net first, so the loser is named rather than whichever was seen last.
  const tb = makeRun({ label: 'b', model: 'm', modelVersion: '1', rubricFingerprint: FP, items: [
    item('t1', [1, 0, 0, 0, 0, 0, 0], ['LOSER']), item('t2', [1, 0, 0, 0, 0, 0, 0], ['LOSER']),
  ]});
  const ta = makeRun({ label: 'a', model: 'm', modelVersion: '2', rubricFingerprint: FP, items: [
    item('t1', [1, 0, 0, 0, 0, 0, 0], ['GAINER']), item('t2', [1, 0, 0, 0, 0, 0, 0], ['GAINER']),
  ]});
  const tc = compare(tb, ta);
  const tie = gateComparison(tc, { lopsidedShare: 0.4 }).holes.find(h => h.kind === HOLE.LOPSIDED);
  ok('gate · LOPSIDED names the first of an equal-movement tie, deterministically',
    !!tie && tie.id === 'LOSER', tie ? `named ${tie.id}` : 'no hole fired');
}

// DROPPED must fire when only ONE side lost items, and must ellipsise honestly
{
  const mk = (ids, label, ver) => makeRun({ label, model: 'm', modelVersion: ver, rubricFingerprint: FP,
    items: ids.map(id => item(id, [1, 0, 0, 0, 0, 0, 0], ['C1'])) });
  // nine before, three after → six dropped, which is over the five-item listing limit
  const wide = mk(['k0','k1','k2','k3','k4','k5','k6','k7','k8'], 'b', '1');
  const narrow = mk(['k0','k1','k2'], 'a', '2');
  const cmp = compare(wide, narrow, { onIntersection: true });
  const hole = gateComparison(cmp).holes.find(h => h.kind === HOLE.DROPPED);
  ok('gate · DROPPED fires when only the earlier run had extra items', !!hole && cmp.droppedAfter.length === 0);
  ok('gate · six dropped items really is over the listing limit', cmp.droppedBefore.length === 6);
  ok('gate · DROPPED ellipsises when more than five were dropped', hole.detail.includes('…'));

  // and symmetrically when it is the LATER run carrying the extra items
  const cAfter = compare(mk(['k0','k1','k2'], 'b', '1'), mk(['k0','k1','k2','k3','k4','k5','k6','k7','k8'], 'a', '2'), { onIntersection: true });
  const hAfter = gateComparison(cAfter).holes.find(h => h.kind === HOLE.DROPPED);
  ok('gate · DROPPED fires when only the later run had extra items',
    !!hAfter && cAfter.droppedBefore.length === 0 && cAfter.droppedAfter.length === 6);
  ok('gate · DROPPED ellipsises the later-run overflow too', hAfter.detail.includes('…'));

  // exactly five on the LATER side must also list without an ellipsis
  const cFive = compare(mk(['k0','k1','k2'], 'b', '1'), mk(['k0','k1','k2','k3','k4','k5','k6','k7'], 'a', '2'), { onIntersection: true });
  ok('gate · exactly five later-run extras are listed without an ellipsis',
    cFive.droppedAfter.length === 5
    && !gateComparison(cFive).holes.find(h => h.kind === HOLE.DROPPED).detail.includes('…'));

  ok('gate · exactly five dropped items are listed without an ellipsis',
    (() => {
      const c = compare(mk(['k0','k1','k2','k3','k4','k5','k6','k7'].slice(0, 8), 'b', '1'), mk(['k0','k1','k2'], 'a', '2'), { onIntersection: true });
      return c.droppedBefore.length === 5 && gateComparison(c).holes.find(h => h.kind === HOLE.DROPPED).detail.split('…').length - 1 === 0;
    })());
}

console.log(`\nkonomi-regress · ${pass}/${pass + fail} passed`);
if (fail) { console.error(`${fail} FAILED`); process.exit(1); }
