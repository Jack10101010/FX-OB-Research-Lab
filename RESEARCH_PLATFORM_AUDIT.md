# FX-OB Research Lab — Product Design Audit
*June 2026 — Strategic Platform Review*

---

## 1. Executive Summary

The platform has solved the hardest part of the problem: it captures data, runs comparisons, and stores observations. Most research tools stop there and call it done. But a collection of saved findings is not the same as accumulated knowledge, and that distinction is the gap that separates a tool from a research operating system.

The core missing layer is *synthesis and forward direction*. The platform currently answers "what did I find?" It does not yet reliably answer "what does this mean?" or "what should I do next?" Every major improvement from this point forward should be evaluated against that single standard. If a feature doesn't move the researcher closer to a confident next action, it doesn't belong.

The good news: the missing pieces are not complicated. They are mostly structural additions to systems that already exist — validation status on findings, explicit hypothesis objects, pattern frequency tracking, and a small number of well-placed "what this implies" prompts. None of these require AI. All of them are traceable to real data.

The risk to avoid is adding more analysis surface area. The platform already has more than enough tools to generate observations. The bottleneck is not more observations — it's turning existing observations into structured knowledge.

---

## 2. Biggest Missing Pieces

### 2.1 Findings Have No Status

A finding saved six months ago after a single run has the same visual weight as a finding confirmed across twelve independent tests. There is no way to distinguish an isolated curiosity from a validated edge without reading every note manually. This is the single highest-leverage gap on the platform. Without validation status, findings accumulate noise faster than signal.

### 2.2 No Explicit Hypothesis Layer

The research process implicitly contains hypotheses — "I think BOS outperforms CHOCH in the London session" — but the platform has nowhere to formally capture them. A hypothesis is not a finding. A finding is evidence. The distinction matters enormously: without it, there is no way to know whether you are testing a new idea or re-testing something you've already answered.

### 2.3 No Forward Pull After Saving a Finding

The current workflow has momentum in one direction: Run → Analyze → Find → Save. After saving, momentum stops. There is no prompt, no suggestion, no next step surface. The researcher is dropped back into an empty findings list and must independently reconstruct what to do next. This creates cognitive overhead at exactly the moment when the researcher has the most context about what they just found.

### 2.4 The Platform Doesn't Know What You Don't Know

This sounds philosophical but it's practical. An observation that has been noted but never formally tested is invisible to the current system. The platform cannot distinguish between an edge you've confirmed and an edge you've only noticed. That distinction is the core of the research process, and it's completely untracked.

### 2.5 Findings Are Not Linked to Each Other

Finding 23 and Finding 41 might both be about BOS in the London session and reach opposite conclusions. Right now, that contradiction sits silently in the database. There is no mechanism to surface it. Contradictions in research are not problems — they are the most valuable signal you can find, because they tell you that a variable you haven't isolated yet is doing something important.

### 2.6 Projects Feel Like Folders

A Project currently groups Runs. It should also define a research goal, track open questions, and have a stated outcome. Right now, you could complete a project without ever articulating what you were trying to answer. A project without a defined question is a filing cabinet, not a research program.

---

## 3. Research Workflow Critique

**Current path:** Run → Analyze → Discover → Save Finding → Findings List → Insights

This workflow is reactive. It responds to what you happen to notice. It has no forward structure — no scaffold that helps you know whether today's run was productive relative to an intended research goal.

The deeper problem is that the workflow terminates at "Save Finding." A finding is inert. It cannot do anything on its own. For the workflow to have forward momentum, something must respond to a finding being saved. Currently, nothing does.

**What should happen when a finding is saved:**

The system should immediately ask — either with a prompt or a lightweight UI surface — two questions. First: has this been formally tested, or is this an observation? Second: what does this suggest you should test next? These don't need to be AI-generated. They can be simple radio buttons or a structured note field. The act of answering them transforms a passive observation into a research action.

**What should happen as findings accumulate:**

