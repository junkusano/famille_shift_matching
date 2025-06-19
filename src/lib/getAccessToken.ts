import jwt from 'jsonwebtoken';
import axios, { AxiosResponse } from 'axios';

const serviceAccount = '3xzf3.serviceaccount@shi-on';
const privateKey = `-----BEGIN PRIVATE KEY-----
MIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQDYyu0j7a1cS1wq
rTB/kvXmdRSZB4QV4bYWpwHSESZDpwqSBwIZwvCYw0D2ufrjSuH6Cc3HfygXfZj5
m9qfVzjx7/wIoSL4j79VKy/8KxbV5iAbDtHUFXkAiy5kt+L63++2fo1rLKcVFxGb
+Grbwx5Htg53+QyTt/RNpGHNTSivZtPIlXEjNxiD9lvdSC6+qnWtlxxZO3jw7a+3
oaOkttFZFAjG0WMxRXNZLzNG4bDyQAL9Uwvon/d0FjSyu8dIDbeoyRFY9bpJEGME
4o1vBImtQrMYVZK75jHuMkrdnveNXpdo2kcf598udr+RO//2xIl8rtIlXT6IsVAq
oxj+xTjJAgMBAAECggEAFUrI7lsXncBLtb1QzWwno+d34G0b4fJLKf+5GWKpzsHc
iJRmS8AY//KdXMjOBVODd5qi5VHDJEYnp3b73+PMf1FCAFmjJPp+oOTJpQtZBiUV
830JyroD1Qkrw09Jhw5GGDcRuKb9ZKrhWzTozzC4tp5WNB5NHUJXR5Dk3NRpMeDJ
2dxhdfOFKLIb5z2xUtIiUR3U0BgCC1DeuRufKqbli8iRe6S490RZ40Zn9iR00pZr
B+UMGuyyShfRtASkUAEX31sVTldEMlWLKpHFlqfdL2PuH/gNF0nIpyeNyjbqgmRD
9OGl/KI0CSIgqjwG2SK3PVrdfuKwYc5xvp2cHe/fiQKBgQD5EHKe0VSus+dkZqV+
/p1G1Qym8J9wwjUAo6h4EgeJUlNQfgHrQUgZMh/A3gAnJt7QcUXLARiQbRJtGr3J
Vs5+Vl5uM9Y7d0u6J2B4RpeCpPqnZVKnn0HNWq5wtlqkQ+8gJ3VTby0W3FBDQRD7
gtVzkSE/3XAuODxZ13QMAi79JwKBgQDe1GsFj0e1ZdEBHTefvcr096nNSBHbqiNF
jNckDvT0Ss/IbGlcyWlNBCDzVEMuJPoLL83G9tKTmAUIsaUMXgH0BWEyvs5rG7pr
FNVpiZI75+pjagJfWjN+0KZdA0+yqVXCWkfpBSvrvpbWLwzTubz1MrbmjgYR2+RD
M7yH5o2wjwKBgQCOQkfF0PkWhGmBXmPe4p2AzMXaQIxBQpw1jkT2uA2X8O7nheGg
tvvwcEHUzri1pC0WT+y2ZBzcuYAR03ldm/h8DucG+RK/ioc1f7JJYMC/fW4x2Nza
I0vZeJc0h+PD+Y2HByKrkk/lw9cQYwTJM9Spmtar/NZLgBFwm3CMP18JdwKBgCL0
vclEfeJWE6CSHczAcFtXktqySKLmINxjSMjOU90S81+kqi61JgC/+g9SE6vkfxlM
KYLh64zd10RS4ep7wOCwC1xzlFw3IFp2DTieLUOakSmBUtf0hYmKX97Niy4i5GI1
2XwTpJ05692zydZZF+x7RTgL5aXdkgR81EGZiHa/AoGBAKltynCq7grETtRU7isd
648VnbqPzovwb7ncPFl7s48FJXgU/9TPwpydA+p+BRv0TNkygQpvKpUIGBAhyGyn
yki4NcE6xuBuJOrAhceByuiJY9E35Rs8IIYO8IjkhDQM6XTf49/RZaimy89Cotj8
d/CEiDEBLaUwpwX5cI3hdb/1
-----END PRIVATE KEY-----`;
const clientId = 'bg4uJjAlSS0gTXejntBa';
const serverApiUrl = 'https://auth.worksmobile.com/oauth2/v2.0/token';

export async function getAccessToken(): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iss: clientId,
    sub: serviceAccount,
    iat: now,
    exp: now + 60 * 5,
    aud: serverApiUrl,
  };
  
  const token = jwt.sign(payload, privateKey, { algorithm: 'RS256' });

  console.log('[getAccessToken] JWT Payload:', payload);
  console.log('[getAccessToken] JWT Token (一部):', token.slice(0, 50) + '...');

  try {
    const response: AxiosResponse<{ access_token: string }> = await axios.post(serverApiUrl, null, {
      params: {
        assertion: token,
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        scope: 'directory',
      },
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    });

    console.log('[getAccessToken] Access Token:', response.data.access_token);
    return response.data.access_token;
  } catch (error: unknown) {
    if (axios.isAxiosError(error)) {
      console.error('[getAccessToken] Access Token取得失敗:', error.response?.data || error.message);
    } else {
      console.error('[getAccessToken] Access Token取得失敗（未知のエラー）:', error);
    }
    throw error;
  }
}