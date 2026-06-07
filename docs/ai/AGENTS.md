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
6. **Scoped commits only** — never `git add .`; stage only your task's files.
7. Prefer the smallest correct change. Leave the tree green.
8. **Documentation accuracy.** If `PROJECT_STATUS.md`, `CURRENT_WORKSTREAM.md`, `ROADMAP.md`,
   `WORKSTREAMS.md`, `FINDINGS.md`, `DECISIONS.md`, `EXPERIMENTS.md`, or `BACKLOG.md` are
   materially stale, propose a `/sync` update **before continuing major planning work**. Prefer
   small incremental updates over large retrospective rewrites.

> **Environment note:** in the Cowork sandbox, git can create but **not unlink**
> `.git/index.lock` (mount restriction), so staging/committing is done on the host.
> Agents validate in-sandbox (assertions + Babel transpile), then hand the exact
> commit commands to the user.

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
