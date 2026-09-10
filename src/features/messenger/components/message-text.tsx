'use client';

import { Fragment, useState, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * Rendert Chat-Text mit einer kleinen, SICHEREN Formatierungs-Teilmenge:
 * **fett**, *kursiv* / _kursiv_, ~~durchgestrichen~~, `code`, Links, Aufzählungen
 * (Zeilen mit „- " / „* ") und ```-Codeblöcke (für HTML-/Code-Schnipsel, die ein
 * Kollege zum Kopieren braucht). Es wird NIE HTML interpretiert – alles entsteht
 * als React-Knoten, der Text wird von React escaped (kein XSS). Roh eingefügter
 * HTML-Code erscheint also wörtlich als Text, nicht als gerendertes Markup.
 */

// http(s)-URLs und www.-Links als Ganzes erkennen (bis Whitespace).
const URL_RE = /(https?:\/\/[^\s]+|www\.[^\s]+)/g;

function linkify(text: string, key: () => number): ReactNode[] {
  const parts = text.split(URL_RE);
  return parts.map((p) => {
    if (/^https?:\/\//.test(p) || /^www\./.test(p)) {
      // Satzzeichen am Ende nicht in den Link ziehen (z. B. „…seite.de).").
      const m = p.match(/^(.*?)([.,;:!?)\]]*)$/s);
      const url = m ? m[1]! : p;
      const trail = m ? m[2]! : '';
      const realHref = url.startsWith('http') ? url : `https://${url}`;
      return (
        <Fragment key={key()}>
          <a
            href={realHref}
            target="_blank"
            rel="noopener noreferrer"
            className="underline underline-offset-2 hover:opacity-80"
          >
            {url}
          </a>
          {trail}
        </Fragment>
      );
    }
    return <Fragment key={key()}>{p}</Fragment>;
  });
}

interface Rule {
  re: RegExp;
  render: (inner: string, key: () => number) => ReactNode;
}

const RULES: Rule[] = [
  {
    re: /`([^`]+)`/,
    render: (inner, key) => (
      <code
        key={key()}
        className="rounded bg-black/10 px-1 py-0.5 font-mono text-[0.9em] dark:bg-white/15"
      >
        {inner}
      </code>
    ),
  },
  {
    re: /\*\*([^*]+)\*\*/,
    render: (inner, key) => <strong key={key()}>{format(inner, key)}</strong>,
  },
  {
    re: /~~([^~]+)~~/,
    render: (inner, key) => <s key={key()}>{format(inner, key)}</s>,
  },
  {
    re: /\*([^*\n]+)\*/,
    render: (inner, key) => <em key={key()}>{format(inner, key)}</em>,
  },
  {
    re: /_([^_\n]+)_/,
    render: (inner, key) => <em key={key()}>{format(inner, key)}</em>,
  },
];

/** Inline-Formatierung: erste passende Regel gewinnt, Rest rekursiv. */
function format(text: string, key: () => number): ReactNode[] {
  for (const rule of RULES) {
    const m = rule.re.exec(text);
    if (m && m.index >= 0) {
      const before = text.slice(0, m.index);
      const after = text.slice(m.index + m[0].length);
      return [
        ...format(before, key),
        rule.render(m[1]!, key),
        ...format(after, key),
      ];
    }
  }
  return linkify(text, key);
}

/** Ein ```-Codeblock: Monospace, scrollbar, mit Kopier-Knopf (für HTML-Code). */
function CodeBlock({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* Clipboard kann blockiert sein – dann bleibt nur markieren/kopieren. */
    }
  }
  return (
    <div className="relative my-1">
      <button
        type="button"
        onClick={copy}
        className="absolute right-1 top-1 rounded bg-background/80 px-1.5 py-0.5 text-[11px] text-foreground shadow-sm hover:bg-background"
      >
        {copied ? '✓ kopiert' : '⧉ kopieren'}
      </button>
      <pre className="overflow-x-auto rounded-md bg-black/10 p-2 pr-16 text-xs dark:bg-white/10">
        <code className="whitespace-pre font-mono">{code}</code>
      </pre>
    </div>
  );
}

/** Text in Segmente aus ```-Codeblöcken und normalem Text zerlegen. */
function splitCodeFences(text: string): { type: 'code' | 'text'; content: string }[] {
  const out: { type: 'code' | 'text'; content: string }[] = [];
  const fence = /```[a-zA-Z0-9]*\n?([\s\S]*?)```/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = fence.exec(text)) !== null) {
    if (m.index > last) out.push({ type: 'text', content: text.slice(last, m.index) });
    out.push({ type: 'code', content: m[1]!.replace(/\n$/, '') });
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push({ type: 'text', content: text.slice(last) });
  return out;
}

export function MessageText({
  text,
  className,
}: {
  text: string;
  className?: string;
}) {
  let counter = 0;
  const key = () => counter++;

  function renderTextBlock(body: string): ReactNode[] {
    const lines = body.split('\n');
    const blocks: ReactNode[] = [];
    let bullets: ReactNode[] = [];
    const flushBullets = () => {
      if (bullets.length === 0) return;
      blocks.push(
        <ul key={key()} className="my-0.5 list-disc space-y-0.5 pl-5">
          {bullets}
        </ul>,
      );
      bullets = [];
    };
    for (const line of lines) {
      const bullet = line.match(/^[ \t]*[-*]\s+(.*)$/);
      if (bullet) {
        bullets.push(<li key={key()}>{format(bullet[1]!, key)}</li>);
      } else {
        flushBullets();
        blocks.push(
          <div key={key()} className="whitespace-pre-wrap">
            {format(line, key)}
          </div>,
        );
      }
    }
    flushBullets();
    return blocks;
  }

  const segments = splitCodeFences(text);
  return (
    <div className={cn('break-words', className)}>
      {segments.map((seg) =>
        seg.type === 'code' ? (
          <CodeBlock key={key()} code={seg.content} />
        ) : (
          <Fragment key={key()}>{renderTextBlock(seg.content)}</Fragment>
        ),
      )}
    </div>
  );
}
