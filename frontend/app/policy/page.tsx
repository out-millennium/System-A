"use client";

import Link from "next/link";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import SystemAPolicyDocument from "@/components/SystemAPolicyDocument";
import SystemAMark from "@/components/SystemAMark";

export default function SystemAPolicyPage() {
  return (
    <div className="relative min-h-[100svh] px-6 py-10 sm:px-10 lg:px-16">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-4">
        <Link href="/" className="sa-eyebrow inline-flex items-center gap-2"><SystemAMark className="h-5 w-5" />System A</Link>
        <LanguageSwitcher />
      </div>
      <main className="mx-auto mt-12 max-w-4xl pb-20">
        <SystemAPolicyDocument />
        <Link href="/" className="sa-btn sa-btn-ghost mt-8">
          ← Back to System A
        </Link>
      </main>
    </div>
  );
}
