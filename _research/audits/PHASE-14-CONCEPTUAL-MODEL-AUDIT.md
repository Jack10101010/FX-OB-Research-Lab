# Phase 14 — Conceptual Model Audit

*Assumes Phase 13 is complete (one preview engine). This is a mental-model design, not an implementation plan. No code, no plumbing — only the concepts a user should hold in their head and what we should call them.*

---

## The single governing idea

A user should only ever hold **one noun** for "the thing I am studying," and everything else is one of three relationships to it:

- a **selector** into it (changes what I'm *looking at*, not the data),
- a **projection** over it (a reversible *what-if*, not yet real),
- a **promotion** of it (the one action that creates new persistent data).

Today's confusion comes from presenting selectors, projections, and saved results as if they were all peer "runs." The fix is not more precise names for seven run-like things — it is **collapsing them to one run plus a small set of clearly non-run relationships.**

---

## 1. What concepts should exist (user-facing: five nouns, six verbs)

**Nouns:**

1. **Run** — one completed backtest. Immutable, "what actually happened." There is always exactly **one Run in focus.**
2. **View** — which slice of the *same* Run I'm reading. Two orthogonal dials under one roof:
   - **Model** — which entry-model family (the thing currently called *Result View*).
   - **Position Mode** — how concurrent positions are counted (the thing currently called *Position Variant*).
   A View never changes the data; it changes selection/counting.
3. **Preview** — a temporary, reversible projection on the current Run answering "what if I change this setting?" Updates every panel instantly. Ends in exactly one of two ways: **Discard** or **Promote**.
4. **Comparison** — the only way two Runs (or a Run and a Preview) appear at once. Side-by-side, read-only.
5. **Project** — the workflow that carries Runs from first idea to final config. **Baseline / Candidate / Final are labels a Run can hold inside a Project — not separate kinds of object.**

**Verbs:** *Adjust* (move a control), *Preview* (see the projection), *Discard*, *Promote* (the only act that mints a new Run), *Rerun* (when a change can't be projected), *Compare*.

That is the entire surface: **5 nouns, 6 verbs.** Everything a researcher does is expressible in them.

---

## 2. Which concepts should be removed (from the user's vocabulary)

| Remove from user speech | Why it's harmful | Replaced by |
|---|---|---|
| **"Active Run"** | There is only ever one Run in focus — the adjective is noise and collides with project/active and `.active` flags. | **Run** (or "current Run") |
| **"Baseline" = raw/un-projected data** | "Baseline" already means a Project stage; using it for "the run without a lens" overloads it 3×. | **Run** (the un-projected Run just *is* the Run) |
| **"Variant"** (free-floating) | Overloaded across entry model, position handling, selected-trade-variant, and FFT — means four different things. | Split into **Model** and **Position Mode** |
| **"Result View"** | Jargon for "which entry model." | **Model** |
| **"Position Variant"** | Jargon for "how positions stack." | **Position Mode** |
| **"Lens" / "Preview Lens" / "Composed Lens"** | Internal mechanism leaking into user language. | **Preview** |
| **"Candidate Run" as a noun-type** | It's a Run wearing a label, not a different object. | **Candidate** (a stage tag) |

The goal of removal: **no user should ever have to ask "is this a different run, or the same run shown differently?"** After this list, the answer is always structurally obvious.

---

## 3. What a user should call each existing concept

| Today's term | User should call it | Reasoning |
|---|---|---|
| **Active Run** | **Run** / "current Run" | Only one is ever in focus; drop "Active." |
| **Preview** | **Preview** | Already the right word — keep it, and make it the *only* word for any what-if projection. |
| **Variant** | *(retire the word)* → **Model** or **Position Mode** | Too overloaded to survive; force the speaker to say which dial. |
| **Result View** | **Model** (or "Entry Model") | It selects an entry-model family. |
| **Position Variant** | **Position Mode** | It selects a position-counting rule. |
| **Comparison Run** | **Comparison** / "vs {name}" | The act, not a third kind of run. The other side is just "the Run you're comparing to." |
| **Candidate Run** | **Candidate** | A stage label on a Run within a Project. |

---

## 4. Which concepts should be hidden entirely (never user-visible)

These are correct internally but must never surface as words or UI nouns:

- The **raw-vs-projected split** (`getRawRunData` vs `getRunData`). A user never decides which to read — the system shows the Preview when one is active, the Run otherwise.
- **Lens modes** (cost / filter / FFT / RR / composed). There is one user concept — *Preview* — regardless of how many dials moved.
- **Bundle / sourceRunId / derivedFrom / isTemporary / signatures.** Pure machinery.
- **The composer's internal stage order** (Swap → Filter → RR → Cost). Users see the *result* update, not the pipeline.
- **Rerun-tier classification** — *mostly* hidden, with **one honest exception** (below).

**The one tier signal that should NOT be hidden:** when a change *can* be projected, the user sees it live (Preview). When a change *cannot* be projected without a real backtest, the user must see an explicit **"needs Rerun to confirm"** state instead of a silently-stale or silently-ignored panel. So the binary "projectable vs needs-rerun" is the *only* piece of tiering that reaches the surface — and it reaches it as a promise about honesty, not as a number.

---

## 5. TradingView-style workflow from first principles

TradingView's whole model is: **one chart in focus → scrub a setting → everything redraws instantly → optionally save.** Translated to this lab, stripped to essentials:

```
        ┌──────────────────────────────────────────────┐
        │                  ONE RUN                      │  ← always exactly one in focus
        └──────────────────────────────────────────────┘
                 │                          │
        ┌────────▼────────┐        ┌────────▼─────────┐
        │      VIEW       │        │     ADJUST       │
        │ Model +         │        │ move a control   │
        │ Position Mode   │        └────────┬─────────┘
        │ (free, no data) │                 │
        └─────────────────┘        ┌────────▼─────────┐
                                   │     PREVIEW       │ ← instant projection,
                                   │ all panels update │   every panel live
                                   └────┬─────────┬────┘
                                  Discard         Promote / Rerun
                                   │                   │
                              back to Run        new Run (persisted)
```

**The loop, in user language:** *Load a Run → change a Model/Position Mode (free) or Adjust a control (Preview) → watch KPIs, equity, strategy map, failures, protection all update instantly → Discard to go back, or Promote/Rerun to keep it.*

**First-principles rules that make it feel like TradingView:**

1. **Exactly one Run is in focus** at all times. Never "which run am I on?"
2. **Two free, reversible moves:** changing a **View** (doesn't touch data) and entering a **Preview** (projects data). Neither costs anything; both are undoable.
3. **Only two ways to create persistent data:** **Promote** a Preview (instant-tier changes) or **Rerun** (backend-tier changes). Nothing else mints a Run.
4. **Every panel reads the same source.** When a Preview is active, *all* panels show projected numbers; when it isn't, all show the Run. No panel is ever half-projected — that is the cardinal sin TradingView never commits.
5. **Comparison is the only multi-Run surface.** Two Runs never coexist except deliberately, side-by-side.
6. **Honesty over silence:** a change you can't project says "needs Rerun," it doesn't quietly show stale numbers.

That is the entire TradingView promise: *change setting → instant projected results → apply or discard → no rerun unless the data demands it.* The five-noun model is exactly enough to express it and nothing more.

---

## 6. If building from scratch today — keep vs rename

**Keep (already clear):**
- **Run** — universal, unambiguous.
- **Preview** — the right word for a reversible projection; just make it the *only* such word.
- **Comparison / Compare** — clear as the two-Run surface.
- **Project** — clear as the workflow container.
- **Promote** — strong verb for "make this real."

**Rename:**
- *Active Run* → **Run**
- *Result View* → **Model**
- *Position Variant* → **Position Mode**
- *Variant* (bare) → **retire**; force *Model* or *Position Mode*
- *Lens / Preview Lens / Composed Lens* → **Preview** (user) / internal-only otherwise
- *Baseline* (when it means raw data) → **Run**; keep *Baseline* **only** as a Project stage
- *Candidate Run / Final Run* → **Candidate / Final** (stage labels, not object types)

**Introduce one new word:**
- **View** — the umbrella over Model + Position Mode, so users have a single handle for "looking at the same Run differently."

---

## Deliverable A — User-facing model (what the researcher holds in their head)

> **A Run is what happened. A View is how I look at it. A Preview is what might happen. A Comparison is two of them side by side. A Project carries Runs from Baseline to Final.**

Five nouns, six verbs (*Adjust, Preview, Discard, Promote, Rerun, Compare*). A user never reasons about lenses, bundles, raw-vs-projected, or pipeline stages. The only tier-awareness they ever need: *"this updates live"* vs *"this needs a Rerun."*

---

## Deliverable B — Internal model (unchanged in power, renamed for alignment)

The machinery stays as precise as it is today; only its public vocabulary changes:

- **Run object** — the immutable completed bundle (the artifact behind "Run").
- **Preview engine** — the single composer producing a transient projection (the artifact behind "Preview"). One engine, all dials, post-Phase-13.
- **View selectors** — the entry-model family and position-counting rule (behind "Model" and "Position Mode").
- **Comparison pairing** — the two-Run/Run-vs-Preview pairing layer.
- **Project graph** — workflow with stage pointers (Baseline / Candidate / Final).
- **Tier classifier** — internal; surfaces only the binary *projectable vs needs-rerun* signal.

The internal model keeps the raw-vs-projected distinction, lens modes, bundle identity, and stage ordering — all of it invisible to the user.

---

## Deliverable C — Mapping (user-facing ⇄ internal)

| User-facing concept | Internal concept(s) it stands for | Ever shown to user? |
|---|---|---|
| **Run** | the immutable run bundle / "raw" un-projected data; `activeRunId` selects which one is in focus | Yes (the noun) |
| **View → Model** | entry-model family (`Result View` family: baseline / triggered-edge / penetration / directional) | Yes |
| **View → Position Mode** | position-counting rule (`Position Variant`: single / one-per-direction / allow-multi) | Yes |
| **Preview** | the transient composer projection + the store overlay that stands in for the Run at read time; *all* lens modes collapse to this one word | Yes (the noun) |
| *(none — hidden)* | individual lens modes, composer stage order, bundle identity, raw-vs-projected accessor choice | **Never** |
| **Promote** | mint a new persistent Run from an instant-tier Preview | Yes (verb) |
| **Rerun** | run a real backtest because the change is backend-tier | Yes (verb) |
| **Comparison** | the Run-vs-Run / Run-vs-Preview pairing surface | Yes |
| **Project · Baseline/Candidate/Final** | workflow stage pointers (`baselineRunId` / `candidateRunId` / `finalRunId`) | Yes (as **labels on Runs**, not object types) |
| *(none — hidden)* | tier numbers; surfaced only as the binary "updates live" vs "needs Rerun" | **Binary signal only** |

---

### The two sentences that should govern every future naming decision

1. **There is always exactly one Run, and everything else is a way of looking at it, projecting it, comparing it, or promoting it — never another Run.**
2. **A user should never have to ask whether something is a different run or the same run shown differently; the vocabulary should make the answer structural.**

*Clarity over machinery. The internal system loses no power — it only stops asking the user to think in its terms.*