The platform should automatically track tag frequency, pattern co-occurrence, and untested observation count. When the same idea appears five times in different findings, the system should surface that. Not as a recommendation — as a mirror. "You have mentioned penetration depth in 6 findings across 3 projects. None have a validation status of Confirmed." That statement alone generates a research agenda without any AI involved.

**The workflow the platform should be moving toward:**

```
Define Hypothesis
  → Design Test (Run)
    → Analyze Results (Run Workspace / Edge Explorer)
      → Save Finding with status + linked hypothesis
        → System updates hypothesis evidence count
          → Suggest next test based on gaps and frequency
```

Every step feeds the next. Research compounds instead of accumulates.

---

## 4. Future Research Memory Design

The goal of research memory is to let the platform answer: *What do we know, what do we think we know, and what are we still guessing about?*

### What to Build (High Value)

**Validation Status on Findings** — A simple four-state enum: `Untested Observation | Tested Once | Confirmed | Refuted`. This single field transforms the Findings page from a journal into a knowledge base. It costs almost nothing to implement and changes how every researcher reads their findings list. Build this first.

**Open Questions** — A first-class object in the system, distinct from findings. An open question is an explicit unknown. It can be attached to a Project, a Finding, or an Insight. It can be resolved (linked to a finding that answered it) or remain open. The list of open questions in a project is the most honest summary of where the research stands. This should be visible on the Project overview.

**Hypotheses** — Simple structured objects with: a claim statement, a linked project, a status (Unvalidated / Supported / Refuted / Contradicted), and a list of linked findings as evidence. Hypotheses give findings a purpose. Without them, findings are answers to questions that were never written down.

**Research Trail Linking** — The ability to link: "This finding prompted this run, which produced this finding." A single-hop trail. Not a full graph. Just enough to trace the logical chain of an investigation over time. This makes research reviewable and teaches researchers which investigation strategies actually yield results.

**Contradictory Finding Detection** — Rule-based, not AI. If two findings share the same primary tags (e.g., BOS + London) and have incompatible conclusions (one notes positive edge, one notes negative or neutral), flag them as contradictory and surface the pair. This is valuable precisely because it tells you which variables you haven't isolated.

### What to Skip (Overengineering)

**Numeric confidence scores** — The data is not dense enough to make this meaningful, and numeric confidence creates anchoring effects. A researcher who has saved 4 findings supporting a hypothesis will set their confidence at 78% and then stop testing. Confidence is a UX trap here. Use status categories instead — they communicate the same thing without false precision.

**Bayesian updating** — Sounds rigorous, is actually cosmetic. The sample sizes in strategy research are almost always too small and too correlated to make probability updates trustworthy. It would create a veneer of statistical rigor on top of qualitative observations.

**Full experiment lineage DAGs** — Visually appealing, practically a maintenance nightmare. Researchers will spend time managing the graph instead of researching. Keep trails to single hops.

**Auto-tagging findings via NLP** — Will produce enough incorrect tags to create noise. Tagging should remain manual, but the system should make manual tagging fast and consistent via a tag suggestion dropdown based on existing tags.

---

## 5. Insights Page — Future Vision

**Where it is now:** A cross-project findings list with filters and grouping. Useful, but passive.

**What it should become:** The platform's research intelligence layer — a place where accumulated findings begin to reveal structure.

The core upgrade is moving from *list* to *theme*. Instead of browsing findings, a researcher should be able to see clusters of related findings regardless of project origin. These clusters should be driven by tag co-occurrence, not AI summarization. "These 7 findings all involve BOS + Morning + Confirmed status." That cluster is a candidate confirmed edge. The researcher did not have to manually find it — the system surfaced it because the pattern exists in real data.

Beyond clustering, Insights should eventually expose:

**The Coverage Map** — A visual representation of what areas of research have dense findings vs. sparse findings vs. none. Think of it as a grid where rows are setup types and columns are sessions or conditions. Dense cells = well-researched. Sparse cells = candidate for investigation. Empty cells = untested. This is the closest thing to a research agenda the platform can generate from real data, and it requires no inference — just counting.

