import "server-only";
import { need, settings } from "../env";
import { BUSY, DECLINED, FAILED, TOO_LONG, type ReplyArgs, type ReplyOutcome } from "./types";

/**
 * Any provider that speaks the OpenAI-style chat completions API: Google Gemini, Groq, OpenRouter and others, several
 * with free tiers. LLM_BASE_URL is the provider's base URL (ending before /chat/completions), LLM_API_KEY its key.
 * These providers get no web search here, so the system prompt tells the agent it has no live data.
 */
export async function openAiCompatibleReply({ system, turns, signal, write }: ReplyArgs): Promise<ReplyOutcome> {
  const base = need("LLM_BASE_URL").replace(/\/+$/, "");
  let res: Response;
  try {
    res = await fetch(`${base}/chat/completions`, {
      method: "POST",
      signal,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${need("LLM_API_KEY")}` },
      body: JSON.stringify({
        model: settings.agentModel(),
        stream: true,
        max_tokens: settings.maxReplyTokens(),
        messages: [{ role: "system", content: system }, ...turns],
      }),
    });
  } catch (e) {
    if ((e as Error).name === "AbortError") return {};
    console.error("chat", e);
    return { notice: FAILED };
  }
  if (!res.ok || !res.body) {
    console.error("chat", res.status, (await res.text().catch(() => "")).slice(0, 300));
    return { notice: res.status === 429 ? BUSY : FAILED };
  }

  // Server-sent events: one "data: {json}" line per chunk, then "data: [DONE]".
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  let finish: string | null = null;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let nl: number;
      while ((nl = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (!line.startsWith("data:")) continue;
        const data = line.slice(5).trim();
        if (data === "[DONE]") continue;
        let chunk: { choices?: { delta?: { content?: string | null }; finish_reason?: string | null }[]; error?: { message?: string } };
        try {
          chunk = JSON.parse(data);
        } catch {
          continue;
        }
        if (chunk.error) {
          console.error("chat", chunk.error.message);
          return { notice: FAILED };
        }
        const choice = chunk.choices?.[0];
        if (choice?.delta?.content) write(choice.delta.content);
        if (choice?.finish_reason) finish = choice.finish_reason;
      }
    }
  } catch (e) {
    if ((e as Error).name === "AbortError") return {};
    console.error("chat", e);
    return { notice: FAILED };
  }
  if (finish === "length") return { notice: TOO_LONG };
  if (finish === "content_filter") return { notice: DECLINED };
  return {};
}
