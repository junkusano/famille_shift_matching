import axios from "axios";
import { getAccessToken } from "@/lib/getAccessToken";

/** Deletes a LINE WORKS user by its immutable LINE WORKS userId. */
export async function deleteLineWorksUser(lineworksUserId: string): Promise<void> {
  const accessToken = await getAccessToken();
  await axios.delete(`https://www.worksapis.com/v1.0/users/${encodeURIComponent(lineworksUserId)}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
}
