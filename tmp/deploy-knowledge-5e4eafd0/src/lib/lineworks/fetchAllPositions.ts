import { getAccessToken } from "@/lib/getAccessToken";

type Position = {
  positionId: string;
  positionName: string;
  positionExternalKey: string;
  displayOrder: number;
};

export async function fetchAllPositions(): Promise<Position[]> {
  const token = await getAccessToken();

  const res = await fetch("https://www.worksapis.com/v1.0/directory/positions", {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });

  if (!res.ok) {
    throw new Error(`Failed to fetch positions: ${res.status} ${res.statusText}`);
  }

  const data = await res.json();
  return data.positions || [];
}
