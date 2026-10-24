import { createHash, timingSafeEqual } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin as db } from '@/lib/supabase/service';
import { isSharefullSyncClient, sharefullRpaMode } from '@/lib/spot-sync/sharefullScope';
import { sharefullMailWorkFinished } from '@/lib/spot-sync/sharefullMailReceipt';
import { notifySharefullApplication } from '@/lib/spot-sync/sharefullApplicationNotification';

type State = 'confirmed' | 'cancelled';
type Outcome = 'queued' | 'cancelled' | 'stale' | 'work_finished' | 'no_target' | 'out_of_scope';
type Row = Record<string, any>;
const text = (value: unknown, limit=240) => typeof value==='string' ? value.trim().slice(0,limit) : '';
export const normalizeTaimeeTitle = (value: unknown) => text(value).normalize('NFKC').replace(/\s*@[0-9]{4,}@\s*/g,' ').replace(/\s+/g,' ').trim();
export const normalizeTaimeeName = (value: unknown) => text(value).normalize('NFKC').replace(/\s+/g,'');
function check(error: {code?: string;message?:string} | null) {
 if(error) throw new Error(['SHAREFULL_ORDER_MISSING','CLOSE_JOB_NEEDS_REVIEW','CLOSE_JOB_NOT_RECORDED','EVENT_NOT_RECORDED'].includes(error.message||'') ? error.message : 'DATABASE_ERROR');
}
function authorized(request: NextRequest) {
 const expected=Buffer.from(process.env.TAIMEE_CONFIRMATION_GAS_TOKEN?.trim() || '');
 const supplied=Buffer.from(request.headers.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim() || '');
 return expected.length>0 && expected.length===supplied.length && timingSafeEqual(expected,supplied);
}

