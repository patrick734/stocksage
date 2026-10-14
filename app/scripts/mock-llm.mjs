// Local stand-in for an OpenAI-compatible provider, for the end-to-end test: streams a fixed reply, answers 429 when
// the last message contains BUSY, and logs every request as one JSON line to MOCK_LOG.
//   MOCK_LOG=/tmp/mock.log node scripts/mock-llm.mjs 8788
import { appendFileSync } from "node:fs";
import { createServer } from "node:http";

const port = Number(process.argv[2] || 8788);
createServer((req, res) => {
  let raw = "";
  req.on("data", (c) => (raw += c));
  req.on("end", () => {
    const body = raw ? JSON.parse(raw) : {};
    if (process.env.MOCK_LOG) appendFileSync(process.env.MOCK_LOG, JSON.stringify({ path: req.url, auth: req.headers.authorization, body }) + "\n");
    const last = body.messages?.at(-1)?.content || "";
    if (/BUSY/.test(last)) {
      res.writeHead(429, { "content-type": "application/json" });
      return res.end(JSON.stringify({ error: { message: "rate limited" } }));
    }
    res.writeHead(200, { "content-type": "text/event-stream" });
    for (const part of ["Hello ", "from the ", "free model."]) res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: part } }] })}\n\n`);
    res.write(`data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: "stop" }] })}\n\n`);
    res.end("data: [DONE]\n\n");
  });
}).listen(port, () => console.log(`mock LLM on :${port}`));
