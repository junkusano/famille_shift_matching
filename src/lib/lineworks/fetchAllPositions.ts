import { getAccessToken } from "@/lib/getAccessToken";
import { Position } from "@/types/lineworks";

export async function fetchAllPositions(): Promise<Position[]> {
  const token = await getAccessToken();

  const res = await fetch("https://www.worksapis.com/v1.0/directory/positions?count=1000", {
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

  return (data.positions || []).map((p: any) => ({
    positionId: p.positionId,
    domainId: p.domainId,
    displayOrder: p.displayOrder,
    positionName: p.positionName,
    positionExternalKey: p.positionExternalKey,
  }));
}
