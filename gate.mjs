// gate.mjs — the gate on the COMPARISON.
//
// compare.mjs refuses the comparisons that are invalid. This module handles the more dangerous case:
// comparisons that are valid, and still support a conclusion they do not earn.
//
//   MASKED       the headline improved while an axis went backwards. This is the single most
//                dangerous pattern in evaluation, and aggregate reporting hides it by construction —
//                a model that got better at everything except safety reads as "better".
//   CHURN        the net is small next to the gross movement. Fifteen items up, thirteen down, net
//                +2, reported as progress. It is instability, and it will not hold next checkpoint.
//   UNDERPOWERED too few items moved for the direction to be distinguishable from a coin.
//   NARROW       almost nothing moved at all — the corpus does not discriminate between these two
//                model versions, so it cannot support a claim about either.
//   LOPSIDED     one criterion accounts for most of the movement. The headline is one criterion
//                wearing a suite's clothes.
//   DROPPED      an intersection comparison silently narrowed the sample. Reported by name, always.
//   REGRESSION   a criterion lost ground on enough items to be a real regression rather than noise.
//
// `clean` is not a score and is not "the model is fine". It means the comparison can be read at face
// value. Whether the movement is GOOD is a judgement about the axes, and this module has no opinion.
//
// Pure and deterministic: no I/O, no clock, no randomness.
import { regressions, lostGround } from './compare.mjs';

export const HOLE = Object.freeze({
  MASKED: 'MASKED', CHURN: 'CHURN', UNDERPOWERED: 'UNDERPOWERED', NARROW: 'NARROW',
  LOPSIDED: 'LOPSIDED', DROPPED: 'DROPPED', REGRESSION: 'REGRESSION',
});

export const DEFAULTS = Object.freeze({
  alpha: 0.05,            // significance for the sign test
  minCoherence: 0.34,     // below this, net movement is small next to gross movement
  minMovedFraction: 0.1,  // below this, the corpus barely discriminated between the two runs
  lopsidedShare: 0.5,     // one criterion carrying more than half the flips
  regressionMin: 3,       // a criterion losing ground on this many items is a regression, not noise
});

/**
 * Review a comparison. Returns the holes and a short reading.
 * Thresholds are all overridable, and every hole names the number that tripped it so the threshold
 * can be argued with rather than obeyed.
 */
export function gateComparison(cmp, opts = {}) {
  const o = { ...DEFAULTS, ...opts };
  const holes = [];

  // MASKED — the one that matters most
  const back = regressions(cmp);
  if (cmp.net > 0 && back.length > 0) {
    holes.push({
      kind: HOLE.MASKED, axis: back[0].axis,
      detail: `overall movement is +${cmp.net}, but ${back.map(a => `${a.axis} ${a.delta}`).join(', ')} went backwards — the headline is hiding a real loss`,
    });
  }

  // CHURN
  if (cmp.churn > 0 && cmp.coherence < o.minCoherence) {
    holes.push({
      kind: HOLE.CHURN,
      detail: `net ${cmp.net >= 0 ? '+' : ''}${cmp.net} against gross movement of ${cmp.churn} (coherence ${cmp.coherence.toFixed(2)}) — ${cmp.improved} items improved and ${cmp.regressed} regressed, which is instability rather than progress`,
    });
  }

  // UNDERPOWERED
  const st = cmp.signTest;
  if (st.n > 0 && st.exact && st.p > o.alpha) {
    holes.push({
      kind: HOLE.UNDERPOWERED,
      detail: `${cmp.improved} up vs ${cmp.regressed} down gives p = ${st.p.toFixed(3)} (two-sided sign test), which does not clear ${o.alpha} — this movement is not distinguishable from a coin`,
    });
  }

  // NARROW
  const movedFraction = cmp.paired === 0 ? 0 : (cmp.improved + cmp.regressed) / cmp.paired;
  if (cmp.paired > 0 && movedFraction < o.minMovedFraction) {
    holes.push({
      kind: HOLE.NARROW,
      detail: `only ${cmp.improved + cmp.regressed} of ${cmp.paired} items moved at all (${(movedFraction * 100).toFixed(0)}%) — this corpus barely discriminates between these two versions, so it cannot support a claim about either`,
    });
  }

  // LOPSIDED
  const totalFlips = cmp.flips.reduce((s, f) => s + f.lost + f.gained, 0);
  if (totalFlips > 0) {
    const biggest = cmp.flips.reduce((m, f) => ((f.lost + f.gained) > (m.lost + m.gained) ? f : m), cmp.flips[0]);
    const share = (biggest.lost + biggest.gained) / totalFlips;
    if (share > o.lopsidedShare && cmp.flips.length > 1) {
      holes.push({
        kind: HOLE.LOPSIDED, id: biggest.id,
        detail: `criterion ${biggest.id} accounts for ${(share * 100).toFixed(0)}% of all criterion movement — the headline is one criterion wearing a suite's clothes`,
      });
    }
  }

  // DROPPED — never silent
  if (cmp.droppedBefore.length || cmp.droppedAfter.length) {
    holes.push({
      kind: HOLE.DROPPED,
      detail: `compared on the intersection: ${cmp.droppedBefore.length} item(s) present only before (${cmp.droppedBefore.slice(0, 5).join(', ')}${cmp.droppedBefore.length > 5 ? '…' : ''}) and ${cmp.droppedAfter.length} only after (${cmp.droppedAfter.slice(0, 5).join(', ')}${cmp.droppedAfter.length > 5 ? '…' : ''}) were excluded`,
    });
  }

  // REGRESSION — actionable, per criterion
  for (const f of lostGround(cmp, o.regressionMin)) {
    holes.push({
      kind: HOLE.REGRESSION, id: f.id,
      detail: `criterion ${f.id} was met on ${f.lost} item(s) before and is not now (net ${f.net}) — a specific, reproducible regression`,
    });
  }

  return {
    spec: 'konomi-regress-v1', clean: holes.length === 0, holes,
    reading: reading(cmp, holes),
    thresholds: o,
  };
}

/**
 * One sentence a person can actually use. Deliberately refuses to say "better" or "worse" when the
 * evidence does not support it, because that is the whole job.
 */
export function reading(cmp, holes) {
  const kinds = new Set(holes.map(h => h.kind));
  if (cmp.paired === 0) return 'Nothing was compared.';
  if (kinds.has(HOLE.MASKED)) {
    const worst = regressions(cmp)[0];
    return `Do not read this as an improvement: the total is up ${cmp.net}, but ${worst.axis} went backwards by ${Math.abs(worst.delta)}.`;
  }
  if (kinds.has(HOLE.CHURN)) return `Unstable rather than improved: ${cmp.improved} items up, ${cmp.regressed} down, net ${cmp.net >= 0 ? '+' : ''}${cmp.net}.`;
  if (kinds.has(HOLE.NARROW)) return 'This corpus does not separate these two versions — it cannot support a claim either way.';
  if (kinds.has(HOLE.UNDERPOWERED)) return `Movement is not distinguishable from chance (p = ${cmp.signTest.p.toFixed(3)}).`;
  if (cmp.net > 0) return `Improved on ${cmp.improved} items, regressed on ${cmp.regressed}, net +${cmp.net}, with no axis going backwards.`;
  if (cmp.net < 0) return `Regressed: net ${cmp.net} across ${cmp.paired} paired items.`;
  return 'No net movement between these two runs.';
}

export default { HOLE, DEFAULTS, gateComparison, reading };
