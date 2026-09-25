"use client";

import { useEffect, useRef } from "react";

/* Accessibility helper for modal dialogs:
   • traps Tab focus inside the dialog while it is open,
   • moves focus into the dialog on open (first focusable, or the container),
   • restores focus to the previously-focused element on close,
   • calls onEscape when Esc is pressed.
   Attach the returned ref to the dialog container. */
export function useFocusTrap<T extends HTMLElement = HTMLDivElement>(
  active: boolean,
  onEscape?: () => void
) {
  const ref = useRef<T>(null);
  const prevFocus = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!active) return;
    const node = ref.current;
    if (!node) return;

    prevFocus.current = document.activeElement as HTMLElement | null;

    const selector =
      'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])';
    const focusables = () =>
      Array.from(node.querySelectorAll<HTMLElement>(selector)).filter(
        (el) => el.offsetParent !== null || el === document.activeElement
      );

    // Move focus in.
    const first = focusables()[0];
    (first ?? node).focus?.();

    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        onEscape?.();
        return;
      }
      if (e.key !== "Tab") return;
      const items = focusables();
      if (items.length === 0) {
        e.preventDefault();
        return;
      }
      const firstEl = items[0];
      const lastEl = items[items.length - 1];
      const activeEl = document.activeElement as HTMLElement | null;
      if (e.shiftKey && activeEl === firstEl) {
        e.preventDefault();
        lastEl.focus();
      } else if (!e.shiftKey && activeEl === lastEl) {
        e.preventDefault();
        firstEl.focus();
      }
    }

    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      // Restore focus to where it was before the dialog opened.
      prevFocus.current?.focus?.();
    };
  }, [active, onEscape]);

  return ref;
}
