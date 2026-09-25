"use client";

import { useEffect, useState } from "react";
import { useT } from "@/lib/i18n";
import { useToast } from "@/components/ToastProvider";

type Photo = { dataUrl: string; name: string | null; mime: string | null } | null;
type Message = { id: string; authorId: string; author: string | null; body: string; kind: string; photo: Photo; createdAt: string };
type Ticket = { id: string; requestedLevel: number; assignedLevel: number; status: string; userId: string; messages: Message[]; assignedAdmin?: { accountName: string | null } | null };

export default function SupportCenter({ category = "support" }: { category?: "support" | "proposal" }) {
  const t = useT();
  const copy = (key: string) => t(`${category}.${key}`);
  const { toast } = useToast();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [warnings, setWarnings] = useState<Array<{ id: string; reason: string | null; status: string }>>([]);
  const [warningAppeal, setWarningAppeal] = useState<Record<string, string>>({});
  const [level, setLevel] = useState("1");
  const [body, setBody] = useState("");
  const [photo, setPhoto] = useState<File | null>(null);
  const [reply, setReply] = useState<Record<string, string>>({});
  const [replyPhoto, setReplyPhoto] = useState<Record<string, File | null>>({});
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [complaintFor, setComplaintFor] = useState<string | null>(null);
  const [complaintReason, setComplaintReason] = useState("");

  async function load() {
    const [ticketsRes, activityRes] = await Promise.all([fetch(`/api/support/tickets?category=${category}`), fetch("/api/auth/activity")]);
    if (ticketsRes.ok) setTickets((await ticketsRes.json()).tickets ?? []);
    if (activityRes.ok) {
      const items = (await activityRes.json()).items ?? [];
      setWarnings(items.filter((item: { kind?: string; status?: string }) => item.kind === "warning" && item.status === "active"));
    }
  }
  useEffect(() => { load(); }, []);

  async function createTicket(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    if (!body.trim() && !photo) return setError(copy("required"));
    setBusy(true);
    const form = new FormData();
    form.set("requestedLevel", level);
    form.set("category", category);
    form.set("body", body);
    if (photo) form.set("photo", photo);
    const res = await fetch("/api/support/tickets", { method: "POST", body: form });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(data.error === "no_admin_available" ? copy("noAdmin") : copy("error"));
      return;
    }
    setBody(""); setPhoto(null); setError("");
    await load();
    toast(copy("send"), "success");
  }

  async function sendReply(ticketId: string) {
    const text = reply[ticketId] ?? "";
    const file = replyPhoto[ticketId] ?? null;
    if (!text.trim() && !file) return;
    const form = new FormData(); form.set("body", text); if (file) form.set("photo", file);
    const res = await fetch(`/api/support/tickets/${ticketId}/messages`, { method: "POST", body: form });
    if (res.ok) { setReply((x) => ({ ...x, [ticketId]: "" })); setReplyPhoto((x) => ({ ...x, [ticketId]: null })); await load(); }
  }

  async function complain(messageId: string) {
    if (!complaintReason.trim()) return;
    const res = await fetch(`/api/support/messages/${messageId}/complaints`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reason: complaintReason }) });
    if (res.ok) { setComplaintFor(null); setComplaintReason(""); toast(copy("complaintSent"), "success"); }
  }

  async function appealWarning(id: string) {
    const warningId = id.replace(/^w_/, "");
    const reason = warningAppeal[id] ?? "";
    if (!reason.trim()) return;
    const res = await fetch("/api/admin/complaints", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ warningId, reason }) });
    if (res.ok) { setWarnings((items) => items.filter((item) => item.id !== id)); toast(copy("complaintSent"), "success"); }
  }

  return (
    <section className="sa-card mt-4 p-6 md:p-7">
      <p className="sa-eyebrow mb-2">{copy("title")}</p>
      <p className="sa-lead mb-5 text-xs">{copy("lead")}</p>
      <form onSubmit={createTicket} className="space-y-3">
        <div>
          <label className="sa-label">{copy("targetLevel")}</label>
          <select className="sa-select w-full" value={level} onChange={(e) => setLevel(e.target.value)}>
            {[1, 2, 3, 4].map((n) => <option key={n} value={n}>{copy("level").replace("{n}", String(n))}</option>)}
          </select>
        </div>
        <div>
          <label className="sa-label">{copy("message")}</label>
          <textarea className="sa-textarea w-full" rows={4} value={body} onChange={(e) => setBody(e.target.value)} placeholder={copy("messagePlaceholder")} />
        </div>
        <label className="flex items-center gap-3 text-xs text-[var(--sa-text-tertiary)]">
          <input type="file" accept="image/jpeg,image/png,image/webp,image/gif" onChange={(e) => setPhoto(e.target.files?.[0] ?? null)} />
          <span>{photo ? photo.name : copy("attachPhoto")}</span>
        </label>
        <p className="text-xs text-[var(--sa-text-quaternary)]">{copy("photoHint")}</p>
        {error && <p className="text-sm text-[var(--sa-danger)]">{error}</p>}
        <button type="submit" disabled={busy} className="sa-btn sa-btn-primary">{busy ? copy("sending") : copy("send")}</button>
      </form>

      {category === "support" && warnings.length > 0 && <section className="mt-8 rounded-[var(--sa-r-md)] border border-[var(--sa-danger)]/30 bg-[var(--sa-surface-0)] p-4">
        <p className="sa-eyebrow mb-3">{copy("warning")}</p>
        <div className="space-y-3">{warnings.map((warning) => <div key={warning.id}><p className="text-sm text-[var(--sa-text-secondary)]">{warning.reason}</p><textarea className="sa-textarea mt-2 w-full" rows={2} value={warningAppeal[warning.id] ?? ""} onChange={(e) => setWarningAppeal((x) => ({ ...x, [warning.id]: e.target.value }))} placeholder={copy("complaintReason")} /><button type="button" onClick={() => appealWarning(warning.id)} className="sa-btn sa-btn-ghost mt-2 !py-1.5 text-xs">{copy("complaint")}</button></div>)}</div>
      </section>}

      <div className="mt-8 space-y-4">
        <p className="sa-eyebrow">{copy("yourRequests")}</p>
        {tickets.length === 0 && <p className="text-sm text-[var(--sa-text-tertiary)]">{copy("noTickets")}</p>}
        {tickets.map((ticket) => (
          <article key={ticket.id} className="rounded-[var(--sa-r-md)] border border-[var(--sa-line)] bg-[var(--sa-surface-0)] p-4">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[var(--sa-text-tertiary)]">
              <span>{copy(`status${ticket.status[0].toUpperCase()}${ticket.status.slice(1)}`) || ticket.status}</span>
              <span>{copy("assignedTo").replace("{n}", String(ticket.assignedLevel))}</span>
            </div>
            <div className="mt-3 space-y-3">
              {ticket.messages.map((message) => (
                <div key={message.id} className="rounded-[var(--sa-r-sm)] border border-[var(--sa-line)] p-3">
                  <div className="flex items-center justify-between gap-2 text-xs text-[var(--sa-text-quaternary)]"><span>{message.authorId === ticket.userId ? copy("ownMessage") : message.author}</span>{message.authorId !== ticket.userId && <button type="button" onClick={() => setComplaintFor(message.id)} className="underline">{copy("complaint")}</button>}</div>
                  <p className="mt-2 whitespace-pre-line text-sm text-[var(--sa-text-secondary)]">{message.body}</p>
                  {message.photo && <img src={message.photo.dataUrl} alt={copy("photo")} className="mt-3 max-h-64 rounded object-contain" />}
                  {complaintFor === message.id && <div className="mt-3 space-y-2"><textarea className="sa-textarea w-full" rows={2} value={complaintReason} onChange={(e) => setComplaintReason(e.target.value)} placeholder={copy("complaintReason")} /><div className="flex gap-2"><button type="button" onClick={() => complain(message.id)} className="sa-btn sa-btn-danger !py-1.5 text-xs">{copy("complaint")}</button><button type="button" onClick={() => setComplaintFor(null)} className="sa-btn sa-btn-ghost !py-1.5 text-xs">{t("confirm.cancel")}</button></div></div>}
                </div>
              ))}
            </div>
            {!['closed', 'rejected'].includes(ticket.status) && <div className="mt-3 flex gap-2"><input type="file" accept="image/jpeg,image/png,image/webp,image/gif" onChange={(e) => setReplyPhoto((x) => ({ ...x, [ticket.id]: e.target.files?.[0] ?? null }))} /><input className="sa-input flex-1" value={reply[ticket.id] ?? ""} onChange={(e) => setReply((x) => ({ ...x, [ticket.id]: e.target.value }))} placeholder={copy("replyPlaceholder")} /><button type="button" onClick={() => sendReply(ticket.id)} className="sa-btn sa-btn-primary">{copy("sendReply")}</button></div>}
          </article>
        ))}
      </div>
    </section>
  );
}
