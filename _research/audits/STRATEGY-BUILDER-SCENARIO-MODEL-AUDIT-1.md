# STRATEGY-BUILDER-SCENARIO-MODEL-AUDIT-1

**Type:** Product-architecture audit of the **Session Scenario conceptual model**. *Audit only — no UI,
no wireframes, no implementation, no code.*
**Source of truth:** the live data layer (`data/sessionProfiles.js`, `data/scenarioCompile.js`), read
directly, plus `STRATEGY-BUILDER-UX-AUDIT-1.md` / `-REDESIGN-PLAN-1.md` / `-WIREFRAMES-1.md`.
**Date:** 2026-06-18 · **Branch:** `codex-dev` · **Author:** Claude (product architect).

> This audit deliberately ignores page layout. It evaluates the *model* — tiers, resolution, identity,
> and how the model scales — and ends with a product-architecture recommendation, not a UI one.

---

## 0 · Correction to the premise (read first)

The brief assumes a **three-tier** model: `Base Strategy → Scenario Global → Cohort Override`. **The code
implements four resolution tiers, and one of them is dead.** From `_resolveCohortChain()`, each dimension
(Entry / Break-Even / Target) resolves in this precedence order:

```
1. Cohort override        card.overrides[cell].{entryRef|beRef|targetRef}     source: "cohort"
2. Session default        card.default.{entryRef|beRef|targetRef}             source: "session-default"
3. Scenario global        globalDefaultRef.{entry|be|target}                  source: "global-default"
4. Base strategy          (the run's exported config / cfg)                   source: "none" → base universe
```

Plus an **independent enable chain** (`session-disabled → cohort → session-default → default-on`) and two
*orthogonal* concepts that are not tiers:
- a **named-profile library** (`profiles.profiles.{entry,be,target}`) — deduplicated Entry/BE/Target
  definitions referenced by deterministic id (`refField`); tiers store *refs*, not values.
- a **Baseline Control** (`control.baselineProfileRef`) — a separate "control universe" used only for a
  Live-vs-Control performance delta. **Not part of resolution.**

**The dead tier:** `setSessionDefaultValue()` (the only writer of the session-default tier) is **exported
but called by nothing** — no UI surface edits it. The resolver and every persisted/normalized object
still carry and honor `card.default`, so the tier is live in *resolution* and *migration* but unreachable
in *authoring*. It can only be populated by hand-edited or legacy-migrated data.

So the real model today is: **Base → Scenario-Global → (Session-Default, dead) → Cohort**, over a profile
library, with a separate control universe. That is materially more complex than the three tiers the brief
remembers — and the complexity is partly invisible. **This reframes every question below.**

---

## 1 · Is the multi-tier model necessary, or is `Base → Cohort` enough?

### What each tier actually buys

- **Base strategy is already a global.** Every dimension has a base value (`selectedEntryModel`, base BE,
  `cfg.rr`). When a cohort sets nothing, resolution falls through to base ("Base universe / Run default").
  This is the crucial point: **the scenario system layers a *second* global (Scenario-Global) on top of
  a default that already exists.**
- **Scenario-Global** lets you shift the universal default *without mutating the base run config*. Its
  only real, non-redundant job is: "keep the base run pristine (so the baseline-control comparison stays
  honest) while moving the scenario's default for all cohorts." That is a legitimate research need — but a
  narrow one.
- **Session-default** (dead) would let you set a value for all cohorts in one session. Currently
  unreachable.
- **Cohort override** is the irreducible unit — the whole point is per-(session×structure) strategy.

### Verdict

A pure **`Base → Cohort`** model preserves the *essential* capability (per-cohort strategy) and is
dramatically simpler. The multi-tier machinery exists mostly to reduce **write amplification** ("apply X
to many cohorts at once") and to provide **live inheritance** (change one global, all inheritors
re-resolve). Both can be recovered without a standing tier:

