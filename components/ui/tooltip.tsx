"use client"

import * as React from "react"
import { Tooltip as TooltipPrimitive } from "radix-ui"
import { Info } from "lucide-react"

import { cn } from "@/lib/utils"

/**
 * Tooltip (Radix base — matches components.json; do NOT switch to base-ui).
 *
 * House style: a dark, rounded card that shows ABOVE the trigger by default and
 * auto-flips when there's no room (Radix `avoidCollisions`). Rich tooltips carry
 * a two-tone body — a bold header and a lighter description — so the two read as
 * distinct (see `InfoTooltip`). Documented in docs/STYLE_GUIDE.md.
 */

function TooltipProvider({
  delayDuration = 200,
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Provider>) {
  return (
    <TooltipPrimitive.Provider
      data-slot="tooltip-provider"
      delayDuration={delayDuration}
      {...props}
    />
  )
}

// Self-providing Root so callers don't need a top-level <TooltipProvider>.
function Tooltip({
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Root>) {
  return (
    <TooltipProvider>
      <TooltipPrimitive.Root data-slot="tooltip" {...props} />
    </TooltipProvider>
  )
}

function TooltipTrigger({
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Trigger>) {
  return <TooltipPrimitive.Trigger data-slot="tooltip-trigger" {...props} />
}

function TooltipContent({
  className,
  sideOffset = 6,
  side = "top",
  children,
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Content>) {
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Content
        data-slot="tooltip-content"
        side={side}
        sideOffset={sideOffset}
        className={cn(
          // Light card (soft violet-white body, dark readable text) via brand tokens
          // (app/brand.css). Rich tooltips pair this with a deep-violet header band
          // (see InfoTooltip) — the header carries the brand colour, the body stays
          // light so it never blends into a same-gradient banner.
          "z-50 max-w-64 origin-(--radix-tooltip-content-transform-origin) rounded-lg bg-tooltip px-3 py-2.5 text-sm text-tooltip-foreground shadow-xl shadow-black/20 ring-1 ring-black/10 outline-hidden",
          "data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2",
          className
        )}
        {...props}
      >
        {children}
        <TooltipPrimitive.Arrow width={11} height={6} className="fill-tooltip" />
      </TooltipPrimitive.Content>
    </TooltipPrimitive.Portal>
  )
}

/**
 * Rich header + body tooltip — the house default. `title` renders bold and full
 * strength; the body (children) renders lighter so the two are easy to tell
 * apart. Works on desktop (hover/focus) and mobile (tap toggles it).
 *
 *   <InfoTooltip title="University Registration No.">
 *     The number your university assigned at admission…
 *   </InfoTooltip>
 */
function InfoTooltip({
  title,
  children,
  icon = <Info className="size-4 shrink-0" />,
  trigger,
  side,
  className,
}: {
  title: React.ReactNode
  children: React.ReactNode
  /** Header icon; pass `null` to omit. */
  icon?: React.ReactNode
  /** Custom trigger; defaults to a small ⓘ button. Must accept a ref (asChild). */
  trigger?: React.ReactNode
  side?: React.ComponentProps<typeof TooltipContent>["side"]
  className?: string
}) {
  const [open, setOpen] = React.useState(false)
  return (
    <Tooltip open={open} onOpenChange={setOpen}>
      <TooltipTrigger
        asChild
        // Tap-to-toggle so it also works on touch, where hover doesn't exist.
        onClick={(e) => {
          e.preventDefault()
          setOpen((v) => !v)
        }}
      >
        {trigger ?? (
          <button
            type="button"
            aria-label={typeof title === "string" ? `What is ${title}?` : "More info"}
            className="text-muted-foreground hover:text-foreground inline-flex size-4 items-center justify-center rounded-full outline-none focus-visible:ring-1 focus-visible:ring-ring"
          >
            <Info className="size-3.5" />
          </button>
        )}
      </TooltipTrigger>
      <TooltipContent side={side} className={cn("overflow-hidden p-0", className)}>
        {/* Solid deep-violet header (brand token) — same brand family as the
            registration header, but darker than its bright gradient so it doesn't
            merge into that banner. */}
        <div className="flex items-center gap-2 bg-tooltip-header px-3 py-2 font-semibold text-tooltip-header-foreground">
          {icon}
          <span className="text-sm leading-none">{title}</span>
        </div>
        <p className="px-3 py-2.5 text-pretty text-tooltip-foreground">{children}</p>
      </TooltipContent>
    </Tooltip>
  )
}

export {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
  TooltipProvider,
  InfoTooltip,
}
