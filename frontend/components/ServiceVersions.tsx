"use client";

import Link from "next/link";
import { useT } from "@/lib/i18n";

/* Footer resource links. Replaces the old hard-coded component version numbers
   (versioning/releases live only in the public repository, so displaying a
   fixed "0.1.0" here carried no meaning). Two layouts:
   • "dashboard": Repository · Documentation · API · Status
   • "landing":   Repository & docs · Transparency · Status               */

const REPO_URL = "https://github.com/out-millennium/system-a-core";
const DOCS_URL =
  "https://github.com/out-millennium/system-a-core/tree/main/docs";

type LinkItem = { label: string; href: string; external?: boolean };

export default function ServiceVersions({
  variant = "dashboard",
}: {
  variant?: "dashboard" | "landing";
}) {
  const t = useT();

  const items: LinkItem[] =
    variant === "landing"
      ? [
          { label: t("resources.repoWithDocs"), href: REPO_URL, external: true },
          { label: t("resources.transparency"), href: "/transparency" },
          { label: t("resources.status"), href: "/status" },
        ]
      : [
          { label: t("resources.repository"), href: REPO_URL, external: true },
          {
            label: t("resources.documentation"),
            href: DOCS_URL,
            external: true,
          },
          { label: t("resources.api"), href: "/api-docs" },
          { label: t("resources.status"), href: "/status" },
        ];

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[var(--sa-text-quaternary)]">
      {items.map((it) =>
        it.external ? (
          <a
            key={it.label}
            href={it.href}
            target="_blank"
            rel="noopener noreferrer"
            className="transition-colors hover:text-[var(--sa-text-secondary)]"
          >
            {it.label} ↗
          </a>
        ) : (
          <Link
            key={it.label}
            href={it.href}
            className="transition-colors hover:text-[var(--sa-text-secondary)]"
          >
            {it.label}
          </Link>
        )
      )}
    </div>
  );
}
