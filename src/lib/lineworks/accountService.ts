import axios from 'axios';
import { getAccessToken } from '@/lib/getAccessToken';

export async function checkLineWorksUserExists(userId: string): Promise<{ exists: boolean }> {
  const accessToken = await getAccessToken();

  if (!process.env.LINEWORKS_DOMAIN_ID) {
    throw new Error('LINE WORKS 設定 (LINEWORKS_DOMAIN_ID) が不足しています');
  }

  try {
    const response = await axios.get(
      `https://www.worksapis.com/v1.0/users/${encodeURIComponent(userId)}@shi-on.net`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`
        }
      }
    );

    console.log('checkLineWorksUserExists レスポンス:', response.status, response.data);

    return { exists: response.status === 200 };
  } catch (err) {
    if (axios.isAxiosError(err) && err.response?.status === 404) {
      return { exists: false };
    }
    console.error('LINE WORKS ユーザー確認エラー:', err);
    throw new Error('LINE WORKS ユーザー確認中にエラーが発生しました');
  }
}
