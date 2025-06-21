import axios, { AxiosError } from 'axios';
import { getAccessToken } from '@/lib/getAccessToken';

export type CreateLineWorksUserResult =
  | { success: true; tempPassword: string }
  | { success: false; error: string };

export async function createLineWorksUser(
  userId: string,
  lastName: string,
  firstName: string,
  phoneticLastName: string,
  phoneticFirstName: string,
  levelId: string,
  orgUnitId: string,
  positionId: string
): Promise<CreateLineWorksUserResult> {
  const accessToken = await getAccessToken();
  const domainId = Number(process.env.LINEWORKS_DOMAIN_ID);

  if (!domainId) {
    return { success: false, error: 'LINE WORKS 設定 (LINEWORKS_DOMAIN_ID) が不足しています。' };
  }

  const email = `${userId}@shi-on`;
  const tempPassword = generateTemporaryPassword();

  const requestBody = {
    domainId,
    email,
    userName: {
      lastName,
      firstName,
      phoneticLastName,
      phoneticFirstName
    },
    passwordConfig: {
      passwordCreationType: 'ADMIN',
      password: tempPassword,
      changePasswordAtNextLogin: true
    },
    organizations: [
      {
        domainId,
        primary: true,
        email,
        levelId,
        orgUnits: [
          {
            orgUnitId,
            primary: true,
            positionId,
            isManager: false,
            visible: true,
            useTeamFeature: true
          }
        ]
      }
    ],
    locale: 'ja_JP',
    timeZone: 'Asia/Tokyo'
  };

  console.log('createLineWorksUser リクエストボディ:', requestBody);

  try {
    const response = await axios.post(
      'https://www.worksapis.com/v1.0/users',
      requestBody,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      }
    );

    console.log('createLineWorksUser レスポンス:', response.status, response.data);

    if (response.status === 201) {
      return { success: true, tempPassword };
    } else {
      return { success: false, error: `Unexpected status code: ${response.status}` };
    }
  } catch (err: unknown) {
    if (axios.isAxiosError(err)) {
      console.error('API エラー詳細:', err.response?.data || err.message);
      return {
        success: false,
        error: JSON.stringify(err.response?.data || err.message)
      };
    } else {
      console.error('不明なエラー:', err);
      return { success: false, error: '不明なエラーが発生しました。' };
    }
  }
}

export async function checkLineWorksUserExists(userId: string): Promise<{ exists: boolean }> {
  const accessToken = await getAccessToken();
  const domainId = Number(process.env.LINEWORKS_DOMAIN_ID);

  if (!domainId) {
    throw new Error('LINE WORKS 設定 (LINEWORKS_DOMAIN_ID) が不足しています');
  }

  try {
    const response = await axios.get(
      `https://www.worksapis.com/v1.0/users/${encodeURIComponent(userId)}@shi-on`,
      {
        headers: { Authorization: `Bearer ${accessToken}` }
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

function generateTemporaryPassword(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let pwd = '';
  for (let i = 0; i < 9; i++) {
    pwd += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return pwd + 'Aa1!';
}
