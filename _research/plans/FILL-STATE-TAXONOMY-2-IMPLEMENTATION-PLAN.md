# FILL-STATE-TAXONOMY-2 — IMPLEMENTATION PLAN
**Repo: FX-OB-Research-Lab**
**Mode: IMPLEMENTATION PLAN ONLY — no implementation, no source changes**
**Source of truth: FILL-STATE-TAXONOMY-1 audit**
**Status of approvals: steps 1 (`researchGlossary.js`) and 2 (`deriveFillState` additive field) APPROVED for a later implementation turn.**

---

## 0. Canonical hierarchy (from TAXONOMY-1)

```
All Filled (performance trades)
├─ Occupied At Arm     obOccupiedAtArm === true                       (~+0.08R)
├─ Vacant At Arm       obOccupiedAtArm === false          ← parent    (~+0.89R)
│   ├─ AAE             vacant && armedAfterObExit === true            (~+0.59R)
│   └─ Vacant — No AAE vacant && armedAfterObExit !== true
└─ Unknown At Arm      obOccupiedAtArm === null            ← excluded from edge analysis
```

Rules:
- `obOccupiedAtArm` is **authoritative** for the parent state.
- `armedAfterObExit` only **subdivides** Vacant.
- AAE ≡ `obOccupiedAtArm === false && armedAfterObExit === true`.
- Vacant-No-AAE ≡ `obOccupiedAtArm === false && armedAfterObExit !== true`.
- Unknown At Arm (`obOccupiedAtArm === null`) is **not** clean.
- "Clean" is **deprecated as a bucket** — synonym in tooltip copy only.

---

## 1. Consumer map (verified by audit)

The literal `"ob_not_occupied"` is authored in only 3 files (registry, derivation, one badge
doc-comment). **No page hardcodes it** — pages resolve tags dynamically via
`buildTradeClassification()` + `ClassificationBadge` / `getTagMeta()`. The only string the pages
hardcode is `"clean"` (the `t !== "clean"` badge-suppression filter). That single literal is the
real migration surface.

| File | How it consumes classification | Hardcoded literal |
|------|--------------------------------|-------------------|
| `frontend/src/data/tradeClassificationDims.js` | `deriveEntryContext` emits `clean/aae/ob_not_occupied` | both |
| `frontend/src/data/classificationRegistry.js` | tag defs + `getTagMeta` | both |
| `frontend/src/components/lab/ClassificationBadge.jsx` | filters `t !== "clean"`, `getTagMeta` lookup | `"clean"` (+ doc example) |
| `frontend/src/pages/RunDetail.jsx` | filter chips (`.some/.map`, `!== "clean"`), ledger Class col, breakdown table + `buildClassificationBreakdown` | `"clean"` |
| `frontend/src/pages/StrategyMap.jsx` (1754–66) | sidebar badges; `entry_context.filter(t!=="clean")` | `"clean"` |
| `frontend/src/pages/TradeInspector.jsx` (389–407) | Entry Model / Context / Exit badges; `!== "clean"` | `"clean"` |

**Out of scope** (matched a broad grep on unrelated `clean`/`aae`, not these tags; separate
workstreams): `components/lab/retest/RetestLabTab.jsx`, `data/obRetest.js`, SessionLab, NewsLab,
ProtectionLab. **Orthogonal and untouched:** `summarizeTradeClassifications` / `classifyTrade`
(the WIN/LOSS outcome classifier in `tradeClassification.js`) — a different system; do not conflate.

---

## 2. Core architectural move

Centralize the two things currently scattered or conflated:

1. **Derivation** → one function `deriveFillState(trade)` becomes the only place occupancy logic
   lives. Every consumer (badges, tables, filters, insights, future research) reads from it.
2. **Badge suppression** → a registry flag `muteAsBadge` replaces every hardcoded
   `t !== "clean"`. This is what prevents broken filters when `clean` disappears.

---

## 3. Exact file changes

### 3.1 `frontend/src/data/researchGlossary.js` — NEW (APPROVED, step 1)

