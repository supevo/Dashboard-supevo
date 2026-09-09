'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

/**
 * Emoji-Katalog im WhatsApp-Stil: nach Kategorien gruppiert, in ähnlicher Menge.
 * Jede Kategorie hat ein Icon (für die Tab-Leiste) und ein Label (Abschnitts-
 * überschrift). Die Reihenfolge entspricht grob der von WhatsApp.
 */
interface EmojiCategory {
  key: string;
  icon: string;
  label: string;
  emojis: string[];
}

const CATEGORIES: EmojiCategory[] = [
  {
    key: 'smileys',
    icon: '😀',
    label: 'Smileys & Menschen',
    emojis: [
      '😀', '😃', '😄', '😁', '😆', '😅', '😂', '🤣', '🥲', '😊',
      '😇', '🙂', '🙃', '😉', '😌', '😍', '🥰', '😘', '😗', '😙',
      '😚', '😋', '😛', '😝', '😜', '🤪', '🤨', '🧐', '🤓', '😎',
      '🥸', '🤩', '🥳', '😏', '😒', '😞', '😔', '😟', '😕', '🙁',
      '☹️', '😣', '😖', '😫', '😩', '🥺', '😢', '😭', '😤', '😠',
      '😡', '🤬', '🤯', '😳', '🥵', '🥶', '😱', '😨', '😰', '😥',
      '😓', '🤗', '🤔', '🤭', '🤫', '🤥', '😶', '😐', '😑', '😬',
      '🙄', '😯', '😦', '😧', '😮', '😲', '🥱', '😴', '🤤', '😪',
      '😵', '🤐', '🥴', '🤢', '🤮', '🤧', '😷', '🤒', '🤕', '🤑',
      '🤠', '😈', '👿', '👹', '👺', '🤡', '💩', '👻', '💀', '☠️',
      '👽', '👾', '🤖', '🎃', '😺', '😸', '😹', '😻', '😼', '😽',
      '🙀', '😿', '😾', '👋', '🤚', '🖐️', '✋', '🖖', '👌', '🤌',
      '🤏', '✌️', '🤞', '🤟', '🤘', '🤙', '👈', '👉', '👆', '👇',
      '☝️', '👍', '👎', '✊', '👊', '🤛', '🤜', '👏', '🙌', '👐',
      '🤲', '🤝', '🙏', '✍️', '💅', '🤳', '💪', '🦾', '🦵', '🦶',
      '👂', '👃', '🧠', '🫀', '🫁', '🦷', '👀', '👁️', '👅', '👄',
      '👶', '🧒', '👦', '👧', '🧑', '👨', '👩', '🧓', '👴', '👵',
      '🙍', '🙎', '🙅', '🙆', '💁', '🙋', '🧏', '🤦', '🤷', '👮',
      '🕵️', '💂', '👷', '🤴', '👸', '👳', '👲', '🧕', '🤵', '👰',
      '🤰', '🤱', '👼', '🎅', '🤶', '🦸', '🦹', '🧙', '🧚', '🧛',
      '🧜', '🧝', '🧞', '🧟', '💆', '💇', '🚶', '🧍', '🧎', '🏃',
      '💃', '🕺', '👯', '🧖', '🧗', '🤺', '🏇', '⛷️', '🏂', '🏌️',
      '🏄', '🚣', '🏊', '⛹️', '🏋️', '🚴', '🚵', '🤸', '🤼', '🤽',
      '🤾', '🤹', '🧘', '👫', '👬', '👭', '💏', '💑', '👪', '🗣️',
    ],
  },
  {
    key: 'nature',
    icon: '🐻',
    label: 'Tiere & Natur',
    emojis: [
      '🐶', '🐱', '🐭', '🐹', '🐰', '🦊', '🐻', '🐼', '🐨', '🐯',
      '🦁', '🐮', '🐷', '🐽', '🐸', '🐵', '🙈', '🙉', '🙊', '🐒',
      '🐔', '🐧', '🐦', '🐤', '🐣', '🐥', '🦆', '🦅', '🦉', '🦇',
      '🐺', '🐗', '🐴', '🦄', '🐝', '🪱', '🐛', '🦋', '🐌', '🐞',
      '🐜', '🪰', '🪲', '🦟', '🦗', '🕷️', '🕸️', '🦂', '🐢', '🐍',
      '🦎', '🦖', '🦕', '🐙', '🦑', '🦐', '🦞', '🦀', '🐡', '🐠',
      '🐟', '🐬', '🐳', '🐋', '🦈', '🐊', '🐅', '🐆', '🦓', '🦍',
      '🦧', '🐘', '🦛', '🦏', '🐪', '🐫', '🦒', '🦘', '🐃', '🐂',
      '🐄', '🐎', '🐖', '🐏', '🐑', '🦙', '🐐', '🦌', '🐕', '🐩',
      '🦮', '🐈', '🐓', '🦃', '🦚', '🦜', '🦢', '🦩', '🕊️', '🐇',
      '🦝', '🦨', '🦡', '🦦', '🦥', '🐁', '🐀', '🐿️', '🦔', '🐾',
      '🐉', '🐲', '🌵', '🎄', '🌲', '🌳', '🌴', '🪵', '🌱', '🌿',
      '☘️', '🍀', '🎍', '🎋', '🍃', '🍂', '🍁', '🍄', '🐚', '🪨',
      '🌾', '💐', '🌷', '🌹', '🥀', '🌺', '🌸', '🌼', '🌻', '🌞',
      '🌝', '🌛', '🌜', '🌚', '🌕', '🌖', '🌗', '🌘', '🌑', '🌒',
      '🌓', '🌔', '🌙', '🌎', '🌍', '🌏', '🪐', '💫', '⭐', '🌟',
      '✨', '⚡', '☄️', '💥', '🔥', '🌪️', '🌈', '☀️', '🌤️', '⛅',
      '🌥️', '☁️', '🌦️', '🌧️', '⛈️', '🌩️', '🌨️', '❄️', '☃️', '⛄',
      '🌬️', '💨', '💧', '💦', '🌊',
    ],
  },
  {
    key: 'food',
    icon: '🍔',
    label: 'Essen & Trinken',
    emojis: [
      '🍏', '🍎', '🍐', '🍊', '🍋', '🍌', '🍉', '🍇', '🍓', '🫐',
      '🍈', '🍒', '🍑', '🥭', '🍍', '🥥', '🥝', '🍅', '🍆', '🥑',
      '🥦', '🥬', '🥒', '🌶️', '🫑', '🌽', '🥕', '🫒', '🧄', '🧅',
      '🥔', '🍠', '🥐', '🥯', '🍞', '🥖', '🥨', '🧀', '🥚', '🍳',
      '🧈', '🥞', '🧇', '🥓', '🥩', '🍗', '🍖', '🌭', '🍔', '🍟',
      '🍕', '🫓', '🥪', '🥙', '🧆', '🌮', '🌯', '🫔', '🥗', '🥘',
      '🫕', '🥫', '🍝', '🍜', '🍲', '🍛', '🍣', '🍱', '🥟', '🦪',
      '🍤', '🍙', '🍚', '🍘', '🍥', '🥠', '🥮', '🍢', '🍡', '🍧',
      '🍨', '🍦', '🥧', '🧁', '🍰', '🎂', '🍮', '🍭', '🍬', '🍫',
      '🍿', '🍩', '🍪', '🌰', '🥜', '🍯', '🥛', '🍼', '🫖', '☕',
      '🍵', '🧃', '🥤', '🧋', '🍶', '🍺', '🍻', '🥂', '🍷', '🥃',
      '🍸', '🍹', '🧉', '🍾', '🧊', '🥄', '🍴', '🍽️', '🥢', '🧂',
    ],
  },
  {
    key: 'activity',
    icon: '⚽',
    label: 'Aktivitäten',
    emojis: [
      '⚽', '🏀', '🏈', '⚾', '🥎', '🎾', '🏐', '🏉', '🥏', '🎱',
      '🪀', '🏓', '🏸', '🏒', '🏑', '🥍', '🏏', '🪃', '🥅', '⛳',
      '🪁', '🏹', '🎣', '🤿', '🥊', '🥋', '🎽', '🛹', '🛼', '🛷',
      '⛸️', '🥌', '🎿', '⛷️', '🏂', '🏋️', '🤼', '🤸', '⛹️', '🤺',
      '🤾', '🏌️', '🏇', '🧘', '🏄', '🏊', '🤽', '🚣', '🧗', '🚵',
      '🚴', '🏆', '🥇', '🥈', '🥉', '🏅', '🎖️', '🏵️', '🎗️', '🎫',
      '🎟️', '🎪', '🤹', '🎭', '🩰', '🎨', '🎬', '🎤', '🎧', '🎼',
      '🎹', '🥁', '🪘', '🎷', '🎺', '🪗', '🎸', '🪕', '🎻', '🎲',
      '♟️', '🎯', '🎳', '🎮', '🎰', '🧩',
    ],
  },
  {
    key: 'travel',
    icon: '🚗',
    label: 'Reisen & Orte',
    emojis: [
      '🚗', '🚕', '🚙', '🚌', '🚎', '🏎️', '🚓', '🚑', '🚒', '🚐',
      '🛻', '🚚', '🚛', '🚜', '🦯', '🦽', '🦼', '🛴', '🚲', '🛵',
      '🏍️', '🛺', '🚨', '🚔', '🚍', '🚘', '🚖', '🚡', '🚠', '🚟',
      '🚃', '🚋', '🚞', '🚝', '🚄', '🚅', '🚈', '🚂', '🚆', '🚇',
      '🚊', '🚉', '✈️', '🛫', '🛬', '🛩️', '💺', '🛰️', '🚀', '🛸',
      '🚁', '🛶', '⛵', '🚤', '🛥️', '🛳️', '⛴️', '🚢', '⚓', '⛽',
      '🚧', '🚦', '🚥', '🗺️', '🗿', '🗽', '🗼', '🏰', '🏯', '🏟️',
      '🎡', '🎢', '🎠', '⛲', '⛱️', '🏖️', '🏝️', '🏜️', '🌋', '⛰️',
      '🏔️', '🗻', '🏕️', '⛺', '🏠', '🏡', '🏘️', '🏚️', '🏗️', '🏭',
      '🏢', '🏬', '🏣', '🏤', '🏥', '🏦', '🏨', '🏪', '🏫', '🏩',
      '💒', '🏛️', '⛪', '🕌', '🕍', '🛕', '🕋', '⛩️', '🌁', '🌃',
      '🏙️', '🌄', '🌅', '🌆', '🌇', '🌉', '🎇', '🎆', '🌌', '🌠',
    ],
  },
  {
    key: 'objects',
    icon: '💡',
    label: 'Objekte',
    emojis: [
      '⌚', '📱', '💻', '⌨️', '🖥️', '🖨️', '🖱️', '🕹️', '💽', '💾',
      '💿', '📀', '📷', '📸', '📹', '🎥', '📽️', '📞', '☎️', '📟',
      '📠', '📺', '📻', '🎙️', '⏱️', '⏲️', '⏰', '🕰️', '⌛', '⏳',
      '📡', '🔋', '🔌', '💡', '🔦', '🕯️', '🧯', '🛢️', '💸', '💵',
      '💴', '💶', '💷', '🪙', '💰', '💳', '💎', '⚖️', '🪜', '🧰',
      '🔧', '🔨', '⚒️', '🛠️', '⛏️', '🔩', '⚙️', '🧱', '⛓️', '🧲',
      '🔫', '💣', '🧨', '🪓', '🔪', '🗡️', '⚔️', '🛡️', '🚬', '⚰️',
      '🪦', '⚱️', '🏺', '🔮', '📿', '🧿', '💈', '⚗️', '🔭', '🔬',
      '🕳️', '🩹', '🩺', '💊', '💉', '🩸', '🧬', '🦠', '🧫', '🧪',
      '🌡️', '🧹', '🧺', '🧻', '🚽', '🚰', '🚿', '🛁', '🛀', '🧼',
      '🪥', '🪒', '🧽', '🧴', '🛎️', '🔑', '🗝️', '🚪', '🪑', '🛋️',
      '🛏️', '🛌', '🧸', '🖼️', '🛍️', '🛒', '🎁', '🎈', '🎏', '🎀',
      '🎊', '🎉', '🎎', '🏮', '🎐', '🧧', '✉️', '📩', '📨', '📧',
      '📥', '📤', '📦', '🏷️', '📪', '📫', '📬', '📭', '📮', '📯',
      '📜', '📃', '📄', '📑', '📊', '📈', '📉', '🗒️', '🗓️', '📆',
      '📅', '📇', '🗃️', '🗳️', '🗄️', '📋', '📁', '📂', '🗂️', '📰',
      '📖', '📚', '📓', '📔', '📒', '📕', '📗', '📘', '📙', '🔖',
      '🔗', '📎', '🖇️', '📐', '📏', '📌', '📍', '✂️', '🖊️', '🖋️',
      '✒️', '🖌️', '🖍️', '📝', '✏️', '🔍', '🔎', '🔏', '🔐', '🔒',
      '🔓',
    ],
  },
  {
    key: 'symbols',
    icon: '❤️',
    label: 'Symbole',
    emojis: [
      '❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '🤎', '💔',
      '❣️', '💕', '💞', '💓', '💗', '💖', '💘', '💝', '💟', '❤️‍🔥',
      '❤️‍🩹', '💯', '💢', '💬', '👁️‍🗨️', '🗨️', '🗯️', '💭', '💤', '💮',
      '♨️', '💈', '🛑', '⭕', '❌', '🚫', '✅', '☑️', '✔️', '❎',
      '➰', '➿', '〽️', '✳️', '✴️', '❇️', '❓', '❔', '❗', '❕',
      '‼️', '⁉️', '🔅', '🔆', '⚠️', '🚸', '🔱', '⚜️', '🔰', '♻️',
      '✅', '🈯', '💹', '❇️', '✳️', '❎', '🌐', '💠', 'Ⓜ️', '🌀',
      '🔤', '🔡', '🔠', '🔣', '🎦', '🈁', '🔟', '🔢', '#️⃣', '*️⃣',
      '⏏️', '▶️', '⏸️', '⏯️', '⏹️', '⏺️', '⏭️', '⏮️', '⏩', '⏪',
      '🔀', '🔁', '🔂', '◀️', '🔼', '🔽', '⏫', '⏬', '➡️', '⬅️',
      '⬆️', '⬇️', '↗️', '↘️', '↙️', '↖️', '↕️', '↔️', '↩️', '↪️',
      '⤴️', '⤵️', '🔃', '🔄', '🔚', '🔙', '🔛', '🔝', '🔜', '➕',
      '➖', '➗', '✖️', '🟰', '♾️', '💲', '💱', '™️', '©️', '®️',
      '🔔', '🔕', '〰️', '➰', '✔️', '☑️', '🔘', '🔴', '🟠', '🟡',
      '🟢', '🔵', '🟣', '⚫', '⚪', '🟤', '🔺', '🔻', '🔸', '🔹',
      '🔶', '🔷', '🔳', '🔲', '▪️', '▫️', '◾', '◽', '◼️', '◻️',
      '⬛', '⬜', '🟥', '🟧', '🟨', '🟩', '🟦', '🟪', '🟫', '🃏',
      '♠️', '♣️', '♥️', '♦️', '♟️', '🀄', '🕐', '🕑', '🕒', '🕓',
    ],
  },
  {
    key: 'flags',
    icon: '🏁',
    label: 'Flaggen',
    emojis: [
      '🏁', '🚩', '🎌', '🏴', '🏳️', '🏳️‍🌈', '🏳️‍⚧️', '🏴‍☠️', '🇩🇪', '🇦🇹',
      '🇨🇭', '🇪🇺', '🇫🇷', '🇮🇹', '🇪🇸', '🇬🇧', '🇺🇸', '🇳🇱', '🇧🇪', '🇱🇺',
      '🇵🇱', '🇵🇹', '🇬🇷', '🇹🇷', '🇸🇪', '🇳🇴', '🇩🇰', '🇫🇮', '🇮🇪', '🇨🇿',
      '🇭🇺', '🇷🇴', '🇺🇦', '🇷🇺', '🇨🇳', '🇯🇵', '🇰🇷', '🇮🇳', '🇧🇷', '🇨🇦',
      '🇦🇺', '🇲🇽', '🇦🇷', '🇿🇦',
    ],
  },
];

