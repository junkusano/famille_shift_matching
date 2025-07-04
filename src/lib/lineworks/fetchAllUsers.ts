// ✅ lib/lineworks/fetchAllUsers.ts
import { User } from '@/types/lineworks';
import { getAccessToken } from '@/lib/getAccessToken';

export async function fetchAllLineworksUsers(): Promise<User[]> {
  const baseUrl = 'https://www.worksapis.com/v1.0/users';
  const domainId = process.env.LINEWORKS_DOMAIN_ID;
  const accessToken = await getAccessToken();
  let users: User[] = [];
  let cursor: string | null = null;

  while (true) {
    const url = `${baseUrl}?domainId=${domainId}&count=100${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`;
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`LINE WORKS APIエラー: ${res.status} - ${text}`);
    }

    const json = await res.json();
    users = users.concat(json.users || []);

    if (!json.responseMetaData?.nextCursor) break;
    cursor = json.responseMetaData.nextCursor;
  }

  return users;
}
