import { ExternalApiError } from './errors';

const TOKEN_URL = 'https://icdaccessmanagement.who.int/connect/token';
const API_BASE = 'https://id.who.int';
const RELEASE = '2024-01';
const LINEARIZATION = 'mms';

export interface Icd11Match {
  code: string;
  title: string;
}

let cachedToken: { value: string; expiresAt: number } | null = null;

const getAccessToken = async (): Promise<string> => {
  const clientId = process.env.ICD11_CLIENT_ID;
  const clientSecret = process.env.ICD11_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new ExternalApiError('ICD-11 API credentials are not configured');
  }

  if (cachedToken && cachedToken.expiresAt > Date.now()) {
    return cachedToken.value;
  }

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: clientId,
      client_secret: clientSecret,
      scope: 'icdapi_access',
    }),
  });

  if (!res.ok) {
    throw new ExternalApiError('Failed to authenticate with the ICD-11 API');
  }

  const data = (await res.json()) as { access_token: string; expires_in: number };
  cachedToken = {
    value: data.access_token,
    // Refresh a minute early so an in-flight search never races token expiry.
    expiresAt: Date.now() + (data.expires_in - 60) * 1000,
  };
  return cachedToken.value;
};

const stripHighlight = (title: string) => title.replace(/<\/?em[^>]*>/g, '');

export const searchIcd11 = async (query: string): Promise<Icd11Match[]> => {
  const token = await getAccessToken();

  const url = new URL(`${API_BASE}/icd/release/11/${RELEASE}/${LINEARIZATION}/search`);
  url.searchParams.set('q', query);

  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
      'Accept-Language': 'en',
      'API-Version': 'v2',
    },
  });

  if (!res.ok) {
    throw new ExternalApiError('ICD-11 search request failed');
  }

  const data = (await res.json()) as { destinationEntities?: Array<{ theCode?: string; title?: string }> };
  return (data.destinationEntities ?? [])
    .filter((e) => !!e.theCode && !!e.title)
    .map((e) => ({ code: e.theCode as string, title: stripHighlight(e.title as string) }));
};
