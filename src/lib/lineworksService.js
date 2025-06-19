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
) {
  const tempPassword = generateTemporaryPassword();

  const response = await axios.post('https://www.worksapis.com/v1.0/users', {
    userId,
    name,
    email,
    password: tempPassword
  }, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    }
  });

  return { tempPassword, response: response.data };
}
