import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import type { AwaitItem, Category } from "@/src/types";

dayjs.extend(relativeTime);

export function fromNow(iso?: string | null) {
  return iso ? dayjs(iso).fromNow() : "";
}

export type PillTone = "error" | "warning" | "success" | "neutral" | "brand" | "purple";

export function dueLabel(item: AwaitItem): { text: string; tone: PillTone } {
  if (item.state === "DONE") return { text: "Done", tone: "success" };
  if (item.attentionState === "POSSIBLE_RESOLUTION") return { text: "Likely resolved", tone: "success" };
  if (item.attentionState === "NEEDS_REVIEW") return { text: "Needs review", tone: "purple" };
  if (!item.expectedAt) return { text: item.expectedText || "No date", tone: "neutral" };
  const d = dayjs(item.expectedAt).startOf("day");
  const today = dayjs().startOf("day");
  const diff = d.diff(today, "day");
  if (diff < 0) {
    const late = Math.abs(diff);
    return { text: late === 1 ? "1 day late" : `${late} days late`, tone: "error" };
  }
  if (diff === 0) return { text: "Due today", tone: "warning" };
  if (diff === 1) return { text: "Due tomorrow", tone: "neutral" };
  if (diff <= 7) return { text: `Due in ${diff} days`, tone: "neutral" };
  return { text: d.format("MMM D"), tone: "neutral" };
}

export function expectedLine(item: AwaitItem): string {
  if (!item.expectedAt) return item.expectedText ? `Expected ${item.expectedText}` : "No expected date";
  const d = dayjs(item.expectedAt).startOf("day");
  const today = dayjs().startOf("day");
  const diff = d.diff(today, "day");
  if (diff === 0) return "Expected today";
  if (diff < 0) return item.attentionState === "OVERDUE" || item.state !== "DONE" ? "Overdue" : d.format("MMM D, YYYY");
  if (diff === 1) return "Expected tomorrow";
  return d.format("MMM D, YYYY");
}

export function fmtDate(iso?: string | null, withTime = false) {
  if (!iso) return "—";
  return dayjs(iso).format(withTime ? "ddd, D MMM YYYY · h:mm A" : "ddd, D MMM YYYY");
}

export function shortDate(iso?: string | null) {
  return iso ? dayjs(iso).format("D MMM") : "—";
}

export function categoryIcon(c: Category): string {
  switch (c) {
    case "DELIVERY":
      return "cube-outline";
    case "REFUND":
      return "cash-outline";
    case "DOCUMENT":
      return "document-text-outline";
    case "APPOINTMENT":
      return "calendar-outline";
    case "PAYMENT":
      return "card-outline";
    default:
      return "ellipse-outline";
  }
}

export function stateLabel(s: string) {
  return s === "MY_TURN" ? "My Turn" : s === "THEIR_TURN" ? "Their Turn" : "Done";
}

export function sourceLabel(s: string) {
  const map: Record<string, string> = {
    MANUAL: "Manual",
    SHARED_TEXT: "Shared text",
    SCREENSHOT: "Screenshot",
    IMAGE: "Image",
    DOCUMENT: "Document",
    VOICE: "Voice",
    URL: "Link",
  };
  return map[s] ?? s;
}

export function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}
