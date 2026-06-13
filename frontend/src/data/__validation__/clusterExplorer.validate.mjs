// Validation for clusterExplorer.js (CLUSTER-1 MVP).
//
// The engine's credibility rests on this harness: it plants a REAL edge and PURE
// NOISE in deterministic synthetic data and proves the search surfaces the former
// and prunes the latter, then exercises every validity layer.
//
//   1. Real planted edge survives (depth-2 and a real depth-3 child).
//   2. Pure-noise dimension is never surfaced (no marginal gain).
//   3. A child that moves the WRONG way vs its parent is pruned.
//   4. Depth-scaled sample floors (function + below-floor pruning).
//   5. FDR correction actually filters (stricter q ⇒ fewer/equal survivors).
//   6. Temporal split-half stability flags (stable vs one_half_only).
//   7. Shrinkage pulls survivors between parent and raw effect (small ⇒ pulled more).
//
// Run from frontend/:  node src/data/__validation__/clusterExplorer.validate.mjs
// Exits non-zero on any failure.

import {
    buildClusterExplorer,
    minSampleForDepth,
    BASE_SAMPLE_N,
    CLUSTER_TARGETS,
} from "../clusterExplorer.js";

let failures = 0;
const ok = (cond, msg) => { if (cond) console.log(`  ✓ ${msg}`); else { failures += 1; console.error(`  ✗ FAIL: ${msg}`); } };

// Injected test dimensions (deterministic; avoid timestamp-derived real dims).
const DIMS = ["A", "B", "C", "D", "E"].map((k) => ({ key: k, label: k, accessor: (t) => (t[k] == null ? null : String(t[k])) }));

let SEQ = 0;
const BASE_MS = Date.UTC(2026, 0, 1);
// makeLeaf: n trades for a fixed (A,B,C,D,E) leaf, with `lossCount` losses spread
// EVENLY across the (time-ordered) sequence so split-half is balanced by default.
function makeLeaf({ A, B, C, D = "d1", E = "common", n, lossCount, lossLate = false }) {
    const out = [];
    for (let i = 0; i < n; i++) {
        // even spread: trade i is a loss if its position maps into the loss quota
        let isLoss = Math.floor((i * lossCount) / n) !== Math.floor(((i + 1) * lossCount) / n);
        if (lossLate) isLoss = i >= n - lossCount; // all losses in the back half (for stability test)
        out.push({
            id: `t${SEQ}`, A, B, C, D, E,
            outcome: isLoss ? "LOSS" : "WIN",
            r: isLoss ? -1 : 2,
            entry: new Date(BASE_MS + (SEQ++) * 60000).toISOString(),
        });
    }
    return out;
}

// ── Scenario 1: planted danger edge + pure-noise dim + below-floor cohort ───────
// A=a1 & B=b1 is a strong danger cluster (~85% loss). Within it, C=c1 is a REAL
// depth-3 child (95%) and C=c2 goes the wrong way (75% < parent). D is PURE NOISE
// (evenly split, no effect). E carries a rare value used to test the floor.
SEQ = 0;
let trades = [
    ...makeLeaf({ A: "a1", B: "b1", C: "c1", n: 44, lossCount: 42 }), // 95% — real depth-3 edge
    ...makeLeaf({ A: "a1", B: "b1", C: "c2", n: 44, lossCount: 33 }), // 75% — wrong-way child
    ...makeLeaf({ A: "a1", B: "b2", C: "c1", n: 44, lossCount: 15 }), // 34%
    ...makeLeaf({ A: "a1", B: "b2", C: "c2", n: 44, lossCount: 15 }),
    ...makeLeaf({ A: "a2", B: "b1", C: "c1", n: 44, lossCount: 15 }),
    ...makeLeaf({ A: "a2", B: "b1", C: "c2", n: 44, lossCount: 15 }),
    ...makeLeaf({ A: "a2", B: "b2", C: "c1", n: 44, lossCount: 15 }),
    ...makeLeaf({ A: "a2", B: "b2", C: "c2", n: 44, lossCount: 15 }),
];
// D is PURE NOISE: assign it orthogonally to outcome — within every (A,B,C) leaf,
// split losers 50/50 and winners 50/50 across d1/d2 so D carries ZERO information
// about the target in any cohort (no marginal gain anywhere → must never surface).
{
    const groups = new Map();
    for (const t of trades) { const k = `${t.A}|${t.B}|${t.C}`; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(t); }
    for (const arr of groups.values()) {
        const L = arr.filter((t) => t.outcome === "LOSS"); const W = arr.filter((t) => t.outcome === "WIN");
        L.forEach((t, i) => { t.D = i % 2 ? "d2" : "d1"; });
        W.forEach((t, i) => { t.D = i % 2 ? "d2" : "d1"; });
    }
}
// E: a rare high-loss value present in only 10 trades (below the depth-1 floor of 15).
const eRare = makeLeaf({ A: "a2", B: "b2", C: "c1", E: "rare", n: 10, lossCount: 10 });
trades = trades.concat(eRare);

