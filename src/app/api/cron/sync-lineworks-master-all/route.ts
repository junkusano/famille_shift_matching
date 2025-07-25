import { NextResponse } from "next/server";

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

export async function GET() {
  try {
    
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
    return NextResponse.json(
      { error: "マスター同期失敗", detail: String(err) },
      { status: 500 }
    );
  }
}
