import 'server-only';
import { env } from '@/lib/env';

/**
 * OneDrive (Microsoft Graph) OAuth configuration, read from the environment so
 * the feature stays inert until an operator sets it up. A PERSONAL OneDrive is
 * supported via the "consumers" authority; delegated flow only (app-only Graph
 * is not available for personal accounts).
 */
export interface OneDriveConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  /** Authority segment: 'consumers' (personal), 'common', or a tenant id. */
  authority: string;
}

const SCOPES = ['offline_access', 'Files.ReadWrite', 'User.Read'];

/** The delegated OAuth scopes we request (space-joined for the auth URL). */
export function oneDriveScopes(): string {
  return SCOPES.join(' ');
}

/** Returns the Graph OAuth config, or null when not configured. */
export function getOneDriveConfig(): OneDriveConfig | null {
  const clientId = process.env.MS_CLIENT_ID;
  const clientSecret = process.env.MS_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;
  const redirectUri =
    process.env.MS_REDIRECT_URI ??
    `${env.NEXT_PUBLIC_APP_URL}/api/integrations/onedrive/callback`;
  const authority = process.env.MS_AUTHORITY ?? 'consumers';
  return { clientId, clientSecret, redirectUri, authority };
}

/** True when the OneDrive integration is configured for this deployment. */
export function isOneDriveConfigured(): boolean {
  return getOneDriveConfig() !== null;
}

export function authorizeUrl(config: OneDriveConfig, state: string): string {
  const p = new URLSearchParams({
    client_id: config.clientId,
    response_type: 'code',
    redirect_uri: config.redirectUri,
    response_mode: 'query',
    scope: oneDriveScopes(),
    state,
  });
  return `https://login.microsoftonline.com/${config.authority}/oauth2/v2.0/authorize?${p.toString()}`;
}

export function tokenUrl(config: OneDriveConfig): string {
  return `https://login.microsoftonline.com/${config.authority}/oauth2/v2.0/token`;
}
