import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { settings } from "../env";
import { BUSY, DECLINED, FAILED, TOO_LONG, type ReplyArgs, type ReplyOutcome } from "./types";

const MAX_PAUSES = 3;
let client: Anthropic | null = null;

/** Claude through the Anthropic API, with server-side web search when the agent has it on. */
export async function anthropicReply({ system, turns, webSearch, signal, write }: ReplyArgs): Promise<ReplyOutcome> {
  client ??= new Anthropic();
  const messages: Anthropic.Beta.BetaMessageParam[] = turns.map((t) => ({ role: t.role, content: t.content }));
  try {
    for (let pass = 0; pass <= MAX_PAUSES; pass++) {
      const s = client.beta.messages.stream(
        {
          model: settings.agentModel(),
          max_tokens: settings.maxReplyTokens(),
          system,
          cache_control: { type: "ephemeral" },
          messages,
          output_config: { effort: settings.agentEffort() },
          ...(webSearch ? { tools: [{ type: "web_search_20260209" as const, name: "web_search" as const, max_uses: settings.webSearchMaxUses() }] } : {}),
          ...(process.env.AGENT_FALLBACKS === "off" ? {} : { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const }),
        },
        { signal }
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
      if (final.stop_reason === "refusal") return { notice: DECLINED };
      if (final.stop_reason === "max_tokens") return { notice: TOO_LONG };
      return {};
    }
    return {};
  } catch (e) {
    if (e instanceof Anthropic.APIUserAbortError) return {};
    console.error("chat", e instanceof Anthropic.APIError ? `${e.status} ${e.message}` : e);
    return { notice: e instanceof Anthropic.RateLimitError ? BUSY : FAILED };
  }
}
