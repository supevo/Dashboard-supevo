import sanitizeHtml from 'sanitize-html';

/**
 * Server-side rich-text sanitization. Rich text (task descriptions, comments)
 * is sanitized BEFORE storage and only a strict allowlist of tags/attributes
 * survives, eliminating stored XSS. No script, style, event handlers or
 * javascript: URLs can pass.
 */
const OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: [
    'p',
    'br',
    'strong',
    'b',
    'em',
    'i',
    'u',
    's',
    'ul',
    'ol',
    'li',
    'blockquote',
    'code',
    'pre',
    'a',
    'h3',
    'h4',
  ],
  allowedAttributes: {
    a: ['href', 'title', 'rel', 'target'],
  },
  allowedSchemes: ['http', 'https', 'mailto'],
  disallowedTagsMode: 'discard',
  allowProtocolRelative: false,
  transformTags: {
    a: (tagName, attribs) => ({
      tagName,
      attribs: {
        ...attribs,
        rel: 'noopener noreferrer nofollow',
        target: '_blank',
      },
    }),
  },
};

export function sanitizeRichText(dirty: string): string {
  return sanitizeHtml(dirty, OPTIONS).trim();
}

const HTML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
};

/**
 * Replaces @[Name](userId) mention tokens with a highlighted, readable form so
 * readers see "@Name" instead of the raw token. The display name is HTML-escaped;
 * `<strong>` is on the sanitizer allowlist. Run AFTER sanitizeRichText.
 */
export function renderMentions(html: string): string {
  return html.replace(
    /@\[([^\]]+)\]\((?:[0-9a-fA-F-]{36})\)/g,
    (_full, name: string) => {
      const safe = name.replace(/[&<>"]/g, (c) => HTML_ESCAPES[c] ?? c);
      return `<strong>@${safe}</strong>`;
    },
  );
}

/** Extracts @mentions of the form @[Name](userId) from raw text/HTML. */
export function extractMentionUserIds(text: string): string[] {
  const ids = new Set<string>();
  const regex = /@\[[^\]]+\]\(([0-9a-fA-F-]{36})\)/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    if (match[1]) ids.add(match[1]);
  }
  return [...ids];
}
