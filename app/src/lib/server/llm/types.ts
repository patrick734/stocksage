import "server-only";

export type Turn = { role: "user" | "assistant"; content: string };

export type ReplyArgs = {
  system: string;
  turns: Turn[];
  webSearch: boolean;
  signal: AbortSignal;
  /** Called with each piece of text as it arrives. */
  write: (text: string) => void;
};

/** How a reply ended, when that is worth telling the user. Aborts end silently. */
export type ReplyOutcome = { notice?: string };

export const BUSY = "The agents are busy right now. Try again in a moment.";
export const FAILED = "The agent could not finish this reply.";
export const DECLINED = "The agent declined this request.";
export const TOO_LONG = "The reply hit its length limit.";