Canonical **semantics** source. Keys: `occupied_at_arm`, `vacant_at_arm`, `aae`, `vacant_no_aae`,
`unknown_at_arm` (plus the §14 entry-model / session / statistic terms). Each entry:
`{ friendlyName, definition, whyItMatters }`. "Clean" appears **only** inside
`occupied_at_arm`'s tooltip copy as a synonym — never a key. Export `getGlossary(key)`.
No data dependency. Non-breaking, additive.

### 3.2 `frontend/src/data/tradeClassificationDims.js` — EDIT (APPROVED additive part, step 2)

Add the canonical derivation:

```
deriveFillState(trade) → { state, parent, isAnomaly }
  obOccupiedAtArm === false → parent "vacant_at_arm";
        state = armedAfterObExit === true ? "aae" : "vacant_no_aae"
  obOccupiedAtArm === true  → state/parent "occupied_at_arm";
        isAnomaly = (armedAfterObExit === true)
  else (null/undefined)     → state/parent "unknown_at_arm";
        isAnomaly = (armedAfterObExit === true)
```

`buildTradeClassification` gains `fill_state` and `fill_state_parent` fields (**additive — this is
the approved step 2 scope**). The rewrite of `deriveEntryContext` into a thin adapter (below) is
part of step 3, NOT step 2 — keep them separate so step 2 stays purely additive and non-breaking.

Adapter target (step 3): `deriveEntryContext` returns `[state]` (canonical leaf, never `clean`),
preserving the array return shape so `.filter/.some/.map` consumers are untouched. Retain all
existing null-safety.

### 3.3 `frontend/src/data/classificationRegistry.js` — EDIT (step 3)

- Add tags: `occupied_at_arm` (tone muted, `muteAsBadge: true`, label "Occupied At Arm"),
  `vacant_at_arm` (tone warning, label "OB Vacant At Arm"), `vacant_no_aae` (tone warning,
  label "Vacant — No AAE"), `unknown_at_arm` (tone muted, `muteAsBadge: true`, label "Unknown At Arm").
  Keep `aae`.
- **Rename** `ob_not_occupied → vacant_no_aae`; fix its description (it currently wrongly describes
  the parent/Vacant concept).
- Add an **alias map** consulted by `getTagMeta`: `ob_not_occupied → vacant_no_aae`,
  `clean → occupied_at_arm`. Legacy keys still resolve to a label.
- Registry holds **presentation only** (tone, label, flags); `description` re-exports from
  `researchGlossary` so meaning is not duplicated.

### 3.4 `frontend/src/components/lab/ClassificationBadge.jsx` — EDIT (step 3)

Replace `t !== "clean"` with `!getTagMeta(t).muteAsBadge`. Occupied/Unknown auto-hide as badges;
AAE/Vacant show. Back-compat: the `clean` alias is muted, so any stray `clean` still hides.
Update the doc-comment example (`ob_not_occupied` → `vacant_no_aae`).

### 3.5 `frontend/src/pages/RunDetail.jsx` — EDIT (step 4)

- Filter chips (~2737, ~2770) and ledger Class column (~2839): swap `!== "clean"` for the
  `muteAsBadge` helper so signal tags (aae, vacant_no_aae, parent vacant_at_arm) are offered and
  default states hidden.
- `buildClassificationBreakdown` (~4637–4701): entry_context rows now show canonical names.
  Optionally add a parent `vacant_at_arm` row computed from `fill_state` (NOT from the multi-valued
  array — that would double-count a trade into both parent and child).
- Apply `normalizeContextTag()` when hydrating any persisted `ledgerContextFilters`.

### 3.6 `frontend/src/pages/StrategyMap.jsx` (1754–66) — EDIT (step 4)

One-line swap: `entry_context.filter(t => t !== "clean")` → `.filter(t => !getTagMeta(t).muteAsBadge)`.
Occupied/Unknown trades render no context badge exactly as `clean` did. No other change.

### 3.7 `frontend/src/pages/TradeInspector.jsx` (389–407) — EDIT (step 4)

Same one-line swap as StrategyMap for the Entry Context row. No other change.

---

## 4. Rename / migration: `ob_not_occupied → vacant_no_aae`

Because no page hardcodes the key, the rename is **registry + derivation only**. Safety net:
- **Alias map in `getTagMeta`** resolves the old key to the new label.
- **`normalizeContextTag()`** applied at every persisted-filter / URL hydration boundary
  (`ob_not_occupied → vacant_no_aae`, `clean → occupied_at_arm`).

