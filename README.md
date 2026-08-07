# konomi-regress

### ▶ **Live: https://sjgant80-hub.github.io/konomi-regress/**

Compare two evaluation runs — or be refused. Answers the question a headline metric cannot:
**did the checkpoint get better, and where did it get worse?**

[![witness](https://github.com/sjgant80-hub/konomi-regress/actions/workflows/witness.yml/badge.svg)](https://github.com/sjgant80-hub/konomi-regress/actions/workflows/witness.yml)

> All figures in this repository and on the live page are **illustrative, against a fictional system**.
> Nothing here describes any real model.

## The problem

The most common failure in model evaluation is not a wrong number. It is an **invalid comparison**.

*"71% last month, 74% now"* gets quoted as an improvement when, in between, someone added twelve
criteria, dropped the four hardest prompts, and re-sampled at a different temperature. Every individual
step was reasonable. The comparison is meaningless, and nothing in the pipeline said so.

Three things follow from that, and this handles all three.

## 1 · Inadmissible comparisons are refused, not caveated

A run carries the rubric's content fingerprint and a content address of its own corpus. Two runs that
disagree on either are **not comparable** and `compare()` throws.

```js
compare(before, after)
// Error: inadmissible: the rubric changed between runs (a1b2c3d4 → ffffffff).
// These scores are on different scales and the difference between them is not a measurement.
```

A caveat gets dropped on the way to the summary slide. A thrown error does not.

The corpus check has an explicit escape — `{ onIntersection: true }` — because comparing the shared
items is often genuinely what you want. It is opt-in, and it **reports exactly which items it dropped**.
A comparison that silently narrows its own sample is the same failure wearing a different hat.

## 2 · Net is not the story. Churn is.

A net of **+2** can be fifteen items improving and thirteen regressing. That is not progress; it is
instability, and it will not survive the next checkpoint. Both numbers are always reported, pairing is
item-by-item rather than aggregate-to-aggregate, and `coherence` (`|net| / churn`) says how much of the
gross movement survived as direction.

```
net +2 · gross movement 28 · coherence 0.07
→ "Unstable rather than improved: 15 items up, 13 down, net +2."
```

## 3 · "Up overall, down on safety" stays visible

The single most dangerous pattern in evaluation is a headline that improves while an axis goes
backwards — and aggregate reporting conceals it by construction. Because grades are seven-place vectors
(from [konomi-rubric](https://sjgant80-hub.github.io/konomi-rubric/)), the per-axis delta is always
available, and it is the **first** thing said:

```
→ "Do not read this as an improvement: the total is up 24, but safety went backwards by 12."
```

## The gate

```js
gateComparison(compare(before, after)).holes
```

| Hole | Meaning |
|---|---|
| `MASKED` | The headline improved while an axis went backwards |
| `CHURN` | The net is small next to the gross movement — instability reported as progress |
| `UNDERPOWERED` | Too few items moved for the direction to beat a coin |
| `NARROW` | Almost nothing moved — the corpus does not discriminate between these versions |
| `LOPSIDED` | One criterion accounts for most of the movement |
| `DROPPED` | An intersection comparison narrowed the sample. Always reported, never silent |
| `REGRESSION` | A criterion lost ground on enough items to be real rather than noise |

Every hole names the number that tripped it, and every threshold is overridable — so a threshold can be
argued with rather than obeyed.

`clean` means the comparison **can be read at face value**. It does not mean the model is fine: whether
the movement is *good* is a judgement about the axes, and this module has no opinion about that.

## The sign test

Whether movement beats chance is decided by an **exact two-sided binomial sign test** at p = 0.5, with
ties excluded. Computed in BigInt rather than approximated, because evaluation corpora are usually small
and a normal approximation is wrong precisely where it matters.

```js
signTest(9, 1).p   // 0.021484375 — exact, not estimated
```

**The assumption, stated plainly because it is load-bearing:** items are treated as independent. If your
corpus contains ten paraphrases of one prompt, they are not, and the p-value is optimistic. That is a
property of your corpus and nothing here can detect it.

Tails are exact and reported to 1e-12; a smaller tail comes back as `0` **and says so**, rather than
being dressed up as a tiny non-zero number.

## Usage

```js
import { makeRun, fromGrades } from './run.mjs';
import { compare } from './compare.mjs';
import { gateComparison } from './gate.mjs';

// runs are plain data, so any grader can produce one
const before = makeRun({
  label: 'v1.0', model: 'my-model', modelVersion: '1.0',
  rubricFingerprint: rubric.fingerprint,          // from konomi-rubric
  items: [{ id: 'prompt-001', vector: [1,0,2,1,0,3,0], met: ['GRD-01','CON-02'] }, …],
});

// or straight from konomi-rubric grades
const after = fromGrades(grades, ids, { label: 'v2.0', model: 'my-model', modelVersion: '2.0', rubricFingerprint: rubric.fingerprint });

const cmp = compare(before, after);              // throws if inadmissible
const g = gateComparison(cmp);
g.reading                                        // one sentence you can actually use
g.holes                                          // what would otherwise be quoted wrongly
cmp.perAxis                                      // where it moved
cmp.flips                                        // which criteria flipped, worst first
```

## Verification

```bash
node test.mjs        # 163 assertions
```

| kernel | killed | reviewed-equivalent | verdict |
|---|---|---|---|
| `fold.mjs` | 11 / 14 | 3 | no test-theatre |
| `run.mjs` | 32 / 32 | 0 | clean outright |
| `compare.mjs` | 23 / 25 | 2 | no test-theatre |
| `gate.mjs` | 27 / 28 | 1 | no test-theatre |

The sign test is checked against **hand-computed exact tails** (9 vs 1 → 22/1024, 20 vs 3 → 2·2048/2²³),
because a statistic nobody verified is a number with a Greek letter next to it. Thresholds are tested
*sitting exactly on the boundary* in both directions — that is the case an author never tries by hand,
and where `>` and `>=` quietly disagree.

Writing those boundary tests caught a vacuous assertion of my own: an `.every()` over a filtered list
that was empty, and therefore passing without testing anything.

## Honest limits

- The sign test assumes independent items (see above).
- `clean` is not "the model is fine" — see above.
- This compares runs. It does not produce them: grading is [konomi-rubric](https://github.com/sjgant80-hub/konomi-rubric)'s job.
- Corpus identity is the **set of item ids**, deliberately not their contents — because the contents
  differ every time a model answers, and what must not change silently is *which* items were scored.

## The suite

| | |
|---|---|
| [konomi-rubric](https://sjgant80-hub.github.io/konomi-rubric/) | Atomic criteria on seven axes; a lossless integer grade; a gate on the rubric |
| [konomi-redteam](https://sjgant80-hub.github.io/konomi-redteam/) | Red-team taxonomy by property exploited; collapse corpus as signatures; a gate on the suite |
| **konomi-regress** | Compare two runs across checkpoints; a gate on the comparison |

Gated by [witness](https://github.com/sjgant80-hub/witness). MIT.
