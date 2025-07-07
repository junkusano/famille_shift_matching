import { getAccessToken } from '@/lib/getAccessToken';

interface CreateUserParams {
  localName: string;
  lastName: string;
  firstName: string;
  levelId?: string;   // オプション
  orgUnitId: string;
  positionId?: string; // オプション
}

interface CreateUserResult {
  userId?: string;
  success: boolean;
  tempPassword?: string;
  error?: string;
}

export async function createLineWorksUser(params: CreateUserParams): Promise<CreateUserResult> {
  try {
    const accessToken = await getAccessToken();
    const tempPassword = generateSecurePassword();

    const domainIdRaw = process.env.NEXT_PUBLIC_LINEWORKS_DOMAIN_ID;
    if (!domainIdRaw) {
      throw new Error('環境変数 NEXT_PUBLIC_LINEWORKS_DOMAIN_ID が未設定です');
    }
    const domainId = Number(domainIdRaw);

    // orgUnits オブジェクト
    const orgUnitObj: Record<string, unknown> = {
      orgUnitId: params.orgUnitId,
      primary: true,
      isManager: false,
      visible: true,
      useTeamFeature: false
    };
    if (params.positionId) {
      orgUnitObj.positionId = params.positionId;
    }

    // organizations オブジェクト
    const orgObj: Record<string, unknown> = {
      domainId: domainId,
      primary: true,
      email: `${params.localName}@shi-on`,
      orgUnits: [orgUnitObj]
    };
    if (params.levelId) {
      orgObj.levelId = params.levelId;
    }

    // リクエスト body
    const body = {
      domainId: domainId,  // ⭐ ルート直下に domainId を追加
      email: `${params.localName}@shi-on`,
      userName: {
        lastName: params.lastName,
        firstName: params.firstName
      },
      passwordConfig: {
        passwordCreationType: "ADMIN",
        password: tempPassword,
        changePasswordAtNextLogin: true
      },
      organizations: [orgObj]
    };

    // デバッグログ
    console.log('送信 domainId:', domainId);
    console.log('送信 body (raw):', body);
    console.log('送信 body (JSON):', JSON.stringify(body, null, 2));

    // API 呼び出し
    const res = await fetch('https://www.worksapis.com/v1.0/users', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json;charset=UTF-8',
        'Authorization': `Bearer ${accessToken}`
      },
      body: JSON.stringify(body)
    });



    if (!res.ok) {
      const errorData = await res.json();
      console.error('LINE WORKS API エラー:', errorData);
      return { success: false, error: errorData.description || errorData.message || 'LINE WORKS API エラー' };
    }

    const responseData = await res.json();
    const userId = responseData.userId;

    return { success: true, tempPassword, userId };

  } catch (err) {
    console.error('createLineWorksUser 実行時エラー:', err);
    return {
      success: false,
      error: err instanceof Error ? err.message : '未知のエラー'
    };
  }
}

function generateSecurePassword(): string {
  const part1 = Math.random().toString(36).slice(-4);
  const part2 = Math.random().toString(36).slice(-4);
  return `${part1}${part2}Aa1!`;
}
