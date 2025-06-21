export async function getAccessToken(): Promise<string> {
  const baseUrl = process.env.BASE_URL;

  if (!baseUrl) {
    throw new Error('BASE_URL が未設定です');
  }

  const res = await fetch(`${baseUrl}/api/getAccessToken`);

  if (!res.ok) {
    throw new Error(`AccessToken取得失敗: ${res.status} ${res.statusText}`);
  }

  const data = await res.json();

  if (!data.accessToken) {
    throw new Error('AccessTokenが返却されませんでした');
  }

  return data.accessToken;
}

