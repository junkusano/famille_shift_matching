import { supabaseAdmin as db } from '@/lib/supabase/service';
import { createCloseRequest, createOpenRequest } from '@/lib/spot_offer/spot_offer_sync_check';
import { desiredAction, staffAssigned, type Application } from './policy';
import { isSharefullSyncClient } from './sharefullScope';

type Row = Record<string, any>;
function check(error: { message: string; code?: string } | null) { if (error && error.code !== '23505') throw new Error(error.message); }
export function providerSyncEnabled() { return process.env.SPOT_PROVIDER_SYNC_ENABLED === 'true'; }

export async function reconcileSpotProviders() {
  if (!providerSyncEnabled()) return { enabled: false, processed: 0 };
  let processed = 0;
  const errors: {request_id: string; message: string}[] = [];
  const today = new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10);
  for (let offset = 0; ; offset += 500) {
    const {data: requests, error} = await db.from('spot_offer_request_table').select('*').gte('shift_start_date', today).order('id').range(offset, offset + 499);
    check(error); if (!requests?.length) break;
    const {data: shifts, error: shiftError} = await db.from('shift').select('*').in('shift_id', requests.map(r => r.shift_id).filter(Boolean));
    check(shiftError);
    const ids = [...new Set((shifts ?? []).flatMap(s => [s.staff_01_user_id, s.staff_02_user_id, s.staff_03_user_id]).filter(id => id && id !== '-'))];
    const {data: users, error: userError} = ids.length ? await db.from('user_entry_united_view_single').select('user_id,system_role').in('user_id', ids) : {data: [], error: null};
    check(userError);
    const roles = new Map<string,string>((users ?? []).map(u => [u.user_id,u.system_role]));
    const {data: applications, error: applicationError} = await db.from('spot_offer_applications').select('request_id,provider,state').in('request_id',requests.map(r=>r.id));
    check(applicationError);
    for (const request of requests) {
      try {
        const shift = shifts?.find(s => String(s.shift_id) === String(request.shift_id)) ?? null;
        const apps = (applications ?? []).filter(a => a.request_id === request.id) as Application[];
        const action = (provider: string) => desiredAction({provider, status:request.status, applications:apps, shift, assigned:!!shift && staffAssigned(shift,roles), manualStop:request.recruitment_paused});
        if (action('taimee') === 'close' && apps.some(a => a.provider !== 'taimee' && ['applied','confirmed'].includes(a.state))) await createCloseRequest(request, 'other_application');
        if (action('taimee') !== 'close') {
          const {error: cancelError} = await db.from('rpa_command_requests').update({status:'cancelled'})
            .eq('request_details->>shift_id',String(request.shift_id)).eq('request_details->>reason','other_application')
            .in('status',['pending','approved']);
          check(cancelError);
        }
        if (action('taimee') === 'open' && shift) {
          const {data: closed, error: closeError} = await db.from('rpa_command_requests').select('id,status').eq('request_details->>shift_id', String(request.shift_id)).eq('request_details->>reason','other_application').order('created_at',{ascending:false}).limit(1);
          check(closeError);
          if (closed?.[0]?.status === 'done') {
            const key = `spot-sync:taimee:open:${closed[0].id}`;
            const {data: reopened,error: reopenedError} = await db.from('rpa_command_requests').select('id').eq('request_details->>sync_operation_key',key).limit(1);
            check(reopenedError);
            if (!reopened?.length) await createOpenRequest(shift, undefined, {reason:'application_cancelled',sourceCloseRequestId:closed[0].id});
          }
        }
        const sharefullInScope = isSharefullSyncClient(request.kaipoke_cs_id);
        const sharefullAction = action('sharefull');
        if (sharefullInScope && sharefullAction !== 'open') {
          const {error: cancelError} = await db.from('rpa_runner_jobs').update({status:'cancelled'}).eq('job_type','sharefull.create_spot_offer').eq('payload->>spot_offer_request_id',request.id).eq('status','pending');
          check(cancelError);
        }
        if (sharefullInScope && sharefullAction === 'close' && request.sharefull_job_id && request.sharefull_status !== 'closed') {
          if (!request.sharefull_order_id) throw new Error('シェアフルのURL管理番号が未取得です。求人詳細の確認が必要です。');
          const key = `spot-sync:sharefull:close:${request.sharefull_order_id}:${request.recruitment_revision}`;
          const {error: insertError} = await db.from('rpa_runner_jobs').insert({job_type:'sharefull.close_spot_offer',status:'pending',payload:{
            spot_offer_request_id:request.id, sharefull_order_id:request.sharefull_order_id,sharefull_job_id:request.sharefull_job_id,
            sync_operation_key:key,created_from:'cron.spot-offer-sync-check'
          }});
          check(insertError);
        }
        if (sharefullInScope && sharefullAction === 'open' && request.sharefull_status === 'closed') {
          // 終了求人のIDは履歴に保存済み。新しい募集として作り直す。
          const {error: resetError} = await db.from('spot_offer_request_table').update({sharefull_job_id:null,sharefull_order_id:null,sharefull_status:'ready_for_offer',sharefull_sync_error:null}).eq('id',request.id).eq('sharefull_status','closed').eq('status','募集中');
          check(resetError);
        }
        processed++;
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        errors.push({request_id:request.id,message});
        await db.from('spot_offer_request_table').update({sharefull_sync_error:message}).eq('id',request.id);
      }
    }
    if (requests.length < 500) break;
  }
  return {enabled:true,processed,errors};
}