- Write amplification → a **bulk "apply to all / apply to filtered cohorts"** action that writes cohort
  values directly.
- The "keep base pristine" need → met as long as scenario values live in the scenario object and never
  mutate `cfg` (already true).

**The one capability a bulk action does *not* reproduce is live inheritance:** with a Scenario-Global
tier, editing the global re-resolves every inheriting cohort on the fly; with bulk-apply, values are
*materialized* (frozen) at write time, so a later base/global change won't propagate. Whether that matters
is the pivotal question (see §6, Decision 5).

**Recommendation:** collapse toward **two authored tiers — `Base → Cohort`** — and **delete the
session-default tier outright** (it is pure latent complexity and a migration/maintenance liability).
Retain Scenario-Global *only if* §6 Decision 5 concludes that live global re-resolution is a required
research behavior; otherwise replace it with bulk-apply. Either way, four tiers is not justified.

---

## 2 · What is lost if **Scenario-Global** is removed?

Removing the Scenario-Global tier (going `Base → Cohort`, with the library and bulk-apply retained) loses:

1. **Live "move the whole scenario" knob.** Editing one value to shift every inheriting cohort at once,
   with automatic re-resolution. Replaced by bulk-apply, but bulk-apply *materializes* — no live
   propagation.
2. **A pristine-base contrast point.** The ability to hold `cfg` unchanged while the scenario's universal
   default differs from it. *Recoverable* only if you accept that "everything differs from base" must be
   expressed as N cohort values rather than one global.
3. **`resetAllToGlobal()` semantics.** "Reset every cohort to the scenario default" stops meaning
   anything distinct from "reset to base." Minor.
4. **Cheaper diffs/provenance.** `source: "global-default"` gives a compact way to say "this cohort just
   follows the scenario default." Without it, provenance is binary (base vs cohort), which is arguably
   *clearer*, not worse.

**Nothing in this list is an irreplaceable research capability.** The only genuine loss is *live global
re-resolution*; everything else is ergonomics recoverable via bulk-apply + clear base-resolved display.
Per AGENTS.md (preserve analytical power), note that **per-cohort analytical flexibility is fully
retained** under `Base → Cohort` — what's removed is an authoring convenience layer, not a research axis.

---

## 3 · Which model is easier to understand in six months?

Ranked, most → least comprehensible for a returning power user:

1. **`Base → Cohort`** (2 authored tiers). One question per cohort: "does this cohort override base, yes/no,
   to what?" Provenance is binary. Lowest concept count.
