import axios from "axios";
import { getAccessToken } from "@/lib/getAccessToken";

/**
 * Deletes a LINE WORKS user by its immutable userId.
 *
 * The normal deletion endpoint preserves LINE WORKS's recovery window. The
 * dashboard can be retried after a timeout or after an earlier request already
 * removed the account.
 */
export async function deleteLineWorksUser(lineworksUserId: string): Promise<void> {
  const accessToken = await getAccessToken();
  try {
    await axios.delete(`https://www.worksapis.com/v1.0/users/${encodeURIComponent(lineworksUserId)}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
  } catch (error) {
    // LINE WORKS returns 404 when a retry targets an already deleted user.
    // 410 is retained for compatibility with the normal deletion endpoint.
    if (axios.isAxiosError(error) && [404, 410].includes(error.response?.status ?? 0)) return;
    throw error;
  }
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
