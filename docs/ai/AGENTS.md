# AGENTS.md — Shared AI Project Memory (read me first)

This folder (`docs/ai/`) is the coordination layer for every AI agent working on
**FX-OB-Research-Lab** — Claude, ChatGPT, Codex, and any future chat. It exists so
agents can coordinate **without relying on chat history**. If you are a new chat,
read this file, then `PROJECT_STATUS.md` and `CURRENT_WORKSTREAM.md`, before doing
anything.

> **Mandatory session start:** At the start of every new session, all AI agents must
> automatically read `AGENTS.md`, `CURRENT_WORKSTREAM.md`, and `PROJECT_STATUS.md` before
> providing recommendations.

> Repo facts live in the **root** `PROJECT_STATUS.md` / `WORKSTREAMS.md` for git
> coordination. The `docs/ai/` copies are the **canonical AI-memory** versions:
> roles, roadmap, decisions, backlog, ideas, glossary, and current focus. When they
> disagree, re-verify against live git and update both.

---

## The files

| File | Purpose | Maintainer |
|------|---------|-----------|
| `AGENTS.md` | This index. Roles, rules, user prefs, custom commands. | All (Claude curates) |
| `CLAUDE.md` | Claude's role + operating rules + research philosophy. | Claude |
| `CODEX.md` | Codex's role + operating rules (code mechanic / backend / tests). | Codex |
| `CHATGPT.md` | ChatGPT's role + operating rules (PM / roadmap / coordination). | ChatGPT |
| `PROJECT_STATUS.md` | Living snapshot: current state, completed, active/next, findings. | ChatGPT |
| `ROADMAP.md` | Sequenced checklist `[x]`/`[~]`/`[ ]` — the plan of record. | ChatGPT |
| `WORKSTREAMS.md` | Registry of parallel workstreams + ownership + scope. | ChatGPT |
| `CURRENT_WORKSTREAM.md` | The single active focus right now, in detail. | Whoever holds focus |
| `DECISIONS.md` | Engineering/design decisions — how we build (append-only). | All |
| `FINDINGS.md` | Validated research conclusions — what the data says (append-only). | Claude (research lead) |
| `BACKLOG.md` | Unscheduled queue of tasks (P1/P2/P3). | ChatGPT |
| `IDEA_CAPTURE.md` | Freeform ideas, research directions, "someday" notes. | All |
| `EXPERIMENTS.md` | Run/experiment log: which run produced which finding. | Claude / Codex |
| `GLOSSARY.md` | Human-readable project glossary (companion to `researchGlossary.js`). | Claude |

Detailed design/audit docs live as `*-PLAN.md` / `*-AUDIT.md` files at the repo
root (e.g. `CLASSIFICATION-TAB-V2-PLAN.md`). `docs/ai/` summarizes and points to them.

---

## Roles (one-line each — see each role file for detail)

- **ChatGPT** → Project manager. Owns the roadmap, coordinates workstreams, generates
  checklists / status / handoffs, helps decide priorities and next actions.
- **Claude** → Product architect, UI/UX lead, research lead, system auditor, frontend
  implementation lead. May read broadly when auditing/designing; proposes stronger
  designs, UX, and roadmap items.
- **Codex** → Targeted code mechanic. Backend / data / test / refactor assistant.
  More constrained than Claude; avoids UI unless asked; keeps edits surgical.

---

## Universal rules (all agents)

1. **Audit before implementation.** Understand the code first; report what you read.
2. **Never modify unrelated files. Never refactor unrelated code.**
3. **Never change the dark theme** unless explicitly requested.
4. **Always report:** files read, files changed, validation performed, risks, follow-ups.
5. **Update `docs/ai/` when a meaningful task completes** (use `/sync`).
6. **Git & commit discipline** — scoped commits only; never `git add .`. See the dedicated
   **Git & workstream commit discipline** section below.