A previously saved filter selecting `ob_not_occupied` then still matches trades now tagged
`vacant_no_aae`.

---

## 5. Backwards compatibility

- Adapter `deriveEntryContext` keeps the **array shape** — zero consumer signature changes.
- Alias map → old bundles, old serialized data, old persisted UI all resolve.
- Old runs (`obOccupiedAtArm === null`) → `unknown_at_arm`, suppressed as badge (was `clean`) →
  identical UX.
- `muteAsBadge` keeps `clean` muted, so any un-migrated path degrades gracefully.

---

## 6. Preventing broken filters

- Suppression centralized on `muteAsBadge` (no orphan literals anywhere).
- `normalizeContextTag()` at every hydration boundary.
- Filter option lists stay **data-derived** from live trades (`ledgerClassificationOptions`), so they
  always reflect current tags.
- Alias guarantees a renamed **selected** value still matches.

---

## 7. Labels: out vs in

- **Disappear:** "Clean" (now a tooltip synonym only); "OB Not Occupied" (renamed).
- **Appear:** "Occupied At Arm", "OB Vacant At Arm" (parent), "Vacant — No AAE", "Unknown At Arm".
- **Unchanged:** "AAE".

---

## 8. Validation steps

1. Unit: `deriveFillState` truth table — all 6 rows including the 2 anomaly rows
   (occupied+armedAfterExit, null+armedAfterExit).
2. Invariant: `count(aae) + count(vacant_no_aae) === count(vacant_at_arm)`;
   `occupied + vacant + unknown + anomalies === total`.
3. Alias: `getTagMeta("ob_not_occupied")` resolves to the `vacant_no_aae` label.
4. Suppression: occupied/unknown render no badge; aae/vacant do — in RunDetail, StrategyMap,
   TradeInspector.
5. Old-bundle smoke: all-null AAE fields → all `unknown_at_arm`, no badges, no React errors.
6. Persisted-filter migration: localStorage holding `ob_not_occupied` still filters after
   `normalizeContextTag`.
7. Grep gate: zero `"clean"` / `"ob_not_occupied"` literals remain outside registry + derivation +
   glossary.

---

## 9. Commit plan (scoped to Trade Classification; never `git add .`)

Each commit builds green on its own.

1. `feat(classification): add researchGlossary canonical term source` — `researchGlossary.js`. **(APPROVED — additive)**
2. `feat(classification): add deriveFillState + fill_state field` — `tradeClassificationDims.js`,
   keeping `entry_context` emitting legacy tags. **(APPROVED — additive)**
3. `refactor(classification): rename ob_not_occupied→vacant_no_aae, add muteAsBadge + aliases` —
   `classificationRegistry.js`, `tradeClassificationDims.js` (adapter now canonical),
   `ClassificationBadge.jsx`.
4. `refactor(classification): migrate consumers to flag-based suppression` — `RunDetail.jsx`,
   `StrategyMap.jsx`, `TradeInspector.jsx` (+ `normalizeContextTag` on persisted filters).
5. `docs(status): record fill-state taxonomy migration` — PROJECT_STATUS / WORKSTREAMS / plan docs.

---

## 10. Coordination flags

- Step 4 touches `StrategyMap.jsx` (Strategy Map workstream) and `RunDetail.jsx` — allowed under
  Trade Classification's "RunDetail/StrategyMap only when classification display requires it," but
  both are currently live-dirty in the working tree from parallel chats. Stage deliberately; do not
  clobber parallel edits.
- Do **not** touch `tradeUniverse.js` (shared, unrelated to this change) or any OB-Retest files.

---

## 11. Approved next step

Steps 1 (`researchGlossary.js`) and 2 (`deriveFillState` additive `fill_state` field) are approved.
They are purely additive and non-breaking, de-risking the rename in step 3. Await explicit go-ahead
before writing any source.

---

*Generated: 2026-06-05 | Basis: FILL-STATE-TAXONOMY-1 | Task: FILL-STATE-TAXONOMY-2-IMPLEMENTATION-PLAN*
