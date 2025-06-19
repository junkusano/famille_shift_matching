import axios from 'axios';

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
        emails: [{ type: 'WORK', value: email }]
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
      console.error('API異常レスポンス:', response.data);
      return { success: false, error: 'LINE WORKS ユーザー作成に失敗しました。' };
    }

  } catch (err) {
    if (axios.isAxiosError(err) && err.response) {
      console.error('LINE WORKS API エラー:', err.response.data);
      return { success: false, error: JSON.stringify(err.response.data) };
    } else {
      console.error('LINE WORKS API 不明エラー:', err);
      return { success: false, error: '不明なエラーが発生しました。' };
    }
  }
}

function generateTemporaryPassword(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let pwd = '';
  for (let i = 0; i < 12; i++) {
    pwd += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return pwd + 'Aa1!';
}

/**
 * LINE WORKS のユーザーが存在するか確認する
 */
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
        },
      }
    );

    // 存在していれば 200 が返る想定
    return response.status === 200;
  } catch (error: unknown) {
    if (axios.isAxiosError(error)) {
      if (error.response?.status === 404) {
        return false; // ユーザーが存在しない場合
      }
      console.error('LINE WORKS ユーザー確認失敗:', error.response?.data || error.message);
    } else {
      console.error('LINE WORKS ユーザー確認未知のエラー:', error);
    }
    throw error; // その他エラーは投げる（ネットワーク異常など）
  }
}
