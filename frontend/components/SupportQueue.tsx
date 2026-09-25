"use client";

import { useEffect, useState } from "react";
import { useT } from "@/lib/i18n";
import { useToast } from "@/components/ToastProvider";

type Message = { id: string; authorId: string; author: string | null; body: string; kind: string; photo: { dataUrl: string; name: string | null } | null; createdAt: string };
type Ticket = { id: string; userId: string; user: { accountName: string | null; email: string | null }; requestedLevel: number; assignedLevel: number; status: string; messages: Message[] };

export default function SupportQueue({ level }: { level: number }) {
  const t = useT();
  const { toast } = useToast();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [reply, setReply] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [complaintFor, setComplaintFor] = useState<string | null>(null);
  const [complaintReason, setComplaintReason] = useState("");

  async function load() { const res = await fetch("/api/support/tickets"); if (res.ok) setTickets((await res.json()).tickets ?? []); }
  useEffect(() => { load(); }, []);
  const ticket = tickets.find((x) => x.id === selected) ?? tickets[0];

  async function action(actionName: string, extra: Record<string, unknown> = {}) {
    if (!ticket) return;
    setBusy(true);
    const res = await fetch(`/api/support/tickets/${ticket.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: actionName, ...extra }) });
    setBusy(false);
    if (res.ok) { setNote(""); await load(); toast(t(`support.${actionName}`), "success"); }
  }
  async function sendReply() {
    if (!ticket || !reply.trim()) return;
    setBusy(true); const form = new FormData(); form.set("body", reply);
    const res = await fetch(`/api/support/tickets/${ticket.id}/messages`, { method: "POST", body: form });
    setBusy(false); if (res.ok) { setReply(""); await load(); }
  }
  async function complain(messageId: string) {
    if (!complaintReason.trim()) return;
    const res = await fetch(`/api/support/messages/${messageId}/complaints`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reason: complaintReason }) });
    if (res.ok) { setComplaintFor(null); setComplaintReason(""); toast(t("support.complaintSent"), "success"); }
  }

  return (
    <section className="sa-card mt-4 p-6 md:p-7">
      <p className="sa-eyebrow mb-2">{t("support.title")}</p>
      <p className="mb-5 text-xs text-[var(--sa-text-tertiary)]">{t("support.lead")}</p>
      {tickets.length === 0 ? <p className="text-sm text-[var(--sa-text-tertiary)]">{t("support.noTickets")}</p> : <div className="grid gap-4 lg:grid-cols-[220px_1fr]">
        <div className="space-y-2">{tickets.map((item) => <button type="button" key={item.id} onClick={() => setSelected(item.id)} className={`w-full rounded-[var(--sa-r-sm)] border p-3 text-left text-xs ${item.id === ticket?.id ? "border-[var(--sa-line-strong)] bg-[var(--sa-surface-2)]" : "border-[var(--sa-line)] bg-[var(--sa-surface-0)]"}`}><span className="sa-mono">{item.user.accountName ?? item.user.email}</span><span className="mt-1 block text-[var(--sa-text-quaternary)]">{item.status} · L{item.assignedLevel}</span></button>)}</div>
        {ticket && <div>
          <div className="flex flex-wrap items-center justify-between gap-2"><div><p className="sa-eyebrow">{ticket.user.accountName ?? ticket.user.email}</p><p className="text-xs text-[var(--sa-text-tertiary)]">{t("support.assignedTo").replace("{n}", String(ticket.assignedLevel))}</p></div><div className="flex flex-wrap gap-2"><button type="button" disabled={busy} onClick={() => action("close")} className="sa-btn sa-btn-ghost !py-1.5 text-xs">{t("support.close")}</button>{level < 4 && <button type="button" disabled={busy || !note.trim()} onClick={() => action("forward", { note })} className="sa-btn sa-btn-ghost !py-1.5 text-xs">{t("support.forward")}</button>}</div></div>
          <div className="mt-4 space-y-3">{ticket.messages.map((message) => <div key={message.id} className="rounded-[var(--sa-r-sm)] border border-[var(--sa-line)] p-3"><div className="flex items-center justify-between gap-2"><p className="text-xs text-[var(--sa-text-quaternary)]">{message.author} · {message.kind}</p>{message.authorId === ticket.userId && <button type="button" onClick={() => setComplaintFor(message.id)} className="text-xs underline">{t("support.complaint")}</button>}</div><p className="mt-2 whitespace-pre-line text-sm text-[var(--sa-text-secondary)]">{message.body}</p>{message.photo && <img src={message.photo.dataUrl} alt={t("support.photo")} className="mt-3 max-h-64 rounded object-contain" />}{complaintFor === message.id && <div className="mt-3 space-y-2"><textarea className="sa-textarea w-full" rows={2} value={complaintReason} onChange={(e) => setComplaintReason(e.target.value)} placeholder={t("support.complaintReason")} /><div className="flex gap-2"><button type="button" onClick={() => complain(message.id)} className="sa-btn sa-btn-danger !py-1.5 text-xs">{t("support.complaint")}</button><button type="button" onClick={() => setComplaintFor(null)} className="sa-btn sa-btn-ghost !py-1.5 text-xs">{t("confirm.cancel")}</button></div></div>}</div>)}</div>
          {!['closed', 'rejected'].includes(ticket.status) && <div className="mt-4 space-y-2"><input className="sa-input w-full" value={note} onChange={(e) => setNote(e.target.value)} placeholder={level < 4 ? t("support.forwardNote") : t("support.rejectReason")} /><textarea className="sa-textarea w-full" rows={2} value={reply} onChange={(e) => setReply(e.target.value)} placeholder={t("support.replyPlaceholder")} /><div className="flex flex-wrap gap-2"><button type="button" disabled={busy || !reply.trim()} onClick={sendReply} className="sa-btn sa-btn-primary">{t("support.sendReply")}</button>{level < 4 ? <button type="button" disabled={busy || !note.trim()} onClick={() => action("forward", { note })} className="sa-btn sa-btn-ghost">{t("support.forward")}</button> : <><button type="button" disabled={busy || !note.trim()} onClick={() => action("reject", { explanation: note })} className="sa-btn sa-btn-danger">{t("support.reject")}</button><button type="button" disabled={busy || !note.trim()} onClick={() => action("warning", { explanation: note })} className="sa-btn sa-btn-danger">{t("support.warn")}</button></>}</div></div>}
        </div>}
      </div>}
    </section>
  );
}