**The Contradiction Surface** — A dedicated view that shows finding pairs flagged as contradictory. These are not problems to be resolved by the platform — they are the most important research items you have, because each one points at a hidden variable. This surface should be a first-class destination, not a footnote.

**The Timeline View** — How has the understanding of a given edge evolved over time? Show findings in chronological order, with status changes, linked runs, and evidence weight. After 6 months of research, a researcher should be able to look at this view and see a genuine arc of understanding — from observation to hypothesis to confirmation.

**What Insights should never become:**

It should never auto-summarize findings using language models. Not because LLMs are bad, but because auto-summaries create passive readers. A researcher who reads a generated summary is not doing research — they are consuming someone else's interpretation of their own data. The value of reviewing findings is the thinking that happens during the review. Automating it away is automating away the work.

It should never include performance tracking or P&L context. That's a different system, with different incentives, and mixing research quality with performance metrics corrupts both.

It should never become a social feed, a notification center, or a dashboard of vanity metrics. The platform's authority comes from being a serious research environment.

---

## 6. Edge Explorer — Future Vision

**Current state:** Trades display, summary metrics, save findings. Functional. Not yet a research workflow.

The fundamental problem with Edge Explorer in its current form is that it answers "what is the edge?" but not "is this edge real?" and not "where does this edge break down?" Showing trades and summary stats is the first 20% of edge discovery. The researcher still has to do the other 80% manually.

**The one upgrade that changes everything:** Sub-segmentation with one click. A researcher viewing an edge should be able to break it by any available dimension — session, day of week, month, entry time bucket — and immediately see whether the edge holds across segments or concentrates in one. This is edge validation, not edge discovery, and right now it requires running an entirely new backtest to achieve. That friction kills the discovery loop.

**What else is genuinely missing:**

A *baseline comparison* embedded directly in the view. Not a separate Compare tab — a persistent reference point. "This edge shows X% win rate. The baseline for this run is Y%." Without that anchor, every metric is orphaned.

An *exploration state save*. If a researcher is breaking down an edge at 11pm and needs to stop, the next morning they are starting from scratch. The ability to save an exploration state — filters applied, segment selected, notes in progress — would eliminate enormous amounts of repeated work.

A *path to hypothesis*. After exploring an edge, there should be a one-click path to "Create hypothesis from this exploration." The exploration data pre-fills the hypothesis statement and links the run. Currently, the researcher must mentally translate the exploration into a written finding. That translation step loses nuance.

**What to avoid adding:**

More charts. More metrics. More tab panels. The power of Edge Explorer is focus — trades and the shape of the edge. Every new chart dilutes the signal. The upgrade path should be depth on the existing view, not breadth.

---

## 7. Research Operating System — Vision

Imagine a trader who has used the platform seriously for two years. This is what their workflow looks like.

**Daily**

They open the platform and see the Research Pulse — a compact surface that shows: open questions from active projects, findings saved in the last 7 days, and any pattern frequency alerts ("You've saved 5 findings mentioning X with no confirmed status"). This takes 60 seconds to review. They already know what to work on.

They run one or two targeted tests, both connected to a formal hypothesis in an active project. After reviewing results in Run Workspace, they save 1-2 findings with validation status applied. The system notes that the hypothesis now has 3 pieces of supporting evidence and surfaces a suggestion: "One open question from this hypothesis remains untested."

**Weekly**

They spend 30 minutes in Insights reviewing the week's findings as a group. They look at the contradiction surface to see if anything new appeared. They update hypothesis statuses based on accumulated evidence. They check the Coverage Map to see if any areas have been neglected. They identify 1-2 research directions for the following week based on frequency patterns and open questions, not intuition.

**Monthly**

A full research review. Projects are evaluated: which hypotheses were resolved, which remain open, which were refuted and can be closed. The research trail for the last 30 days is visible — each finding links to what prompted it and what it generated. The researcher can see whether they've been testing new hypotheses or circling the same ones. They can see which of their original beliefs turned out to be wrong. This review produces a clean set of priorities for the next month.

