"use client";

import { useEffect, useRef, useState } from "react";
import { useAccount } from "wagmi";
import { useQueryClient } from "@tanstack/react-query";
import { useQuotas, useSession, type Agent, type Quota } from "@/lib/api";
import { Markdown } from "./Markdown";

type Turn = { role: "user" | "assistant"; content: string };

const key = (id: number) => `chat:${id}`;
function loadChat(id: number): Turn[] {
  try {
    return JSON.parse(sessionStorage.getItem(key(id)) || "[]") as Turn[];
  } catch {
    return [];
  }
}
function saveChat(id: number, turns: Turn[]) {
  try {
    sessionStorage.setItem(key(id), JSON.stringify(turns));
  } catch {}
}

export function Chat({ agent }: { agent: Agent }) {
  const { isConnected } = useAccount();
  const session = useSession();
  const quotas = useQuotas(session.signedIn);
  const qc = useQueryClient();
  const quota = quotas.data?.quotas[String(agent.id)] as Quota | undefined;
  const [turns, setTurns] = useState<Turn[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string>();
  const log = useRef<HTMLDivElement>(null);
  const abort = useRef<AbortController | null>(null);

  useEffect(() => setTurns(loadChat(agent.id)), [agent.id]);
  // Scroll the log itself, never the page.
  useEffect(() => {
    if (log.current) log.current.scrollTop = log.current.scrollHeight;
  }, [turns]);
  useEffect(() => () => abort.current?.abort(), []);

  async function send() {
    const text = draft.trim();
    if (!text || busy) return;
    const history: Turn[] = [...turns, { role: "user", content: text }];
    setTurns([...history, { role: "assistant", content: "" }]);
    setDraft("");
    setBusy(true);
    setNotice(undefined);
    const ctrl = new AbortController();
    abort.current = ctrl;
    let reply = "";
    try {
      const res = await fetch("/api/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ agentId: agent.id, messages: history }), signal: ctrl.signal });
      if (!res.ok || !res.body) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { error?: string }).error || `Request failed (${res.status})`);
      }
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const cut = buf.indexOf("\u0000");
        reply = cut >= 0 ? buf.slice(0, cut) : buf;
        setTurns([...history, { role: "assistant", content: reply }]);
      }
      const cut = buf.indexOf("\u0000");
      if (cut >= 0) {
        const status = JSON.parse(buf.slice(cut + 1)) as { notice?: string };
        if (status.notice) setNotice(status.notice);
      }
    } catch (e) {
      if ((e as Error).name !== "AbortError") setNotice((e as Error).message);
    } finally {
      const final = reply.trim() ? [...history, { role: "assistant" as const, content: reply }] : turns;
      if (!reply.trim()) setDraft(text);
      setTurns(final);
      saveChat(agent.id, final);
      setBusy(false);
      qc.invalidateQueries({ queryKey: ["me"] });
    }
  }

  const gate = !isConnected
    ? "Connect a wallet to chat."
    : !session.signedIn
      ? null
      : quota && quota.remaining <= 0
        ? quota.kind === "free"
          ? "You've used today's free messages. They reset at 00:00 UTC."
          : "Buy uses to chat with this agent."
        : null;

  return (
    <div className="card chat">
      <div className="chat-head">
        <h3>Chat with {agent.name}</h3>
        <span className="muted small">
          {quota ? (quota.kind === "free" ? `${quota.remaining} of ${quota.limit} free messages left today` : `${quota.remaining} use${quota.remaining === 1 ? "" : "s"} left`) : ""}
        </span>
        {turns.length > 0 && !busy && (
          <button className="btn btn-sm" onClick={() => (setTurns([]), saveChat(agent.id, []))}>
            New chat
          </button>
        )}
      </div>
      <div className="chat-log" aria-live="polite" ref={log}>
        {turns.length === 0 && <p className="muted">{agent.config?.description}</p>}
        {turns.map((t, i) => (
          <div key={i} className={`bubble ${t.role}`}>
            {t.role === "assistant" ? t.content ? <Markdown text={t.content} /> : <span className="typing">Thinking…</span> : t.content}
          </div>
        ))}
      </div>
      {notice && <p className="tx-status error">{notice}</p>}
      {isConnected && !session.signedIn ? (
        <div className="chat-gate">
          <p className="muted small">Sign a free message so the agent knows which wallet bought uses. It sends no transaction.</p>
          <button className="btn btn-primary" disabled={session.busy} onClick={session.signIn}>
            {session.busy ? "Check your wallet…" : "Sign in to chat"}
          </button>
          {session.error && <p className="tx-status error">{session.error}</p>}
        </div>
      ) : gate ? (
        <p className="chat-gate muted">{gate}</p>
      ) : (
        <form
          className="chat-input"
          onSubmit={(e) => {
            e.preventDefault();
            send();
          }}
        >
          <textarea
            className="input"
            rows={2}
            value={draft}
            maxLength={8000}
            placeholder={`Ask ${agent.name}…`}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
          />
          {busy ? (
            <button type="button" className="btn" onClick={() => abort.current?.abort()}>
              Stop
            </button>
          ) : (
            <button className="btn btn-primary" disabled={!draft.trim()}>
              Send
            </button>
          )}
        </form>
      )}
    </div>
  );
}
