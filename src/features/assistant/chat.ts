import { ApiError, errorMessage } from "@/api/errors";
import type { AssistantTurn } from "@/api/types";

/** The assistant's name, shown in the app. */
export const ASSISTANT_NAME = "Sarah";

export type ChatItem = AssistantTurn & { id: number; toolsUsed?: string[]; failed?: boolean };

export const SUGGESTIONS = ["Aaj ki sale kitni hui?", "Which items are running low?", "Last 30 days profit?", "Kis customer ka sabse zyada udhaar hai?", "This month's GST summary"];

/** Plain-text history sent with each question: the last 10 user/assistant turns, failed replies left out. */
export function historyFor(items: ChatItem[]): AssistantTurn[] {
  return items
    .filter((item) => !item.failed)
    .slice(-10)
    .map(({ role, content }) => ({ role, content }));
}

export function friendlyError(error: unknown) {
  if (error instanceof ApiError && error.code === "daily_limit") return "You've reached today's question limit. Sarah will be back tomorrow.";
  if (error instanceof ApiError && error.isNetwork) return "You're offline. Sarah needs the internet to answer.";
  return errorMessage(error);
}
