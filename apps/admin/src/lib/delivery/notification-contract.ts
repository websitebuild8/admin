import { z } from "zod";
export const noticeId = (value: string | null) => {
  const result = z.uuid().safeParse(value);
  return result.success ? result.data : null;
};
export type NoticeTarget =
  | {
      targetType: "INVOICE" | "PAYMENT" | "PACKAGE" | "ACCOUNT" | "APPLICATION";
      targetId: string;
    }
  | { targetType: "COLLECTION" | "SETTINGS"; targetId?: never };
export function noticeInbox(role: string) {
  return role === "ADMIN"
    ? "/delivery/notifications"
    : role === "PARTNER"
      ? "/partner/notifications"
      : "/rider/notifications";
}
export function workspacePushPayload(notice: { id: string }, role: string) {
  return {
    title: "iGO Delivery",
    body: "You have an update in your iGO workspace.",
    tag: `igo-${notice.id}`,
    url: `${noticeInbox(role)}?open=${notice.id}`,
  };
}