/** 実行待ちの間に応募・担当者確定・時間切れになっていないか再確認する。 */
export async function validateSharefullSyncJob(jobType: string, payload: Row): Promise<boolean> {
  if (!payload.spot_offer_request_id) return true; // 既存の手動ジョブは互換性維持
  const {data:r,error}=await db.from('spot_offer_request_table').select('*').eq('id',payload.spot_offer_request_id).maybeSingle(); check(error);
  if (!r || !isSharefullSyncClient(r.kaipoke_cs_id)) return false;
  const {data:s,error:se}=await db.from('shift').select('*').eq('shift_id',r.shift_id).maybeSingle(); check(se);
  const {data:apps,error:ae}=await db.from('spot_offer_applications').select('provider,state').eq('request_id',r.id); check(ae);
  const ids=s?[s.staff_01_user_id,s.staff_02_user_id,s.staff_03_user_id].filter(Boolean):[];
  const {data:users,error:ue}=ids.length?await db.from('user_entry_united_view_single').select('user_id,system_role').in('user_id',ids):{data:[],error:null};check(ue);
  const action=desiredAction({provider:'sharefull',status:r.status,applications:apps??[],shift:s,assigned:!!s&&staffAssigned(s,new Map((users??[]).map(u=>[u.user_id,u.system_role]))),manualStop:r.recruitment_paused});
  const timeMinutes = (v: unknown) => { const [h,m]=String(v??'').split(':').map(Number); return h*60+m; };
  const obsolete = !!s && (payload.reason === 'date_changed' && payload.original_shift_start_date !== s.shift_start_date
    || payload.reason === 'time_changed' && Math.abs(timeMinutes(payload.original_shift_start_time)-timeMinutes(s.shift_start_time))>30);
  const ownApplication = (apps??[]).some(a=>a.provider==='sharefull' && ['applied','confirmed'].includes(a.state));
  if(jobType==='sharefull.close_spot_offer') return !ownApplication && (action==='close' || obsolete) && r.sharefull_order_id===payload.sharefull_order_id && r.sharefull_job_id===payload.sharefull_job_id;
  return action==='open' && !r.sharefull_job_id && r.shift_start_date===payload.shift_start_date && timeMinutes(r.shift_start_time)===timeMinutes(payload.shift_start_time);
}
