// PortfolioBar — PORTFOLIO-SAVE-LOAD (MVP).
//
// Header control for the Session Portfolio panel: a portfolio selector (with an
// unsaved-changes dot), Save, and a Manager modal (Create / Duplicate / Rename /
// Delete / descriptions). Loads are dirty-guarded. The working copy is
// state.sessionProfiles; this component never mutates profiles directly — it only
// calls the store's portfolio actions.

import React, { useState } from "react";
import { ChevronDown, Plus, Copy, Pencil, Trash2, FolderOpen, Save as SaveIcon, Check, X } from "lucide-react";
import {
    useDataset, listPortfolios, getLoadedPortfolio, isWorkingCopyDirty,
    loadPortfolio, savePortfolio, savePortfolioAs, createPortfolio, revertPortfolio,
    duplicatePortfolio, renamePortfolio, setPortfolioDescription, deletePortfolio,
} from "@/data/store";
import { summarizePortfolio } from "@/data/portfolioLibrary";
import {
    DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
    DropdownMenuLabel, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
    Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
    AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle,
    AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";

const btn = "clip-bevel-sm px-2.5 py-1 text-[11px] font-ui border border-[hsl(var(--border-mid))] text-[hsl(var(--text-1))] hover:border-[hsl(var(--accent-secondary))] transition-colors inline-flex items-center gap-1.5 disabled:opacity-40 disabled:pointer-events-none";

function summaryText(profiles) {
    const s = summarizePortfolio(profiles);
    const bits = [];
    if (s.customStrategies) bits.push(`${s.customStrategies} custom`);
    if (s.disabledCohorts) bits.push(`${s.disabledCohorts} disabled`);
    if (s.targetOverrides) bits.push(`${s.targetOverrides} target`);
    return bits.length ? bits.join(" · ") : "No exceptions";
}

export default function PortfolioBar() {
    useDataset(); // re-render on store notify
    const portfolios = listPortfolios();
    const loaded = getLoadedPortfolio();
    const dirty = isWorkingCopyDirty();

    const [managerOpen, setManagerOpen] = useState(false);
    const [saveAs, setSaveAs] = useState({ open: false, name: "", desc: "" });
    const [guard, setGuard] = useState({ open: false, targetId: null });
    const [rename, setRename] = useState({ id: null, name: "" });

    const doLoad = (id) => {
        if (id === loaded?.id) return;
        if (dirty) { setGuard({ open: true, targetId: id }); return; }
        loadPortfolio(id);
    };
    const confirmDiscardAndLoad = () => { const id = guard.targetId; setGuard({ open: false, targetId: null }); if (id) loadPortfolio(id); };
    const confirmSaveAndLoad = () => { const id = guard.targetId; setGuard({ open: false, targetId: null }); if (loaded) savePortfolio(); if (id) loadPortfolio(id); };

    const openSaveAs = () => setSaveAs({ open: true, name: loaded ? `${loaded.name} (copy)` : "New Portfolio", desc: "" });
    const commitSaveAs = () => {
        const name = saveAs.name.trim();
        if (!name) return;
        savePortfolioAs(name, saveAs.desc.trim());
        setSaveAs({ open: false, name: "", desc: "" });
    };

    const handleSave = () => { if (loaded) savePortfolio(); else openSaveAs(); };

    return (
        <div className="flex items-center gap-2">
            {/* Selector */}
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <button className={btn} data-testid="portfolio-selector">
                        <FolderOpen size={13} className="text-[hsl(var(--accent-secondary))]" />
                        <span className="max-w-[160px] truncate">{loaded ? loaded.name : "Untitled"}</span>
                        {dirty && <span title="Unsaved changes" className="w-1.5 h-1.5 rounded-full bg-[hsl(var(--accent-primary))]" />}
                        <ChevronDown size={14} className="text-[hsl(var(--accent-secondary))]" />
                    </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="min-w-[220px]">
                    <DropdownMenuLabel>Portfolios</DropdownMenuLabel>
                    {portfolios.length === 0 && <DropdownMenuItem disabled>No saved portfolios</DropdownMenuItem>}
                    {portfolios.map((p) => (
                        <DropdownMenuItem key={p.id} onSelect={() => doLoad(p.id)} className="flex items-center justify-between gap-3">
                            <span className="truncate">{p.name}</span>
                            {p.id === loaded?.id && <Check size={13} className="text-[hsl(var(--accent-primary))] shrink-0" />}
                        </DropdownMenuItem>
                    ))}
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onSelect={handleSave} disabled={!!loaded && !dirty}>Save{loaded ? "" : " As…"}</DropdownMenuItem>
                    <DropdownMenuItem onSelect={openSaveAs}>Save As…</DropdownMenuItem>
                    {loaded && dirty && <DropdownMenuItem onSelect={() => revertPortfolio()}>Revert changes</DropdownMenuItem>}
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onSelect={() => setManagerOpen(true)}>Manage…</DropdownMenuItem>
                </DropdownMenuContent>
            </DropdownMenu>

            <button className={btn} onClick={handleSave} disabled={!!loaded && !dirty} data-testid="portfolio-save">
                <SaveIcon size={13} />Save
            </button>

            {/* Save As dialog */}
            <Dialog open={saveAs.open} onOpenChange={(o) => setSaveAs((s) => ({ ...s, open: o }))}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Save portfolio as</DialogTitle>
                        <DialogDescription>Saves the current working copy as a new named portfolio.</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-3 py-1">
                        <Input autoFocus placeholder="Portfolio name" value={saveAs.name} onChange={(e) => setSaveAs((s) => ({ ...s, name: e.target.value }))} />
                        <Textarea placeholder="Description (optional)" value={saveAs.desc} onChange={(e) => setSaveAs((s) => ({ ...s, desc: e.target.value }))} />
                    </div>
                    <DialogFooter>
                        <Button variant="ghost" onClick={() => setSaveAs({ open: false, name: "", desc: "" })}>Cancel</Button>
                        <Button onClick={commitSaveAs} disabled={!saveAs.name.trim()}>Save</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Dirty guard */}
            <AlertDialog open={guard.open} onOpenChange={(o) => setGuard((g) => ({ ...g, open: o }))}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Unsaved changes</AlertDialogTitle>
                        <AlertDialogDescription>
                            The current portfolio has unsaved changes. Loading another will discard them unless you save first.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        {loaded && <Button variant="outline" onClick={confirmSaveAndLoad}>Save &amp; switch</Button>}
                        <AlertDialogAction onClick={confirmDiscardAndLoad}>Discard &amp; switch</AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            {/* Manager */}
            <PortfolioManager
                open={managerOpen}
                onOpenChange={setManagerOpen}
                portfolios={portfolios}
                loadedId={loaded?.id || null}
                onLoad={doLoad}
                rename={rename}
                setRename={setRename}
            />
        </div>
    );
}

