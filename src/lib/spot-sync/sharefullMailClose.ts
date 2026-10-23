import { supabaseAdmin as db } from "@/lib/supabase/service";

/** 現在の確定に対するメール起点の停止指示をCronでも再利用する。 */
export async function findCurrentSharefullMailClose(requestId: string, taimeeJobId: string): Promise<string | null> {
  const {data:commands,error:commandError}=await db.from("rpa_command_requests")
    .select("id,request_details").eq("request_details->>created_from","/api/rpa/sharefull/confirmed")
    .eq("request_details->spot_offer_request->>id",requestId).eq("request_details->>taimee_job_id",taimeeJobId)
    .in("status",["approved","running","done"]).order("created_at",{ascending:false}).limit(20);
  if(commandError)throw commandError;
  const prefix=`spot-sync:taimee:close:${taimeeJobId}:sharefull-confirmed:`;
  const candidates=(commands??[]).flatMap(command=>{
    const details=command.request_details as Record<string,unknown>;
    const key=String(details.sync_operation_key||""),applicationKey=String(details.sharefull_application_key||"");
    return key.startsWith(prefix)&&applicationKey?[{id:String(command.id),eventId:key.slice(prefix.length),applicationKey}]:[];
  });
  if(!candidates.length)return null;
  const {data:receipts,error:receiptError}=await db.from("spot_offer_mail_receipts")
    .select("event_id,occurred_at").eq("provider","sharefull").eq("event_kind","confirmed")
    .in("event_id",candidates.map(candidate=>candidate.eventId));
  if(receiptError)throw receiptError;
  const {data:applications,error:applicationError}=await db.from("spot_offer_applications")
    .select("application_key,occurred_at").eq("request_id",requestId).eq("provider","sharefull")
    .eq("state","confirmed").in("application_key",candidates.map(candidate=>candidate.applicationKey));
  if(applicationError)throw applicationError;
  for(const candidate of candidates){
    const receipt=receipts?.find(row=>row.event_id===candidate.eventId);
    const application=applications?.find(row=>row.application_key===candidate.applicationKey);
    if(receipt&&application&&Date.parse(receipt.occurred_at)===Date.parse(application.occurred_at))return candidate.id;
  }
  return null;
}
