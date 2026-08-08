'use client';

import { useEffect, useRef, useState } from 'react';
import {
  Bold,
  Italic,
  Underline,
  Strikethrough,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  Link2,
  RemoveFormatting,
} from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Lightweight rich-text editor: a small formatting toolbar over a
 * contentEditable area. The current HTML is mirrored into a hidden input so it
 * submits with the surrounding form; it is sanitized server-side on save
 * (lib/sanitize → allowlist of b/i/u/s, lists, links, h3/h4 …).
 *
 * execCommand is deprecated but remains the pragmatic, dependency-free way to
 * cover this level of formatting across current browsers.
 */
export function RichTextEditor({
  name,
  initialHtml,
  placeholder,
}: {
  name: string;
  initialHtml: string;
  placeholder?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [html, setHtml] = useState(initialHtml);

  // Seed the editable area once on mount (uncontrolled thereafter, so the caret
  // never jumps). PageEditor is keyed by page id, so this remounts per page.
  useEffect(() => {
    if (ref.current) ref.current.innerHTML = initialHtml || '';
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function sync() {
    setHtml(ref.current?.innerHTML ?? '');
  }

  function exec(command: string, value?: string) {
    ref.current?.focus();
    document.execCommand(command, false, value);
    sync();
  }

  function addLink() {
    const url = window.prompt('Link-Adresse (https://…)');
    if (!url) return;
    exec('createLink', url);
  }

  const isEmpty = html.replace(/<br>|<div><\/div>|\s/g, '') === '';

  const Btn = ({
    onClick,
    label,
    children,
  }: {
    onClick: () => void;
    label: string;
    children: React.ReactNode;
  }) => (
    <button
      type="button"
      // Keep the editor's selection while clicking a toolbar button.
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      title={label}
      aria-label={label}
      className="rounded p-1.5 text-muted-foreground hover:bg-background hover:text-foreground"
    >
      {children}
    </button>
  );

  return (
    <div className="rounded-md border bg-card">
      <div className="flex flex-wrap items-center gap-0.5 border-b bg-muted/40 p-1">
        <Btn onClick={() => exec('bold')} label="Fett">
          <Bold className="h-4 w-4" />
        </Btn>
        <Btn onClick={() => exec('italic')} label="Kursiv">
          <Italic className="h-4 w-4" />
        </Btn>
        <Btn onClick={() => exec('underline')} label="Unterstrichen">
          <Underline className="h-4 w-4" />
        </Btn>
        <Btn onClick={() => exec('strikeThrough')} label="Durchgestrichen">
          <Strikethrough className="h-4 w-4" />
        </Btn>
        <span className="mx-1 h-5 w-px bg-border" />
        <Btn onClick={() => exec('formatBlock', 'h3')} label="Überschrift">
          <Heading2 className="h-4 w-4" />
        </Btn>
        <Btn onClick={() => exec('formatBlock', 'h4')} label="Unterüberschrift">
          <Heading3 className="h-4 w-4" />
        </Btn>
        <Btn onClick={() => exec('insertUnorderedList')} label="Aufzählung">
          <List className="h-4 w-4" />
        </Btn>
        <Btn onClick={() => exec('insertOrderedList')} label="Nummerierte Liste">
          <ListOrdered className="h-4 w-4" />
        </Btn>
        <span className="mx-1 h-5 w-px bg-border" />
        <Btn onClick={addLink} label="Link einfügen">
          <Link2 className="h-4 w-4" />
        </Btn>
        <Btn
          onClick={() => {
            exec('removeFormat');
            exec('formatBlock', 'p');
          }}
          label="Formatierung entfernen"
        >
          <RemoveFormatting className="h-4 w-4" />
        </Btn>
      </div>

      <div className="relative">
        {isEmpty && placeholder && (
          <p className="pointer-events-none absolute left-3 top-3 text-sm text-muted-foreground">
            {placeholder}
          </p>
        )}
        <div
          ref={ref}
          contentEditable
          suppressContentEditableWarning
          onInput={sync}
          role="textbox"
          aria-multiline="true"
          aria-label="Seiteninhalt"
          className={cn(
            'min-h-[320px] w-full px-3 py-3 text-sm leading-relaxed focus:outline-none',
            '[&_a]:text-primary [&_a]:underline',
            '[&_h3]:mb-1 [&_h3]:mt-3 [&_h3]:text-lg [&_h3]:font-semibold',
            '[&_h4]:mb-1 [&_h4]:mt-2 [&_h4]:text-base [&_h4]:font-semibold',
            '[&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5',
            '[&_blockquote]:border-l-2 [&_blockquote]:pl-3 [&_blockquote]:text-muted-foreground',
          )}
        />
      </div>

      <input type="hidden" name={name} value={html} />
    </div>
  );
}