**What each system contributes:**

Runs are the atomic unit of work — they generate raw evidence. They should remain exactly what they are: fast to launch, structured in their output, and linked to hypotheses.

Findings are the atomic unit of knowledge. Their value is entirely dependent on having validation status and hypothesis linkage. Without those, they're notes. With them, they're evidence.

Projects are research programs, not folders. A project has a stated goal, a set of hypotheses, a list of open questions, and a research trail. When a project is "done," it should be possible to write a one-paragraph summary of what was learned.

Insights is the platform's long-term memory. It's where research across projects becomes structural knowledge. It is where edges get confirmed, contradictions get surfaced, and research gaps become visible.

Edge Explorer is the microscope. It's where you zoom in on a specific edge and try to understand its shape, its conditions, and its limits. It should feel surgical.

---

## 8. Top 10 Roadmap — Ranked by Value / Complexity

**#1 — Validation Status on Findings**
Four states: Untested / Tested / Confirmed / Refuted. Filterable, visible in all findings views. Transforms the findings list from a journal into a knowledge base. Maximum leverage, minimum complexity. Build this week.

**#2 — Open Questions as First-Class Objects**
Attachable to Projects and Findings. A simple text field with a resolved/open status and an optional link to the finding that answered it. The list of open questions on a project is the most honest research status report possible. Very low complexity.

**#3 — Research Pulse (Investigation Suggestions)**
A compact panel — on the Project page or a dedicated surface — that shows: open questions, untested observations count, and tag frequency patterns ("BOS mentioned in 7 findings with no Confirmed status"). No AI. Pure aggregation. Each suggestion cites the specific findings that generated it. This is the "What should I investigate next?" answer, and it costs almost nothing to generate.

**#4 — Hypothesis Objects**
Claim + project link + status + linked findings as evidence. The claim is freeform text. Evidence is a multi-select from existing findings. Status is: Unvalidated / Supported / Refuted / Contradicted. Medium complexity. Extremely high value — this gives findings a purpose and makes research goals explicit.

**#5 — Contradictory Finding Detection**
Rule-based: same primary tags, incompatible noted conclusions. Surfaced as a "Contradictions" view in Insights. Not automatically resolved — just surfaced for the researcher to investigate. The value is not in the resolution but in the visibility.

**#6 — Research Trail Linking**
On a finding, the ability to mark "This was prompted by finding [X]" and "This led me to run [Y]." Single-hop. Builds the linear chain of an investigation over time. Combined with hypothesis objects, this makes a project's research narrative visible without any auto-generation.

**#7 — Coverage Map in Insights**
A grid or matrix view showing research density by setup type × condition (session, direction, etc.). Dense = studied. Empty = untested. This is the most honest "what should I work on" answer the platform can generate, and it requires only counting existing findings. Medium complexity.

**#8 — Edge Explorer Sub-Segmentation**
Break trades by session, day of week, time bucket, direction — in-place, without a new backtest run. This collapses a multi-day investigation loop into minutes. The delta in research velocity is significant.

**#9 — Project Research Narrative**
A freeform but structured summary field on each Project: stated goal, current status, key conclusions, open questions. Editable at any time. This is the equivalent of a research lab notebook for the project. Low complexity, very high value for periodic reviews and for returning to old projects after months away.

**#10 — Sweep Completion Tracking**
If a sweep plan exists, track which parameter combinations have been run vs. remain untested. Show this as a completion indicator on the Project. Prevents duplicate work and makes planned research visible as a progress artifact.

---

## 9. Things to Not Build

**AI-generated finding summaries.** The value of reviewing your findings is the cognition that happens during the review. An auto-generated summary is an answer to a question you didn't ask, generated from observations you made yourself. It adds a layer of interpretation between you and your own data. If the summary is correct, you didn't need it. If it's wrong, it's actively harmful. Do not build this.