7. Prefer the smallest correct change. Leave the tree green.
8. **Documentation accuracy.** If `PROJECT_STATUS.md`, `CURRENT_WORKSTREAM.md`, `ROADMAP.md`,
   `WORKSTREAMS.md`, `FINDINGS.md`, `DECISIONS.md`, `EXPERIMENTS.md`, or `BACKLOG.md` are
   materially stale, propose a `/sync` update **before continuing major planning work**. Prefer
   small incremental updates over large retrospective rewrites.
9. **Preserve analytical power unless the user explicitly requests simplification.** Rule 7
   ("smallest correct change") never justifies removing exploration, flexibility, or research
   capability. See **Research Workflow Preservation** below.

> **Environment note:** in the Cowork sandbox, git can create but **not unlink**
> `.git/index.lock` (mount restriction), so staging/committing is done on the host.
> Agents validate in-sandbox (assertions + Babel transpile), then hand the exact
> commit commands to the user.

---

## Pre-implementation classification gate (all agents)

Before starting any new implementation:
- **Audit current dirty files** (`git status --short`).
- **Identify the owning workstream for each dirty file** (`WORKSTREAMS.md` Owns / Shared-caution).
- **Report commit boundaries** — which dirty files belong together as a scoped commit, and which
  must be kept apart.
- **Report whether the new task should continue an existing workstream or start a new one**, with
  the reason.

**Do not begin implementation until this classification is complete.**

---

## Git & workstream commit discipline (all agents)

`codex-dev` is edited by several AI chats in parallel; shared files are frequently dirty
from *other* streams. **The agent owns the full git cycle — classify, stage, validate,
commit — and executes it directly whenever it has terminal + repo access.** The user is
pulled in only at the three gates marked **[ASK]** below. Never offload routine staging or
hunk-picking onto the user.

**1 — Inspect (agent does this)**
- Run `git status --short` before any code work. A gate, not a formality.
- If dirty, classify every dirty file by workstream (`WORKSTREAMS.md` Owns / Shared-caution)
  before editing. Do not start a new workstream on top of unclassified dirty work.
- **[ASK – ambiguous]** if a dirty file or hunk can't be attributed to a stream — surface it,
  don't edit over it.

**2 — Stage (agent, non-interactively)**
- **Never `git add .` or `git add -A`.** Stage explicitly by path: `git add <paths>`.
- For a file that mixes workstreams, do **not** stage it whole and do **not** hand the user a
  hunk-stage. `git add -p` is interactive and unavailable to a non-interactive shell, so stage
  your hunks with a patch instead:
  1. `git diff -- <file> > /tmp/<name>.patch`
  2. Edit the patch to keep only your hunks — drop foreign hunks; for interleaved hunks delete
     the foreign `+`/`-` lines and correct the `@@` line counts.
  3. `git apply --cached /tmp/<name>.patch`
- Hotspot files — never stage whole-file without the patch path above:
  `frontend/src/pages/RunDetail.jsx`, `frontend/src/data/researchGlossary.js`,
  `frontend/src/components/lab/protection/BreakevenTab.jsx`, `frontend/src/pages/StrategyMap.jsx`;
  high-traffic: `frontend/src/data/importer.js`.

**3 — Validate (agent does this)**
- Run the relevant `frontend/src/data/__validation__/*.validate.mjs` (Node ≥ 22 ESM) and a Babel
  transpile check on touched files; run `craco build` for non-trivial changes. All green before
  committing — a red gate is a stop, not a footnote.

**4 — Verify the stage (agent does this)**
- `git diff --cached --stat` — confirm only your files/lines are staged.
- Grep the cached diff for other streams' symbols (e.g. `loserRunUp`, `retest_`, `BreakevenTab`)
  → expect zero hits.
- **[ASK – approval]** if a hotspot's foreign hunks could not be cleanly excluded (contamination risk).

