"use client";
import { useEffect } from "react";
import { motion, useReducedMotion } from "framer-motion";

type ToastProps = {
  message: string;
  type: "success" | "error";
  onClose: () => void;
  /* Optional click action: clicking the toast body runs it (e.g. navigate to
     the related item), then dismisses. The × button still just dismisses. */
  onAction?: () => void;
};

export default function Toast({ message, type, onClose, onAction }: ToastProps) {
  useEffect(() => {
    // Clickable toasts linger a little longer so they can actually be clicked.
    const t = setTimeout(onClose, onAction ? 6000 : 3000);
    return () => clearTimeout(t);
  }, [onClose, onAction]);

  const clickable = !!onAction;
  const reduce = useReducedMotion();

  const activate = () => {
    onAction?.();
    onClose();
  };

  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, y: 16, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={reduce ? { opacity: 0 } : { opacity: 0, y: 8 }}
      transition={{ duration: reduce ? 0 : 0.4, ease: [0.22, 1, 0.36, 1] }}
      className={`sa-glass flex items-center gap-3 rounded-[var(--sa-r-md)] px-4 py-3 text-sm shadow-lg ${
        type === "error" ? "sa-error-shake" : ""} ${
        clickable ? "cursor-pointer transition-colors hover:bg-[var(--sa-surface-1)]" : ""
      }`}
      role={clickable ? "button" : "status"}
      aria-live={clickable ? undefined : "polite"}
      tabIndex={clickable ? 0 : undefined}
      onClick={clickable ? activate : undefined}
      onKeyDown={
        clickable
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                activate();
              }
            }
          : undefined
      }
    >
      <span
        className={`sa-dot ${type === "success" ? "sa-dot-ok" : "sa-dot-err"}`}
      />
      <span className="text-[var(--sa-text)]">{message}</span>
      <button
        onClick={(e) => {
          e.stopPropagation(); // don't trigger the action, just dismiss
          onClose();
        }}
        className="ml-2 text-[var(--sa-text-quaternary)] transition-colors hover:text-[var(--sa-text)]"
        aria-label="Dismiss"
      >
        ×
      </button>
    </motion.div>
  );
}
