import React, { useState, useMemo, useCallback } from "react";
import { NeonPanel } from "@/components/lab/NeonPanel";
import { Pill }      from "@/components/lab/DataTable";
import { cn }        from "@/lib/utils";
import { PLANNED_ENTRY_MODES } from "../analytics/entryRegistry";
import { downloadCsv }         from "../analytics/entryAnalytics";

const STORAGE_KEY = "fxob_entry_hypotheses_v1";

const STATUS_META = {
    pending:   { label: "Pending",   tone: "default",    order: 0 },
    testing:   { label: "Testing",   tone: "warning",    order: 1 },
    promising: { label: "Promising", tone: "success",    order: 2 },
    rejected:  { label: "Rejected",  tone: "danger",     order: 3 },
    promoted:  { label: "Promoted",  tone: "secondary",  order: 4 },
};

const STATUS_ORDER = Object.keys(STATUS_META);

function genId() {
    return `hyp_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

function loadHypotheses() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        return raw ? JSON.parse(raw) : [];
    } catch { return []; }
}

function saveHypotheses(list) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(list)); } catch {}
}

// ─── Add / Edit Form ──────────────────────────────────────────────────────────

function HypothesisForm({ initial, onSave, onCancel }) {
    const [title,       setTitle]       = useState(initial?.title       || "");
    const [description, setDescription] = useState(initial?.description || "");
    const [rationale,   setRationale]   = useState(initial?.rationale   || "");
    const [linkedMode,  setLinkedMode]  = useState(initial?.linkedMode  || "");
    const [status,      setStatus]      = useState(initial?.status      || "pending");
    const [tags,        setTags]        = useState(initial?.tags?.join(", ") || "");

    function handleSubmit(e) {
        e.preventDefault();
        if (!title.trim()) return;
        onSave({
            id:          initial?.id || genId(),
            title:       title.trim(),
            description: description.trim(),
            rationale:   rationale.trim(),
            linkedMode:  linkedMode || null,
            status,
            tags:        tags.split(",").map(t => t.trim()).filter(Boolean),
            createdAt:   initial?.createdAt || new Date().toISOString(),
            updatedAt:   new Date().toISOString(),
        });
    }

    const inputCls = "w-full px-2.5 py-1.5 text-[10.5px] font-mono bg-[hsl(var(--panel-2)/0.6)] border border-[hsl(var(--border-soft)/0.8)] text-white placeholder:text-muted-lab focus:outline-none focus:border-[hsl(var(--accent-primary)/0.5)] rounded-[1px]";

    return (
        <form onSubmit={handleSubmit} className="space-y-2.5 p-3 border border-[hsl(var(--border-soft)/0.5)] bg-[hsl(var(--panel-2)/0.3)] rounded-[1px]">
            <div>
                <label className="block text-[9.5px] font-mono uppercase tracking-wider text-muted-lab mb-1">Hypothesis Title *</label>
                <input className={inputCls} placeholder="e.g. Reducing penetration threshold to 15% improves fill quality" value={title} onChange={e => setTitle(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-2">
                <div>
                    <label className="block text-[9.5px] font-mono uppercase tracking-wider text-muted-lab mb-1">Status</label>
                    <select className={inputCls} value={status} onChange={e => setStatus(e.target.value)}>
                        {STATUS_ORDER.map(s => <option key={s} value={s}>{STATUS_META[s].label}</option>)}
                    </select>
                </div>
                <div>
                    <label className="block text-[9.5px] font-mono uppercase tracking-wider text-muted-lab mb-1">Linked Model</label>
                    <select className={inputCls} value={linkedMode} onChange={e => setLinkedMode(e.target.value)}>
                        <option value="">None</option>
                        {PLANNED_ENTRY_MODES.map(m => <option key={m.mode} value={m.mode}>{m.label}</option>)}
                    </select>
                </div>
            </div>
            <div>
                <label className="block text-[9.5px] font-mono uppercase tracking-wider text-muted-lab mb-1">Description</label>
                <textarea className={cn(inputCls, "resize-y min-h-[56px]")} placeholder="What are you testing? What data supports this?" value={description} onChange={e => setDescription(e.target.value)} rows={3} />
            </div>
            <div>
                <label className="block text-[9.5px] font-mono uppercase tracking-wider text-muted-lab mb-1">Rationale / Expected Outcome</label>
                <textarea className={cn(inputCls, "resize-y min-h-[40px]")} placeholder="Why do you expect this to work?" value={rationale} onChange={e => setRationale(e.target.value)} rows={2} />
            </div>
            <div>
                <label className="block text-[9.5px] font-mono uppercase tracking-wider text-muted-lab mb-1">Tags (comma-separated)</label>
                <input className={inputCls} placeholder="penetration, session, asia, reclaim" value={tags} onChange={e => setTags(e.target.value)} />
            </div>
            <div className="flex items-center gap-2 pt-1">
                <button type="submit"
                    className="px-3 py-1.5 text-[10px] font-mono uppercase tracking-wider border border-[hsl(var(--accent-primary)/0.5)] bg-[hsl(var(--accent-primary)/0.12)] text-white hover:bg-[hsl(var(--accent-primary)/0.2)] transition-colors rounded-[1px]"
                >
                    {initial ? "Update" : "Add Hypothesis"}
                </button>
                <button type="button" onClick={onCancel}
                    className="px-3 py-1.5 text-[10px] font-mono uppercase tracking-wider border border-[hsl(var(--border-soft)/0.5)] text-muted-lab hover:text-white transition-colors rounded-[1px]"
                >
                    Cancel
                </button>
            </div>
        </form>
    );
}

// ─── Hypothesis Card ──────────────────────────────────────────────────────────

function HypothesisCard({ hyp, onEdit, onDelete, onStatusChange }) {
    const [expanded, setExpanded] = useState(false);
    const sm = STATUS_META[hyp.status] || STATUS_META.pending;
    const model = PLANNED_ENTRY_MODES.find(m => m.mode === hyp.linkedMode);

    return (
        <div className={cn(
            "border rounded-[1px] bg-[hsl(var(--panel-2)/0.25)] transition-colors",
            expanded ? "border-[hsl(var(--border-mid))]" : "border-[hsl(var(--border-soft)/0.5)] hover:border-[hsl(var(--border-soft))]"
        )}>
            {/* Header row */}
            <div className="flex items-center gap-2 px-3 py-2 cursor-pointer" onClick={() => setExpanded(e => !e)}>
                <Pill tone={sm.tone}>{sm.label.toUpperCase()}</Pill>
                <span className="flex-1 text-[10.5px] font-mono text-white leading-snug">{hyp.title}</span>
                {model && <span className="text-[9px] font-mono text-muted-lab shrink-0">{model.label}</span>}
                {hyp.tags?.length > 0 && (
                    <div className="hidden md:flex gap-1">
                        {hyp.tags.slice(0, 3).map(t => (
                            <span key={t} className="px-1 py-0.5 text-[8px] font-mono border border-[hsl(var(--border-soft)/0.5)] text-muted-lab rounded-[1px]">{t}</span>
                        ))}
                    </div>
                )}
                <span className="text-[9px] font-mono text-muted-lab shrink-0">{hyp.createdAt?.slice(0, 10)}</span>
                <span className="text-[9px] font-mono text-muted-lab ml-1">{expanded ? "▲" : "▼"}</span>
            </div>

            {/* Expanded detail */}
            {expanded && (
                <div className="px-3 pb-3 pt-1 border-t border-[hsl(var(--border-soft)/0.3)] space-y-2">
                    {hyp.description && (
                        <p className="text-[10px] font-mono text-[hsl(var(--text-2))] leading-relaxed">{hyp.description}</p>
                    )}
                    {hyp.rationale && (
                        <div>
                            <span className="text-[9px] font-mono uppercase tracking-wider text-muted-lab">Expected outcome: </span>
                            <span className="text-[10px] font-mono text-[hsl(var(--text-2))]">{hyp.rationale}</span>
                        </div>
                    )}
                    {hyp.updatedAt && hyp.updatedAt !== hyp.createdAt && (
                        <div className="text-[9px] font-mono text-muted-lab">Updated {hyp.updatedAt?.slice(0, 10)}</div>
                    )}

                    {/* Status transitions */}
                    <div className="flex flex-wrap items-center gap-1.5 pt-1">
                        <span className="text-[9px] font-mono text-muted-lab uppercase tracking-wider">Move to:</span>
                        {STATUS_ORDER.filter(s => s !== hyp.status).map(s => (
                            <button key={s} type="button"
                                onClick={() => onStatusChange(hyp.id, s)}
                                className="px-2 py-0.5 text-[9px] font-mono border border-[hsl(var(--border-soft)/0.5)] text-muted-lab hover:text-white hover:border-[hsl(var(--border-mid))] transition-colors rounded-[1px]"
                            >
                                {STATUS_META[s].label}
                            </button>
                        ))}
                        <span className="ml-auto flex gap-1.5">
                            <button type="button" onClick={() => onEdit(hyp)}
                                className="text-[9.5px] font-mono text-muted-lab hover:text-white transition-colors"
                            >edit</button>
                            <button type="button" onClick={() => onDelete(hyp.id)}
                                className="text-[9.5px] font-mono text-[hsl(var(--danger)/0.6)] hover:text-[hsl(var(--danger))] transition-colors"
                            >delete</button>
                        </span>
                    </div>
                </div>
            )}
        </div>
    );
}

// ─── Main Tab ──────────────────────────────────────────────────────────────────

export function EntryHypothesisLab() {
    const [hypotheses, setHypotheses] = useState(() => loadHypotheses());
    const [showForm,   setShowForm]   = useState(false);
    const [editing,    setEditing]    = useState(null);
    const [filterStatus, setFilterStatus] = useState("all");
    const [search,       setSearch]       = useState("");

    function persist(list) {
        setHypotheses(list);
        saveHypotheses(list);
    }

    const handleSave = useCallback((hyp) => {
        persist(hypotheses.some(h => h.id === hyp.id)
            ? hypotheses.map(h => h.id === hyp.id ? hyp : h)
            : [hyp, ...hypotheses]
        );
        setShowForm(false);
        setEditing(null);
    }, [hypotheses]);

    const handleDelete = useCallback((id) => {
        if (!window.confirm("Delete this hypothesis?")) return;
        persist(hypotheses.filter(h => h.id !== id));
    }, [hypotheses]);

    const handleStatusChange = useCallback((id, status) => {
        persist(hypotheses.map(h => h.id === id ? { ...h, status, updatedAt: new Date().toISOString() } : h));
    }, [hypotheses]);

    const handleEdit = useCallback((hyp) => {
        setEditing(hyp);
        setShowForm(true);
    }, []);

    function handleExport() {
        const header = "id,title,status,linkedMode,tags,description,rationale,createdAt,updatedAt";
        const rows = hypotheses.map(h => [
            h.id, `"${(h.title || "").replace(/"/g, '""')}"`,
            h.status, h.linkedMode || "",
            `"${(h.tags || []).join("; ")}"`,
            `"${(h.description || "").replace(/"/g, '""')}"`,
            `"${(h.rationale   || "").replace(/"/g, '""')}"`,
            h.createdAt || "", h.updatedAt || "",
        ].join(","));
        downloadCsv("entry_hypotheses.csv", [header, ...rows].join("\n"));
    }

    const filtered = useMemo(() => {
        let list = hypotheses;
        if (filterStatus !== "all") list = list.filter(h => h.status === filterStatus);
        if (search.trim()) {
            const q = search.toLowerCase();
            list = list.filter(h =>
                h.title?.toLowerCase().includes(q) ||
                h.description?.toLowerCase().includes(q) ||
                h.tags?.some(t => t.toLowerCase().includes(q))
            );
        }
        return list.slice().sort((a, b) => (STATUS_META[a.status]?.order || 0) - (STATUS_META[b.status]?.order || 0) || (b.createdAt || "").localeCompare(a.createdAt || ""));
    }, [hypotheses, filterStatus, search]);

    const counts = useMemo(() => {
        const c = { all: hypotheses.length };
        STATUS_ORDER.forEach(s => { c[s] = hypotheses.filter(h => h.status === s).length; });
        return c;
    }, [hypotheses]);

    return (
        <div className="space-y-4">
            <NeonPanel title="Entry Hypothesis Journal" className="xl:col-span-3"
                action={
                    <div className="flex gap-1.5">
                        <Pill tone="secondary">{hypotheses.length} TOTAL</Pill>
                        {counts.testing   > 0 && <Pill tone="warning">{counts.testing} TESTING</Pill>}
                        {counts.promising > 0 && <Pill tone="success">{counts.promising} PROMISING</Pill>}
                    </div>
                }
            >
                <p className="mb-3 text-[10px] font-mono text-muted-lab">
                    Track entry-specific hypotheses through their lifecycle. Link to a model, tag for discovery, and progress through stages as evidence accumulates.
                </p>

                {/* Toolbar */}
                <div className="flex flex-wrap items-center gap-2 mb-3">
                    {/* Status filter */}
                    {[["all", "All"], ...STATUS_ORDER.map(s => [s, STATUS_META[s].label])].map(([k, l]) => (
                        <button key={k} type="button"
                            onClick={() => setFilterStatus(k)}
                            className={cn(
                                "px-2 py-1 text-[9.5px] font-mono uppercase tracking-wider border rounded-[1px] transition-colors",
                                filterStatus === k
                                    ? "border-[hsl(var(--accent-primary)/0.5)] bg-[hsl(var(--accent-primary)/0.1)] text-white"
                                    : "border-[hsl(var(--border-soft)/0.4)] text-muted-lab hover:text-white"
                            )}
                        >
                            {l} ({counts[k] ?? 0})
                        </button>
                    ))}

                    {/* Search */}
                    <input
                        className="ml-auto px-2.5 py-1 text-[10px] font-mono bg-[hsl(var(--panel-2)/0.5)] border border-[hsl(var(--border-soft)/0.6)] text-white placeholder:text-muted-lab focus:outline-none focus:border-[hsl(var(--accent-primary)/0.4)] rounded-[1px] w-40"
                        placeholder="search…"
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                    />

                    {/* Actions */}
                    <button type="button" onClick={handleExport}
                        className="px-2.5 py-1 text-[9.5px] font-mono uppercase tracking-wider border border-[hsl(var(--border-soft)/0.5)] text-muted-lab hover:text-white transition-colors rounded-[1px]"
                    >
                        Export CSV
                    </button>
                    <button type="button"
                        onClick={() => { setEditing(null); setShowForm(s => !s); }}
                        className="px-2.5 py-1 text-[9.5px] font-mono uppercase tracking-wider border border-[hsl(var(--accent-primary)/0.5)] bg-[hsl(var(--accent-primary)/0.1)] text-white hover:bg-[hsl(var(--accent-primary)/0.2)] transition-colors rounded-[1px]"
                    >
                        + New Hypothesis
                    </button>
                </div>

                {/* Add / Edit form */}
                {showForm && (
                    <HypothesisForm
                        initial={editing}
                        onSave={handleSave}
                        onCancel={() => { setShowForm(false); setEditing(null); }}
                    />
                )}

                {/* Hypothesis list */}
                {filtered.length === 0 ? (
                    <div className="py-8 text-center text-[11px] font-mono text-muted-lab">
                        {hypotheses.length === 0
                            ? "No hypotheses yet. Add one to start tracking your entry research."
                            : "No hypotheses match the current filter."}
                    </div>
                ) : (
                    <div className="flex flex-col gap-1.5 mt-2">
                        {filtered.map(hyp => (
                            <HypothesisCard
                                key={hyp.id}
                                hyp={hyp}
                                onEdit={handleEdit}
                                onDelete={handleDelete}
                                onStatusChange={handleStatusChange}
                            />
                        ))}
                    </div>
                )}
            </NeonPanel>
        </div>
    );
}
