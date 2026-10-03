/** GET/POST /assistant: a small demo stand-in for the AI assistant, answering from the demo shop's data. */
import type { AssistantAnswer, AssistantStatus } from "@/api/types";
import { postedInvoices, productOf, qtyIn } from "../db";
import { body, route, type Ctx, type Route } from "../http";
import { isoDate, ok } from "../util";

let asked = 0;
const LIMIT = 100;
const rupees = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;

function answer(ctx: Ctx, question: string): Pick<AssistantAnswer, "answer" | "toolsUsed"> {
  const text = question.toLowerCase();
  const storeIds = ctx.db.stores.map((store) => store.id);
  if (/stock|kam|low|khatam|out/.test(text)) {
    const low = ctx.db.variants
      .map((variant) => ({ variant, qty: qtyIn(ctx.db, variant.id, storeIds) }))
      .filter((row) => row.qty > 0 && row.qty <= 5)
      .slice(0, 5);
    if (!low.length) return { answer: "Nothing is running low right now. 👍", toolsUsed: ["Stock · low"] };
    return {
      answer: `These are running low:\n${low.map(({ variant, qty }) => `• ${productOf(ctx.db, variant).name} ${[variant.size, variant.colour].filter(Boolean).join(" ")}: ${qty} left`).join("\n")}`,
      toolsUsed: ["Stock · low"]
    };
  }
  const today = isoDate(new Date());
  const bills = postedInvoices(ctx.db).filter((invoice) => isoDate(new Date(invoice.at)) === today);
  const total = bills.reduce((sum, invoice) => sum + invoice.totals.net, 0);
  return {
    answer: `Hi, I'm Sarah! Today you've made ${bills.length} bill${bills.length === 1 ? "" : "s"} for ${rupees(total)}.\n\nThis is demo mode: the real assistant answers any question about your sales, stock, GST, profit, dues and customers.`,
    toolsUsed: ["Today's overview"]
  };
}

export const assistantRoutes: Route[] = [
  route("GET", "/assistant", () => ok({ enabled: true, questionsToday: asked, dailyLimit: LIMIT } satisfies AssistantStatus)),
  route("POST", "/assistant", (ctx) => {
    const messages = body<{ messages?: Array<{ role: string; content: string }> }>(ctx).messages ?? [];
    const last = [...messages].reverse().find((message) => message.role === "user");
    asked += 1;
    return ok({ ...answer(ctx, last?.content ?? ""), questionsToday: asked, dailyLimit: LIMIT } satisfies AssistantAnswer);
  })
];
