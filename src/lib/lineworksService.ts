import axios from 'axios';

const domainId = process.env.LINEWORKS_DOMAIN_ID;
if (!domainId) {
  throw new Error('LINEWORKS_DOMAIN_ID が環境変数に設定されていません。');
}

export type CreateLineWorksUserResult =
  | { success: true; tempPassword: string }
  | { success: false; error: string };

export async function createLineWorksUser(
  accessToken: string,
  userId: string,
  name: string,
  email: string
): Promise<CreateLineWorksUserResult> {
  const tempPassword = generateTemporaryPassword();

  try {
    const response = await axios.post(
      'https://www.worksapis.com/v1.0/users',
      {
        userId,
        name,
        password: tempPassword,
        emails: [{ type: 'WORK', value: email }],
        domainId: process.env.LINEWORKS_DOMAIN_ID  
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
      return {
        success: false,
        error: `Unexpected status code: ${response.status}`,
      };
    }
  } catch (err) {
    if (axios.isAxiosError(err)) {
      console.error('LINE WORKS API エラー:', err.response?.data || err.message);
      return {
        success: false,
        error: JSON.stringify(err.response?.data || err.message),
      };
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
        headers: {
          Authorization: `Bearer ${accessToken}`,
        }
      }
    );

    return response.status === 200;
  } catch (err) {
    if (axios.isAxiosError(err)) {
      if (err.response?.status === 404) {
        return false;
      }
      console.error('LINE WORKS ユーザー確認失敗:', err.response?.data || err.message);
      throw new Error(`ユーザー確認APIエラー: ${JSON.stringify(err.response?.data || err.message)}`);
    } else {
      console.error('LINE WORKS ユーザー確認未知のエラー:', err);
      throw new Error('未知のエラーが発生しました。');
    }
  }
}
