import { Fragment, type ReactNode } from "react";

// A small, safe Markdown renderer for agent replies: paragraphs, headings, lists, bold, italic, inline code,
// code blocks and links (http/https only). Everything else is plain text; no HTML is ever injected.

function inline(text: string, keyBase: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\((https?:\/\/[^)\s]+)\)|\*[^*\s][^*]*\*)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const tok = m[0];
    const k = `${keyBase}-${i++}`;
    if (tok.startsWith("**")) out.push(<strong key={k}>{tok.slice(2, -2)}</strong>);
    else if (tok.startsWith("`")) out.push(<code key={k}>{tok.slice(1, -1)}</code>);
    else if (tok.startsWith("["))
      out.push(
        <a key={k} href={m[2]} target="_blank" rel="noreferrer nofollow">
          {tok.slice(1, tok.indexOf("]"))}
        </a>
      );
    else out.push(<em key={k}>{tok.slice(1, -1)}</em>);
    last = m.index + tok.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export function Markdown({ text }: { text: string }) {
  const blocks: ReactNode[] = [];
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith("```")) {
      const code: string[] = [];
      for (i++; i < lines.length && !lines[i].startsWith("```"); i++) code.push(lines[i]);
      blocks.push(<pre key={i}>{code.join("\n")}</pre>);
      continue;
    }
    const h = /^(#{1,4})\s+(.*)$/.exec(line);
    if (h) {
      blocks.push(<h4 key={i}>{inline(h[2], `h${i}`)}</h4>);
      continue;
    }
    if (/^\s*([-*]|\d+\.)\s+/.test(line)) {
      const ordered = /^\s*\d+\./.test(line);
      const items: ReactNode[] = [];
      for (; i < lines.length && /^\s*([-*]|\d+\.)\s+/.test(lines[i]); i++) items.push(<li key={i}>{inline(lines[i].replace(/^\s*([-*]|\d+\.)\s+/, ""), `l${i}`)}</li>);
      i--;
      blocks.push(ordered ? <ol key={`o${i}`}>{items}</ol> : <ul key={`u${i}`}>{items}</ul>);
      continue;
    }
    if (!line.trim()) continue;
    const para: string[] = [line];
    while (i + 1 < lines.length && lines[i + 1].trim() && !/^(#{1,4}\s|```|\s*([-*]|\d+\.)\s)/.test(lines[i + 1])) para.push(lines[++i]);
    blocks.push(
      <p key={i}>
        {para.map((l, j) => (
          <Fragment key={j}>
            {j > 0 && <br />}
            {inline(l, `p${i}-${j}`)}
          </Fragment>
        ))}
      </p>
    );
  }
  return <div className="md">{blocks}</div>;
}
