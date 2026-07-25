'use client';

import { useRef, useState } from 'react';
import { Textarea } from '@/components/ui/textarea';

export interface MentionMember {
  userId: string;
  name: string;
}

/**
 * Textarea with an @mention autocomplete. Typing "@" followed by part of a
 * name shows matching members; picking one inserts a `@[Name](userId)` token
 * (the format the server parses for mention notifications). When no members are
 * provided it behaves like a plain textarea.
 */
export function MentionTextarea({
  name,
  placeholder,
  required,
  members = [],
}: {
  name: string;
  placeholder?: string;
  required?: boolean;
  members?: MentionMember[];
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [value, setValue] = useState('');
  const [query, setQuery] = useState<{ text: string; start: number } | null>(
    null,
  );

  function refresh(v: string, cursor: number) {
    const upto = v.slice(0, cursor);
    // The active mention query: an "@" followed by name characters up to the
    // cursor, not preceded by another word character.
    const m = upto.match(/(?:^|\s)@([\p{L}0-9._-]*)$/u);
    if (m && members.length > 0) {
      const text = (m[1] ?? '').toLowerCase();
      setQuery({ text, start: cursor - text.length - 1 });
    } else {
      setQuery(null);
    }
  }

  const suggestions = query
    ? members
        .filter((mem) => mem.name.toLowerCase().includes(query.text))
        .slice(0, 6)
    : [];

  function pick(mem: MentionMember) {
    const el = ref.current;
    if (!query || !el) return;
    const cursor = el.selectionStart ?? value.length;
    const before = value.slice(0, query.start);
    const after = value.slice(cursor);
    const token = `@[${mem.name}](${mem.userId}) `;
    const next = before + token + after;
    setValue(next);
    setQuery(null);
    requestAnimationFrame(() => {
      el.focus();
      const pos = (before + token).length;
      el.setSelectionRange(pos, pos);
    });
  }

  return (
    <div className="relative">
      <Textarea
        ref={ref}
        name={name}
        placeholder={placeholder}
        required={required}
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          refresh(e.target.value, e.target.selectionStart ?? 0);
        }}
        onKeyUp={(e) =>
          refresh(
            (e.target as HTMLTextAreaElement).value,
            (e.target as HTMLTextAreaElement).selectionStart ?? 0,
          )
        }
        onBlur={() => setTimeout(() => setQuery(null), 150)}
      />
      {suggestions.length > 0 && (
        <ul className="absolute z-10 mt-1 max-h-48 w-full overflow-auto rounded-md border bg-card shadow-lg">
          {suggestions.map((mem) => (
            <li key={mem.userId}>
              <button
                type="button"
                // onMouseDown (not onClick) so it fires before the textarea blur.
                onMouseDown={(e) => {
                  e.preventDefault();
                  pick(mem);
                }}
                className="block w-full px-3 py-1.5 text-left text-sm hover:bg-muted"
              >
                @{mem.name}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
