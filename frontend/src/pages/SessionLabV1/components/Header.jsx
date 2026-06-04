import React from "react";
import { Settings, Download, Share2, BookmarkPlus, RotateCcw, FlaskConical, Calendar, Globe2 } from "lucide-react";

const SegmentedControl = ({ value, options, onChange, testId }) => (
  <div
    data-testid={testId}
    className="inline-flex items-center gap-1 rounded-lg border border-[hsl(var(--border-soft))] bg-[hsl(var(--panel-2))] p-1"
  >
    {options.map((o) => {
      const active = value === o.value;
      return (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          data-testid={`${testId}-${o.value}`}
          className={[
            "px-3 py-1.5 text-xs font-medium rounded-md transition-all",
            active
              ? "bg-[hsl(var(--accent-primary)/0.12)] text-[hsl(var(--accent-primary))] shadow-[inset_0_0_0_1px_rgba(34,211,238,0.4)]"
              : "text-[hsl(var(--text-2))] hover:text-[hsl(var(--text))]",
          ].join(" ")}
        >
          {o.label}
        </button>
      );
    })}
  </div>
);

const HeaderButton = ({ icon: Icon, label, onClick, primary, testId }) => (
  <button
    onClick={onClick}
    data-testid={testId}
    className={[
      "inline-flex items-center gap-2 rounded-lg px-3.5 py-2 text-xs font-medium border transition-all",
      primary
        ? "bg-[hsl(var(--accent-primary))] text-[#050A12] border-[hsl(var(--accent-primary))] hover:bg-[#67E8F9] shadow-[0_0_18px_hsl(var(--accent-primary)/0.3)]"
        : "bg-[hsl(var(--panel-2))] border-[hsl(var(--border-soft))] text-[hsl(var(--text))] hover:border-[hsl(var(--border-mid))] hover:bg-[hsl(var(--panel-2))]",
    ].join(" ")}
  >
    {Icon && <Icon size={14} strokeWidth={2} />}
    <span>{label}</span>
  </button>
);

export default function Header({
  direction,
  setDirection,
  previewMode,
  setPreviewMode,
  onOpenSettings,
  onResetAll,
}) {
  return (
    <header className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
      {/* LEFT: title */}
      <div className="flex items-center gap-4">
        <div
          className="flex h-12 w-12 items-center justify-center rounded-xl border border-[hsl(var(--accent-primary))]/30 bg-[hsl(var(--accent-primary)/0.10)] text-[hsl(var(--accent-primary))]"
          aria-hidden
        >
          <FlaskConical size={22} />
        </div>
        <div>
          <h1
            className="font-display text-3xl md:text-4xl font-bold tracking-tight text-[hsl(var(--text))]"
            data-testid="page-title"
          >
            Session Lab
          </h1>
          <p className="text-sm text-[hsl(var(--text-2))] mt-0.5 max-w-xl">
            Session-first edge analysis — discover which sessions deserve capital.
          </p>
        </div>
      </div>

      {/* RIGHT: controls */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Date range chip */}
        <div className="inline-flex items-center gap-1.5 rounded-lg border border-[hsl(var(--border-soft))] bg-[hsl(var(--panel-2))] px-3 py-2 text-[11px] text-[hsl(var(--text-2))]">
          <Calendar size={12} />
          <span className="font-num">Last 30D</span>
        </div>
        {/* UTC chip */}
        <div className="inline-flex items-center gap-1.5 rounded-lg border border-[hsl(var(--accent-primary))]/30 bg-[hsl(var(--accent-primary)/0.08)] px-3 py-2 text-[11px] text-[hsl(var(--accent-primary))]">
          <Globe2 size={12} />
          <span className="font-num">UTC</span>
        </div>

        <div className="mx-2 hidden h-8 w-px bg-[hsl(var(--border-soft))] lg:block" />

        {/* Direction toggle */}
        <div className="flex items-center gap-2">
          <span className="label-eyebrow">Direction</span>
          <SegmentedControl
            testId="direction-toggle"
            value={direction}
            onChange={setDirection}
            options={[
              { value: "both", label: "Both" },
              { value: "long", label: "Long Only" },
              { value: "short", label: "Short Only" },
            ]}
          />
        </div>

        {/* Preview mode toggle */}
        <div className="flex items-center gap-2">
          <span className="label-eyebrow">Preview</span>
          <SegmentedControl
            testId="preview-toggle"
            value={previewMode}
            onChange={setPreviewMode}
            options={[
              { value: "original", label: "Original" },
              { value: "filtered", label: "Filtered" },
            ]}
          />
        </div>

        <div className="mx-2 hidden h-8 w-px bg-[hsl(var(--border-soft))] lg:block" />

        <HeaderButton icon={Settings} label="Session Settings" onClick={onOpenSettings} testId="btn-session-settings" />
        <HeaderButton icon={RotateCcw} label="Reset All Rules" onClick={onResetAll} testId="btn-reset-all" />
        <HeaderButton icon={Download} label="Export" testId="btn-export" />
        <HeaderButton icon={Share2} label="Share" testId="btn-share" />
        <HeaderButton icon={BookmarkPlus} label="Save View" primary testId="btn-save-view" />
      </div>
    </header>
  );
}
