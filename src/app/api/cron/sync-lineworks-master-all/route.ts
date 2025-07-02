import { NextResponse } from "next/server";

import { fetchAllPositions } from "@/lib/lineworks/fetchAllPositions";
import { fetchAllLevels } from "@/lib/lineworks/fetchAllLevels";
//import { fetchAllOrgUnits } from "@/lib/lineworks/fetchAllOrgUnits";
//import { fetchAllLineworksUsers } from "@/lib/lineworks/fetchAllUsers";
//import { fetchAllGroups } from "@/lib/lineworks/fetchAllGroups";

//import { savePositionsTemp } from "@/lib/supabase/savePositionsTemp";
//import { saveLevelsTemp } from "@/lib/supabase/saveLevelsTemp";
//import { saveOrgsLwTemp } from "@/lib/supabase/saveOrgsLwTemp";
//import { saveUsersLWTemp } from "@/lib/supabase/saveUsersLwTemp";
//import { saveGroupsMaster } from "@/lib/supabase/saveGroupsMaster";

import { savePositionsMaster } from "@/lib/supabase/savePositionsMaster";
import { saveLevelsMaster } from "@/lib/supabase/saveLevelsMaster";

export async function GET() {
  try {
    
    const positions = await fetchAllPositions();
    await savePositionsMaster(positions);

    const levels = await fetchAllLevels();
    await saveLevelsMaster(levels);
    /*
    const orgs = await fetchAllOrgs();
    await saveOrgsMaster(orgs);

    const users = await fetchAllUsers();
    await saveUsersMaster(users);

    const groups = await fetchAllGroups();
    await saveGroupsMaster(groups);
    */

    return NextResponse.json({
      status: "OK",
      counts: {
        positions: positions.length,
        /*levels: levels.length,
        orgs: orgs.length,
        users: users.length,
        groups: groups.length,
        */
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
