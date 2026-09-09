import axios from "axios";
import { getAccessToken } from "@/lib/getAccessToken";

/** Deletes a LINE WORKS user by its immutable LINE WORKS userId. */
export async function deleteLineWorksUser(lineworksUserId: string): Promise<void> {
  const accessToken = await getAccessToken();
  await axios.delete(`https://www.worksapis.com/v1.0/users/${encodeURIComponent(lineworksUserId)}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
}

/** Confirms current existence by the immutable LINE WORKS userId. */
export async function lineWorksUserExists(lineworksUserId: string): Promise<boolean> {
  const accessToken = await getAccessToken();
  try {
    await axios.get(`https://www.worksapis.com/v1.0/users/${encodeURIComponent(lineworksUserId)}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    return true;
  } catch (error) {
    if (axios.isAxiosError(error) && error.response?.status === 404) return false;
    throw error;
  }
}
