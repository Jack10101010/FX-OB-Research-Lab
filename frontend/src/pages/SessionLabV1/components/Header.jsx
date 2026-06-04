import React from "react";
import { Settings, Download, Share2, BookmarkPlus, RotateCcw, FlaskConical, Calendar, Globe2 } from "lucide-react";

const SegmentedControl = ({ value, options, onChange, testId }) => (
  <div
    data-testid={testId}
    className="inline-flex items-center gap-1 rounded-lg border border-[#223142] bg-[#0D1520] p-1"
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
              ? "bg-[#22D3EE]/15 text-[#22D3EE] shadow-[inset_0_0_0_1px_rgba(34,211,238,0.4)]"
              : "text-[#94A3B8] hover:text-[#E5EDF7]",
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
        ? "bg-[#22D3EE] text-[#050A12] border-[#22D3EE] hover:bg-[#67E8F9] shadow-[0_0_18px_rgba(34,211,238,0.35)]"
        : "bg-[#0D1520] border-[#223142] text-[#E5EDF7] hover:border-[#2E4358] hover:bg-[#172331]",
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
          className="flex h-12 w-12 items-center justify-center rounded-xl border border-[#22D3EE]/30 bg-[#22D3EE]/10 text-[#22D3EE]"
          aria-hidden
        >
          <FlaskConical size={22} />
        </div>
        <div>
          <h1
            className="font-display text-3xl md:text-4xl font-bold tracking-tight text-[#E5EDF7]"
            data-testid="page-title"
          >
            Session Lab
          </h1>
          <p className="text-sm text-[#94A3B8] mt-0.5 max-w-xl">
            Session-first edge analysis — discover which sessions deserve capital.
          </p>
        </div>
      </div>

      {/* RIGHT: controls */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Date range chip */}
        <div className="inline-flex items-center gap-1.5 rounded-lg border border-[#223142] bg-[#0D1520] px-3 py-2 text-[11px] text-[#94A3B8]">
          <Calendar size={12} />
          <span className="font-mono">Last 30D</span>
        </div>
        {/* UTC chip */}
        <div className="inline-flex items-center gap-1.5 rounded-lg border border-[#22D3EE]/30 bg-[#22D3EE]/8 px-3 py-2 text-[11px] text-[#22D3EE]">
          <Globe2 size={12} />
          <span className="font-mono">UTC</span>
        </div>

        <div className="mx-2 hidden h-8 w-px bg-[#223142] lg:block" />

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

        <div className="mx-2 hidden h-8 w-px bg-[#223142] lg:block" />

        <HeaderButton icon={Settings} label="Session Settings" onClick={onOpenSettings} testId="btn-session-settings" />
        <HeaderButton icon={RotateCcw} label="Reset All Rules" onClick={onResetAll} testId="btn-reset-all" />
        <HeaderButton icon={Download} label="Export" testId="btn-export" />
        <HeaderButton icon={Share2} label="Share" testId="btn-share" />
        <HeaderButton icon={BookmarkPlus} label="Save View" primary testId="btn-save-view" />
      </div>
    </header>
  );
}