function PortfolioManager({ open, onOpenChange, portfolios, loadedId, onLoad, rename, setRename }) {
    const [confirmDelete, setConfirmDelete] = useState({ open: false, id: null, name: "" });

    const commitRename = () => {
        const name = rename.name.trim();
        if (rename.id && name) renamePortfolio(rename.id, name);
        setRename({ id: null, name: "" });
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-2xl">
                <DialogHeader>
                    <DialogTitle>Portfolio Library</DialogTitle>
                    <DialogDescription>Saved snapshots of your session portfolio. Editing always happens on a working copy.</DialogDescription>
                </DialogHeader>

                <div className="flex justify-end">
                    <button className={btn} onClick={() => createPortfolio("New Portfolio")} data-testid="portfolio-new"><Plus size={13} />New portfolio</button>
                </div>

                <div className="max-h-[50vh] overflow-y-auto divide-y divide-[hsl(var(--border-soft))]">
                    {portfolios.length === 0 && <div className="py-6 text-center text-[12px] text-muted-lab">No portfolios yet.</div>}
                    {portfolios.map((p) => (
                        <div key={p.id} className="py-3 flex items-start justify-between gap-3">
                            <div className="min-w-0 flex-1">
                                {rename.id === p.id ? (
                                    <div className="flex items-center gap-2">
                                        <Input autoFocus value={rename.name} onChange={(e) => setRename({ id: p.id, name: e.target.value })}
                                            onKeyDown={(e) => { if (e.key === "Enter") commitRename(); if (e.key === "Escape") setRename({ id: null, name: "" }); }} />
                                        <button className={btn} onClick={commitRename}><Check size={13} /></button>
                                        <button className={btn} onClick={() => setRename({ id: null, name: "" })}><X size={13} /></button>
                                    </div>
                                ) : (
                                    <div className="flex items-center gap-2">
                                        <span className="text-[13px] font-ui font-semibold text-[hsl(var(--text-1))] truncate">{p.name}</span>
                                        {p.id === loadedId && <span className="clip-bevel-sm px-1.5 py-0.5 text-[9.5px] font-ui uppercase border border-[hsl(var(--accent-primary)/0.5)] text-[hsl(var(--accent-primary))]">Loaded</span>}
                                    </div>
                                )}
                                <div className="mt-1">
                                    <Input
                                        className="h-7 text-[11.5px]"
                                        placeholder="Add a description…"
                                        defaultValue={p.description}
                                        onBlur={(e) => { if (e.target.value !== p.description) setPortfolioDescription(p.id, e.target.value); }}
                                    />
                                </div>
                                <div className="mt-1 text-[10.5px] font-ui text-muted-lab">{summaryText(p.profiles)} · updated {new Date(p.updatedAt).toLocaleDateString()}</div>
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0">
                                <button className={btn} title="Load" onClick={() => onLoad(p.id)}><FolderOpen size={13} /></button>
                                <button className={btn} title="Rename" onClick={() => setRename({ id: p.id, name: p.name })}><Pencil size={13} /></button>
                                <button className={btn} title="Duplicate" onClick={() => duplicatePortfolio(p.id)}><Copy size={13} /></button>
                                <button className={btn} title="Delete" onClick={() => setConfirmDelete({ open: true, id: p.id, name: p.name })}><Trash2 size={13} /></button>
                            </div>
                        </div>
                    ))}
                </div>

                <AlertDialog open={confirmDelete.open} onOpenChange={(o) => setConfirmDelete((c) => ({ ...c, open: o }))}>
                    <AlertDialogContent>
                        <AlertDialogHeader>
                            <AlertDialogTitle>Delete “{confirmDelete.name}”?</AlertDialogTitle>
                            <AlertDialogDescription>This removes the saved snapshot. Your current working copy is not affected.</AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction onClick={() => { if (confirmDelete.id) deletePortfolio(confirmDelete.id); setConfirmDelete({ open: false, id: null, name: "" }); }}>Delete</AlertDialogAction>
                        </AlertDialogFooter>
                    </AlertDialogContent>
                </AlertDialog>
            </DialogContent>
        </Dialog>
    );
}
