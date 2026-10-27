import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import "../styles/contextual-tooltips.css";

type TooltipPlacement = "top" | "bottom";

type TooltipState = {
  text: string;
  left: number;
  top: number;
  placement: TooltipPlacement;
};

const INTERACTIVE_SELECTOR = [
  "button",
  "a",
  "[role='button']",
  "[role='tab']",
  "[role='menuitem']",
  "[role='option']",
  "input[type='button']",
  "input[type='submit']",
  "select",
].join(", ");

const ACTION_RULES: Array<[RegExp, string]> = [
  [/^close(?:\s|$)/i, "Close this panel or dialog."],
  [/^back(?:\s|$)/i, "Return to the previous screen."],
  [/^(?:cancel|discard)(?:\s|$)/i, "Cancel this action without saving new changes."],
  [/^(?:save|update)(?:\s|$)/i, "Save your changes and keep working."],
  [/^(?:delete|remove)(?:\s|$)/i, "Remove this item. Check the selection before continuing."],
  [/^(?:edit|modify)(?:\s|$)/i, "Edit this record or map feature."],
  [/^(?:add|create|new)(?:\s|$)/i, "Add a new item to this workspace."],
  [/^(?:export|download|print)(?:\s|$)/i, "Create a file from the current records or map."],
  [/^(?:upload|import)(?:\s|$)/i, "Bring data into this workflow for review and processing."],
  [/^(?:search|find)(?:\s|$)/i, "Find a record, project, plot, or location."],
  [/^(?:filter|sort)(?:\s|$)/i, "Narrow or organize the items shown in this view."],
  [/^(?:refresh|reload)(?:\s|$)/i, "Fetch the latest information from the workspace."],
  [/^zoom\s+in/i, "Zoom closer on the map."],
  [/^zoom\s+out/i, "Zoom farther out on the map."],
  [/^(?:fit|show)\s+(?:plot|boundary|all|map)/i, "Fit the selected map content into view."],
  [/^(?:map|satellite|vector)(?:\s|$)/i, "Change the map view or map working mode."],
  [/^(?:survey|survey\s+plan)(?:\s|$)/i, "Open the survey-plan workflow for this item."],
  [/^(?:subdivision|subdivide)(?:\s|$)/i, "Split a parcel into planned child plots."],
  [/^(?:georeference|georeferencing)(?:\s|$)/i, "Align scanned or imported geometry to real-world coordinates."],
  [/^(?:hazard|flood|erosion|soil)(?:\s|$)/i, "Review environmental risk or land-condition analysis."],
  [/^(?:tree|plant|planting|maintenance)(?:\s|$)/i, "Open field-tree monitoring, planting, or maintenance tools."],
  [/^(?:payment|payments|record payment|send payment)(?:\s|$)/i, "Review, record, or follow up on a payment."],
  [/^(?:customer|buyer)(?:\s|$)/i, "Open the customer or buyer record linked to this item."],
  [/^(?:copy|share)(?:\s|$)/i, "Copy or share this record, link, or result."],
  [/^(?:approve|reject|review)(?:\s|$)/i, "Review this submission and choose the appropriate decision."],
  [/^(?:notifications?|alerts?)(?:\s|$)/i, "Review recent alerts, updates, and action items."],
  [/^(?:settings?|preferences?)(?:\s|$)/i, "Configure this workspace or account."],
  [/^(?:help|support)(?:\s|$)/i, "Get guidance or contact support."],
  [/^(?:menu|open menu|open navigation)(?:\s|$)/i, "Open the navigation and workspace sections."],
  [/^(?:sign in|login|log in)(?:\s|$)/i, "Sign in to access your workspace."],
  [/^(?:sign out|logout|log out)(?:\s|$)/i, "Sign out of this workspace."],
  [/^(?:continue|next|start|open|view|manage)(?:\s|$)/i, "Open this option and continue the current workflow."],
];

function cleanLabel(value: string | null | undefined): string {
  return (value || "").replace(/\s+/g, " ").trim().replace(/[.。]+$/, "");
}

function labelFor(element: HTMLElement): string {
  const ariaLabel = cleanLabel(element.getAttribute("aria-label"));
  if (ariaLabel) return ariaLabel;

  const nestedLabel = cleanLabel(element.querySelector("[aria-label]")?.getAttribute("aria-label"));
  if (nestedLabel) return nestedLabel;

  return cleanLabel(element.textContent);
}

function descriptionFor(element: HTMLElement): string | null {
  const explicit = cleanLabel(element.getAttribute("data-tooltip"));
  if (explicit) return explicit;

  // Existing titles already provide a browser-native explanation; avoid showing two tooltips.
  if (element.hasAttribute("title")) return null;

  const label = labelFor(element);
  if (!label) {
    const className = typeof element.className === "string" ? element.className : "";
    if (/zoom|map-ctrl|map-control/i.test(className)) return "Use this control to change the map view.";
    if (/sidebar|side-nav|toolbar|tool/i.test(className)) return "Use this workspace tool to manage the current task.";
    if (element.matches("button, [role='button'], [role='tab'], [role='menuitem'], [role='option'], input[type='button'], input[type='submit'], select")) {
      return "Use this control to continue the current task.";
    }
    return null;
  }

  const matchingRule = ACTION_RULES.find(([pattern]) => pattern.test(label));
  if (matchingRule) return matchingRule[1];

  if (element.getAttribute("role") === "tab") return `Switch to the ${label} view.`;
  if (/sidebar|side-nav|nav-item|menu-item/i.test(element.className)) {
    return `Open the ${label} section of this workspace.`;
  }
  if (element.tagName === "SELECT") return `Choose a ${label.toLowerCase()} for this workflow.`;
  if (element.tagName === "A") return `Open ${label}.`;
  return `Use ${label.toLowerCase()} to continue this task.`;
}

