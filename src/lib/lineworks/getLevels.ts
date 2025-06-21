import axios from 'axios';

/**
 * LINE WORKS の職級一覧を取得する関数
 * @param accessToken LINE WORKS のアクセストークン
 * @param domainId ドメインID
 * @returns levels の配列
 */
export async function getLevelList(accessToken: string, domainId: string) {
  try {
    const url = `https://www.worksapis.com/v1.0/directory/levels?domainId=${domainId}`;
    console.log('Requesting Levels URL:', url);

    const response = await axios.get(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    });

    return response.data.levels;
  } catch (err) {
    console.error('[getLevelList] データ取得失敗:', err);
    throw new Error('Levels データ取得に失敗しました');
  }
}
