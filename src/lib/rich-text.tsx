import { Fragment, type ReactNode } from "react";

/**
 * A small, safe Markdown subset for chat messages. Everything renders as
 * React elements (never raw HTML), and links are limited to http(s).
 *
 *   **bold**  *italic* / _italic_  ~~strike~~  `code`  ```code block```
 *   [text](https://…)  bare https:// links  - bullets  1. numbers  > quotes
 *   @Name mentions (only for names the message actually mentions)
 */

type Ctx = {
  mentionRe: RegExp | null;
  /** Lower-cased name of the viewer, to highlight mentions of them. */
  selfName?: string;
};

type Rule = {
  re: RegExp;
  render: (match: RegExpExecArray, key: string, ctx: Ctx) => ReactNode;
};

const RULES: Rule[] = [
  {
    re: /`([^`\n]+)`/,
    render: (m, key) => (
      <code key={key} className="rounded bg-black/5 px-1 py-0.5 font-mono text-[0.85em] dark:bg-white/10">
        {m[1]}
      </code>
    ),
  },
  {
    re: /\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/,
    render: (m, key) => (
      <ExternalLink key={key} href={m[2]}>
        {m[1]}
      </ExternalLink>
    ),
  },
  {
    re: /https?:\/\/[^\s<>"']*[^\s<>"'.,:;!?)\]]/,
    render: (m, key) => (
      <ExternalLink key={key} href={m[0]}>
        {m[0]}
      </ExternalLink>
    ),
  },
  {
    re: /\*\*([^*\n]+?)\*\*/,
    render: (m, key, ctx) => <strong key={key}>{inline(m[1], ctx, key)}</strong>,
  },
  {
    re: /~~([^~\n]+?)~~/,
    render: (m, key, ctx) => <s key={key}>{inline(m[1], ctx, key)}</s>,
  },
  {
    re: /(?<![\w*])\*([^*\s](?:[^*\n]*[^*\s])?)\*(?![\w*])/,
    render: (m, key, ctx) => <em key={key}>{inline(m[1], ctx, key)}</em>,
  },
  {
    re: /(?<![\w])_([^_\s](?:[^_\n]*[^_\s])?)_(?![\w])/,
    render: (m, key, ctx) => <em key={key}>{inline(m[1], ctx, key)}</em>,
  },
];

function ExternalLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="break-all text-accent-text underline underline-offset-2 hover:no-underline"
    >
      {children}
    </a>
  );
}

function inline(text: string, ctx: Ctx, keyPrefix: string): ReactNode[] {
  const out: ReactNode[] = [];
  let rest = text;
  let n = 0;

  while (rest) {
    let best: { match: RegExpExecArray; render: Rule["render"] } | null = null;

    if (ctx.mentionRe) {
      const match = ctx.mentionRe.exec(rest);
      if (match) {
        best = {
          match,
          render: (m, key) => {
            const isSelf = m[1].toLowerCase() === ctx.selfName;
            return (
              <span
                key={key}
                className={`rounded px-0.5 font-semibold ${
                  isSelf ? "bg-accent/20 text-accent-text" : "text-accent-text"
                }`}
              >
                {m[0]}
              </span>
            );
          },
        };
      }
    }
    for (const rule of RULES) {
      const match = rule.re.exec(rest);
      if (match && (!best || match.index < best.match.index)) {
        best = { match, render: rule.render };
      }
    }

    if (!best) {
      out.push(rest);
      break;
    }
    const { match, render } = best;
    if (match.index > 0) out.push(rest.slice(0, match.index));
    out.push(render(match, `${keyPrefix}.${n++}`, ctx));
    rest = rest.slice(match.index + match[0].length);
  }
  return out;
}

type Block =
  | { type: "p"; lines: string[] }
  | { type: "ul"; items: string[] }
  | { type: "ol"; items: string[]; start: number }
  | { type: "quote"; lines: string[] }
  | { type: "code"; code: string };

const UL_RE = /^\s*[-*•]\s+(.*)$/;
const OL_RE = /^\s*(\d+)[.)]\s+(.*)$/;
const QUOTE_RE = /^>\s?(.*)$/;

function parseBlocks(text: string): Block[] {
  const blocks: Block[] = [];
  const parts = text.split("```");
  // An unclosed fence is just text.
  if (parts.length % 2 === 0) parts.splice(-2, 2, `${parts.at(-2)}\`\`\`${parts.at(-1)}`);

  parts.forEach((part, i) => {
    if (i % 2 === 1) {
      const code = part.replace(/^[\w+#-]*\n/, "").replace(/\n$/, "");
      blocks.push({ type: "code", code });
      return;
    }
    // Drop the line break that sits right next to a ``` fence.
    let body = part;
    if (i > 0) body = body.replace(/^\n/, "");
    if (i < parts.length - 1) body = body.replace(/\n$/, "");
    if (!body) return;

    for (const line of body.split("\n")) {
      const last = blocks.at(-1);
      let m: RegExpExecArray | null;
      if ((m = UL_RE.exec(line))) {
        if (last?.type === "ul") last.items.push(m[1]);
        else blocks.push({ type: "ul", items: [m[1]] });
      } else if ((m = OL_RE.exec(line))) {
        if (last?.type === "ol") last.items.push(m[2]);
        else blocks.push({ type: "ol", items: [m[2]], start: Number(m[1]) });
      } else if ((m = QUOTE_RE.exec(line))) {
        if (last?.type === "quote") last.lines.push(m[1]);
        else blocks.push({ type: "quote", lines: [m[1]] });
      } else if (last?.type === "p") {
        last.lines.push(line);
      } else {
        blocks.push({ type: "p", lines: [line] });
      }
    }
  });
  return blocks;
}

function lines(list: string[], ctx: Ctx, key: string) {
  return list.map((line, i) => (
    <Fragment key={i}>
      {i > 0 && <br />}
      {inline(line, ctx, `${key}.${i}`)}
    </Fragment>
  ));
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const EMOJI_ONLY_RE = /^(?:\p{Extended_Pictographic}|\p{Emoji_Modifier}|‍|️|\s)+$/u;

export function RichText({
  text,
  mentionNames = [],
  selfName,
}: {
  text: string;
  /** Usernames this message mentions; "@Name" for these gets highlighted. */
  mentionNames?: string[];
  selfName?: string;
}) {
  if (!text.trim()) return null;

  // Teams shows short emoji-only messages big.
  if (EMOJI_ONLY_RE.test(text) && Array.from(text.trim()).length <= 8) {
    return <p className="text-3xl leading-tight">{text.trim()}</p>;
  }

  const names = [...new Set(mentionNames)].sort((a, b) => b.length - a.length).map(escapeRe);
  const ctx: Ctx = {
    mentionRe: names.length ? new RegExp(`@(${names.join("|")})(?![\\w])`, "i") : null,
    selfName: selfName?.toLowerCase(),
  };

  return (
    <div className="space-y-1.5 break-words text-sm leading-relaxed">
      {parseBlocks(text).map((block, i) => {
        const key = String(i);
        switch (block.type) {
          case "code":
            return (
              <pre
                key={key}
                className="overflow-x-auto rounded-md bg-black/5 p-2.5 font-mono text-xs leading-normal dark:bg-white/10"
              >
                <code>{block.code}</code>
              </pre>
            );
          case "ul":
            return (
              <ul key={key} className="ml-5 list-disc space-y-0.5">
                {block.items.map((item, j) => (
                  <li key={j}>{inline(item, ctx, `${key}.${j}`)}</li>
                ))}
              </ul>
            );
          case "ol":
            return (
              <ol key={key} start={block.start} className="ml-5 list-decimal space-y-0.5">
                {block.items.map((item, j) => (
                  <li key={j}>{inline(item, ctx, `${key}.${j}`)}</li>
                ))}
              </ol>
            );
          case "quote":
            return (
              <blockquote key={key} className="border-l-[3px] border-border pl-2.5 text-muted">
                {lines(block.lines, ctx, key)}
              </blockquote>
            );
          default:
            return (
              <p key={key} className="whitespace-pre-wrap">
                {lines(block.lines, ctx, key)}
              </p>
            );
        }
      })}
    </div>
  );
}

/** Plain-text preview: strips formatting markers for one-line snippets. */
export function plainText(text: string) {
  return text
    .replace(/```[\s\S]*?```/g, "[code]")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/~~([^~]+)~~/g, "$1")
    .replace(/(?<![\w*])\*([^*\s][^*]*?)\*(?![\w*])/g, "$1")
    .replace(/(?<![\w])_([^_\s][^_]*?)_(?![\w])/g, "$1")
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, "$1")
    .replace(/^\s*(?:[-*•]|\d+[.)]|>)\s?/gm, "")
    .replace(/\s+/g, " ")
    .trim();
}
