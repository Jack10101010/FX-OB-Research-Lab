# Dirty-Tree Workstream Audit

*Read-only audit. No files edited, staged, or committed. HEAD = `e9d03aa` (Phase 14 Wave 1). Goal: turn the dirty tree into clean scoped commits without mixing workstreams.*

---

## ⚠ Headline finding — the 13-file view is incomplete

Several dirty files **import modules that are untracked and absent from your `git status` list.** Committing the 13 modified files without these would produce a **broken build** (missing modules). `git ls-files --error-unmatch` confirms (the sandbox `git status` isn't surfacing untracked files, likely the `.git/index.lock` mount issue — verify on host with `git status --porcelain`).

| Untracked module (must be committed) | Required by | Belongs to |
|---|---|---|
| `frontend/src/data/backendDomainSync.js` | presets · roadmapStore · playbookStore · EntryHypothesisLab · PromotionDesk | **STORAGE** |
| `frontend/src/components/lab/protection/BeAffectedTradesCard.jsx` | StrategyMap · BreakevenTab | **Protection-BE** |
| `frontend/src/data/protectionTimeline.js` (+ `__validation__/protectionTimeline.validate.mjs`) | StrategyMap · BeAffectedTradesCard | **Protection-BE** |
| `frontend/src/data/selectiveBeUniverse.js` (+ `__validation__/selectiveBeUniverse.validate.mjs`) | BreakevenTab | **Protection-BE** |

**Consequence:** never `git add .` — it would sweep all untracked across all three workstreams into one commit. Stage each commit's files **explicitly**, including its untracked deps.

---

## 1. Workstream grouping

**WS-1 · STORAGE Phase 1 — durable backend mirror** (backend JSON storage + per-domain localStorage→backend sync; "backend optional — down = unchanged behavior").
- `backendDomainSync.js` *(untracked — shared core)*
- `backend/server.py` (+89: `/storage/{domain}` GET/PUT, allowlisted domains, atomic write)
- `frontend/src/data/presets.js` (+37: configs mirror + `mergeConfigs`)
- `frontend/src/data/roadmapStore.js` (+38: section_roadmaps mirror + `mergeRoadmapOverrides`)
- `frontend/src/data/playbookStore.js` (+45: playbook mirror + `mergePlaybookStates`)
- `frontend/src/data/usePlaybook.js` (+5: re-read on backend hydrate)
- `frontend/src/components/lab/roadmap/SectionRoadmap.jsx` (+5: re-read on backend hydrate)
- `frontend/src/components/lab/entries/hypothesis/EntryHypothesisLab.jsx` (+41: hypotheses mirror + `mergeHypotheses`)
- `frontend/src/components/lab/entries/promotion/PromotionDesk.jsx` (+39: promotion mirror + `mergePromotion`)

> Note: the two **entries** files are *not* entries-feature work — they are STORAGE Phase 1 applied to the hypotheses/promotion domains. They belong here.

**WS-2 · Protection Lab BE — selective panel + BE-affected debug-on-map** (one Protection-BE effort with two threads sharing `BreakevenTab.jsx`).
- `selectiveBeUniverse.js` + `selectiveBeUniverse.validate.mjs` *(untracked)*
- `protectionTimeline.js` + `protectionTimeline.validate.mjs` *(untracked)*
- `BeAffectedTradesCard.jsx` *(untracked)*
- `frontend/src/components/lab/protection/BreakevenTab.jsx` (+436: **selective-BE cohort panel** [the prior BE-SELECTIVE refine] **+** `BeAffectedTradesCard`)
- `frontend/src/pages/StrategyMap.jsx` (+105: BE-affected trades card + timeline; BE-debug split layout)
- `frontend/src/components/lab/CandleChart.jsx` (+65: BE-affected OB highlight + "Debug" labels)
- `frontend/src/components/lab/IntrabarInspector.jsx` (+285: per-OB magnifier view persistence + BE-lines)

**WS-3 · Chart attribution CSS** (standalone cosmetic).
- `frontend/src/index.css` (+9: hide lightweight-charts "TradingView" attribution anchor)

---

## 2. Recommended commit order

The three workstreams share **no files** and have **no inter-dependencies**, so order is flexible. Recommended for clean history:

1. **WS-1 STORAGE** (largest, self-contained; lands the shared `backendDomainSync` core).
2. **WS-2 Protection-BE** (lands its 4 untracked modules).
3. **WS-3 CSS** (trivial, last).

Within WS-1, optionally split **backend first, then frontend** (frontend is backend-optional, so both orders build) — or keep as one commit since they're one feature.

---

## 3 & 4. Files per commit + suggested messages

### Commit 1 — WS-1 STORAGE  *(1 new + 8 modified)*
```bash
git add frontend/src/data/backendDomainSync.js \
        backend/server.py \
        frontend/src/data/presets.js \
        frontend/src/data/roadmapStore.js \
        frontend/src/data/playbookStore.js \
        frontend/src/data/usePlaybook.js \
        frontend/src/components/lab/roadmap/SectionRoadmap.jsx \
        frontend/src/components/lab/entries/hypothesis/EntryHypothesisLab.jsx \
        frontend/src/components/lab/entries/promotion/PromotionDesk.jsx
```
> `feat(storage): durable backend mirror for playbook, roadmap, presets, hypotheses & promotion`
> *(optional split: `feat(storage): add /storage/{domain} backend endpoints` then `feat(storage): mirror research domains to durable backend`)*

### Commit 2 — WS-2 Protection-BE  *(4 new + 4 modified)*
```bash
git add frontend/src/data/selectiveBeUniverse.js \
        frontend/src/data/__validation__/selectiveBeUniverse.validate.mjs \
        frontend/src/data/protectionTimeline.js \
        frontend/src/data/__validation__/protectionTimeline.validate.mjs \
        frontend/src/components/lab/protection/BeAffectedTradesCard.jsx \
        frontend/src/components/lab/protection/BreakevenTab.jsx \
        frontend/src/pages/StrategyMap.jsx \
        frontend/src/components/lab/CandleChart.jsx \
        frontend/src/components/lab/IntrabarInspector.jsx
```
> `feat(protection): selective-BE cohort panel + BE-affected debug on the strategy map`

### Commit 3 — WS-3 CSS  *(1 modified)*
```bash
git add frontend/src/index.css
```
> `style(charts): hide lightweight-charts TradingView attribution anchor`

---

## 5. Validation commands per commit

**Commit 1 — STORAGE**
```bash
python3 -m py_compile backend/server.py                                   # backend syntax
node frontend/src/data/__validation__/playbookStore.validate.mjs          # covers mergePlaybookStates
# JSX/JS parse (project @babel/core — npx babel@5 is unreliable for JSX):
node -e 'const b=require("@babel/core");["frontend/src/data/backendDomainSync.js","frontend/src/data/presets.js","frontend/src/data/roadmapStore.js","frontend/src/data/playbookStore.js","frontend/src/data/usePlaybook.js","frontend/src/components/lab/roadmap/SectionRoadmap.jsx","frontend/src/components/lab/entries/hypothesis/EntryHypothesisLab.jsx","frontend/src/components/lab/entries/promotion/PromotionDesk.jsx"].forEach(f=>b.transformFileSync(f,{presets:[["@babel/preset-react"],["@babel/preset-env",{targets:{node:"current"}}]]}));console.log("PARSE OK")'
```
> Gap: `mergeConfigs` / `mergeRoadmapOverrides` / `mergeHypotheses` / `mergePromotion` have **no dedicated validators** — rely on parse + a manual hydrate/merge smoke (save in one tab, confirm it survives reload).

**Commit 2 — Protection-BE**
```bash
node frontend/src/data/__validation__/selectiveBeUniverse.validate.mjs    # ✅ passed earlier
node frontend/src/data/__validation__/protectionTimeline.validate.mjs
node frontend/src/data/__validation__/beIntegration.validate.mjs          # ✅ passed earlier
node frontend/src/data/__validation__/beReplay.validate.mjs               # ✅ passed earlier
node -e 'const b=require("@babel/core");["frontend/src/components/lab/protection/BeAffectedTradesCard.jsx","frontend/src/components/lab/protection/BreakevenTab.jsx","frontend/src/pages/StrategyMap.jsx","frontend/src/components/lab/CandleChart.jsx","frontend/src/components/lab/IntrabarInspector.jsx"].forEach(f=>b.transformFileSync(f,{presets:[["@babel/preset-react"],["@babel/preset-env",{targets:{node:"current"}}]]}));console.log("PARSE OK")'
```

**Commit 3 — CSS**
```bash
# CSS-only, no JS impact. Visual smoke: confirm the TradingView anchor is hidden on a chart page.
```

---

## 6. Collision risks

1. **Untracked dependency omission (highest).** Each commit MUST include its untracked modules (table at top). Miss one → broken build / failing import.
2. **`git add .` is dangerous here.** It would stage `backendDomainSync` (WS-1) *and* `BeAffectedTradesCard`/`protectionTimeline`/`selectiveBeUniverse` (WS-2) together, fusing two workstreams. Stage explicitly.
3. **`BreakevenTab.jsx` is a junction file.** It carries BOTH the selective-BE panel (prior refine task) and the BE-affected-card import. They can't be split at file level — if you ever want them in separate commits, you'd need `git add -p` hunk staging. Recommended: keep them together as one Protection-BE commit (same domain).
4. **`IntrabarInspector.jsx` is separable-in-principle** (magnifier view persistence + BE-lines). It's grouped with WS-2 because its BE-lines tie to the same map BE-overlay; split it out only if you want a dedicated "intrabar magnifier persistence" commit.
5. **Multi-agent branch.** These span ≥3 parallel agents' work on `codex-dev`; the explicit-staging discipline above is exactly what prevents cross-stream contamination.
6. **Sandbox `git status` under-reports untracked** (index.lock mount issue) — re-verify the untracked set on the host before staging.

---

## 7. Files that should NOT be committed yet / caveats

- **None are inherently unsafe to commit** — all three workstreams appear feature-complete and parse/validate. But:
- **Do not commit any WS-1 frontend file without `backendDomainSync.js`**, and **do not commit `BreakevenTab.jsx`/`StrategyMap.jsx` without their 4 untracked Protection-BE modules** — those are the only true blockers.
- **`backend/server.py`** is a backend change (note: outside the frontend-only scope some earlier tasks observed). It's safe and coupled to the WS-1 frontend (which degrades gracefully if absent), but confirm the backend deploy story before committing if backend deploys separately.
- **Validation gap on WS-1 merges** (configs/roadmap/hypotheses/promotion) — not blocking, but a manual hydrate smoke is advisable before treating the durable mirror as trusted.
- **Commit on host** (sandbox can't unlink `.git/index.lock`).

*Summary: 3 clean commits — STORAGE (9 files), Protection-BE (9 files incl. 4 untracked), CSS (1 file). The single thing that turns this from "13 dirty files" into "buildable commits" is including the 5 untracked dependency modules with the right workstream.*
