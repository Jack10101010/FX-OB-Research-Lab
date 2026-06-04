import React from "react";
import { X, Settings as SettingsIcon, Info } from "lucide-react";

export default function SessionSettingsModal({ open, onClose, sessions }) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
      onClick={onClose}
      data-testid="session-settings-modal"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-3xl rounded-xl border border-[#22D3EE]/30 bg-[#0D1520] shadow-[0_0_40px_rgba(34,211,238,0.15)] overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#223142]">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-[#22D3EE]/10 border border-[#22D3EE]/30 flex items-center justify-center text-[#22D3EE]">
              <SettingsIcon size={16} />
            </div>
            <div>
              <h3 className="font-display text-lg font-bold text-[#E5EDF7] tracking-tight">Session Settings</h3>
              <p className="text-[11px] text-[#94A3B8]">Customize session windows and color labels. All times in UTC.</p>
            </div>
          </div>
          <button
            data-testid="session-settings-close"
            onClick={onClose}
            className="p-2 rounded-md text-[#94A3B8] hover:text-[#E5EDF7] hover:bg-[#172331]"
          >
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 max-h-[60vh] overflow-y-auto">
          <div className="overflow-hidden rounded-lg border border-[#223142]">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-[#172331] text-[#64748B] uppercase tracking-wider text-[10px]">
                  <th className="text-left px-3 py-2.5 font-medium">Session</th>
                  <th className="text-left px-3 py-2.5 font-medium">Start (UTC)</th>
                  <th className="text-left px-3 py-2.5 font-medium">End (UTC)</th>
                  <th className="text-left px-3 py-2.5 font-medium">Color</th>
                  <th className="text-center px-3 py-2.5 font-medium">Enabled</th>
                </tr>
              </thead>
              <tbody>
                {sessions.map((s) => {
                  const [start, end] = s.range.split(" – ").map((x) => x.replace(" UTC", ""));
                  return (
                    <tr key={s.key} className="border-t border-[#223142]/60">
                      <td className="px-3 py-2.5">
                        <input
                          defaultValue={s.name}
                          className="bg-[#172331] border border-[#223142] rounded-md px-2 py-1.5 text-xs text-[#E5EDF7] font-mono w-32 focus:outline-none focus:border-[#22D3EE]"
                        />
                      </td>
                      <td className="px-3 py-2.5">
                        <input
                          defaultValue={start}
                          className="bg-[#172331] border border-[#223142] rounded-md px-2 py-1.5 text-xs text-[#E5EDF7] font-mono w-20 focus:outline-none focus:border-[#22D3EE]"
                        />
                      </td>
                      <td className="px-3 py-2.5">
                        <input
                          defaultValue={end}
                          className="bg-[#172331] border border-[#223142] rounded-md px-2 py-1.5 text-xs text-[#E5EDF7] font-mono w-20 focus:outline-none focus:border-[#22D3EE]"
                        />
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-2">
                          {["#A855F7", "#22C55E", "#F59E0B", "#3B82F6", "#C084FC", "#64748B"].map((c) => (
                            <button
                              key={c}
                              className="h-5 w-5 rounded-full border-2"
                              style={{ backgroundColor: c, borderColor: "#223142" }}
                            />
                          ))}
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        <span
                          className="inline-block h-2.5 w-2.5 rounded-full"
                          style={{
                            backgroundColor: s.enabled ? "#22C55E" : "#EF4444",
                            boxShadow: `0 0 6px ${s.enabled ? "#22C55E" : "#EF4444"}`,
                          }}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="mt-4 flex items-start gap-2 rounded-md border border-[#3B82F6]/30 bg-[#3B82F6]/8 p-3 text-[11px]">
            <Info size={13} className="text-[#3B82F6] mt-0.5 shrink-0" />
            <div className="text-[#94A3B8]">
              <span className="text-[#60A5FA] font-medium">Coming soon: </span>
              custom session times and DST-aware market timezone conversion.
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-[#223142] bg-[#0D1520]">
          <button
            onClick={onClose}
            data-testid="session-settings-cancel"
            className="px-3 py-1.5 rounded-md border border-[#223142] bg-transparent text-[#94A3B8] text-xs font-medium hover:text-[#E5EDF7] hover:border-[#2E4358]"
          >
            Cancel
          </button>
          <button
            onClick={onClose}
            data-testid="session-settings-save"
            className="px-4 py-1.5 rounded-md bg-[#22D3EE] text-[#050A12] text-xs font-semibold hover:bg-[#67E8F9]"
          >
            Save Changes
          </button>
        </div>
      </div>
    </div>
  );
}
