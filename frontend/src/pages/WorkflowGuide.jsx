import React from "react";
import {
    ArrowDown,
    ArrowRight,
    Beaker,
    CheckCircle2,
    Circle,
    FlaskConical,
    FolderKanban,
    GitCompareArrows,
    Lightbulb,
    Rocket,
    Search,
    ShieldCheck,
    Split,
    Target,
    Trophy,
    Wrench,
} from "lucide-react";

const bigPicture = [
    "Project",
    "Baseline Backtest",
    "Inspect Baseline",
    "Identify Weaknesses / Opportunities",
    "Run Targeted Experiments",
    "Compare Results",
    "Promote Best Candidate",
    "Validate",
    "Export Live Bot Config",
];

const experimentBranches = [
    {
        title: "Entry Experiments",
        icon: Target,
        items: ["Baseline entries", "Deeper OB entries", "Confirmation entries", "Penetration entry testing"],
    },
    {
        title: "Protection Experiments",
        icon: ShieldCheck,
        items: ["Full breach exits", "Penetration thresholds", "Close-confirmed exits", "Break-even concepts"],
    },
    {
        title: "Session Experiments",
        icon: Split,
        items: ["Session filters", "Origin session", "Detection session", "Fill session"],
    },
    {
        title: "Risk / Target Experiments",
        icon: Wrench,
        items: ["RR sweep", "Stop buffer changes", "Verify ticks"],
    },
    {
        title: "News Experiments",
        icon: Lightbulb,
        items: ["Blackout toggles", "Impact filters", "Currency filters"],
    },
];

const statusGroups = [
    {
        title: "Working",
        tone: "success",
        items: [
            "Projects",
            "Baseline runs",
            "Sidecar local runs",
            "Auto import",
            "RR sweep execution",
            "Protection sweep execution",
            "Candidate promotion",
            "Findings",
            "Timeline",
        ],
    },
    {
        title: "Partial",
        tone: "warning",
        items: ["Project workflow UX", "Overview / cockpit", "Comparison integration", "Project hierarchy"],
    },
    {
        title: "Planned",
        tone: "muted",
        items: ["Entry sweeps", "Session sweeps", "News sweeps", "Monte Carlo", "Final config export", "Live bot handoff"],
    },
];

const principles = [
    "Always isolate one variable when testing.",
    "Do not optimise multiple dimensions blindly.",
    "Baseline first. Experiments second.",
    "Promote evidence, not intuition.",
    "Avoid overfitting.",
];

