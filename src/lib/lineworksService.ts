import axios from 'axios';
import { getAccessToken } from '@/lib/getAccessToken';

export type CreateLineWorksUserResult =
  | { success: true; tempPassword: string }
  | { success: false; error: string };

export async function createLineWorksUser(
  userId: string,
  name: string,
  email: string
): Promise<CreateLineWorksUserResult> {
  console.log('createLineWorksUser 受信データ', { userId, name, email }); 
  const accessToken = await getAccessToken();
  const domainId = process.env.LINEWORKS_DOMAIN_ID;

  if (!domainId) {
    console.error('LINEWORKS_DOMAIN_ID が未設定です');
    return { success: false, error: 'LINE WORKS 設定が不足しています。' };
  }

  const tempPassword = generateTemporaryPassword();

  try {

    const cleanedName = name.replace(/[（）\(\)]/g, '').trim();
    const response = await axios.post(
      'https://www.worksapis.com/v1.0/users',
      {
        userId,
        userName: cleanedName,
        password: tempPassword,
        emails: [{ type: 'WORK', value: email }],
        domainId
      },
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        }
      }
    );

    if (response.status === 201) {
      return { success: true, tempPassword };
    } else {
      console.error('LINE WORKS API 異常レスポンス:', response.status, response.data);
      return { success: false, error: `Unexpected status code: ${response.status}` };
    }
  } catch (err) {
    if (axios.isAxiosError(err)) {
      console.error('LINE WORKS API エラー:', err.response?.data || err.message);
      return { success: false, error: JSON.stringify(err.response?.data || err.message) };
    } else {
      console.error('LINE WORKS API 不明エラー:', err);
      return { success: false, error: '不明なエラーが発生しました。' };
    }
  }
}

function generateTemporaryPassword(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let pwd = '';
  for (let i = 0; i < 9; i++) {
    pwd += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return pwd + 'Aa1!';
}

export async function checkLineWorksUserExists(
  accessToken: string,
  userId: string
): Promise<boolean> {
  try {
    const response = await axios.get(
      `https://www.worksapis.com/v1.0/users/${userId}`,
      {
        headers: { Authorization: `Bearer ${accessToken}` }
      }
    );
    return response.status === 200;
  } catch (err) {
    if (axios.isAxiosError(err)) {
      if (err.response?.status === 404) return false;
      console.error('LINE WORKS ユーザー確認失敗:', err.response?.data || err.message);
      throw new Error(`API エラー: ${JSON.stringify(err.response?.data || err.message)}`);
    } else {
      console.error('未知のエラー:', err);
      throw new Error('未知のエラーが発生しました');
    }
  }
}
