import "server-only";
import { need, settings } from "../env";
import { anthropicReply } from "./anthropic";
import { openAiCompatibleReply } from "./openaiCompatible";
import type { ReplyArgs, ReplyOutcome } from "./types";

export type { Turn } from "./types";

/** Streams one agent reply from the configured provider (LLM_PROVIDER). */
export function streamReply(args: ReplyArgs): Promise<ReplyOutcome> {
  return settings.llmProvider() === "anthropic" ? anthropicReply(args) : openAiCompatibleReply(args);
}

/** Whether the configured provider can search the web for an agent. */
export function hasWebSearch() {
  return settings.llmProvider() === "anthropic";
}

/** Throws a setup error (shown as a 503) when the configured provider is missing its settings. */
export function assertConfigured() {
  settings.agentModel();
  if (settings.llmProvider() === "anthropic") {
    if (!process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_AUTH_TOKEN) need("ANTHROPIC_API_KEY");
  } else {
    need("LLM_BASE_URL");
    need("LLM_API_KEY");
  }
}
