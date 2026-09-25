"use client";

import { useEffect, useState } from "react";
import { useT } from "@/lib/i18n";

type Complaint = { id: string; reason: string; status: string; filer?: { accountName: string | null }; message?: { body: string; kind: string; author: { accountName: string | null }; ticket: { id: string; user: { accountName: string | null } } } };

export default function SupportComplaintsReview() {
  const t = useT();
  const [items, setItems] = useState<Complaint[]>([]);
  const [note, setNote] = useState<Record<string, string>>({});
  async function load() { const res = await fetch("/api/admin/support/complaints"); if (res.ok) setItems((await res.json()).complaints ?? []); }
  useEffect(() => { load(); }, []);
  async function resolve(id: string, action: "uphold" | "dismiss") {
    await fetch("/api/admin/support/complaints", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, action, reviewNote: note[id] }) });
    await load();
  }
  return <section className="sa-card mt-4 p-6 md:p-7"><p className="sa-eyebrow mb-4">{t("support.reviewTitle")}</p>{items.length === 0 ? <p className="text-sm text-[var(--sa-text-tertiary)]">{t("support.noReports")}</p> : <div className="space-y-3">{items.map((item) => <div key={item.id} className="rounded-[var(--sa-r-sm)] border border-[var(--sa-line)] bg-[var(--sa-surface-0)] p-4"><p className="text-xs text-[var(--sa-text-quaternary)]">{item.message?.ticket.user.accountName} · {item.message?.author.accountName}</p><p className="mt-2 text-sm text-[var(--sa-text-secondary)]">{item.message?.body}</p><p className="mt-2 text-sm text-[var(--sa-danger)]">{item.reason}</p><input className="sa-input mt-3" value={note[item.id] ?? ""} onChange={(e) => setNote((x) => ({ ...x, [item.id]: e.target.value }))} placeholder={t("support.reviewNote")} /><div className="mt-3 flex gap-2"><button type="button" onClick={() => resolve(item.id, "uphold")} className="sa-btn sa-btn-danger !py-1.5 text-xs">{t("support.uphold")}</button><button type="button" onClick={() => resolve(item.id, "dismiss")} className="sa-btn sa-btn-ghost !py-1.5 text-xs">{t("support.dismiss")}</button></div></div>)}</div>}</section>;
}