export default function WorkflowGuide() {
    return (
        <div className="min-h-full px-4 py-5 md:px-6 lg:px-8 space-y-6">
            <header className="clip-bevel p-[1px] bg-gradient-to-br from-[hsl(var(--accent-primary)/0.65)] via-[hsl(var(--border-mid))] to-[hsl(var(--accent-secondary)/0.45)]">
                <div className="clip-bevel bg-[hsl(var(--panel)/0.96)] px-5 py-5 md:px-6 md:py-6">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                        <div>
                            <div className="inline-flex items-center gap-2 text-[10px] font-mono uppercase tracking-[0.22em] text-[hsl(var(--accent-secondary))]">
                                <Beaker className="w-3.5 h-3.5" />
                                Temporary Internal Page
                            </div>
                            <h1 className="mt-2 font-display text-2xl md:text-3xl text-[hsl(var(--text-1))]">
                                Research Workflow Blueprint
                            </h1>
                            <p className="mt-2 max-w-3xl text-sm text-[hsl(var(--text-2))]">
                                Temporary internal guide for the intended research process.
                            </p>
                        </div>
                        <div className="grid grid-cols-3 gap-2 text-center">
                            <MiniStat label="Flow" value="9 Steps" />
                            <MiniStat label="Sweeps" value="V1" />
                            <MiniStat label="Goal" value="Config" />
                        </div>
                    </div>
                </div>
            </header>

            <BlueprintPanel
                eyebrow="Section 1"
                title="Big Picture Flow"
                icon={Rocket}
            >
                <div className="grid gap-2 md:grid-cols-3 xl:flex xl:items-stretch">
                    {bigPicture.map((step, index) => (
                        <React.Fragment key={step}>
                            <FlowCard index={index + 1} label={step} />
                            {index < bigPicture.length - 1 && (
                                <div className="hidden xl:flex items-center justify-center text-[hsl(var(--accent-secondary))]">
                                    <ArrowRight className="w-4 h-4" />
                                </div>
                            )}
                        </React.Fragment>
                    ))}
                </div>
                <div className="mt-3 flex xl:hidden justify-center text-[hsl(var(--accent-secondary))]">
                    <ArrowDown className="w-4 h-4" />
                </div>
            </BlueprintPanel>

            <BlueprintPanel
                eyebrow="Section 2"
                title="Detailed Flow"
                icon={FolderKanban}
            >
                <div className="grid gap-4 lg:grid-cols-3">
                    <PhaseCard
                        phase="Phase 1"
                        title="Create Research Project"
                        copy="Create the container that holds the baseline, variants, sweep results, candidate, and final config."
                        examples={["EURUSD M15 Research", "GBPUSD London Session Research"]}
                        checklist={["Define symbol", "Define timeframe", "Create baseline research container"]}
                        action="Go to Projects"
                    />
                    <PhaseCard
                        phase="Phase 2"
                        title="Create Baseline Run"
                        copy="Run the clean baseline with no experimental changes."
                        checklist={["Baseline config", "Import completed run", "Assign to project", "Baseline metrics captured"]}
                    />
                    <PhaseCard
                        phase="Phase 3"
                        title="Inspect Baseline"
                        copy="Use the current analytics pages to locate where the baseline is fragile or promising."
                        tools={["Run Detail", "Strategy Map", "Trade Inspector", "Comparison Lab"]}
                        questions={[
                            "Where are losses concentrated?",
                            "Which sessions underperform?",
                            "Are OB breaches common?",
                            "Is RR too aggressive?",
                            "Is win rate acceptable?",
                            "Is drawdown acceptable?",
                        ]}
                    />
                </div>

                <div className="mt-5">
                    <SectionLabel icon={FlaskConical} title="Phase 4 · Targeted Experiments" />
                    <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
                        {experimentBranches.map((branch) => (
                            <BranchCard key={branch.title} {...branch} />
                        ))}
                    </div>
                </div>

                <div className="mt-5 grid gap-4 lg:grid-cols-[1.05fr_0.95fr]">
                    <div>
                        <SectionLabel icon={GitCompareArrows} title="Phase 5 · Sweep Flow" />
                        <div className="mt-3 grid gap-2">
                            {["Choose Source Run", "Create Sweep Plan", "Execute Sweep", "Auto-import Results", "Review Summary Table", "Compare Winners", "Promote Candidate"].map((step, index, arr) => (
                                <React.Fragment key={step}>
                                    <HorizontalStep index={index + 1} label={step} />
                                    {index < arr.length - 1 && <Connector />}
                                </React.Fragment>
                            ))}
                        </div>
                    </div>
                    <div className="grid gap-4">
                        <PhaseCard
                            phase="Phase 6"
                            title="Candidate Validation"
                            copy="Candidate runs should earn promotion through evidence, not a single attractive metric."
                            questions={["Is improvement robust?", "Better expectancy?", "Better DD?", "Enough trades?", "Overfit risk?"]}
                            tools={["Comparison Lab", "Monte Carlo (future)"]}
                        />
                        <PhaseCard
                            phase="Phase 7"
                            title="Final Production Config"
                            copy="Only export after validation and a clear paper trail from baseline to candidate."
                            checklist={["Validated", "Candidate promoted", "Config exported", "Ready for live bot"]}
                            action="Export Final Config"
                        />
                    </div>
                </div>
            </BlueprintPanel>

            <BlueprintPanel
                eyebrow="Section 3"
                title="Current Implementation Status"
                icon={CheckCircle2}
            >
                <div className="grid gap-4 lg:grid-cols-3">
                    {statusGroups.map((group) => (
                        <StatusBoard key={group.title} {...group} />
                    ))}
                </div>
            </BlueprintPanel>

            <BlueprintPanel
                eyebrow="Section 4"
                title="Principles"
                icon={Trophy}
            >
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
                    {principles.map((principle) => (
                        <div
                            key={principle}
                            className="clip-bevel-sm border border-[hsl(var(--border-soft))] bg-[hsl(var(--panel-2)/0.66)] px-4 py-3"
                        >
                            <div className="flex items-start gap-2">
                                <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-[hsl(var(--accent-primary))] shadow-[0_0_10px_hsl(var(--accent-primary))]" />
                                <p className="text-sm leading-relaxed text-[hsl(var(--text-1))]">{principle}</p>
                            </div>
                        </div>
                    ))}
                </div>
            </BlueprintPanel>
        </div>
    );
}

