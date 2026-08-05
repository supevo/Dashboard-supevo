import { requireAgencyPage } from '@/lib/authz/page-guards';
import { listPasswordEntries } from '@/features/passwords/queries';
import { PasswordManager } from '@/features/passwords/components/password-manager';
import { PasswordImport } from '@/features/passwords/components/password-import';
import { isSecretVaultEnabled } from '@/lib/crypto/secret-vault';

export const dynamic = 'force-dynamic';

export default async function PasswordsPage() {
  await requireAgencyPage();
  const entries = await listPasswordEntries();
  const vault = isSecretVaultEnabled();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">🔐 Passwortmanager</h1>
        <p className="text-sm text-muted-foreground">
          Geteilter Team-Tresor. Passwörter werden verschlüsselt gespeichert und
          von der KI automatisch in Kategorien einsortiert.
        </p>
      </div>

      {!vault && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
          Hinweis: <code>SECRET_ENCRYPTION_KEY</code> ist nicht gesetzt. Ohne
          diesen Schlüssel lassen sich keine Passwörter speichern. Bitte in den
          Umgebungsvariablen (Vercel) hinterlegen.
        </div>
      )}

      <PasswordManager entries={entries} />
      <PasswordImport />
    </div>
  );
}
