"use client";
import { useId, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { useT } from "@/lib/i18n";
import { useFocusTrap } from "@/lib/useFocusTrap";

type Props = {
  title: string;
  description: string;
  confirmLabel?: string;
  onConfirm: (password?: string) => void;
  onCancel: () => void;
  danger?: boolean;
  /* When true, shows a password field and passes its value to onConfirm. The
     confirm button stays disabled until a password is entered. Used for
     sensitive actions (e.g. API-key revocation) confirmed by account password. */
  requirePassword?: boolean;
  passwordPrompt?: string;
  /* When set, shows an OPTIONAL multi-line reason field. Its current value is
     read via onReasonChange (the parent owns the state). Used by reject/dismiss
     flows so an admin can attach a reason the requester will see. The confirm
     button is NOT gated on it (the reason is optional). */
  showReason?: boolean;
  reasonValue?: string;
  reasonPrompt?: string;
  onReasonChange?: (v: string) => void;
};

export default function ConfirmDialog({
  title,
  description,
  confirmLabel,
  onConfirm,
  onCancel,
  danger,
  requirePassword,
  passwordPrompt,
  showReason,
  reasonValue,
  reasonPrompt,
  onReasonChange,
}: Props) {
  const t = useT();
  const [password, setPassword] = useState("");
  const confirmText = confirmLabel ?? t("confirm.confirm");
  const reduce = useReducedMotion();
  const titleId = useId();
  const descId = useId();
  // Focus trap + Esc-to-close + focus restore. Container gets the ref.
  const trapRef = useFocusTrap<HTMLDivElement>(true, onCancel);
  return (
    <motion.div
      initial={reduce ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 px-4 backdrop-blur-sm"
      onClick={onCancel}
    >
      <motion.div
        ref={trapRef}
        initial={reduce ? false : { opacity: 0, y: 14, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: reduce ? 0 : 0.4, ease: [0.22, 1, 0.36, 1] }}
        className="sa-glass w-full max-w-sm rounded-[var(--sa-r-lg)] p-7"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descId : undefined}
        tabIndex={-1}
      >
        <h2 id={titleId} className="sa-heading text-lg">{title}</h2>
        {description && (
          <p id={descId} className="sa-lead mt-3 text-sm">
            {description}
          </p>
        )}
        {requirePassword && (
          <input
            type="password"
            className="sa-input mt-4 w-full"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={passwordPrompt ?? t("confirm.passwordPrompt")}
            autoComplete="current-password"
            autoFocus
          />
        )}
        {showReason && (
          <textarea
            className="sa-textarea mt-4 w-full text-sm"
            rows={3}
            value={reasonValue ?? ""}
            onChange={(e) => onReasonChange?.(e.target.value)}
            placeholder={reasonPrompt ?? t("confirm.reasonPrompt")}
            autoFocus
          />
        )}
        {/* Actions. Long confirm labels (they vary a lot across languages,
            e.g. "Отменить создание аккаунта") used to wrap and stretch BOTH
            buttons vertically. We stack on narrow widths and lay out in a row
            once there is room; buttons keep equal height, wrap text neatly and
            stay centered, so no language looks awkward. */}
        <div className="mt-7 flex flex-col gap-3 sm:flex-row">
          <button
            onClick={onCancel}
            className="sa-btn sa-btn-ghost min-h-[2.75rem] flex-1 items-center justify-center whitespace-normal text-center leading-snug"
          >
            {t("confirm.cancel")}
          </button>
          <button
            onClick={() => onConfirm(requirePassword ? password : undefined)}
            disabled={requirePassword && !password}
            className={`sa-btn min-h-[2.75rem] flex-1 items-center justify-center whitespace-normal text-center leading-snug ${
              danger ? "sa-btn-danger" : "sa-btn-primary"
            }`}
          >
            {confirmText}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
