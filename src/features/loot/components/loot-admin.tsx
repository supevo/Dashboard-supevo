'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  saveLootConfigAction,
  deleteLootItemAction,
  giftBoxAction,
} from '@/features/loot/actions';
import type { LootConfig, LootItem } from '@/features/loot/queries';
import {
  type BoxTier,
  WEIGHT_MIN,
  WEIGHT_MAX,
  boxArtUrl,
} from '@/features/loot/shared';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/alert';
import { cn } from '@/lib/utils';

const TIER_LABEL: Record<BoxTier, string> = {
  common: '📦 Common',
  rare: '🎁 Rare',
  super: '💎 Super Rare',
};

// Häufig genutzte Emojis für digitale Badges – anklickbar, Freitext bleibt möglich.
const BADGE_EMOJIS = [
  '🏅', '🥇', '🥈', '🥉', '🎖️', '🏆', '⭐', '🌟', '✨', '💫',
  '💎', '👑', '🔥', '🚀', '🎯', '💪', '🧠', '🍀', '🦄', '🐙',
  '⚡', '❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '🎉',
  '🎊', '🎈', '🎁', '🏵️', '🎗️', '🏳️', '🚩', '🔮', '🧿', '💠',
  '🌈', '☀️', '🌙', '⚙️', '🛡️', '⚔️', '🗡️', '🏹', '🎓', '📈',
  '💡', '🔑', '🧩', '🎮', '🕹️', '🎲', '♟️', '🎳', '🏀', '⚽',
  '🏈', '🎾', '🥊', '🏓', '🥋', '🏆', '🐉', '🦁', '🐯', '🐺',
  '🦅', '🦉', '🐝', '🦋', '🐢', '🐬', '🦈', '🌵', '🌻', '🍄',
  '🍕', '🍔', '🍩', '🍪', '☕', '🍺', '🥂', '🧉', '🎸', '🎧',
  '🎬', '📷', '🖌️', '🎨', '✏️', '📌', '⏰', '🧭', '🗺️', '🏔️',
];

interface Colleague {
  userId: string;
  name: string;
}

interface ExclusiveBanner {
  id: string;
  name: string;
  imageUrl: string;
}

