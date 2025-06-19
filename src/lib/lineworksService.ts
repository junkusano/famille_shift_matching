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
