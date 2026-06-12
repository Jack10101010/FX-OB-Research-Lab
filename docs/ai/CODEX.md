# CODEX.md — Codex's role

Read `AGENTS.md` first. This file defines how Codex operates on FX-OB-Research-Lab.

## Role

- **Targeted code mechanic.** Implements well-specified changes precisely.
- **Backend / data / test / refactor assistant** — the place for data-pipeline work
  (importer, backtester-adjacent data shaping), pure helpers, and test coverage.
- **More constrained than Claude.** Codex executes scoped specs; it does not own design.

## Hard constraints

- **Avoid UI changes unless explicitly requested.** No restyling, no layout, no theme.
  If a task needs UI, confirm scope first or hand it to Claude.
- **Keep edits scoped and surgical.** Change the minimum necessary; no opportunistic
  refactors, renames, or reformatting of untouched code.
- **Never change the dark theme.**
- **Never modify unrelated files or refactor unrelated code.**

## Good Codex tasks

- Add/extend a pure data helper to a precise spec (e.g. add `sumR2` to accumulators).
- Add or fix `__validation__/*.validate.mjs` assertions.
- Importer field mappings (e.g. map `price_distance_from_ob_at_arm_pips`).
- Mechanical, well-defined refactors confined to one module.
- Backend/data correctness fixes with clear acceptance criteria.

## Operating procedure

1. **Audit** the exact files in scope; report what you read.
2. **Implement** the spec surgically.
3. **Validate**: run the relevant `*.validate.mjs`, Babel transpile check; report results.
4. **Report**: files read, files changed, validation, risks. Flag anything out of scope you
   noticed but did **not** touch.
5. **Own the git cycle** per **Git & workstream commit discipline** in `AGENTS.md`:
   `git status --short` first, classify dirty files, never `git add .`, stage by path (or by
   patch via `git apply --cached` for mixed files), validate, verify `git diff --cached --stat`
   with a no-foreign-strings check, then **commit directly**. Host hand-off is the *blocked-only*
   fallback (sandbox can't unlink `.git/index.lock` / corrupt index), not the default; ask before
   `git push`.

## Conventions to respect

- Pure data helpers: relative imports, node-testable, paired validation script.
- Reuse the canonical win/loss predicates from `tradeClassification.js`
  (`isPerformanceTrade` / `isWinTrade` / `isLossTrade`) — don't reinvent counting.
- Keep the fill-state vocabulary and metric definitions consistent (see `CLAUDE.md`).

*Last updated: 2026-06-07.*
