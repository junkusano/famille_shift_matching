import { NextRequest, NextResponse } from "next/server";

import { assertCronAuth } from "@/lib/cron/auth";

import { fetchAllPositions } from "@/lib/lineworks/fetchAllPositions";
import { fetchAllLevels } from "@/lib/lineworks/fetchAllLevels";
import { fetchAllOrgUnits } from "@/lib/lineworks/fetchAllOrgUnits";
import { fetchAllLineworksUsers } from "@/lib/lineworks/fetchAllUsers";
import { fetchAllGroups } from "@/lib/lineworks/fetchAllGroups";

import { savePositionsMaster } from "@/lib/supabase/savePositionsMaster";
import { saveLevelsMaster } from "@/lib/supabase/saveLevelsMaster";
import { saveOrgsMaster } from "@/lib/supabase/saveOrgsMaster";
import { saveUsersLWTemp } from "@/lib/supabase/saveUsersLwTemp";
import { saveGroupsMaster } from "@/lib/supabase/saveGroupsTemp";

export async function GET(req: NextRequest) {
  try {
    assertCronAuth(req);

    const positions = await fetchAllPositions();
    await savePositionsMaster(positions);

    const levels = await fetchAllLevels();
    await saveLevelsMaster(levels);
    
    const orgs = await fetchAllOrgUnits();
    await saveOrgsMaster(orgs);
    
    const users = await fetchAllLineworksUsers();
    await saveUsersLWTemp(users);
    
    const groups = await fetchAllGroups();
    await saveGroupsMaster(groups);
    

    return NextResponse.json({
      status: "OK",
      counts: {
        positions: positions.length,
        levels: levels.length,
        orgs: orgs.length,
        users: users.length,
        groups: groups.length,
        
      },
    });
  } catch (err) {
    console.error("❌ マスター同期全体エラー:", err);
    const unauthorized = err instanceof Error && err.message === "Unauthorized";
    return NextResponse.json(
      { error: unauthorized ? "unauthorized_cron" : "マスター同期失敗" },
      { status: unauthorized ? 401 : 500 }
    );
  }
}
