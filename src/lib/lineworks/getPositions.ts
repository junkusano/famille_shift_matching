import axios from 'axios';

/**
 * LINE WORKS の役職一覧を取得する関数
 * @param accessToken LINE WORKS のアクセストークン
 * @param domainId ドメインID
 * @returns positions の配列
 */
export async function getPositionList(accessToken: string, domainId: string) {
  try {
    const response = await axios.get(`https://www.worksapis.com/v1.0/positions?domainId=${domainId}`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    });

    return response.data.positions;
  } catch (err) {
    console.error('[getPositionList] データ取得失敗:', err);
    throw new Error('Positions データ取得に失敗しました');
  }
}