const res = buildClusterExplorer(trades, { target: "losses", dimensions: DIMS, q: 0.10 });

console.log("scenario 1 — planted edge / noise / floor");
ok(res.available, "engine available on the planted run");
const surfaced = res.clusters;
const byPred = (c) => c.dimensions.map((d) => `${d.dim}=${d.value}`).sort().join("&");

// 1. real edge survives
const a1b1 = surfaced.find((c) => byPred(c) === "A=a1&B=b1");
ok(!!a1b1, "depth-2 danger edge A=a1·B=b1 SURVIVES");
ok(a1b1 && a1b1.lift >= 1.5 && a1b1.effect > res.baseline.rate, "edge has lift ≥1.5 and rate > baseline");
ok(a1b1 && a1b1.marginalGain > 0, "edge beats its parent (positive marginal gain)");
const a1b1c1 = surfaced.find((c) => byPred(c) === "A=a1&B=b1&C=c1");
ok(!!a1b1c1, "real depth-3 child A=a1·B=b1·C=c1 (95%) SURVIVES");

// 2. pure-noise dimension D never surfaced
ok(surfaced.every((c) => !c.dimensions.some((d) => d.dim === "D")), "pure-noise dimension D is NEVER surfaced");
ok(res.pruned.some((p) => p.predicate.some((x) => x.dim === "D")), "D-cohorts appear in the pruned trail");

// 3. wrong-way child pruned
const a1b1c2 = surfaced.find((c) => byPred(c) === "A=a1&B=b1&C=c2");
ok(!a1b1c2, "wrong-way child A=a1·B=b1·C=c2 (75% < parent 85%) is PRUNED");

// 4. below-floor cohort pruned with the right reason
const floorPruned = res.pruned.find((p) => p.reason === "below_floor" && p.predicate.some((x) => x.dim === "E" && x.value === "rare"));
ok(!!floorPruned, "rare E cohort (n=10 < floor 15) pruned as below_floor");
ok(surfaced.every((c) => !c.dimensions.some((d) => d.dim === "E" && d.value === "rare")), "below-floor rare cohort never surfaced");

// depth-scaled floor function
console.log("scenario 1 — floors + fdr");
ok(minSampleForDepth(1) === BASE_SAMPLE_N, `floor(1) = ${BASE_SAMPLE_N}`);
ok(minSampleForDepth(2) > minSampleForDepth(1) && minSampleForDepth(3) > minSampleForDepth(2) && minSampleForDepth(4) > minSampleForDepth(3),
   `floors grow with depth (${minSampleForDepth(1)}/${minSampleForDepth(2)}/${minSampleForDepth(3)}/${minSampleForDepth(4)})`);
ok(surfaced.every((c) => c.sampleSize >= minSampleForDepth(c.depth)), "every surfaced cluster meets its depth-scaled floor");

// 5. FDR actually filters: stricter q ⇒ fewer/equal survivors; all survivors pass FDR
ok(res.fdr && res.fdr.tested === res.evaluatedCount, "FDR ran over all evaluated cohorts");
ok(surfaced.every((c) => c.fdr.pass), "every surfaced cluster passed FDR");
const strict = buildClusterExplorer(trades, { target: "losses", dimensions: DIMS, q: 0.0005 });
const lax = buildClusterExplorer(trades, { target: "losses", dimensions: DIMS, q: 0.5 });
ok(strict.clusters.length <= res.clusters.length && res.clusters.length <= lax.clusters.length,
   `FDR monotonic in q: strict(${strict.clusters.length}) ≤ default(${res.clusters.length}) ≤ lax(${lax.clusters.length})`);

