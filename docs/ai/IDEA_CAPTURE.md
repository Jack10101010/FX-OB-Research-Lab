# IDEA_CAPTURE.md — freeform ideas

Low-friction capture. Anything goes; groom later into `BACKLOG.md`. Date entries.
Not commitments — a parking lot for research directions and UX thoughts.

*Last updated: 2026-06-07.*

---

## Research directions

- **Effect-significance, not just precision.** Track `sumR2` so confidence can test whether avgR
  is reliably ≠ 0 (t-style), instead of only how tightly WR is estimated. (2026-06-07)
- **Multi-run consistency as a confidence input.** A finding that holds across runs/periods is
  more trustworthy than one strong run. Could feed a future `stabilityScore` term. (2026-06-07)
- **Vacant-No-AAE deep dive.** Is the rest of the Vacant cohort (beyond AAE) even stronger? Split
  by how it became vacant (gap vs drift). (2026-06-07)
- **Distance × fill-state interaction.** Once distance is imported, cross distance bands with
  Vacant/AAE — is the <2 pip danger concentrated in a fill state? (2026-06-07)
- **Session × fill-state interaction.** Does Vacant's edge survive Outside session, or is Outside
  uniformly bad regardless of fill state? (2026-06-07)

## UX ideas

- **Research Signals as the tab's headline** — a plain-English "what the data says" banner with
  confidence, above the cards. (designed → Phase 2) (2026-06-07)
- **Saved findings / research library** — pin a signal with its run + filters; compare later. (2026-06-07)
- **Confidence-aware coloring** — dim low-confidence rows/cards so the eye trusts the strong ones. (2026-06-07)
- **"Why this signal?" expander** — show the sample, WR interval, and the rule that fired. (2026-06-07)

## Platform / workflow

- Consider a tiny `/why` command: explain how a surfaced signal/confidence was computed. (2026-06-07)
- Automate `/sync` proposals at end of each implementation task. (2026-06-07)