/** 受領・応募状態・停止指示・通知を確認した後にだけGASへACKを返す。 */
export async function handleTaimeeMail(request: NextRequest, state: State) {
 if(!authorized(request)) return NextResponse.json({ok:false,code:'UNAUTHORIZED'},{status:401});
 if(process.env.SPOT_PROVIDER_SYNC_ENABLED!=='true' || sharefullRpaMode()==='test')
  return NextResponse.json({ok:false,code:'SYNC_DISABLED'},{status:503});
 let eventId='',received=false;
 try {
  const body=await request.json() as Row;
  eventId=text(body.event_id,160);
  const jobId=text(body.taimee_job_id,100), title=normalizeTaimeeTitle(body.template_title);
  const date=text(body.shift_start_date,10), time=text(body.shift_start_time,5), name=normalizeTaimeeName(body.applicant_name);
  const timestamp=Date.parse(text(body.occurred_at,80));
  if(!eventId || !Number.isFinite(timestamp) || timestamp>Date.now()+300000 || !name
   || (body.state && body.state!==state) || (jobId && !/^[A-Za-z0-9_-]{1,100}$/.test(jobId))
   || (!jobId && (!title || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time))))
   return NextResponse.json({ok:false,code:'INVALID_MAIL_IDENTIFIERS'},{status:400});
  const occurredAt=new Date(timestamp).toISOString();
  // 外部指定キーで別人を取消できないよう、人物キーをサーバー側で固定する。
  const hash=createHash('sha256').update(JSON.stringify({state,jobId,title,date,time,name,occurredAt})).digest('hex');
  const {error:insertError}=await db.from('spot_offer_mail_receipts').upsert({provider:'taimee',event_id:eventId,
   event_kind:state,payload_hash:hash,job_id:jobId||null,occurred_at:occurredAt},{onConflict:'provider,event_id',ignoreDuplicates:true});
  check(insertError);received=true;
  const {data:receipt,error:receiptError}=await db.from('spot_offer_mail_receipts').select('payload_hash,status,outcome,close_runner_job_id').eq('provider','taimee').eq('event_id',eventId).single();
  check(receiptError);
  if(receipt?.payload_hash!==hash) return NextResponse.json({ok:false,code:'MAIL_EVENT_ID_COLLISION'},{status:409});
  if(['completed','ignored'].includes(receipt.status) && receipt.outcome) return NextResponse.json({ok:true,recorded:true,event_id:eventId,
   outcome:receipt.outcome,close_job_id:receipt.close_runner_job_id||undefined});
  async function finish(outcome:Outcome,target?:Row,job?:string,republication?:string) {
   const {error}=await db.from('spot_offer_mail_receipts').update({status:outcome==='work_finished'||outcome==='out_of_scope'?'ignored':'completed',
    outcome,request_id:target?.id||null,close_runner_job_id:job||null,error_code:null,
    completed_at:new Date().toISOString(),last_attempt_at:new Date().toISOString()}).eq('provider','taimee').eq('event_id',eventId).select('event_id').single();
   check(error);
   console.info('[taimee-mail-receipt]',{event_id:eventId,outcome,close_job_id:job||null});
   return NextResponse.json({ok:true,recorded:true,event_id:eventId,outcome,close_job_id:job,republication});
  }
  let query=db.from('spot_offer_request_table').select('*');
  query=jobId?query.eq('taimee_job_id',jobId):query.eq('shift_start_date',date).eq('shift_start_time',time);
  const {data:rows,error:lookupError}=await query.limit(jobId?2:500);check(lookupError);
  const matches=(rows||[]).filter((r:Row)=>jobId || normalizeTaimeeTitle(r.template_title)===title);
  if(matches.length!==1 || (!jobId && (rows||[]).length>=500)) throw new Error(matches.length?'REQUEST_AMBIGUOUS':'REQUEST_NOT_FOUND');
  const target=matches[0] as Row;
  if((title && normalizeTaimeeTitle(target.template_title)!==title) || (date && target.shift_start_date!==date)
   || (time && String(target.shift_start_time).slice(0,5)!==time)) throw new Error('MAIL_REQUEST_MISMATCH');
  if(!isSharefullSyncClient(target.kaipoke_cs_id)) return finish('out_of_scope',target);
  if(sharefullMailWorkFinished(target)) return finish('work_finished',target);
  const {data:apps,error:appsError}=await db.from('spot_offer_applications').select('application_key,applicant_name,state,occurred_at')
   .eq('request_id',target.id).eq('provider','taimee');check(appsError);
  const named=(apps||[]).filter((a:Row)=>normalizeTaimeeName(a.applicant_name)===name);
  if(named.length>1) throw new Error('APPLICANT_AMBIGUOUS');
  // 旧版の匿名レコードは人物との対応が不明。勝手に取消して再掲載しない。
  if((apps||[]).some((a:Row)=>!normalizeTaimeeName(a.applicant_name) && a.state!=='cancelled')) throw new Error('LEGACY_APPLICANT_UNRESOLVED');
  const applicationKey=named[0]?.application_key || `taimee:${jobId||target.taimee_job_id||target.id}:${createHash('sha256').update(name).digest('hex')}`;
  const {error:recordError}=await db.rpc('record_spot_offer_application',{p_request_id:target.id,p_provider:'taimee',
   p_application_key:applicationKey,p_event_id:eventId,p_state:state,p_occurred_at:occurredAt,p_name:name,p_sex:null,p_url:null});check(recordError);
  const {data:sync,error:syncError}=await db.rpc('apply_taimee_mail_sync',{p_request_id:target.id,p_application_key:applicationKey,
   p_event_id:eventId,p_occurred_at:occurredAt,p_state:state});check(syncError);
  const result=sync as Row;
  if(!['queued','cancelled','stale','no_target'].includes(result?.outcome) || (result.outcome==='queued'&&!result.close_job_id)) throw new Error('SYNC_ACK_MISSING');
  if(result.outcome!=='stale') {
   const notification=await notifySharefullApplication({provider:'taimee',eventId,eventTable:'spot_offer_application_events',
    text:`【タイミー${state==='confirmed'?'応募確定':'キャンセル'}】\n${date||target.shift_start_date} ${time||String(target.shift_start_time).slice(0,5)}\n${normalizeTaimeeTitle(target.template_title)}\n${state==='confirmed'?(result.outcome==='queued'?'シェアフルの募集停止を依頼しました。':'応募状態を記録しました。シェアフルの停止対象はありません。'):'応募の取消を記録しました。再掲載は他の応募・担当者・手動停止・締切を確認して行います。'}`});
   if(!notification.sent) throw new Error('NOTIFICATION_PENDING');
  }
  return finish(result.outcome,target,result.close_job_id,result.republication);
 } catch(error) {
  const code=error instanceof Error && /^[A-Z_]{1,80}$/.test(error.message)?error.message:'TAIMEE_MAIL_PROCESSING_FAILED';
  if(received) await db.from('spot_offer_mail_receipts').update({status:'retry',error_code:code,last_attempt_at:new Date().toISOString()}).eq('provider','taimee').eq('event_id',eventId);
  console.warn('[taimee-mail-receipt]',{event_id:eventId,code});
  const conflicts=['REQUEST_AMBIGUOUS','MAIL_REQUEST_MISMATCH','APPLICANT_AMBIGUOUS','LEGACY_APPLICANT_UNRESOLVED','SHAREFULL_ORDER_MISSING','CLOSE_JOB_NEEDS_REVIEW'];
  return NextResponse.json({ok:false,code,event_id:eventId},{status:code==='REQUEST_NOT_FOUND'?404:conflicts.includes(code)?409:503});
 }
}
