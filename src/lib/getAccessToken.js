const jwt = require('jsonwebtoken');
const axios = require('axios');

// === LINE WORKS アプリ情報 ===
const serviceAccount = '3xzf3.serviceaccount@shi-on';  // あなたのService Account
const privateKey = `-----BEGIN PRIVATE KEY-----
あなたのPRIVATE_KEY文字列
-----END PRIVATE KEY-----`;
const clientId = 'bg4uJjAlSS0gTXejntBa';
const serverApiUrl = 'https://auth.worksmobile.com/oauth2/v2.0/token';
const domainId = '12052449';  // あなたのドメインID（shi-onのID）

// === JWT生成 ===
const now = Math.floor(Date.now() / 1000);
const payload = {
  iss: clientId,
  sub: serviceAccount,
  iat: now,
  exp: now + 60 * 5,  // 5分間有効
  aud: serverApiUrl
};

// directoryスコープ指定
const scope = 'directory';

// JWT署名
const token = jwt.sign(payload, privateKey, { algorithm: 'RS256' });

// === Access Token取得 ===
async function getAccessToken() {
  try {
    const response = await axios.post(serverApiUrl, null, {
      params: {
        assertion: token,
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        scope: scope
      },
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    });

    console.log('Access Token:', response.data.access_token);
    return response.data.access_token;
  } catch (error) {
    console.error('Access Token取得失敗:', error.response ? error.response.data : error.message);
    throw error;
  }
}

// 実行
getAccessToken();

module.exports = getAccessToken;
