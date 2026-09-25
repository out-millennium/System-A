"use client";

import Link from "next/link";
import { useT } from "@/lib/i18n";

export default function NotFound() {
  const t = useT();
  return (
    <div className="relative flex min-h-[100svh] flex-col items-center justify-center px-6 text-center">
      <p className="sa-eyebrow mb-6">{t("notFound.code")}</p>
      <h1 className="sa-heading sa-text-gradient text-[clamp(3rem,10vw,7rem)]">
        {t("notFound.title")}
      </h1>
      <p className="sa-lead mt-6 max-w-sm text-sm">{t("notFound.lead")}</p>
      <div className="mt-10 flex gap-3">
        <Link href="/" className="sa-btn sa-btn-primary">
          {t("notFound.returnHome")}
        </Link>
        <Link href="/architecture" className="sa-btn sa-btn-ghost">
          {t("notFound.architecture")}
        </Link>
      </div>
    </div>
  );
}
