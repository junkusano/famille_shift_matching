import axios from 'axios';

export function generateTemporaryPassword(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let pwd = '';
  for (let i = 0; i < 12; i++) {
    pwd += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return pwd;
}

export async function createLineWorksUser(
  accessToken: string,
  userId: string,
  name: string,
  email: string
): Promise<{
  success: boolean;
  tempPassword?: string;
  response?: any;
  error?: any;
}> {
  const tempPassword = generateTemporaryPassword();

  const payload = {
    userId,
    name,
    email,
    password: tempPassword,
  };

  try {
    const response = await axios.post('https://www.worksapis.com/v1.0/users', payload, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    });

    return {
      success: true,
      tempPassword,
      response: response.data,
    };
  } catch (err: any) {
    return {
      success: false,
      error: err.response ? err.response.data : err.message,
    };
  }
}
