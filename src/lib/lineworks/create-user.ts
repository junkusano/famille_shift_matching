import { getAccessToken } from '@/lib/getAccessToken';

interface CreateUserParams {
  loginId: string;
  lastName: string;
  firstName: string;
  levelId?: string;
  orgUnitId: string;
  positionId?: string;
}

interface CreateUserResult {
  success: boolean;
  userId?: string; // ← LINE WORKSの内部ID（UUID）
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

    const orgObj: Record<string, unknown> = {
      domainId: domainId,
      primary: true,
      email: `${params.loginId}@shi-on`,
      orgUnits: [orgUnitObj]
    };
    if (params.levelId) {
      orgObj.levelId = params.levelId;
    }

    const body = {
      domainId: domainId,
      email: `${params.loginId}@shi-on`,
      userExternalKey: params.loginId,
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
    const userId = responseData.userId; // ← LINE WORKSが返すUUID（内部ID）

    return { success: true, userId, tempPassword };

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
