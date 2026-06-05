import React from "react";

/**
 * AppBlueprintBackground
 *
 * Renders the three-layer blueprint-grid backdrop used across the app.
 * Mount once inside AppShell, before sidebar/main content.
 * All layers are fixed, pointer-events-none, and sit behind all page content.
 *
 * Layer 1 — Solid base:  #050A12
 * Layer 2 — 48px grid:   1px cyan lines, opacity 0.04
 * Layer 3 — Ambient glow: soft cyan radial, upper-left, opacity 0.07
 */
export default function AppBlueprintBackground() {
  return (
    <>
      {/* Layer 1: solid deep-navy base */}
      <div className="pointer-events-none fixed inset-0 bg-[#050A12]" />

      {/* Layer 2: 48px cyan blueprint grid */}
      <div
        className="pointer-events-none fixed inset-0 opacity-[0.04]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(34,211,238,0.6) 1px, transparent 1px), " +
            "linear-gradient(90deg, rgba(34,211,238,0.6) 1px, transparent 1px)",
          backgroundSize: "48px 48px",
        }}
      />

      {/* Layer 3: soft ambient radial glow, upper-left quadrant */}
      <div
        className="pointer-events-none fixed -top-40 left-1/4 h-[600px] w-[800px] rounded-full opacity-[0.07]"
        style={{
          background:
            "radial-gradient(circle, rgba(34,211,238,0.6) 0%, transparent 60%)",
        }}
      />
    </>
  );
}