**5 — Commit (agent does this)**
- Commit directly with a scoped message: `git commit -m "<type>(<scope>): <summary>"`.
- Local commits are reversible → no approval needed.
- **[ASK – approval]** before `git push`, before committing into a file another stream owns, and
  before any history rewrite (`reset --hard`, `rebase`, force-push) — avoid the last unless asked.

**The only times the user is involved:**
- **[ASK – approval]** push to remote · commit into another stream's owned file · history rewrite ·
  unavoidable hotspot contamination.
- **[ASK – blocked]** the environment genuinely can't execute git (sandbox can't unlink
  `.git/index.lock`, corrupt index, EPERM). *Only then* fall back to handing the user the exact
  reviewed command sequence — starting with `git reset` if foreign changes may already be staged.
- **[ASK – ambiguous]** a dirty file/hunk can't be attributed, or scope/ownership is unclear.

**Session end** — leave either a clean scoped commit (your files only, verified above) or, if
blocked, an explicit dirty-tree handoff: each dirty file, its owning workstream, and whether it's
safe to stage around.

---

## User Preferences

The user values **proactive suggestions**. When a meaningful improvement is apparent, do
**not** wait to be asked — surface it. When appropriate:

- Suggest roadmap additions.
- Suggest UX improvements.
- Suggest architecture improvements.
- Suggest research directions.
- Suggest future opportunities.

Proactivity means *proposing*, not *acting*: still get approval before implementing, never
refactor unrelated code, never change the dark theme.

---

## Research Workflow Preservation

**CRITICAL PRODUCT RULE**

FX-OB Research Lab is a research platform first and a reporting tool second.

When choosing between:
- **A)** simpler implementation
- **B)** preserving analytical flexibility

prefer **B** unless explicitly instructed otherwise.

Explorers, filters, dimensions, pivots, comparisons, drilldowns, cohort analysis, ranking
systems, and investigative workflows are **core product features**.

Do not remove, hard-code, simplify, replace, or reduce these capabilities merely to make
implementation easier.

If a requested feature could be implemented by:
- extending an existing explorer
- adding columns
- adding metrics
- adding adapters
- adding views

prefer that approach over replacing the explorer with a static report.

Before implementing any change that would remove:
- dimension selectors
- exploration controls
- drilldowns
- pivots
- filtering
- comparison capabilities
- ranking systems
- cohort exploration

**STOP and report it during the audit phase.** Such changes require explicit approval.

---

## Research UI Design Principle

The goal of Research Lab is **discovery**. Users should be able to:
- investigate unexpected relationships
- pivot data through multiple dimensions
- compare cohorts
- drill into subsets
- test hypotheses

Do not convert exploratory tools into fixed reports unless explicitly requested.

- A **report** answers: "What happened?"
- A **research tool** answers: "Why did it happen?"

Prefer preserving the ability to answer **"why"**.

---

## Existing Explorer Protection

If modifying an existing explorer or explorer-adjacent surface, follow this default
**preference order**:

1. Additive enhancement
2. Adapter layer
3. Additional columns
4. Additional metrics
5. Additional filters
6. Additional views
7. Explorer replacement

**Explorer replacement requires explicit approval.** If an implementation would remove
functionality that already exists in an explorer, call it out during the audit and request
approval before proceeding.

**Validation requirement** — for any explorer-related task, include in the final report:
- What existing capabilities were **preserved**
- What capabilities were **added**
- What capabilities were **removed**, if any
- Whether **live UI verification** was performed

If any capability was removed, explain why and confirm approval was obtained.

---

## Custom Commands

These are **logical commands, not native Claude commands.** When the user writes one of:
`/status` · `/roadmap` · `/next` · `/sync` · `/handoff` · `/decision` · `/idea` · `/promote` ·
`/checkpoint` · `/health` — interpret the request using the definitions below and execute the
associated workflow.

Most are read-only reports; the ones that write always **propose diffs first** and wait for
confirmation (docs are committed on the host).