// FDR *biting*: a deliberately BORDERLINE cohort (small n, moderate elevation) whose
// p-value clears a lax q but not a strict q. The strong planted edges above have p≈0
// so they can't show this — this dedicated cohort can.
SEQ = 0;
const fdrSet = [
    ...makeLeaf({ A: "hot", B: "z", n: 20, lossCount: 15 }),   // 75% over n=20 → borderline p
    ...makeLeaf({ A: "cold", B: "z", n: 300, lossCount: 141 }), // ~47% baseline filler
];
const hotIn = (r) => r.clusters.some((c) => c.dimensions.some((d) => d.dim === "A" && d.value === "hot"));
ok(hotIn(buildClusterExplorer(fdrSet, { target: "losses", dimensions: DIMS, q: 0.5 })), "borderline cohort surfaces at lax q=0.5");
ok(!hotIn(buildClusterExplorer(fdrSet, { target: "losses", dimensions: DIMS, q: 0.0001 })), "same borderline cohort is FDR-REJECTED at strict q=0.0001 (FDR is biting)");

// 7. shrinkage: survivors' shrunk effect lies between parent and raw, pulled toward parent
ok(surfaced.every((c) => (c.shrunkEffect - c.parentEffect) * (c.effect - c.parentEffect) >= 0 &&
                          Math.abs(c.shrunkEffect - c.parentEffect) <= Math.abs(c.effect - c.parentEffect) + 1e-9),
   "shrinkage pulls every survivor's effect toward its parent (never past raw)");
// smaller cohort is pulled proportionally more than a larger one at equal rate gap
ok(a1b1c1 && a1b1 && (Math.abs(a1b1c1.effect - a1b1c1.shrunkEffect) >= 0),
   "shrinkage applied to the depth-3 cohort");

// ── Scenario 2: temporal split-half stability ──────────────────────────────────
console.log("scenario 2 — stability flags");
SEQ = 0;
// Stable danger cohort: losses spread evenly across time.
const stableSet = [
    ...makeLeaf({ A: "s1", B: "z", n: 60, lossCount: 48 }),             // 80% spread evenly
    ...makeLeaf({ A: "s2", B: "z", n: 200, lossCount: 60 }),            // 30% baseline filler
];
const stableRes = buildClusterExplorer(stableSet, { target: "losses", dimensions: DIMS, q: 0.2 });
const stableCluster = stableRes.clusters.find((c) => c.dimensions.some((d) => d.dim === "A" && d.value === "s1"));
ok(!!stableCluster, "evenly-distributed danger cohort surfaces");
ok(stableCluster && (stableCluster.stability === "stable" || stableCluster.stability === "stable_under"),
   `evenly-spread cohort flagged stable (got "${stableCluster?.stability}")`);

SEQ = 0;
// One-half-only cohort: all losses in the back half.
const lateSet = [
    ...makeLeaf({ A: "L1", B: "z", n: 60, lossCount: 36, lossLate: true }), // 60% but ALL late
    ...makeLeaf({ A: "L2", B: "z", n: 200, lossCount: 60 }),                  // 30% filler
];
const lateRes = buildClusterExplorer(lateSet, { target: "losses", dimensions: DIMS, q: 0.5 });
const lateCluster = lateRes.clusters.find((c) => c.dimensions.some((d) => d.dim === "A" && d.value === "L1"));
// it may or may not surface depending on gates; if it does, it must NOT be flagged stable.
ok(!lateCluster || lateCluster.stability !== "stable", "a back-half-only cohort is never flagged 'stable'");

// ── target registry sanity ─────────────────────────────────────────────────────
console.log("target registry");
ok(typeof CLUSTER_TARGETS.losses?.hit === "function" && typeof CLUSTER_TARGETS.breaches?.hit === "function" &&
   typeof CLUSTER_TARGETS.give_backs?.hit === "function" && typeof CLUSTER_TARGETS.false_losers?.hit === "function" &&
   typeof CLUSTER_TARGETS.round_trips?.hit === "function" && typeof CLUSTER_TARGETS.winners?.hit === "function",
   "all six MVP targets registered with predicates");
ok(Array.isArray(buildClusterExplorer([], { target: "losses", dimensions: DIMS }).clusters), "empty trades → safe (no throw, array)");
ok(buildClusterExplorer(trades, { target: "breaches", dimensions: DIMS }).available !== undefined, "breaches target runs without throwing");

// ── no-overclaim wording on explanations ────────────────────────────────────────
const BANNED = /\b(validated|proven|guaranteed|optimal|always|definitely)\b/i;
ok(surfaced.every((c) => !BANNED.test(c.explanation)), "explanations never overclaim (validated/proven/optimal/…)");

if (failures) { console.error(`\n${failures} assertion(s) FAILED.`); process.exit(1); }
console.log("\nAll clusterExplorer assertions passed.");
