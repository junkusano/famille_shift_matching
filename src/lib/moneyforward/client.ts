import "server-only";

const TOKEN_URL = "https://api.biz.moneyforward.com/token";
const TENANT_URL = "https://api.biz.moneyforward.com/v2/tenant";
export const MONEY_FORWARD_AUTHORIZE_URL = "https://api.biz.moneyforward.com/authorize";
export const MONEY_FORWARD_TENANT_SCOPE = "mfc/admin/tenant.read";

function oauthConfig() {
  const clientId = process.env.MF_CLIENT_ID;
  const clientSecret = process.env.MF_CLIENT_SECRET;
  const redirectUri = process.env.MF_REDIRECT_URI;
  if (!clientId || !clientSecret || !redirectUri) throw new Error("Money Forward OAuth is not configured.");
  return { clientId, clientSecret, redirectUri };
}

export type MoneyForwardToken = {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: string;
  scopes: string[];
};

async function tokenRequest(params: URLSearchParams): Promise<MoneyForwardToken> {
  const { clientId, clientSecret } = oauthConfig();
  params.set("client_id", clientId);
  params.set("client_secret", clientSecret);
  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: params,
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`Money Forward token request failed (${response.status}).`);
  const body = await response.json() as { access_token?: string; refresh_token?: string; expires_in?: number; scope?: string };
  if (!body.access_token) throw new Error("Money Forward access token was not returned.");
  return {
    accessToken: body.access_token,
    refreshToken: body.refresh_token ?? null,
    expiresAt: new Date(Date.now() + Math.max(60, Number(body.expires_in ?? 3_600)) * 1_000).toISOString(),
    scopes: String(body.scope ?? MONEY_FORWARD_TENANT_SCOPE).split(/\s+/).filter(Boolean),
  };
}

export async function exchangeMoneyForwardCode(code: string) {
  const { redirectUri } = oauthConfig();
  return tokenRequest(new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: redirectUri }));
}

export async function refreshMoneyForwardToken(refreshToken: string) {
  return tokenRequest(new URLSearchParams({ grant_type: "refresh_token", refresh_token: refreshToken }));
}

export function buildMoneyForwardAuthorizationUrl(state: string) {
  const { clientId, redirectUri } = oauthConfig();
  const url = new URL(MONEY_FORWARD_AUTHORIZE_URL);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("scope", MONEY_FORWARD_TENANT_SCOPE);
  url.searchParams.set("state", state);
  return url.toString();
}

export async function getMoneyForwardTenant(accessToken: string) {
  const response = await fetch(TENANT_URL, {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`Money Forward tenant request failed (${response.status}).`);
  const body = await response.json() as Record<string, unknown>;
  const accountId = body.id ?? body.tenant_id ?? body.code;
  if (accountId === null || accountId === undefined) throw new Error("Money Forward tenant ID was not returned.");
  return {
    accountId: String(accountId),
    accountName: String(body.name ?? body.tenant_name ?? body.code ?? accountId),
    metadata: {
      code: body.code ?? null,
      fiscalYearStartMonth: body.fiscal_year_start_month ?? null,
    },
  };
}

