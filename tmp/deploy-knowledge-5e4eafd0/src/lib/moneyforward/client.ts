import "server-only";

const TOKEN_URL = "https://api.biz.moneyforward.com/token";
const TENANT_URL = "https://api.biz.moneyforward.com/v2/tenant";
const ACCOUNTING_API_URL = "https://api-accounting.moneyforward.com";
export const MONEY_FORWARD_AUTHORIZE_URL = "https://api.biz.moneyforward.com/authorize";
export const MONEY_FORWARD_TENANT_SCOPE = "mfc/admin/tenant.read";
export const MONEY_FORWARD_ACCOUNTING_READ_SCOPES = [
  "mfc/accounting/offices.read",
  "mfc/accounting/accounts.read",
  "mfc/accounting/journal.read",
  "mfc/accounting/report.read",
] as const;
export const MONEY_FORWARD_SCOPES = [
  MONEY_FORWARD_TENANT_SCOPE,
  ...MONEY_FORWARD_ACCOUNTING_READ_SCOPES,
] as const;

function oauthConfig() {
  const clientId = process.env.MF_CLIENT_ID;
  const clientSecret = process.env.MF_CLIENT_SECRET;
  const redirectUri = process.env.MF_REDIRECT_URI;
  if (!clientId || !clientSecret || !redirectUri) throw new Error("Money Forward OAuth is not configured.");
  const authenticationMethod = process.env.MF_CLIENT_AUTH_METHOD === "client_secret_post"
    ? "client_secret_post"
    : "client_secret_basic";
  return { clientId, clientSecret, redirectUri, authenticationMethod };
}

export type MoneyForwardToken = {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: string;
  scopes: string[];
};

async function tokenRequest(params: URLSearchParams): Promise<MoneyForwardToken> {
  const { clientId, clientSecret, authenticationMethod } = oauthConfig();
  const headers: Record<string, string> = {
    "Content-Type": "application/x-www-form-urlencoded",
    Accept: "application/json",
  };
  if (authenticationMethod === "client_secret_basic") {
    headers.Authorization = `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`;
  } else {
    params.set("client_id", clientId);
    params.set("client_secret", clientSecret);
  }
  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers,
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
  url.searchParams.set("scope", MONEY_FORWARD_SCOPES.join(" "));
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
  const accountId = body.tenant_code ?? body.id ?? body.tenant_id ?? body.code;
  if (accountId === null || accountId === undefined) throw new Error("Money Forward tenant ID was not returned.");
  return {
    accountId: String(accountId),
    accountName: String(body.tenant_name ?? body.name ?? body.code ?? accountId),
    metadata: {
      code: body.tenant_code ?? body.code ?? null,
      fiscalYearStartMonth: body.fiscal_year_start_month ?? null,
    },
  };
}

async function accountingFetch<T>(path: string, accessToken: string, query?: Record<string, string | number | boolean>) {
  const url = new URL(path, ACCOUNTING_API_URL);
  Object.entries(query ?? {}).forEach(([key, value]) => url.searchParams.set(key, String(value)));
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
    cache: "no-store",
  });
  if (!response.ok) {
    if (response.status === 401) throw new Error("Money Forwardの接続期限が切れています。再接続してください。");
    if (response.status === 403) throw new Error("Money Forward会計の読み取り権限がありません。再接続して会計権限を許可してください。");
    throw new Error(`Money Forward会計APIへの接続に失敗しました（${response.status}）。`);
  }
  return response.json() as Promise<T>;
}

export type MoneyForwardAccountingPeriod = {
  fiscal_year: number;
  start_date: string;
  end_date: string;
};

export type MoneyForwardAccountingOffice = {
  name: string;
  code: string;
  type: string;
  accounting_periods: MoneyForwardAccountingPeriod[];
};

export type MoneyForwardTransitionRow = {
  name: string;
  type: string;
  values: number[];
  rows: MoneyForwardTransitionRow[] | null;
};

export type MoneyForwardTransitionReport = {
  fiscal_year: number;
  start_month: number;
  end_month: number;
  report_type: "transition_pl" | "transition_bs";
  columns: string[];
  rows: MoneyForwardTransitionRow[];
  created_at?: string;
};

export function getMoneyForwardAccountingOffice(accessToken: string) {
  return accountingFetch<MoneyForwardAccountingOffice>("/api/v3/offices", accessToken);
}

export function getMoneyForwardTransitionReport(
  accessToken: string,
  reportType: "transition_pl" | "transition_bs",
  fiscalYear: number
) {
  return accountingFetch<MoneyForwardTransitionReport>(`/api/v3/reports/${reportType}`, accessToken, {
    type: "monthly",
    fiscal_year: fiscalYear,
    with_sub_accounts: false,
  });
}