2. **`Base → Scenario-Global → Cohort`** (3 tiers). Tractable, but introduces the genuinely subtle idea
   that there are *two* globals (the run's base default **and** a scenario default that shadows it). Users
   conflate them (the wireframe review already flagged this).
3. **Current `Base → Scenario-Global → Session-Default(dead) → Cohort`** (4 tiers, one invisible). Worst:
   a returning user cannot even *see* the session-default tier, yet a migrated object can resolve through
   it, producing "why is this cohort showing a value nobody set?" mysteries.

**Six-months test:** the failure mode is always "where did this effective value come from?" That cost
grows with tier count and is catastrophic when a tier is unauthorable-but-active. **`Base → Cohort` wins
decisively** on comprehension.

---

## 4 · Which model scales better for the future feature set?

The roadmap items — **multiple named scenarios, scenario libraries, scenario batching, A/B testing,
portfolio comparison** — all share one requirement: **more than one scenario must exist and be operated on
at the same time.** This is a question about the *container* model, largely **orthogonal to tier depth**.

| Future feature | Needs… | `Base→Global→Cohort` tier depth | Single working copy (today) | Named-variant collection |
|---|---|---|---|---|
| Multiple named scenarios | N coexisting scenario objects | irrelevant | ✗ one at a time | ✓ native |
| Scenario library | save/load/list named scenarios | irrelevant | ~ load-one (PortfolioBar) | ✓ native |
| Scenario batching | run base + N scenarios in one job | irrelevant | ✗ serial edit→run | ✓ native |
| A/B testing | 2+ scenarios live + comparable | irrelevant | ✗ | ✓ native |
| Portfolio comparison | diff scenario A vs B vs base | irrelevant | ~ PortfolioCompare hints at it | ✓ native |

**Tier depth does not help or hurt scaling** — a deep tier model and a flat one both scale identically
across these features. **The container model is what matters**, and a **named-variant collection scales
natively while the single working copy is a dead-end** for batching and A/B.

Two reinforcing signals from the existing code: (a) **`PortfolioCompare` already wants to diff two saved
portfolios** — i.e. it presumes plurality the working-copy model doesn't natively provide; (b) the
existing **"Scenario Batch" / penetration result-views** concept (base + N variants → selectable Views in
Run Workspace) is *the same shape* batching wants. The product is already reaching for plurality; the data
model hasn't followed.

**Conclusion:** for scaling, **shrink the tiers (simpler unit) and grow the container (many named
units).** These pull in the same direction — a simpler per-scenario tier model makes N coexisting
scenarios cheaper to reason about, not more expensive.

---

## 5 · Single working copy (A) vs named-variant collection (B)?

### Today

The system is effectively **(A) a single working copy** (`getSessionProfiles`/`setSessionProfiles`) with a
**load-one-at-a-time** named library on top (`PortfolioBar` + `getLoadedPortfolio`). Only one scenario is
ever "live." The base config lives **outside** the scenario object (in `cfg`/`sidecarConfig`) — which is
architecturally fortunate, because it means a scenario is *already* shaped as "deltas over a shared base."

### Target

**(B) a collection of named scenario variants attached to one base strategy.** Each variant = the current
`profiles`-shaped object (scenario-global + cohort overrides + enable map + its slice of the profile
library) *minus* the base, which is shared. This is the correct long-term model because:

- It is the **only** model that supports batching, A/B, and side-by-side comparison without serial
  edit-run cycles.
- It matches the product's existing direction (PortfolioCompare, Scenario Batch result-views).
- The migration is shallow: today's single working copy **is one variant**. "Loaded portfolio" → "active
  variant." The base is already external, so variants can share it cleanly.
- It aligns the two meanings of "scenario" the UX audit found overloaded: a *named scenario variant*
  becomes the single unit that is authored, named, saved, run, and compared — collapsing "portfolio" and
  "scenario" into one first-class object.

**Caveat / guardrail:** B multiplies state. To stay coherent it needs (i) a strict rule that the **base is
shared and never embedded** per-variant, (ii) a defined answer to "what does a variant inherit when the
shared base changes" (re-resolve vs freeze — Decision 5), and (iii) one **active** variant for editing
even when many exist, to avoid a confusing multi-edit surface.

**Recommendation:** commit to **B as the target model**, implemented as *named variants = delta sets over
one shared base*, with each variant kept to the **minimum tier depth** from §1. Do not build any UI that
hard-assumes the single-working-copy model, because that assumption is the expensive one to unwind later.

---

## 6 · Decisions that must be made **now**, before any UI work

These are data-model / product-architecture commitments. UI built before they're settled will be rebuilt.

1. **Container model (highest stakes).** Commit to **B (named-variant collection over one shared base)**
   as the target, even if v1 ships a single variant. This single decision governs batching, A/B, library,
   and comparison. *Decide now: A or B.* (Recommended: B.)

2. **Kill the dead session-default tier.** Decide to **remove `card.default` resolution + setter** (and
   migrate any persisted `default` into explicit cohort values or drop it). It is unauthorable, invisible,
   and a correctness hazard. *Decide now: remove vs formally adopt.* (Recommended: remove.)

3. **Authored tier depth per variant.** Choose **`Base → Cohort`** (recommended) or **`Base →
   Scenario-Global → Cohort`**. This fixes the resolver and the persisted shape; everything binds to it.
   *Decide now.*

4. **Base/scenario boundary (lock it).** Ratify that **base config always lives outside the scenario
   object** and a scenario stores only deltas/refs. It's true today; make it an invariant so B is possible.
   *Decide now: ratify.*

5. **Inheritance vs materialization.** Decide whether a cohort that "follows base/global" **re-resolves
   live** when base changes, or **freezes** its value at write time. This determines whether Scenario-Global
   can be replaced by bulk-apply (Decision 3) and how shared-base changes propagate to variants (Decision
   1). *This is the pivotal semantic.* (Recommended: live re-resolution against the shared base; cohort
   overrides are explicit and frozen, everything else inherits.)

6. **The unit of identity.** Define the **named scenario variant** as the one thing that is authored,
   named, saved, enabled, compiled (`compileScenarioToRunConfig`), run, and compared — collapsing
   "portfolio" and "scenario" into a single first-class object with a stable id. *Decide now: is the
   nameable/runnable/comparable unit one and the same?* (Recommended: yes.)

7. **Baseline Control's status.** Confirm Baseline Control remains a **separate control universe for
   delta**, explicitly *not* a resolution tier, and decide whether it is per-variant or per-base.
   *Decide now.* (Recommended: per-base, shared.)

8. **Migration contract.** Any change to tiers/shape needs a deterministic migration (today
   `normalizeProfiles` already migrates Phase-1/2A shapes). Decide the forward migration for existing saved
   portfolios *before* changing the shape, so no saved scenario is lost. *Decide now.*

Decisions 1, 2, 3, 5 are the load-bearing ones — they define the resolver and the persisted schema. 4, 6,
7, 8 are ratifications/guardrails that protect the first four.

---

## 7 · Product-architecture recommendation

**Shrink the unit, grow the container.**

1. **Adopt model B** — a strategy run has **one shared base** and a **collection of named scenario
   variants** layered over it. The variant is the first-class object (named, saved, enabled, run,
   compared), unifying "portfolio" and "scenario."
2. **Make each variant minimal — `Base → Cohort`.** Delete the dead session-default tier now. Treat
   Scenario-Global as optional and justify it *only* by the live-re-resolution need (Decision 5); if that
   need isn't firm, replace it with a non-tier **bulk-apply** action so the standing concept count drops to
   two.
3. **Keep the base external and the profile library shared.** Variants store refs + deltas, never base
   values; the named-profile library and Baseline Control are shared, orthogonal services, not tiers.
4. **Resolve "Run Default" live against the shared base**, with cohort overrides explicit and frozen — so
   provenance is always a clean binary ("base, or this cohort's override") and changing the base
   propagates predictably to all variants.

**Why this is the right architecture for FX Research Lab specifically:** it preserves every analytical
capability (per-cohort strategy across session × structure is untouched), it removes invisible/latent
complexity that will cost debugging time in six months, and it is the *only* model that lets the platform
grow into batching, A/B, libraries, and comparison — which the codebase is already reaching for
(PortfolioCompare, Scenario Batch). The tier simplification and the container expansion reinforce each
other: fewer tiers per variant is exactly what makes many coexisting variants comprehensible.

**What is explicitly *not* recommended:** keeping four tiers; keeping the dead session-default tier;
shipping new UI on top of the single-working-copy assumption; or treating "portfolio" and "scenario" as
two different objects.

**Sequencing note (not a UI plan):** Decisions §6.1–§6.5 should be ratified and the resolver/schema
settled **before** any Strategy Builder UI work begins, because the redesign's "Scenario Overrides"
surface binds directly to this model. Building the surface first would hard-code whichever model the UI
happened to assume — and on current evidence that would be the single-working-copy dead-end.

*No repository files were modified other than this document. No UI, wireframe, or code recommendations are
included by design.*