**Numeric confidence scores.** Any system that assigns a number to research confidence will be gamed by the researcher's own optimism bias. A finding with 4 supporting runs will feel like 85% confidence. That number will suppress future testing. Use status categories — they are honest about what they are.

**Automated pattern detection via machine learning.** The dataset is almost certainly too small and too autocorrelated for ML-based pattern detection to produce useful signal. The false positive rate will be high, and a researcher who acts on a false-positive pattern recommendation can lose months of work. Stick to frequency counting and tag co-occurrence. Those are honest because they only claim to report what you already observed.

**Performance dashboards inside the research platform.** Linking P&L or live performance metrics to research findings creates a feedback loop that corrupts research quality. A researcher who sees that their confirmed edge is underperforming live will unconsciously begin finding reasons to refute it. The research platform should deal in evidence and logic, not outcomes. Keep performance tracking in a separate system.

**Full experiment lineage graphs.** Visually compelling, practically abandoned after week one. A graph that requires manual maintenance always decays. The research trail approach — single-hop links between findings — gives 80% of the value with none of the maintenance cost.

**Bayesian probability updates on hypotheses.** In financial market research, most findings are drawn from correlated, non-stationary time series with sample sizes that a statistician would reject. Assigning Bayesian probability updates to these findings creates the appearance of rigor without the substance. A hypothesis with 6 findings updated to "72% confidence" is not science. It is false precision attached to real uncertainty. Don't build it.

**More analytics views or metrics pages.** The platform already surfaces more information than most researchers can process. Adding more analysis surfaces does not improve research quality — it diffuses attention. Every new page added to the platform raises the cognitive cost of navigating it. The next phase of the platform should consolidate and connect, not expand.

**Social or collaboration features.** This is a solo research instrument. Adding sharing, comments, or multi-user workflows changes the fundamental nature of the tool and introduces incentive misalignments (researchers optimize for what looks good to others rather than what is true). Stay single-player.

**Notification systems or research reminders.** A researcher who needs reminders to follow up on their own hypotheses has a workflow problem, not an information problem. Notifications create urgency where the platform should create clarity. The Research Pulse should be a pull surface, not a push surface.

---

## 10. Final Recommendation

The platform is one layer away from being genuinely excellent.

Everything above that layer — the analytics, the comparison tools, the edge exploration — already works. The missing layer is *structure*. Right now, the platform stores what you found. It doesn't store what you believed, what you've confirmed, what you've refuted, or what you still need to answer. That gap is why a researcher with 200 findings still has to think manually about what to do next.

The order of operations is clear:

**Phase 1 — Knowledge structure (now):** Validation status on findings. Open questions on projects. These two changes alone make the existing platform substantially more powerful by making the quality and completeness of research visible.

**Phase 2 — Forward direction (next):** Hypothesis objects linked to findings. Research Pulse showing frequency patterns and untested observations. These changes give the platform a forward-facing voice. Instead of being a place you go to look at what happened, it becomes a place that helps you decide what to do.

**Phase 3 — Long-term memory (later):** Coverage map in Insights. Contradiction surfacing. Research trails. These are the features that make two years of work compound rather than just accumulate. They are not urgent, but they are the difference between a research tool and a research operating system.

Build Phase 1 first. It is trivially small in implementation terms and disproportionately large in impact. A researcher who can filter findings by validation status and see a list of open questions on their active project will immediately research better — not because the tool got smarter, but because it made the structure of their own research visible.

The final measure of success is this: a researcher should be able to open the platform on any given morning, spend 60 seconds reviewing a Research Pulse, and know exactly what to test next — with full traceability to the specific findings that generated that suggestion. That experience is achievable with deterministic logic, a handful of new data fields, and thoughtful placement on existing pages. It does not require AI. It requires clarity about what the platform is for.

---

*This document represents a conceptual audit as of June 2026. Implementation priorities should be revisited quarterly as research workflow evolves.*
