/**
 * Winziger, abhängigkeitsfreier Markdown→HTML-Renderer für kurze Texte
 * (Briefings, KI-Ausgaben). Bewusst schlank und XSS-sicher: der Eingabetext wird
 * ZUERST vollständig HTML-escaped, danach werden nur die eigenen, kontrollierten
 * Tags erzeugt. Unterstützt: Überschriften (#…), fett, kursiv, Inline-Code,
 * Links, ungeordnete/geordnete Listen, Absätze und Zeilenumbrüche.
 */

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Inline-Formatierung auf einer bereits escapten Zeile. */
function inline(text: string): string {
  let t = text;
  // Inline-Code zuerst (schützt Inhalte vor weiterer Formatierung grob genug).
  t = t.replace(/`([^`]+)`/g, '<code>$1</code>');
  // Links [Text](http…) – nur http/https/mailto zulassen.
  t = t.replace(
    /\[([^\]]+)\]\((https?:\/\/[^\s)]+|mailto:[^\s)]+)\)/g,
    '<a href="$2" target="_blank" rel="noreferrer noopener">$1</a>',
  );
  // Fett **x** / __x__
  t = t.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  t = t.replace(/__([^_]+)__/g, '<strong>$1</strong>');
  // Kursiv *x* / _x_ (nach Fett, damit ** nicht kollidiert)
  t = t.replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, '$1<em>$2</em>');
  t = t.replace(/(^|[^_])_([^_\n]+)_(?!_)/g, '$1<em>$2</em>');
  return t;
}

/** Rendert Markdown-Klartext zu sicherem HTML (siehe Modulkommentar). */
export function renderMarkdown(input: string): string {
  const escaped = escapeHtml(input.replace(/\r\n/g, '\n'));
  const lines = escaped.split('\n');
  const out: string[] = [];
  let list: 'ul' | 'ol' | null = null;
  let para: string[] = [];

  const flushPara = () => {
    if (para.length) {
      out.push(`<p>${inline(para.join('<br>'))}</p>`);
      para = [];
    }
  };
  const closeList = () => {
    if (list) {
      out.push(`</${list}>`);
      list = null;
    }
  };

  for (const raw of lines) {
    const lineTrim = raw.trim();

    // Leerzeile → Absatz/Liste abschließen.
    if (!lineTrim) {
      flushPara();
      closeList();
      continue;
    }

    // Überschrift (# … ######) → fette Zeile.
    const heading = lineTrim.match(/^(#{1,6})\s+(.*)$/);
    if (heading) {
      flushPara();
      closeList();
      out.push(`<p class="font-semibold">${inline(heading[2]!)}</p>`);
      continue;
    }

    // Ungeordnete Liste: - / * / •
    const ul = lineTrim.match(/^[-*•]\s+(.*)$/);
    if (ul) {
      flushPara();
      if (list !== 'ul') {
        closeList();
        out.push('<ul>');
        list = 'ul';
      }
      out.push(`<li>${inline(ul[1]!)}</li>`);
      continue;
    }

    // Geordnete Liste: 1. / 2) …
    const ol = lineTrim.match(/^\d+[.)]\s+(.*)$/);
    if (ol) {
      flushPara();
      if (list !== 'ol') {
        closeList();
        out.push('<ol>');
        list = 'ol';
      }
      out.push(`<li>${inline(ol[1]!)}</li>`);
      continue;
    }

    // Normale Textzeile → sammeln (mehrere Zeilen = ein Absatz mit <br>).
    closeList();
    para.push(raw.trim());
  }
  flushPara();
  closeList();
  return out.join('');
}
