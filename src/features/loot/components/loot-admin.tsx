'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  saveLootConfigAction,
  addLootItemAction,
  deleteLootItemAction,
} from '@/features/loot/actions';
import type { LootConfig, LootItem, BoxTier } from '@/features/loot/queries';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/alert';

const TIER_LABEL: Record<BoxTier, string> = {
  common: '📦 Common',
  rare: '🎁 Rare',
  super: '💎 Super Rare',
};

export function LootAdmin({
  config,
  items,
}: {
  config: LootConfig;
  items: LootItem[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [cfg, setCfg] = useState(config);

  const [boxTier, setBoxTier] = useState<BoxTier>('common');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState<'physical' | 'badge'>('physical');
  const [weight, setWeight] = useState(10);
  const [badgeEmoji, setBadgeEmoji] = useState('🏅');
  const [badgeName, setBadgeName] = useState('');

  function saveConfig() {
    setError(null);
    start(async () => {
      const res = await saveLootConfigAction(cfg);
      if (res.status === 'error') setError(res.message);
      router.refresh();
    });
  }

  function addItem() {
    setError(null);
    start(async () => {
      const res = await addLootItemAction({ boxTier, name, description, type, weight, badgeEmoji, badgeName });
      if (res.status === 'error') {
        setError(res.message);
        return;
      }
      setName('');
      setDescription('');
      setBadgeName('');
      router.refresh();
    });
  }

  const byTier = (t: BoxTier) => items.filter((i) => i.boxTier === t);

  return (
    <div className="space-y-6">
      {error && <Alert variant="destructive">{error}</Alert>}

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
            <Select value={type} onChange={(e) => setType(e.target.value as 'physical' | 'badge')}>
              <option value="physical">Physisch (du löst ein)</option>
              <option value="badge">Badge (digital, automatisch)</option>
            </Select>
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Gewicht (Häufigkeit)</label>
            <Input type="number" min={1} value={weight} onChange={(e) => setWeight(Math.max(1, Number(e.target.value) || 1))} />
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
        {type === 'badge' && (
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Badge-Emoji</label>
              <Input value={badgeEmoji} onChange={(e) => setBadgeEmoji(e.target.value)} maxLength={8} className="w-24" />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Badge-Name (optional)</label>
              <Input value={badgeName} onChange={(e) => setBadgeName(e.target.value)} maxLength={60} />
            </div>
          </div>
        )}
        <Button size="sm" disabled={pending || name.trim().length < 2} onClick={addItem}>Item hinzufügen</Button>
        <p className="text-xs text-muted-foreground">
          Das Gewicht bestimmt die Ziehwahrscheinlichkeit innerhalb der Box (höher = häufiger). Seltene Items bekommen ein niedriges Gewicht.
        </p>
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
                    <span aria-hidden>{i.type === 'badge' ? i.badgeEmoji ?? '🏅' : '🎁'}</span>
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
