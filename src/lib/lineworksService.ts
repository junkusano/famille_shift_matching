import axios from 'axios';
import { getAccessToken } from '@/lib/getAccessToken';

export type CreateLineWorksUserResult =
  | { success: true; tempPassword: string }
  | { success: false; error: string };

export async function createLineWorksUser(
  userId: string,  // ローカル部 (localPart)
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
    return { success: false, error: 'LINE WORKS 設定 (domainId) が不足しています。' };
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

    if (response.status === 201) {
      console.log('ユーザー作成成功', response.data);
      return { success: true, tempPassword };
    } else {
      console.error('予期しないステータス:', response.status, response.data);
      return { success: false, error: `Unexpected status code: ${response.status}` };
    }
  } catch (err) {
    if (axios.isAxiosError(err)) {
      console.error('API エラー:', err.response?.data || err.message);
      return { success: false, error: JSON.stringify(err.response?.data || err.message) };
    } else {
      console.error('不明なエラー:', err);
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
