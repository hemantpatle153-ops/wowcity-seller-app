import { ApiError } from "@/api/errors";
import { friendlyError, historyFor, joinSpeech, parseReply, voiceErrorMessage, type ChatItem } from "@/features/assistant/chat";
import { mockFetch, resetMock, setMockLatency } from "@/mock/server";

const BASE = "https://mock.wowcity.local/api/v1";

async function call(method: string, path: string, token: string, body?: unknown) {
  const response = await mockFetch(`${BASE}${path}`, {
    method,
    headers: { Accept: "application/json", Authorization: `Bearer ${token}`, ...(body ? { "Content-Type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined
  });
  return { status: response.status, json: JSON.parse(await response.text()) };
}

beforeAll(() => setMockLatency(0));
beforeEach(() => resetMock());
afterAll(() => setMockLatency(null));

describe("Sarah, the shop assistant", () => {
  it("sends only the last 10 plain turns and drops failed replies", () => {
    const items: ChatItem[] = Array.from({ length: 13 }, (_, i) => ({ id: i, role: i % 2 ? "assistant" : "user", content: `m${i}`, toolsUsed: ["x"] }));
    items[9].failed = true;
    const history = historyFor(items);
    expect(history).toHaveLength(10);
    expect(history.every((turn) => Object.keys(turn).sort().join() === "content,role")).toBe(true);
    expect(history.map((turn) => turn.content)).not.toContain("m9");
    expect(history.at(-1)).toEqual({ role: "user", content: "m12" });
  });

  it("explains the daily limit and being offline in plain words", () => {
    expect(friendlyError(new ApiError(429, "daily_limit", "x"))).toMatch(/tomorrow/);
    expect(friendlyError(new ApiError(0, "network", "x"))).toMatch(/offline/);
  });

  it("adds what was heard after what was already typed", () => {
    expect(joinSpeech("", " aaj ki sale ")).toBe("aaj ki sale");
    expect(joinSpeech("Kal ki ", "sale kitni hui")).toBe("Kal ki sale kitni hui");
    expect(joinSpeech("typed", "")).toBe("typed");
    expect(voiceErrorMessage("aborted")).toBeNull();
    expect(voiceErrorMessage("no-speech")).toBeNull();
    expect(voiceErrorMessage("not-allowed")).toMatch(/microphone/);
  });

  it("shows Markdown from the model as clean bullets and bold text", () => {
    const blocks = parseReply("Sales:\n- **Today**: ₹1,798\n  * 2 bills");
    expect(blocks.map((b) => [b.kind, b.indent, b.spans.map((s) => (s.bold ? `[${s.text}]` : s.text)).join("")])).toEqual([
      ["paragraph", 0, "Sales:"],
      ["bullet", 0, "[Today]: ₹1,798"],
      ["bullet", 1, "2 bills"]
    ]);
  });

  it("answers in demo mode and counts questions", async () => {
    const login = await mockFetch(`${BASE}/auth/owner-login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "owner@luzzan.in", password: "demo1234", deviceName: "Jest", platform: "test" })
    });
    const token = JSON.parse(await login.text()).data.accessToken as string;
    const before = await call("GET", "/assistant", token);
    expect(before.json.data).toMatchObject({ enabled: true, dailyLimit: 100 });
    const reply = await call("POST", "/assistant", token, { messages: [{ role: "user", content: "which items are low on stock?" }] });
    expect(reply.status).toBe(200);
    expect(reply.json.data.toolsUsed).toEqual(["Stock · low"]);
    expect(reply.json.data.questionsToday).toBe(before.json.data.questionsToday + 1);
  });
});
