// compare.mjs — compare two runs, or refuse to.
//
// THE REFUSAL IS THE FEATURE
//
// A comparison between two evaluation runs is only meaningful if the instrument and the corpus were
// the same. That is not a nicety; it is the difference between a measurement and a number. So an
// inadmissible comparison THROWS here rather than returning a caveat, because a caveat gets dropped
// on the way to the summary slide and a thrown error does not.
//
// Two refusals:
//   the rubric fingerprints differ  — the instrument changed, so the scale changed
//   the corpus addresses differ     — the test changed, so the difficulty changed
//
// The second has an explicit escape (`onIntersection`) because comparing the shared items is often
// genuinely what you want. It is opt-in, and it REPORTS exactly which items it dropped. A comparison
// that silently narrows its own sample is the same failure wearing a different hat.
//
// WHAT IT REPORTS THAT AN AGGREGATE CANNOT
//
// `net` alone is the number everyone quotes and it hides the thing you most need to know. A net of +2
// can be fifteen items improving and thirteen regressing — that is not an improvement, it is
// instability, and it will not survive the next checkpoint. So `churn` is reported alongside `net`,
// pairing is item-by-item rather than aggregate-to-aggregate, and the per-axis deltas make
// "up overall, down on safety" visible instead of averaged away.
//
// Pure and deterministic: no I/O, no clock, no randomness.
import { PLACES } from './fold.mjs';
import { summarise } from './run.mjs';

// VENDORED from sjgant80-hub/konomi-rubric (canonical). CI fails on drift.
export const AXES = Object.freeze([
  'grounding', 'comprehension', 'compliance', 'completeness', 'reasoning', 'safety', 'calibration',
]);

export const IMPROVED = 'IMPROVED', REGRESSED = 'REGRESSED', UNCHANGED = 'UNCHANGED';

// Above this the exact test is not attempted — the binomial coefficients stay exact but the work
// grows, and no evaluation corpus this size needs an exact tail rather than an obvious verdict.
export const MAX_EXACT_N = 4096;

/**
 * Two-sided exact binomial sign test at p = 0.5.
 *
 * Ties are excluded, which is what makes it a SIGN test: an item that did not move carries no
 * evidence either way. Computed exactly with BigInt rather than approximated, so a small corpus —
 * which is the normal case in evaluation work — gets an honest tail instead of a normal
 * approximation that is wrong precisely where it matters.
 *
 * The assumption, stated plainly because it is load-bearing: items are treated as independent. If
 * your corpus contains ten paraphrases of one prompt, they are not independent and this p-value is
 * optimistic. That is a property of your corpus, not something this function can detect.
 */
export function signTest(improved, regressed) {
  const n = improved + regressed;
  if (n === 0) return { n: 0, k: 0, p: 1, exact: true, note: 'nothing moved — no evidence either way' };
  if (n > MAX_EXACT_N) {
    return { n, k: Math.min(improved, regressed), p: null, exact: false, note: `more than ${MAX_EXACT_N} moved items — exact tail not computed` };
  }
  const k = Math.min(improved, regressed);
  let sum = 0n, c = 1n;                       // C(n,0) = 1
  for (let i = 0; i <= k; i++) {
    if (i > 0) c = (c * BigInt(n - i + 1)) / BigInt(i);   // exact at every step
    sum += c;
  }
  const total = 1n << BigInt(n);
  // The tail is computed exactly in BigInt and only then converted, so the fraction is right before
  // it is ever a float. Resolution is 1e-12; a smaller tail reports as 0, which is reported honestly
  // rather than dressed up as a tiny non-zero number.
  const SCALE = 1000000000000n;
  let p = Number((2n * sum * SCALE) / total) / Number(SCALE);
  if (p > 1) p = 1;                            // improved === regressed gives a doubled half-tail
  return { n, k, p, exact: true, note: p === 0 ? 'tail below the 1e-12 resolution of this report' : null };
}

/** Item-level movement. Total met is the comparable quantity; the vector says where it moved. */
function movement(a, b) {
  const delta = [];
  for (let i = 0; i < PLACES; i++) delta.push(b.vector[i] - a.vector[i]);
  const net = b.total - a.total;
  return { delta, net, direction: net > 0 ? IMPROVED : net < 0 ? REGRESSED : UNCHANGED };
}

