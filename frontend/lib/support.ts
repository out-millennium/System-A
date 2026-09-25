import { prisma } from "@/lib/prisma";
import type { AdminCtx } from "@/lib/admin";
import { boundedText, MAX_BODY, MAX_REASON } from "@/lib/text";

export const SUPPORT_LEVELS = [1, 2, 3, 4] as const;
export const MAX_SUPPORT_PHOTO_BYTES = 2 * 1024 * 1024;
const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

export function supportBody(value: unknown): string {
  return boundedText(value, MAX_BODY);
}

export function supportReason(value: unknown): string {
  return boundedText(value, MAX_REASON);
}

export async function readSupportPhoto(form: FormData) {
  const value = form.get("photo");
  if (!(value instanceof File) || value.size === 0) return null;
  if (!IMAGE_TYPES.has(value.type)) throw new Error("invalid_photo_type");
  if (value.size > MAX_SUPPORT_PHOTO_BYTES) throw new Error("photo_too_large");
  const bytes = Buffer.from(await value.arrayBuffer());
  return {
    data: bytes.toString("base64"),
    mime: value.type,
    name: value.name.slice(0, 120),
  };
}

export async function findSupportAdmin(level: number, excludeId?: string) {
  if (!SUPPORT_LEVELS.includes(level as (typeof SUPPORT_LEVELS)[number])) return null;
  return prisma.user.findFirst({
    where: {
      role: "admin",
      adminLevel: level,
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
    orderBy: { createdAt: "asc" },
    select: { id: true, accountName: true, adminLevel: true },
  });
}

export function isTicketAdmin(ticket: { assignedAdminId: string | null }, admin: AdminCtx | null) {
  return Boolean(admin && ticket.assignedAdminId === admin.id);
}

export function serializeSupportMessage(message: {
  id: string;
  authorId: string;
  body: string;
  kind: string;
  attachmentData: string | null;
  attachmentMime: string | null;
  attachmentName: string | null;
  createdAt: Date;
  author: { accountName: string | null };
}) {
  return {
    id: message.id,
    authorId: message.authorId,
    author: message.author.accountName,
    body: message.body,
    kind: message.kind,
    photo: message.attachmentData
      ? {
          name: message.attachmentName,
          mime: message.attachmentMime,
          dataUrl: `data:${message.attachmentMime ?? "image/jpeg"};base64,${message.attachmentData}`,
        }
      : null,
    createdAt: message.createdAt,
  };
}

export function serializeSupportTicket(ticket: {
  id: string;
  userId: string;
  category: string;
  requestedLevel: number;
  assignedLevel: number;
  assignedAdminId: string | null;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  user: { accountName: string | null; email: string | null };
  assignedAdmin: { accountName: string | null } | null;
  messages: Array<{
    id: string;
    authorId: string;
    body: string;
    kind: string;
    attachmentData: string | null;
    attachmentMime: string | null;
    attachmentName: string | null;
    createdAt: Date;
    author: { accountName: string | null };
  }>;
}) {
  return {
    id: ticket.id,
    userId: ticket.userId,
    category: ticket.category,
    user: ticket.user,
    requestedLevel: ticket.requestedLevel,
    assignedLevel: ticket.assignedLevel,
    assignedAdminId: ticket.assignedAdminId,
    assignedAdmin: ticket.assignedAdmin,
    status: ticket.status,
    createdAt: ticket.createdAt,
    updatedAt: ticket.updatedAt,
    messages: ticket.messages.map(serializeSupportMessage),
  };
}