function BlueprintPanel({ eyebrow, title, icon: Icon, children }) {
    return (
        <section className="clip-bevel p-[1px] bg-[hsl(var(--border-soft))]">
            <div className="clip-bevel bg-[hsl(var(--panel)/0.94)] p-4 md:p-5">
                <div className="mb-4 flex items-center gap-3">
                    <div className="clip-bevel-sm border border-[hsl(var(--accent-primary)/0.45)] bg-[hsl(var(--accent-primary)/0.08)] p-2 text-[hsl(var(--accent-primary))]">
                        <Icon className="w-4 h-4" />
                    </div>
                    <div>
                        <div className="text-[9.5px] font-mono uppercase tracking-[0.24em] text-muted-lab">{eyebrow}</div>
                        <h2 className="font-display text-lg text-[hsl(var(--title))]">{title}</h2>
                    </div>
                </div>
                {children}
            </div>
        </section>
    );
}

function MiniStat({ label, value }) {
    return (
        <div className="min-w-[96px] clip-bevel-sm border border-[hsl(var(--border-soft))] bg-[hsl(var(--panel-2)/0.7)] px-3 py-2">
            <div className="text-[9px] font-mono uppercase tracking-[0.2em] text-muted-lab">{label}</div>
            <div className="mt-1 font-mono text-sm text-[hsl(var(--accent-secondary))]">{value}</div>
        </div>
    );
}

function FlowCard({ index, label }) {
    return (
        <div className="relative clip-bevel-sm border border-[hsl(var(--accent-primary)/0.28)] bg-[hsl(var(--panel-2)/0.72)] px-3 py-3 min-h-[88px] xl:flex-1">
            <div className="text-[9px] font-mono uppercase tracking-[0.2em] text-muted-lab">Step {String(index).padStart(2, "0")}</div>
            <div className="mt-2 text-sm font-semibold uppercase tracking-wide text-[hsl(var(--text-1))]">{label}</div>
        </div>
    );
}

function PhaseCard({ phase, title, copy, examples, checklist, tools, questions, action }) {
    return (
        <div className="clip-bevel-sm border border-[hsl(var(--border-soft))] bg-[hsl(var(--panel-2)/0.58)] p-4">
            <div className="text-[9.5px] font-mono uppercase tracking-[0.22em] text-[hsl(var(--accent-secondary))]">{phase}</div>
            <h3 className="mt-1 font-display text-base text-[hsl(var(--title))]">{title}</h3>
            {copy && <p className="mt-2 text-sm leading-relaxed text-[hsl(var(--text-2))]">{copy}</p>}
            {examples && <TagList label="Examples" items={examples} />}
            {checklist && <Checklist items={checklist} />}
            {tools && <TagList label="Tools" items={tools} />}
            {questions && <QuestionList items={questions} />}
            {action && (
                <button className="mt-4 inline-flex cursor-default items-center gap-2 clip-bevel-sm border border-[hsl(var(--accent-primary)/0.45)] bg-[hsl(var(--accent-primary)/0.08)] px-3 py-2 text-xs font-mono uppercase tracking-[0.14em] text-[hsl(var(--accent-primary))]">
                    {action}
                    <ArrowRight className="w-3.5 h-3.5" />
                </button>
            )}
        </div>
    );
}

function SectionLabel({ icon: Icon, title }) {
    return (
        <div className="flex items-center gap-2 text-[11px] font-mono uppercase tracking-[0.2em] text-[hsl(var(--accent-secondary))]">
            <Icon className="w-3.5 h-3.5" />
            {title}
        </div>
    );
}

