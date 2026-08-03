import 'server-only';
import { createSupabaseServiceClient } from '@/lib/supabase/service';
import { createNotifications } from '@/features/notifications/create';
import { berlinToday } from '@/lib/time';
import { isBirthdayOn, BIRTHDAY_BOX_TIER } from '@/features/birthday/helpers';

export interface BirthdayGrantResult {
  isBirthday: boolean;
  newlyGranted: boolean;
}

/**
 * Idempotently grants the birthday reward for a user, if today is their
 * birthday. Anti-glitch: a birthday_grants row is unique per (user, year), so a
 * user gets at most ONE birthday reward per calendar year no matter how often
 * they change their date of birth. The lootbox is only handed out on the first
 * (successful) insert for the year. Safe to call from a read path (hub view) or
 * from the daily cron — both go through the same once-per-year lock.
 *
 * Uses the service client (writes target loot_grants / notifications / a table
 * without an insert policy); callers do not need extra authorization since the
 * grant only ever benefits the user's own row on their real birthday.
 */
export async function ensureBirthdayGrant(
  userId: string,
  orgId: string,
): Promise<BirthdayGrantResult> {
  const service = createSupabaseServiceClient();

  const { data: hr } = await service
    .from('employee_hr_profiles')
    .select('date_of_birth')
    .eq('user_id', userId)
    .maybeSingle();

  const today = berlinToday();
  if (!isBirthdayOn(hr?.date_of_birth, today)) {
    return { isBirthday: false, newlyGranted: false };
  }

  const year = Number(today.slice(0, 4));

  // The once-per-year lock: insert is ignored if a row for this (user, year)
  // already exists, so only the very first call this year returns a row.
  const { data: inserted } = await service
    .from('birthday_grants')
    .upsert(
      { user_id: userId, year, organization_id: orgId, box_tier: BIRTHDAY_BOX_TIER },
      { onConflict: 'user_id,year', ignoreDuplicates: true },
    )
    .select('user_id');

  const newlyGranted = (inserted ?? []).length > 0;
  if (!newlyGranted) return { isBirthday: true, newlyGranted: false };

  // First time this year → hand out exactly one lootbox and greet the user.
  await service.from('loot_grants').insert({
    organization_id: orgId,
    user_id: userId,
    box_tier: BIRTHDAY_BOX_TIER,
    note: 'Geburtstags-Lootbox 🎂',
  });

  await createNotifications([
    {
      organizationId: orgId,
      recipientId: userId,
      type: 'birthday',
      title: '🎉 Alles Gute zum Geburtstag!',
      body: 'Für dich gibt es heute eine Geburtstags-Lootbox – viel Spaß beim Öffnen!',
      entityType: 'loot',
      entityId: null,
    },
  ]);

  return { isBirthday: true, newlyGranted: true };
}
