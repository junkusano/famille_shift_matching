import { getAccessToken } from "@/lib/getAccessToken";

export type LineworksGroup = {
    groupId: string;
    groupName: string;
};

export async function fetchAllGroups(): Promise<LineworksGroup[]> {
    const token = await getAccessToken();
    const domainId = process.env.NEXT_PUBLIC_LINEWORKS_DOMAIN_ID;
    const apiUrl = "https://www.worksapis.com/v1.0/groups";

    const allGroups: LineworksGroup[] = [];
    let cursor = "";
    let hasMore = true;

    while (hasMore) {
        const res = await fetch(`${apiUrl}?domainId=${domainId}&count=100${cursor ? `&cursor=${cursor}` : ""}`, {
            method: "GET",
            headers: {
                Authorization: `Bearer ${token}`,
                "Content-Type": "application/json",
            },
        });

        if (!res.ok) throw new Error(`Group fetch failed: ${res.statusText}`);
        const json = await res.json();

        allGroups.push(...(json.groups || []));
        cursor = json.responseMetaData?.nextCursor || "";
        hasMore = !!cursor;
    }

    return allGroups;
}