function isTooltipTarget(element: HTMLElement): boolean {
  if (element.closest("[data-tooltip-ignore], [aria-hidden='true']")) return false;
  if (element.matches("button, [role='button'], [role='tab'], [role='menuitem'], [role='option'], input[type='button'], input[type='submit'], select")) {
    return true;
  }

  if (element.tagName !== "A") return false;
  if (element.hasAttribute("data-tooltip") || element.hasAttribute("title") || element.hasAttribute("aria-label")) return true;
  if (!cleanLabel(element.textContent)) return true;
  return /sidebar|side-nav|nav-item|menu-item|toolbar|tool/i.test(element.className);
}

function targetFromEvent(event: Event): HTMLElement | null {
  const source = event.target;
  if (!(source instanceof Element)) return null;
  const target = source.closest<HTMLElement>(INTERACTIVE_SELECTOR);
  return target && isTooltipTarget(target) ? target : null;
}

function positionFor(target: HTMLElement): Omit<TooltipState, "text"> {
  const rect = target.getBoundingClientRect();
  const horizontalInset = Math.min(172, Math.max(84, (window.innerWidth - 24) / 2));
  const center = Math.min(
    Math.max(rect.left + rect.width / 2, horizontalInset),
    window.innerWidth - horizontalInset,
  );
  // Leave enough room for the tooltip body and arrow. Controls near the top edge should get a
  // bottom tooltip instead of one that is clipped or covers the panel heading.
  const placement: TooltipPlacement = rect.top >= 132 ? "top" : "bottom";
  return {
    left: center,
    top: placement === "top" ? rect.top - 10 : rect.bottom + 10,
    placement,
  };
}

export default function ContextualTooltips() {
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);
  const activeTarget = useRef<HTMLElement | null>(null);
  const showTimer = useRef<number | null>(null);

  useEffect(() => {
    const clearTimer = () => {
      if (showTimer.current !== null) {
        window.clearTimeout(showTimer.current);
        showTimer.current = null;
      }
    };

    const hide = () => {
      clearTimer();
      activeTarget.current = null;
      setTooltip(null);
    };

    const schedule = (target: HTMLElement, delay: number) => {
      clearTimer();
      activeTarget.current = target;
      const text = descriptionFor(target);
      if (!text) {
        setTooltip(null);
        return;
      }
      showTimer.current = window.setTimeout(() => {
        if (document.body.contains(target)) setTooltip({ text, ...positionFor(target) });
      }, delay);
    };

    const handlePointerOver = (event: PointerEvent) => {
      const target = targetFromEvent(event);
      if (!target) return;
      const related = event.relatedTarget;
      if (related instanceof Node && target.contains(related)) return;
      schedule(target, 450);
    };

    const handlePointerDown = (event: PointerEvent) => {
      if (event.pointerType !== "touch") return;
      const target = targetFromEvent(event);
      if (target) schedule(target, 500);
    };

    const handlePointerOut = (event: PointerEvent) => {
      const target = activeTarget.current;
      const related = event.relatedTarget;
      if (target && related instanceof Node && target.contains(related)) return;
      hide();
    };

    const handleFocusIn = (event: FocusEvent) => {
      const target = targetFromEvent(event);
      if (target) schedule(target, 200);
    };

    const handleFocusOut = (event: FocusEvent) => {
      const target = activeTarget.current;
      const related = event.relatedTarget;
      if (target && related instanceof Node && target.contains(related)) return;
      hide();
    };

    document.addEventListener("pointerover", handlePointerOver);
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("pointerout", handlePointerOut);
    document.addEventListener("focusin", handleFocusIn);
    document.addEventListener("focusout", handleFocusOut);
    document.addEventListener("click", hide, true);
    window.addEventListener("scroll", hide, true);
    window.addEventListener("resize", hide);

    return () => {
      clearTimer();
      document.removeEventListener("pointerover", handlePointerOver);
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("pointerout", handlePointerOut);
      document.removeEventListener("focusin", handleFocusIn);
      document.removeEventListener("focusout", handleFocusOut);
      document.removeEventListener("click", hide, true);
      window.removeEventListener("scroll", hide, true);
      window.removeEventListener("resize", hide);
    };
  }, []);

  if (!tooltip || typeof document === "undefined") return null;

  return createPortal(
    <div
      className="lc-context-tooltip"
      data-placement={tooltip.placement}
      role="tooltip"
      style={{ left: tooltip.left, top: tooltip.top }}
    >
      {tooltip.text}
    </div>,
    document.body,
  );
}
