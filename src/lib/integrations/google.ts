import 'server-only';
import { createHmac } from 'node:crypto';

/**
 * Google-Search-Console-Anbindung über OAuth 2.0 (Rohe fetch-Aufrufe, keine
 * SDK). Nur Lese-Scope. Ablauf:
 *   1. buildAuthUrl() → Nutzer bestätigt den Zugriff bei Google.
 *   2. Callback: exchangeCode() → refresh_token (dauerhaft, verschlüsselt
 *      gespeichert) + access_token (kurzlebig).
 *   3. Später: accessTokenFromRefresh() → frischer access_token → API-Aufrufe.
 */

const AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const SCOPE = 'https://www.googleapis.com/auth/webmasters.readonly';

export function isGoogleConfigured(): boolean {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

function appUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL ?? '').replace(/\/$/, '');
}

export function googleRedirectUri(): string {
  return `${appUrl()}/api/integrations/google/callback`;
}

/** Signiert einen State-Wert (client_company_id) gegen CSRF/Manipulation. */
export function signState(value: string): string {
  const key = process.env.SECRET_ENCRYPTION_KEY ?? 'dev-key';
  const sig = createHmac('sha256', key).update(value).digest('base64url');
  return `${value}.${sig}`;
}

export function verifyState(state: string): string | null {
  const idx = state.lastIndexOf('.');
  if (idx < 0) return null;
  const value = state.slice(0, idx);
  const sig = state.slice(idx + 1);
  const key = process.env.SECRET_ENCRYPTION_KEY ?? 'dev-key';
  const expected = createHmac('sha256', key).update(value).digest('base64url');
  // Konstante-Zeit-Vergleich wäre schöner; hier reicht die HMAC-Prüfung.
  return sig === expected ? value : null;
}

/** Baut die Google-Zustimmungs-URL. `state` schützt den Callback vor CSRF. */
export function buildAuthUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID ?? '',
    redirect_uri: googleRedirectUri(),
    response_type: 'code',
    scope: SCOPE,
    access_type: 'offline', // refresh_token anfordern
    prompt: 'consent', // erzwingt refresh_token auch bei Re-Auth
    include_granted_scopes: 'true',
    state,
  });
  return `${AUTH_ENDPOINT}?${params.toString()}`;
}

interface TokenResponse {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
}

/** Tauscht den Authorization-Code gegen Tokens. */
export async function exchangeCode(
  code: string,
): Promise<{ accessToken: string; refreshToken: string | null } | null> {
  const res = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID ?? '',
      client_secret: process.env.GOOGLE_CLIENT_SECRET ?? '',
      redirect_uri: googleRedirectUri(),
      grant_type: 'authorization_code',
    }),
  });
  const data = (await res.json()) as TokenResponse;
  if (!res.ok || !data.access_token) return null;
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? null,
  };
}

/** Holt mit dem Refresh-Token einen frischen access_token. */
export async function accessTokenFromRefresh(
  refreshToken: string,
): Promise<string | null> {
  const res = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: process.env.GOOGLE_CLIENT_ID ?? '',
      client_secret: process.env.GOOGLE_CLIENT_SECRET ?? '',
      grant_type: 'refresh_token',
    }),
  });
  const data = (await res.json()) as TokenResponse;
  if (!res.ok || !data.access_token) return null;
  return data.access_token;
}

/** Listet die für dieses Konto verifizierten Search-Console-Properties. */
export async function listSites(accessToken: string): Promise<string[]> {
  const res = await fetch('https://searchconsole.googleapis.com/webmasters/v3/sites', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return [];
  const data = (await res.json()) as {
    siteEntry?: { siteUrl: string; permissionLevel: string }[];
  };
  return (data.siteEntry ?? [])
    .filter((s) => s.permissionLevel !== 'siteUnverifiedUser')
    .map((s) => s.siteUrl);
}

export interface SearchQueryRow {
  query: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

/** Top-Suchanfragen der letzten `days` Tage für eine Property. */
export async function querySearchAnalytics(
  accessToken: string,
  siteUrl: string,
  days = 28,
  rowLimit = 25,
): Promise<SearchQueryRow[]> {
  const end = new Date();
  const start = new Date(end.getTime() - days * 24 * 60 * 60 * 1000);
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const res = await fetch(
    `https://searchconsole.googleapis.com/webmasters/v3/sites/${encodeURIComponent(
      siteUrl,
    )}/searchAnalytics/query`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        startDate: iso(start),
        endDate: iso(end),
        dimensions: ['query'],
        rowLimit,
      }),
    },
  );
  if (!res.ok) return [];
  const data = (await res.json()) as {
    rows?: { keys: string[]; clicks: number; impressions: number; ctr: number; position: number }[];
  };
  return (data.rows ?? []).map((r) => ({
    query: r.keys[0] ?? '',
    clicks: r.clicks,
    impressions: r.impressions,
    ctr: r.ctr,
    position: r.position,
  }));
}