function BranchCard({ title, icon: Icon, items }) {
    return (
        <div className="clip-bevel-sm border border-[hsl(var(--border-soft))] bg-[hsl(var(--bg-2)/0.44)] p-3">
            <div className="flex items-center gap-2">
                <Icon className="w-4 h-4 text-[hsl(var(--accent-primary))]" />
                <h3 className="text-sm font-semibold text-[hsl(var(--title))]">{title}</h3>
            </div>
            <ul className="mt-3 space-y-1.5">
                {items.map((item) => (
                    <li key={item} className="flex gap-2 text-xs text-[hsl(var(--text-2))]">
                        <Circle className="mt-1 h-2 w-2 shrink-0 text-[hsl(var(--accent-secondary))]" />
                        <span>{item}</span>
                    </li>
                ))}
            </ul>
        </div>
    );
}

function HorizontalStep({ index, label }) {
    return (
        <div className="flex items-center gap-3 clip-bevel-sm border border-[hsl(var(--border-soft))] bg-[hsl(var(--panel-2)/0.62)] px-3 py-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-full border border-[hsl(var(--accent-secondary)/0.5)] text-[10px] font-mono text-[hsl(var(--accent-secondary))]">
                {index}
            </span>
            <span className="text-sm text-[hsl(var(--text-1))]">{label}</span>
        </div>
    );
}

function Connector() {
    return (
        <div className="ml-3 h-4 border-l border-dashed border-[hsl(var(--accent-secondary)/0.45)]" />
    );
}

function StatusBoard({ title, tone, items }) {
    const toneClass = {
        success: "text-[hsl(var(--success))] border-[hsl(var(--success)/0.45)] bg-[hsl(var(--success)/0.06)]",
        warning: "text-[hsl(var(--warning))] border-[hsl(var(--warning)/0.45)] bg-[hsl(var(--warning)/0.06)]",
        muted: "text-[hsl(var(--text-2))] border-[hsl(var(--border-mid))] bg-[hsl(var(--panel-2)/0.45)]",
    }[tone];

    const marker = tone === "success" ? "✓" : tone === "warning" ? "~" : "○";

    return (
        <div className="clip-bevel-sm border border-[hsl(var(--border-soft))] bg-[hsl(var(--panel-2)/0.58)] p-4">
            <div className={`inline-flex clip-bevel-sm border px-2 py-1 text-[10px] font-mono uppercase tracking-[0.18em] ${toneClass}`}>
                {title}
            </div>
            <div className="mt-3 grid gap-2">
                {items.map((item) => (
                    <div key={item} className="flex items-center gap-2 text-sm text-[hsl(var(--text-2))]">
                        <span className={toneClass.split(" ")[0]}>{marker}</span>
                        <span>{item}</span>
                    </div>
                ))}
            </div>
        </div>
    );
}

function TagList({ label, items }) {
    return (
        <div className="mt-3">
            <div className="text-[9px] font-mono uppercase tracking-[0.2em] text-muted-lab">{label}</div>
            <div className="mt-2 flex flex-wrap gap-1.5">
                {items.map((item) => (
                    <span key={item} className="clip-bevel-sm border border-[hsl(var(--border-mid))] bg-[hsl(var(--bg-2)/0.42)] px-2 py-1 text-[11px] text-[hsl(var(--text-2))]">
                        {item}
                    </span>
                ))}
            </div>
        </div>
    );
}

function Checklist({ items }) {
    return (
        <ul className="mt-3 space-y-1.5">
            {items.map((item) => (
                <li key={item} className="flex gap-2 text-xs text-[hsl(var(--text-2))]">
                    <CheckCircle2 className="mt-[1px] h-3.5 w-3.5 shrink-0 text-[hsl(var(--success))]" />
                    <span>{item}</span>
                </li>
            ))}
        </ul>
    );
}

function QuestionList({ items }) {
    return (
        <div className="mt-3">
            <div className="flex items-center gap-1.5 text-[9px] font-mono uppercase tracking-[0.2em] text-muted-lab">
                <Search className="w-3 h-3" />
                Questions
            </div>
            <ul className="mt-2 space-y-1.5">
                {items.map((item) => (
                    <li key={item} className="text-xs leading-relaxed text-[hsl(var(--text-2))]">
                        {item}
                    </li>
                ))}
            </ul>
        </div>
    );
}
