import { getAccessToken } from "@/lib/getAccessToken";

type Level = {
  levelId: string;
  displayOrder: number;
  levelName: string;
  levelExternalKey?: string;
  executive: boolean;
};

export async function fetchAllLevels(): Promise<Level[]> {
  const token = await getAccessToken();

  const res = await fetch("https://www.worksapis.com/v1.0/directory/levels", {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });

  if (!res.ok) {
    throw new Error(`Failed to fetch levels: ${res.status} ${res.statusText}`);
  }

  const data = await res.json();
  return data.levels || [];
}
