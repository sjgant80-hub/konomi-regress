// fold.mjs — the seven-place fold algebra.
//
// VENDORED VERBATIM from sjgant80-hub/konomigami-lib (konomigami-spec-v1, VERSION 1.0.0),
// reduced to the subset this kernel needs. The canonical source is that repository; this copy
// exists so the rubric kernel has zero dependencies and can ship inside a single-file page.
// If the algebra changes there, it changes here — the identities below are the contract.
//
// What it provides, and why the rubric needs it:
//
//   A state is a length-7 vector of non-negative integers, one place per spine prime.
//   The fold number  F(S) = Π SPINE[i]^S[i]  maps that vector to a SINGLE integer, and by the
//   fundamental theorem of arithmetic the map is a BIJECTION — unique factorization means the
//   integer can be taken apart again into exactly the vector that built it, and no other.
//
//   That is the whole reason this algebra is under a rubric. Ordinary rubrics reduce a
//   multi-axis judgement to a weighted average, which is lossy and irreversible: 4.2/5 does not
//   tell you which axis failed. A fold number is a single sortable, storable, signable integer
//   that loses NOTHING — vector(number(v)) === v, always.

export const SPINE = [2, 3, 5, 7, 11, 13, 17];          // the seven spine primes, ascending
export const GLYPHS = ['●', '〜', '┃', '♡', '△', '◐', '◯'];
export const GLYPH_NAMES = ['GROUND', 'WAVE', 'GATE', 'SINK', 'REVERSE', 'PETAL', 'COLLAPSE'];
export const ISA95 = ['L0-physical', 'L1-sensing', 'L2-control', 'L3-operations', 'L4-business', 'L5-enterprise', 'L6-observer'];
export const PLACES = SPINE.length;

export function emptyState() { return [0, 0, 0, 0, 0, 0, 0]; }

/** Increment place i in a NEW state. Never mutates its argument. */
export function inc(state, i) {
  const s = state.slice();
  s[i] = (s[i] || 0) + 1;
  return s;
}

/**
 * Exact fold number F(S) = Π pᵢ^eᵢ as a BigInt.
 * BigInt rather than Number because a rubric with several criteria per axis exceeds 2^53 quickly
 * (7 axes × 5 met criteria is already ≈3.4e28) and a silently-rounded grade is a corrupt grade.
 */
export function foldNumber(state) {
  let n = 1n;
  for (let i = 0; i < PLACES; i++) n *= BigInt(SPINE[i]) ** BigInt(state[i] || 0);
  return n;
}

/**
 * The inverse. Factor an integer back into its state vector.
 * Returns null if the integer has any prime factor outside the spine — such a number was not
 * produced by this algebra, and saying so is more useful than returning a plausible wrong vector.
 */
export function bloomVector(n) {
  const S = emptyState();
  let rem = typeof n === 'bigint' ? (n < 0n ? -n : n) : BigInt(Math.floor(Math.abs(Number(n))));
  if (rem < 1n) return S;
  for (let i = 0; i < PLACES; i++) {
    const p = BigInt(SPINE[i]);
    while (rem % p === 0n) { S[i]++; rem = rem / p; }
  }
  return rem === 1n ? S : null;
}

/** A state as its glyph sequence — the human-facing form. The integer stays canonical. */
export function toGlyphs(state) {
  let out = '';
  for (let i = 0; i < PLACES; i++) out += GLYPHS[i].repeat(state[i] || 0);
  return out;
}

/** Is this integer expressible in the algebra? */
export function isFoldable(n) { return bloomVector(n) !== null; }

export default { SPINE, GLYPHS, GLYPH_NAMES, ISA95, PLACES, emptyState, inc, foldNumber, bloomVector, toGlyphs, isFoldable };
