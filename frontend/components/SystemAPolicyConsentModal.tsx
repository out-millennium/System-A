"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useI18n } from "@/lib/i18n";

const COOKIE = "system_a_policy_v1";

function accepted(): boolean {
  if (typeof document === "undefined") return false;
  return document.cookie.split("; ").some((item) => item.startsWith(`${COOKIE}=1`));
}

export default function SystemAPolicyConsentModal() {
  const router = useRouter();
  const { locale } = useI18n();
  const russian = locale === "ru";
  const [open, setOpen] = useState(false);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    setOpen(!accepted());
  }, []);

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previous; };
  }, [open]);

  if (!open) return null;

  function accept() {
    document.cookie = `${COOKIE}=1; path=/; max-age=31536000; SameSite=Lax`;
    setOpen(false);
  }

  function cancel() {
    if (window.history.length > 1) router.back();
    else router.push("/");
  }

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/75 px-4 backdrop-blur-md">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="system-a-policy-consent-title"
        className="w-full max-w-lg rounded-[var(--sa-r-lg)] border border-[var(--sa-line-strong)] bg-[var(--sa-elevated)] p-7 shadow-[0_30px_100px_-30px_rgba(0,0,0,.9)] sm:p-9"
      >
        <p className="sa-eyebrow">System A</p>
        <h1 id="system-a-policy-consent-title" className="sa-heading mt-4 text-2xl sm:text-3xl">
          {russian ? "Подтверждение использования" : "Use of System A"}
        </h1>
        <p className="mt-4 text-sm leading-6 text-[var(--sa-text-secondary)]">
          {russian
            ? "Перед входом или созданием аккаунта ознакомьтесь с пользовательской политикой System A."
            : "Before signing in or creating an account, please review the System A user policy."}
        </p>
        <label htmlFor="system-a-policy-consent" className="mt-6 flex cursor-pointer items-start gap-3 rounded-[var(--sa-r-md)] border border-[var(--sa-line)] bg-[var(--sa-surface-0)] p-4 text-sm leading-6 text-[var(--sa-text-secondary)]">
          <input
            id="system-a-policy-consent"
            type="checkbox"
            className="sa-checkbox mt-1"
            checked={checked}
            onChange={(event) => setChecked(event.target.checked)}
          />
          <span>
            {russian ? "Я принимаю " : "I accept the "}
            <Link href="/policy" target="_blank" rel="noreferrer" className="underline underline-offset-4 hover:text-[var(--sa-text)]">
              {russian ? "Политику использования System A" : "System A User Policy"}
            </Link>
          </span>
        </label>
        <div className="mt-7 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <button type="button" onClick={cancel} className="sa-btn sa-btn-ghost">
            {russian ? "Отмена" : "Cancel"}
          </button>
          <button type="button" onClick={accept} disabled={!checked} className="sa-btn sa-btn-primary disabled:cursor-not-allowed disabled:opacity-40">
            {russian ? "Принять" : "Accept"}
          </button>
        </div>
      </section>
    </div>
  );
}