export function LootAdmin({
  config,
  items,
  colleagues,
  banners,
  frames = [],
}: {
  config: LootConfig;
  items: LootItem[];
  colleagues: Colleague[];
  banners: ExclusiveBanner[];
  frames?: ExclusiveBanner[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [cfg, setCfg] = useState(config);

  // Neues Item
  const [boxTier, setBoxTier] = useState<BoxTier>('common');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState<'physical' | 'badge' | 'banner' | 'frame'>('physical');
  const [weight, setWeight] = useState(10);
  const [badgeEmoji, setBadgeEmoji] = useState('🏅');
  const [badgeName, setBadgeName] = useState('');
  const [photo, setPhoto] = useState<File | null>(null);
  const [bannerImageId, setBannerImageId] = useState(banners[0]?.id ?? '');
  const [frameImageId, setFrameImageId] = useState(frames[0]?.id ?? '');

  // Verschenken
  const [giftUser, setGiftUser] = useState(colleagues[0]?.userId ?? '');
  const [giftTier, setGiftTier] = useState<BoxTier>('common');
  const [giftQty, setGiftQty] = useState(1);
  const [giftNote, setGiftNote] = useState('');

  function saveConfig() {
    setError(null);
    setNotice(null);
    start(async () => {
      const res = await saveLootConfigAction(cfg);
      if (res.status === 'error') setError(res.message);
      router.refresh();
    });
  }

  async function addItem() {
    setError(null);
    setNotice(null);
    // Für Banner/Rahmen den Namen als Fallback nehmen.
    const bannerName = banners.find((b) => b.id === bannerImageId)?.name ?? '';
    const frameName = frames.find((f) => f.id === frameImageId)?.name ?? '';
    const effectiveName =
      type === 'banner' && name.trim().length < 2
        ? bannerName
        : type === 'frame' && name.trim().length < 2
          ? frameName
          : name;
    if (type === 'banner' && !bannerImageId) {
      setError('Bitte ein exklusives Titelbild wählen.');
      return;
    }
    if (type === 'frame' && !frameImageId) {
      setError('Bitte einen exklusiven Rahmen wählen.');
      return;
    }
    if (effectiveName.trim().length < 2) {
      setError('Bitte einen Namen angeben.');
      return;
    }
    setBusy(true);
    try {
      const fd = new FormData();
      fd.set('boxTier', boxTier);
      fd.set('name', effectiveName);
      fd.set('description', description);
      fd.set('type', type);
      fd.set('weight', String(weight));
      fd.set('badgeEmoji', badgeEmoji);
      fd.set('badgeName', badgeName);
      if (type === 'banner') fd.set('bannerImageId', bannerImageId);
      if (type === 'frame') fd.set('frameImageId', frameImageId);
      if (photo) fd.set('file', photo);
      const res = await fetch('/api/loot/items', { method: 'POST', body: fd });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !json.ok) {
        setError(json.error ?? 'Fehler beim Hinzufügen.');
      } else {
        setName('');
        setDescription('');
        setBadgeName('');
        setPhoto(null);
        router.refresh();
      }
    } catch {
      setError('Fehler beim Hinzufügen.');
    } finally {
      setBusy(false);
    }
  }

  async function uploadBoxAsset(kind: 'box-art' | 'box-video', tier: BoxTier, file: File) {
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      const fd = new FormData();
      fd.set('file', file);
      const res = await fetch(`/api/loot/${kind}/${tier}`, { method: 'POST', body: fd });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !json.ok) {
        setError(json.error ?? 'Upload fehlgeschlagen.');
      } else {
        setNotice(
          `${kind === 'box-video' ? 'Öffnungs-Video' : 'Box-Bild'} für ${TIER_LABEL[tier]} gespeichert.`,
        );
        router.refresh();
      }
    } catch {
      setError('Upload fehlgeschlagen.');
    } finally {
      setBusy(false);
    }
  }

  function gift() {
    setError(null);
    setNotice(null);
    if (!giftUser) {
      setError('Bitte einen Mitarbeiter wählen.');
      return;
    }
    start(async () => {
      const res = await giftBoxAction({
        userId: giftUser,
        boxTier: giftTier,
        quantity: giftQty,
        note: giftNote,
      });
      if (res.status === 'error') {
        setError(res.message);
      } else if (res.status === 'success') {
        setNotice(res.message ?? 'Box verschenkt.');
        setGiftNote('');
        router.refresh();
      }
    });
  }

  const byTier = (t: BoxTier) => items.filter((i) => i.boxTier === t);

  return (
    <div className="space-y-6">
      {error && <Alert variant="destructive">{error}</Alert>}
      {notice && <Alert>{notice}</Alert>}

      {/* Config */}
      <div className="space-y-3 rounded-lg border p-4">
        <div className="text-sm font-semibold">Coins & Preise</div>
        <div className="grid gap-3 sm:grid-cols-4">
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">XP je Coin</label>
            <Input type="number" min={1} value={cfg.xpPerCoin} onChange={(e) => setCfg({ ...cfg, xpPerCoin: Math.max(1, Number(e.target.value) || 1) })} />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Preis Common</label>
            <Input type="number" min={0} value={cfg.priceCommon} onChange={(e) => setCfg({ ...cfg, priceCommon: Math.max(0, Number(e.target.value) || 0) })} />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Preis Rare</label>
            <Input type="number" min={0} value={cfg.priceRare} onChange={(e) => setCfg({ ...cfg, priceRare: Math.max(0, Number(e.target.value) || 0) })} />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Preis Super Rare</label>
            <Input type="number" min={0} value={cfg.priceSuper} onChange={(e) => setCfg({ ...cfg, priceSuper: Math.max(0, Number(e.target.value) || 0) })} />
          </div>
        </div>
        <Button size="sm" variant="outline" disabled={pending} onClick={saveConfig}>Preise speichern</Button>
      </div>

      {/* Box artwork + opening video */}
      <div className="space-y-3 rounded-lg border p-4">
        <div className="text-sm font-semibold">Box-Bilder & Öffnungs-Videos</div>
        <p className="text-xs text-muted-foreground">
          Lade je Stufe ein Box-Bild (empfohlen quadratisch, z. B. 512×512) und optional ein
          Öffnungs-Video (MP4/WebM, max. 30 MB, am besten kurz) hoch. Das Video wird beim Öffnen
          abgespielt, danach erscheint das Item. Ohne Bild wird ein Emoji angezeigt, ohne Video
          erscheint das Item direkt.
        </p>
        <div className="grid gap-4 sm:grid-cols-3">
          {(['common', 'rare', 'super'] as BoxTier[]).map((t) => (
            <div key={t} className="flex flex-col items-center gap-2 rounded-lg border p-3 text-center">
              <div className="text-xs font-medium">{TIER_LABEL[t]}</div>
              {config.hasArt?.[t] ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={boxArtUrl(t)} alt={t} className="h-20 w-20 rounded object-contain" />
              ) : (
                <div className="flex h-20 w-20 items-center justify-center rounded bg-muted text-2xl">📦</div>
              )}
              <div className="w-full space-y-1 text-left">
                <label className="text-[11px] text-muted-foreground">Box-Bild</label>
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif"
                  disabled={busy}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void uploadBoxAsset('box-art', t, f);
                    e.target.value = '';
                  }}
                  className="block w-full text-xs"
                />
              </div>
              <div className="w-full space-y-1 text-left">
                <label className="text-[11px] text-muted-foreground">
                  Öffnungs-Video {config.hasVideo?.[t] ? '🎬 ✓' : '(optional)'}
                </label>
                <input
                  type="file"
                  accept="video/mp4,video/webm,video/ogg,video/quicktime"
                  disabled={busy}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void uploadBoxAsset('box-video', t, f);
                    e.target.value = '';
                  }}
                  className="block w-full text-xs"
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Add item */}
      <div className="space-y-3 rounded-lg border p-4">
        <div className="text-sm font-semibold">Item zu einer Box hinzufügen</div>
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Box</label>
            <Select value={boxTier} onChange={(e) => setBoxTier(e.target.value as BoxTier)}>
              <option value="common">📦 Common</option>
              <option value="rare">🎁 Rare</option>
              <option value="super">💎 Super Rare</option>
            </Select>
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Typ</label>
            <Select value={type} onChange={(e) => setType(e.target.value as 'physical' | 'badge' | 'banner' | 'frame')}>
              <option value="physical">Physisch (du löst ein)</option>
              <option value="badge">Badge (digital, automatisch)</option>
              <option value="banner">Titelbild (nur über Lootbox)</option>
              <option value="frame">Profilrahmen (nur über Lootbox)</option>
            </Select>
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">
              Häufigkeit ({WEIGHT_MIN}–{WEIGHT_MAX})
            </label>
            <Input
              type="number"
              min={WEIGHT_MIN}
              max={WEIGHT_MAX}
              value={weight}
              onChange={(e) => setWeight(Math.max(WEIGHT_MIN, Math.min(WEIGHT_MAX, Number(e.target.value) || WEIGHT_MIN)))}
            />
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Name</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} placeholder={type === 'badge' ? 'z. B. Glückspilz' : 'z. B. Gutschein 20 €'} />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Beschreibung (optional)</label>
            <Textarea rows={1} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={300} />
          </div>
        </div>

        {type === 'banner' && (
          <div className="space-y-2">
            {banners.length === 0 ? (
              <p className="text-xs text-amber-600 dark:text-amber-400">
                Noch keine exklusiven Titelbilder. Lade zuerst unter{' '}
                <b>Einstellungen → Titelbilder</b> ein Titelbild hoch und markiere es als
                „exklusiv (nur über Lootbox)&ldquo;.
              </p>
            ) : (
              <>
                <label className="text-xs text-muted-foreground">Exklusives Titelbild</label>
                <div className="flex items-center gap-3">
                  <Select
                    value={bannerImageId}
                    onChange={(e) => setBannerImageId(e.target.value)}
                    className="sm:max-w-xs"
                  >
                    {banners.map((b) => (
                      <option key={b.id} value={b.id}>{b.name}</option>
                    ))}
                  </Select>
                  {bannerImageId && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={banners.find((b) => b.id === bannerImageId)?.imageUrl}
                      alt=""
                      className="h-10 w-16 rounded object-cover"
                    />
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  Wer dieses Item zieht und einlöst, schaltet das Titelbild exklusiv im Level
                  Hub frei. Ohne eigenen Namen wird der Titelbild-Name verwendet.
                </p>
              </>
            )}
          </div>
        )}

        {type === 'frame' && (
          <div className="space-y-2">
            {frames.length === 0 ? (
              <p className="text-xs text-amber-600 dark:text-amber-400">
                Noch keine exklusiven Rahmen. Lade zuerst unter{' '}
                <b>Einstellungen → Profilrahmen</b> einen Rahmen hoch und markiere ihn als
                „exklusiv (nur über Lootbox)&ldquo;.
              </p>
            ) : (
              <>
                <label className="text-xs text-muted-foreground">Exklusiver Rahmen</label>
                <div className="flex items-center gap-3">
                  <Select
                    value={frameImageId}
                    onChange={(e) => setFrameImageId(e.target.value)}
                    className="sm:max-w-xs"
                  >
                    {frames.map((f) => (
                      <option key={f.id} value={f.id}>{f.name}</option>
                    ))}
                  </Select>
                  {frameImageId && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={frames.find((f) => f.id === frameImageId)?.imageUrl}
                      alt=""
                      className="h-12 w-12 rounded object-contain"
                    />
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  Wer dieses Item zieht und einlöst, schaltet den Rahmen exklusiv im Level
                  Hub frei. Ohne eigenen Namen wird der Rahmen-Name verwendet.
                </p>
              </>
            )}
          </div>
        )}

        {type === 'physical' && (
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Foto des Loots (optional)</label>
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              onChange={(e) => setPhoto(e.target.files?.[0] ?? null)}
              className="block text-sm"
            />
            {photo && <p className="text-xs text-muted-foreground">Ausgewählt: {photo.name}</p>}
          </div>
        )}

        {type === 'badge' && (
          <div className="space-y-3">
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Badge-Emoji</label>
              <div className="flex flex-wrap gap-1.5">
                {BADGE_EMOJIS.map((em) => (
                  <button
                    key={em}
                    type="button"
                    onClick={() => setBadgeEmoji(em)}
                    className={cn(
                      'flex h-9 w-9 items-center justify-center rounded-lg border text-lg transition hover:bg-muted',
                      badgeEmoji === em && 'border-primary bg-primary/10 ring-1 ring-primary',
                    )}
                    aria-label={`Emoji ${em}`}
                  >
                    <span aria-hidden>{em}</span>
                  </button>
                ))}
                <Input
                  value={badgeEmoji}
                  onChange={(e) => setBadgeEmoji(e.target.value)}
                  maxLength={8}
                  className="h-9 w-20"
                  aria-label="Eigenes Emoji"
                />
              </div>
            </div>
            <div className="space-y-1 sm:max-w-xs">
              <label className="text-xs text-muted-foreground">Badge-Name (optional)</label>
              <Input value={badgeName} onChange={(e) => setBadgeName(e.target.value)} maxLength={60} />
            </div>
          </div>
        )}

        <Button
          size="sm"
          disabled={
            busy ||
            (type === 'banner'
              ? !bannerImageId
              : type === 'frame'
                ? !frameImageId
                : name.trim().length < 2)
          }
          onClick={addItem}
        >
          {busy ? 'Wird gespeichert …' : 'Item hinzufügen'}
        </Button>
        <p className="text-xs text-muted-foreground">
          Die Häufigkeit bestimmt die Ziehwahrscheinlichkeit innerhalb der Box: <b>{WEIGHT_MIN}</b> = sehr
          selten, <b>{WEIGHT_MAX}</b> = sehr häufig. Seltene Top-Preise bekommen einen niedrigen Wert.
        </p>
      </div>

      {/* Gift a box */}
      <div className="space-y-3 rounded-lg border p-4">
        <div className="text-sm font-semibold">🎁 Box verschenken</div>
        <p className="text-xs text-muted-foreground">
          Schenke einem Mitarbeiter Gratis-Boxen – z. B. zum Testen oder in besonderen
          Challenge-Wochen. Er öffnet sie kostenlos im Level Hub.
        </p>
        {colleagues.length === 0 ? (
          <p className="text-xs text-muted-foreground">Keine Mitarbeiter gefunden.</p>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-4">
              <div className="space-y-1 sm:col-span-2">
                <label className="text-xs text-muted-foreground">Mitarbeiter</label>
                <Select value={giftUser} onChange={(e) => setGiftUser(e.target.value)}>
                  {colleagues.map((c) => (
                    <option key={c.userId} value={c.userId}>{c.name}</option>
                  ))}
                </Select>
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Box</label>
                <Select value={giftTier} onChange={(e) => setGiftTier(e.target.value as BoxTier)}>
                  <option value="common">📦 Common</option>
                  <option value="rare">🎁 Rare</option>
                  <option value="super">💎 Super Rare</option>
                </Select>
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Anzahl (1–20)</label>
                <Input
                  type="number"
                  min={1}
                  max={20}
                  value={giftQty}
                  onChange={(e) => setGiftQty(Math.max(1, Math.min(20, Number(e.target.value) || 1)))}
                />
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Notiz (optional)</label>
              <Input value={giftNote} onChange={(e) => setGiftNote(e.target.value)} maxLength={140} placeholder="z. B. Danke für die tolle Woche!" />
            </div>
            <Button size="sm" disabled={pending} onClick={gift}>Box verschenken</Button>
          </>
        )}
      </div>

      {/* Item lists */}
      <div className="grid gap-4 lg:grid-cols-3">
        {(['common', 'rare', 'super'] as BoxTier[]).map((t) => (
          <div key={t} className="rounded-lg border p-3">
            <div className="mb-2 text-sm font-semibold">{TIER_LABEL[t]}</div>
            {byTier(t).length === 0 ? (
              <p className="text-xs text-muted-foreground">Leer</p>
            ) : (
              <ul className="space-y-1.5">
                {byTier(t).map((i) => (
                  <li key={i.id} className="flex items-center gap-2 text-sm">
                    {i.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={i.imageUrl} alt="" className="h-6 w-6 rounded object-cover" />
                    ) : (
                      <span aria-hidden>{i.type === 'badge' ? i.badgeEmoji ?? '🏅' : '🎁'}</span>
                    )}
                    <span className="min-w-0 flex-1 truncate">{i.name}</span>
                    <span className="text-xs text-muted-foreground">×{i.weight}</span>
                    <button
                      type="button"
                      disabled={pending}
                      aria-label="Löschen"
                      className="rounded px-1 text-muted-foreground hover:bg-muted"
                      onClick={() => start(async () => { await deleteLootItemAction(i.id); router.refresh(); })}
                    >
                      ✕
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