### `/status`
- **Purpose:** report the state of the current workstream.
- **Output:** completed work · blockers · next actions, concise. Verified against git.
- **Files:** none (reads `CURRENT_WORKSTREAM.md`, `PROJECT_STATUS.md`).

### `/roadmap`
- **Purpose:** show the sequenced checklist.
- **Output:** `ROADMAP.md` rendered with `[x]`/`[~]`/`[ ]` and rough % per phase.
- **Files:** none (reads `ROADMAP.md`).

### `/next`
- **Purpose:** name the single best next action and why.
- **Output:** one recommended task + rationale + which agent should do it (Claude/Codex).
- **Files:** none (reads `CURRENT_WORKSTREAM.md`, `ROADMAP.md`, `BACKLOG.md`).

### `/sync`
- **Purpose:** bring the memory layer up to date after meaningful work.
- **Output:** proposed diffs for each affected doc; user confirms before write.
- **Files:** `PROJECT_STATUS.md`, `ROADMAP.md`, `WORKSTREAMS.md`, `CURRENT_WORKSTREAM.md`,
  `DECISIONS.md`, `FINDINGS.md`, `BACKLOG.md`, `IDEA_CAPTURE.md`, `EXPERIMENTS.md` (as relevant).

### `/handoff`
- **Purpose:** produce a self-contained context block for a brand-new chat.
- **Output:** workstream · current state · next action · files in flight · gotchas · relevant
  commits — paste-ready.
- **Files:** none (read-only).

### `/decision`
- **Purpose:** record an engineering/design decision.
- **Output:** a new `DECISIONS.md` entry (next `D-###`, what / why / consequence, date).
- **Files:** `DECISIONS.md` (append).

### `/idea`
- **Purpose:** capture an idea without committing to it.
- **Output:** a dated bullet under the right `IDEA_CAPTURE.md` heading.
- **Files:** `IDEA_CAPTURE.md` (append).

### `/promote`
- **Purpose:** move an item up the pipeline (idea → backlog, or backlog → roadmap).
- **Output:** the item added to the target doc and marked/removed in the source.
- **Files:** `IDEA_CAPTURE.md` → `BACKLOG.md` → `ROADMAP.md` (the two relevant ones).

### `/checkpoint`
- **Purpose:** save a recovery point — a timestamped snapshot of where things stand.
- **Output:** updated `PROJECT_STATUS.md` + `CURRENT_WORKSTREAM.md` "where we are", plus an
  `EXPERIMENTS.md` entry if a backtest run was involved.
- **Files:** `PROJECT_STATUS.md`, `CURRENT_WORKSTREAM.md`, `EXPERIMENTS.md` (if a run).

### `/finding` (alias used by research work)
- **Purpose:** record a validated research conclusion.
- **Output:** a new `FINDINGS.md` entry (next `F-###`, summary / evidence / status / date).
- **Files:** `FINDINGS.md` (append). (Use `/decision` for *build* choices, `/finding` for
  *research* conclusions — see the boundary note in those files.)

### `/health`
- **Purpose:** quick project health check.
- **Output:** current workstream · last completed milestone · active blockers · stale documents ·
  dirty files · uncommitted work · recommended next task.
- **Files:** none (read-only; verifies docs against live git).

---

## New chat startup checklist

1. Read `AGENTS.md` (this file), `PROJECT_STATUS.md`, `CURRENT_WORKSTREAM.md`.
2. Read your role file (`CLAUDE.md` / `CODEX.md` / `CHATGPT.md`).
3. Verify against live git: `git branch --show-current`, `git log --oneline -10`,
   `git status --short`. Treat docs as possibly stale; re-verify.
4. Attach to a workstream in `WORKSTREAMS.md` (or add one) before coding.
5. Report: repo path, branch, workstream, files you'll touch, files you won't, whether
   it's safe to proceed.

*Last updated: 2026-06-07.*
