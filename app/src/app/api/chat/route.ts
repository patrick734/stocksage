import { agentById } from "@/lib/server/chain";
import { loadConfig } from "@/lib/server/configs";
import { assertConfigured, hasWebSearch, streamReply, type Turn } from "@/lib/server/llm";
import { systemPrompt } from "@/lib/server/prompt";
import { sessionAddress } from "@/lib/server/session";
import { reserve } from "@/lib/server/usage";
import { fail, route } from "@/lib/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

// One reply streams as plain text. After the text, a NUL character and one JSON line report the outcome:
// { remaining, refunded, notice? }. A reply that fails or is declined before any text gives the use back.

const MAX_TURNS = 24;
const MAX_CHARS = 8_000;
const MAX_TOTAL = 48_000;

function parseTurns(raw: unknown): Turn[] | string {
  if (!Array.isArray(raw) || raw.length === 0) return "Send at least one message.";
  if (raw.length > MAX_TURNS) return "This conversation is too long. Start a new one.";
  let total = 0;
  const turns: Turn[] = [];
  for (const [i, t] of raw.entries()) {
    const role = (t as Turn)?.role;
    const content = (t as Turn)?.content;
    if ((role !== "user" && role !== "assistant") || typeof content !== "string" || !content.trim()) return "Malformed message.";
    if (role !== (i % 2 === 0 ? "user" : "assistant")) return "Messages must alternate, starting with yours.";
    if (content.length > MAX_CHARS) return `Keep each message under ${MAX_CHARS.toLocaleString()} characters.`;
    total += content.length;
    turns.push({ role, content });
  }
  if (turns[turns.length - 1].role !== "user") return "The last message must be yours.";
  if (total > MAX_TOTAL) return "This conversation is too long. Start a new one.";
  return turns;
}

export const POST = route(async (req: Request) => {
  const user = sessionAddress();
  if (!user) return fail("Sign in with your wallet first.", 401);
  const body = await req.json().catch(() => null);
  const turns = parseTurns(body?.messages);
  if (typeof turns === "string") return fail(turns);

  const agent = await agentById(Number(body?.agentId));
  if (!agent) return fail("No such agent.", 404);
  if (!agent.active || agent.blocked) return fail("This agent is not available right now.", 403);
  const config = await loadConfig(agent.configHash);
  if (!config) return fail("This agent's configuration is missing, so it can't run.", 500);

  assertConfigured(); // before taking a use
  const reservation = await reserve(user, agent);
  if (!reservation.ok) return fail(reservation.error, reservation.status);

  const webSearch = config.webSearch && hasWebSearch();
  const enc = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let wrote = false;
      const write = (text: string) => {
        if (!text) return;
        wrote = true;
        controller.enqueue(enc.encode(text));
      };
      let { notice } = await streamReply({ system: systemPrompt(config, { webSearch }), turns, webSearch, signal: req.signal, write });
      const refunded = !wrote;
      if (refunded) await reservation.release().catch((e) => console.error("refund", e));
      if (refunded && notice) notice += " Your use was not charged.";
      controller.enqueue(enc.encode(`\u0000${JSON.stringify({ remaining: reservation.remaining + (refunded ? 1 : 0), refunded, notice })}`));
      controller.close();
    },
  });

  return new Response(stream, { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store", "X-Accel-Buffering": "no" } });
});
