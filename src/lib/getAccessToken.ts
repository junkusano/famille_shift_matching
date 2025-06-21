export async function getAccessToken(): Promise<string> {
  const res = await fetch('/api/lineworks/getAccessToken');
  if (!res.ok) {
    throw new Error(`AccessToken取得失敗: ${res.statusText}`);
  }
  const data = await res.json();
  if (!data.accessToken) {
    throw new Error('AccessTokenが返却されませんでした');
  }
  return data.accessToken;
}
