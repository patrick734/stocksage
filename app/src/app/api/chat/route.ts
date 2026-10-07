import Anthropic from "@anthropic-ai/sdk";
import { agentById } from "@/lib/server/chain";
import { loadConfig } from "@/lib/server/configs";
import { settings } from "@/lib/server/env";
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
const MAX_PAUSES = 3;

type Turn = { role: "user" | "assistant"; content: string };

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

let anthropic: Anthropic | null = null;

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

  const model = settings.agentModel();
  const reservation = await reserve(user, agent);
  if (!reservation.ok) return fail(reservation.error, reservation.status);

  anthropic ??= new Anthropic();
  const client = anthropic;
  const enc = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let wrote = false;
      let notice: string | undefined;
      const write = (s: string) => {
        if (!s) return;
        wrote = true;
        controller.enqueue(enc.encode(s));
      };
      const messages: Anthropic.Beta.BetaMessageParam[] = turns.map((t) => ({ role: t.role, content: t.content }));
      try {
        for (let pass = 0; pass <= MAX_PAUSES; pass++) {
          const s = client.beta.messages.stream(
            {
              model,
              max_tokens: settings.maxReplyTokens(),
              system: systemPrompt(config),
              cache_control: { type: "ephemeral" },
              messages,
              output_config: { effort: settings.agentEffort() },
              ...(config.webSearch ? { tools: [{ type: "web_search_20260209" as const, name: "web_search" as const, max_uses: settings.webSearchMaxUses() }] } : {}),
              ...(process.env.AGENT_FALLBACKS === "off" ? {} : { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const }),
            },
            { signal: req.signal }
          );
          for await (const event of s) {
            if (event.type === "content_block_delta" && event.delta.type === "text_delta") write(event.delta.text);
          }
          const final = await s.finalMessage();
          if (final.stop_reason === "pause_turn") {
            // A long web search paused the turn: hand the partial turn back and let it continue.
            messages.push({ role: "assistant", content: final.content });
            continue;
          }
          if (final.stop_reason === "refusal") notice = "The agent declined this request.";
          else if (final.stop_reason === "max_tokens") notice = "The reply hit its length limit.";
          break;
        }
      } catch (e) {
        if (!(e instanceof Anthropic.APIUserAbortError)) {
          console.error("chat", e instanceof Anthropic.APIError ? `${e.status} ${e.message}` : e);
          notice = e instanceof Anthropic.RateLimitError ? "The agents are busy right now. Try again in a moment." : "The agent could not finish this reply.";
        }
      }
      const refunded = !wrote;
      if (refunded) await reservation.release().catch((e) => console.error("refund", e));
      if (refunded && notice) notice += " Your use was not charged.";
      controller.enqueue(enc.encode(`\u0000${JSON.stringify({ remaining: reservation.remaining + (refunded ? 1 : 0), refunded, notice })}`));
      controller.close();
    },
  });

  return new Response(stream, { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store", "X-Accel-Buffering": "no" } });
});
