export type AwaitState = "MY_TURN" | "THEIR_TURN" | "DONE";
export type AttentionState = "NORMAL" | "OVERDUE" | "NEEDS_REVIEW" | "POSSIBLE_RESOLUTION";
export type Category = "DELIVERY" | "REFUND" | "DOCUMENT" | "APPOINTMENT" | "PAYMENT" | "OTHER";
export type SourceType = "MANUAL" | "SHARED_TEXT" | "SCREENSHOT" | "IMAGE" | "DOCUMENT" | "VOICE" | "URL";

export interface AwaitItem {
  id: string;
  title: string;
  ownerName: string;
  commitment: string;
  expectedAt: string | null;
  expectedText?: string | null;
  expectedDateOnly: boolean;
  state: AwaitState;
  attentionState: AttentionState;
  category: Category;
  notes: string;
  sourceType: SourceType;
  sourceAppLabel?: string | null;
  sourceEvidenceIds: string[];
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  lastReminderAt: string | null;
  nextReminderAt: string | null;
  reminderCount: number;
  ignoredReminderCount: number;
  lastFollowupAt: string | null;
  nextCheckAt: string | null;
  resolutionConfidence: number | null;
  resolutionEvidenceId: string | null;
  amount?: number | null;
  currency?: string | null;
  calendarEventId?: string | null;
  /** Set on items created/edited offline and not yet synced. */
  pending?: boolean;
}

export interface Evidence {
  id: string;
  awaitItemId: string;
  type: SourceType;
  contentText?: string | null;
  uri?: string | null;
  mimeType?: string | null;
  fileName?: string | null;
  createdAt: string;
}

export interface TimelineEvent {
  id: string;
  type: string;
  text: string;
  meta?: Record<string, any>;
  createdAt: string;
}

export interface Extraction {
  who: string;
  what: string;
  expected_text: string | null;
  expected_at: string | null;
  category: Category;
  suggested_state: "MY_TURN" | "THEIR_TURN";
  completion_signal: boolean;
  confidence: number;
  amount?: number | null;
  currency?: string | null;
}

export interface MatchResult {
  candidateAwaitId: string;
  candidate: AwaitItem;
  relationshipConfidence: number;
  completionSignalConfidence: number;
  suggestedChanges: { expected_at?: string | null; expected_text?: string | null };
  shortExplanation: string;
}

export interface ExtractResponse {
  ok: boolean;
  extraction: Extraction | null;
  match: MatchResult | null;
}

export interface User {
  user_id: string;
  email: string;
  name: string;
  picture?: string | null;
  plan: "FREE" | "PRO";
  ai_extractions_used: number;
  ai_followups_used: number;
}

export const CATEGORY_LABEL: Record<Category, string> = {
  DELIVERY: "Deliveries",
  REFUND: "Refunds",
  DOCUMENT: "Documents",
  APPOINTMENT: "Appointments",
  PAYMENT: "Payments",
  OTHER: "Other",
};

export const CATEGORIES: Category[] = ["DELIVERY", "REFUND", "DOCUMENT", "APPOINTMENT", "PAYMENT", "OTHER"];
