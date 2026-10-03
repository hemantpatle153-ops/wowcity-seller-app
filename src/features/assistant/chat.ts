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

export type VoiceLang = "en-IN" | "hi-IN";

/** What was typed before the mic was tapped, followed by what was heard. */
export function joinSpeech(before: string, heard: string) {
  const said = heard.trim();
  if (!said) return before;
  return before.trim() ? `${before.trimEnd()} ${said}` : said;
}

/** Speech errors in plain words; null for the ones that need no message (cancelled, silence). */
export function voiceErrorMessage(code: string): string | null {
  if (code === "aborted" || code === "no-speech" || code === "speech-timeout") return null;
  if (code === "not-allowed") return "Allow the microphone for WowCity Seller to talk to Sarah.";
  if (code === "network") return "Voice typing needs the internet on this phone.";
  if (code === "service-not-allowed" || code === "language-not-supported") return "Voice typing isn't available on this phone. You can type instead.";
  return "Couldn't hear that. Tap the mic and try again.";
}

export type ReplySpan = { text: string; bold: boolean };
export type ReplyBlock = { kind: "paragraph" | "bullet"; indent: number; spans: ReplySpan[] };

/** Splits **bold** runs; any stray asterisks left over are dropped. */
function spansOf(line: string): ReplySpan[] {
  const out: ReplySpan[] = [];
  line.split(/(\*\*[^*]+\*\*)/g).forEach((part) => {
    if (!part) return;
    const bold = /^\*\*[^*]+\*\*$/.test(part);
    const text = (bold ? part.slice(2, -2) : part).replace(/\*+/g, "").replace(/__/g, "");
    if (text) out.push({ text, bold });
  });
  return out;
}

/**
 * Turns the assistant"s reply into paragraphs and bullet rows, so Markdown the model may still send
 * (**bold**, "- item", "### Heading") shows as clean formatting instead of symbols.
 */
export function parseReply(text: string): ReplyBlock[] {
  const blocks: ReplyBlock[] = [];
  for (const raw of text.replace(/\r/g, "").split("\n")) {
    if (!raw.trim()) continue;
    const bullet = raw.match(/^(\s*)(?:[-*•]|\d+[.)])\s+(.*)$/);
    if (bullet) {
      blocks.push({ kind: "bullet", indent: bullet[1].length >= 2 ? 1 : 0, spans: spansOf(bullet[2]) });
      continue;
    }
    const heading = raw.match(/^\s*#{1,6}\s+(.*)$/);
    if (heading) {
      blocks.push({ kind: "paragraph", indent: 0, spans: [{ text: heading[1].replace(/\*+/g, ""), bold: true }] });
      continue;
    }
    blocks.push({ kind: "paragraph", indent: 0, spans: spansOf(raw.trim()) });
  }
  return blocks;
}
