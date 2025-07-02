import { Position } from "@/types/lineworks";
import { getAccessToken } from "@/lib/getAccessToken";

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

  type RawPosition = {
    positionId: string;
    domainId: string;
    positionName: string;
    positionExternalKey?: string;
    displayOrder?: number;
  };

  const data: { positions: RawPosition[] } = await res.json();

  return data.positions.map((p) => ({
    positionId: p.positionId,
    domainId: p.domainId,
    positionName: p.positionName,
    positionExternalKey: p.positionExternalKey ?? null,
    displayOrder: p.displayOrder ?? null,
  }));
}