/**
 * Compare two runs. Throws unless the comparison is admissible.
 * `onIntersection` opts in to comparing shared items only, and reports what it dropped.
 */
export function compare(before, after, { onIntersection = false } = {}) {
  if (before.rubricFingerprint !== after.rubricFingerprint) {
    throw new Error(
      `inadmissible: the rubric changed between runs (${before.rubricFingerprint} → ${after.rubricFingerprint}). ` +
      'These scores are on different scales and the difference between them is not a measurement. ' +
      'Re-score the earlier run with the current rubric, or compare against a run that used it.');
  }

  let ids = before.items.map(i => i.id);
  let droppedBefore = [], droppedAfter = [];
  if (before.corpusId !== after.corpusId) {
    if (!onIntersection) {
      throw new Error(
        `inadmissible: the corpus changed between runs (${before.corpusId} → ${after.corpusId}). ` +
        'A different set of items is a different test. Pass { onIntersection: true } to compare the ' +
        'shared items deliberately — it will report exactly which items it drops.');
    }
    const bIds = new Set(before.items.map(i => i.id));
    const aIds = new Set(after.items.map(i => i.id));
    ids = [...bIds].filter(id => aIds.has(id)).sort();
    droppedBefore = [...bIds].filter(id => !aIds.has(id)).sort();
    droppedAfter = [...aIds].filter(id => !bIds.has(id)).sort();
    if (ids.length === 0) throw new Error('inadmissible: the two runs share no items at all');
  }

  const items = ids.map(id => {
    const a = before.byId.get(id), b = after.byId.get(id);
    const m = movement(a, b);
    return {
      id, before: a.vector.slice(), after: b.vector.slice(), delta: m.delta,
      net: m.net, direction: m.direction,
      lost: a.met.filter(c => !b.met.includes(c)),
      gained: b.met.filter(c => !a.met.includes(c)),
    };
  });

  const improved = items.filter(i => i.direction === IMPROVED).length;
  const regressed = items.filter(i => i.direction === REGRESSED).length;
  const unchanged = items.filter(i => i.direction === UNCHANGED).length;

  const perAxis = AXES.map((axis, i) => {
    const b = items.reduce((s, it) => s + it.before[i], 0);
    const a = items.reduce((s, it) => s + it.after[i], 0);
    return { axis, before: b, after: a, delta: a - b };
  });

  // Per-criterion flips: the actionable output. "Overall down 3" is not a task; "CAL-01 lost on 9
  // items" is a task.
  const flip = new Map();
  for (const it of items) {
    for (const c of it.lost) { const f = flip.get(c) || { id: c, lost: 0, gained: 0 }; f.lost++; flip.set(c, f); }
    for (const c of it.gained) { const f = flip.get(c) || { id: c, lost: 0, gained: 0 }; f.gained++; flip.set(c, f); }
  }
  const flips = [...flip.values()]
    .map(f => ({ ...f, net: f.gained - f.lost }))
    .sort((x, y) => (x.net - y.net) || x.id.localeCompare(y.id));

  const net = items.reduce((s, i) => s + i.net, 0);
  const churn = items.reduce((s, i) => s + Math.abs(i.net), 0);

  return {
    spec: 'konomi-regress-v1', admissible: true,
    before: summarise(before), after: summarise(after),
    paired: items.length, droppedBefore, droppedAfter, onIntersection,
    items, improved, regressed, unchanged,
    net, churn,
    // How much of the gross movement survived as direction. 1 means everything moved one way; near 0
    // means the two runs disagree item by item and the headline is noise wearing a sign.
    coherence: churn === 0 ? 1 : Math.abs(net) / churn,
    perAxis, flips,
    signTest: signTest(improved, regressed),
  };
}

/** Axes that went backwards, worst first — the sentence a headline number hides. */
export function regressions(cmp) {
  return cmp.perAxis.filter(a => a.delta < 0).sort((x, y) => x.delta - y.delta);
}

/** Criteria that lost ground on at least `min` items. */
export function lostGround(cmp, min = 1) {
  return cmp.flips.filter(f => f.lost >= min && f.net < 0);
}

export default { AXES, IMPROVED, REGRESSED, UNCHANGED, MAX_EXACT_N, signTest, compare, regressions, lostGround };
