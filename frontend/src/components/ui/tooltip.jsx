import * as React from "react"
import * as TooltipPrimitive from "@radix-ui/react-tooltip"

import { cn } from "@/lib/utils"

const TooltipProvider = TooltipPrimitive.Provider

const Tooltip = TooltipPrimitive.Root

const TooltipTrigger = TooltipPrimitive.Trigger

// Premium tooltip surface — clean elevated panel, crisp neutral border, no glow.
// Optimised for readability (TradingView-premium, not neon HUD): solid elevated
// background, hairline border, neutral drop shadow for depth only. Theme-token
// driven. Used by the glossary tooltip system (TermTip / ConfidenceChip) and any
// direct Tooltip consumer.
const TooltipContent = React.forwardRef(({ className, sideOffset = 6, ...props }, ref) => (
  <TooltipPrimitive.Portal>
    <TooltipPrimitive.Content
      ref={ref}
      sideOffset={sideOffset}
      className={cn(
        "z-50 max-w-sm rounded-lg border border-[hsl(var(--border-mid))] bg-[hsl(var(--panel-2))] px-4 py-3 font-ui text-[12px] leading-snug text-[hsl(var(--text))] shadow-[0_10px_28px_-8px_hsl(0_0%_0%/0.7),0_2px_8px_hsl(0_0%_0%/0.45)] animate-in fade-in-0 zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[side=bottom]:slide-in-from-top-1 data-[side=left]:slide-in-from-right-1 data-[side=right]:slide-in-from-left-1 data-[side=top]:slide-in-from-bottom-1 origin-[--radix-tooltip-content-transform-origin]",
        className
      )}
      {...props} />
  </TooltipPrimitive.Portal>
))
TooltipContent.displayName = TooltipPrimitive.Content.displayName

export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider }
