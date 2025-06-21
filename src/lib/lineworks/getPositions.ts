import axios from 'axios';

/**
 * LINE WORKS の役職一覧を取得する関数
 * @param accessToken LINE WORKS のアクセストークン
 * @param domainId ドメインID
 * @returns positions の配列
 */
export async function getPositionList(accessToken: string, domainId: string) {
  try {
    const url = `https://www.worksapis.com/v1.0/directory/positions?domainId=${domainId}`;
    console.log('Requesting Positions URL:', url);

    const response = await axios.get(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    });

    return response.data.positions;
  } catch (err) {
    console.error('[getPositionList] データ取得失敗:', err);
    throw new Error('Positions データ取得に失敗しました');
  }
}