const RECENT_KEY = 'messenger:recent-emojis';
const RECENT_MAX = 24;

function readRecent(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    const arr = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(arr)
      ? arr.filter((x): x is string => typeof x === 'string').slice(0, RECENT_MAX)
      : [];
  } catch {
    return [];
  }
}

/**
 * Emoji-Picker im WhatsApp-Stil: Kategorien mit Tab-Leiste, große Auswahl und
 * ein „Zuletzt verwendet"-Abschnitt (in localStorage gemerkt, pro Gerät).
 */
export function EmojiPicker({ onPick }: { onPick: (emoji: string) => void }) {
  const [open, setOpen] = useState(false);
  const [recent, setRecent] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState<string>('recent');
  const ref = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const sectionRefs = useRef<Record<string, HTMLDivElement | null>>({});

  // „Zuletzt verwendet" beim Öffnen frisch aus dem Speicher lesen.
  useEffect(() => {
    if (open) setRecent(readRecent());
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const sections = useMemo(() => {
    const list: EmojiCategory[] = [];
    if (recent.length > 0) {
      list.push({ key: 'recent', icon: '🕘', label: 'Zuletzt verwendet', emojis: recent });
    }
    for (const c of CATEGORIES) {
      // Innerhalb einer Kategorie deduplizieren (einzelne Symbole doppeln sich).
      list.push({ ...c, emojis: [...new Set(c.emojis)] });
    }
    return list;
  }, [recent]);

  const tabs = useMemo(
    () => [
      { key: 'recent', icon: '🕘' },
      ...CATEGORIES.map((c) => ({ key: c.key, icon: c.icon })),
    ],
    [],
  );

  function handlePick(emoji: string) {
    // „Zuletzt verwendet" aktualisieren (vorne einfügen, deduplizieren, kappen).
    const next = [emoji, ...recent.filter((e) => e !== emoji)].slice(0, RECENT_MAX);
    setRecent(next);
    try {
      localStorage.setItem(RECENT_KEY, JSON.stringify(next));
    } catch {
      // Speichern ist optional – Auswahl funktioniert trotzdem.
    }
    onPick(emoji);
    setOpen(false);
  }

  function scrollToSection(key: string) {
    setActiveTab(key);
    const el = sectionRefs.current[key];
    const container = scrollRef.current;
    if (el && container) {
      container.scrollTo({ top: el.offsetTop - container.offsetTop, behavior: 'smooth' });
    }
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Emoji einfügen"
        className="flex h-9 w-9 items-center justify-center rounded-md text-lg hover:bg-muted"
      >
        😊
      </button>
      {open && (
        <div className="absolute bottom-full right-0 z-50 mb-2 w-[20rem] max-w-[92vw] overflow-hidden rounded-lg border bg-card shadow-xl">
          {/* Kategorie-Tabs */}
          <div className="flex items-center gap-0.5 overflow-x-auto border-b px-1.5 py-1">
            {tabs.map((t) => {
              // „Zuletzt"-Tab nur zeigen, wenn es Einträge gibt.
              if (t.key === 'recent' && recent.length === 0) return null;
              return (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => scrollToSection(t.key)}
                  aria-label={t.key}
                  className={
                    'flex h-7 w-7 shrink-0 items-center justify-center rounded text-base transition ' +
                    (activeTab === t.key
                      ? 'bg-muted'
                      : 'opacity-60 hover:opacity-100 hover:bg-muted/60')
                  }
                >
                  {t.icon}
                </button>
              );
            })}
          </div>

          {/* Scrollbarer Emoji-Bereich mit Abschnitten */}
          <div ref={scrollRef} className="max-h-64 overflow-y-auto px-1.5 py-1">
            {sections.map((section) => (
              <div
                key={section.key}
                ref={(el) => {
                  sectionRefs.current[section.key] = el;
                }}
              >
                <div className="sticky top-0 bg-card px-1 py-1 text-[11px] font-medium text-muted-foreground">
                  {section.label}
                </div>
                <div className="grid grid-cols-8 gap-0.5 pb-1">
                  {section.emojis.map((e, i) => (
                    <button
                      key={`${section.key}-${e}-${i}`}
                      type="button"
                      onClick={() => handlePick(e)}
                      className="flex h-8 w-8 items-center justify-center rounded text-xl hover:bg-muted"
                    >
                      {e}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
