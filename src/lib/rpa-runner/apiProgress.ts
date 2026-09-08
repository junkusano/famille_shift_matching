import {NextRequest} from 'next/server';
import {randomUUID} from 'node:crypto';
import {supabaseAdmin as db} from '@/lib/supabase/service';
import {requireTaimeeRpaOperator} from '@/lib/rpa/taimee';
import {cleanEvent} from './progressEvent';
export function withApiProgress(handler:(request:NextRequest)=>Promise<Response>,operation:string){return async(request:NextRequest)=>{
 const started=Date.now();let context:{job_id:string|null;run_id:string;attempt:number;runner_id:string|null}|null=null;
 try{const run=request.headers.get('x-rpa-run-id');if(run){await requireTaimeeRpaOperator(request);const job=request.headers.get('x-rpa-job-id');let runnerId:string|null=null;
  if(job){const {data,error}=await db.from('rpa_runner_jobs').select('claimed_runner_id').eq('id',job).maybeSingle();if(!error&&data?.claimed_runner_id)runnerId=data.claimed_runner_id;}
  if(!job||runnerId)context={job_id:job,run_id:run,attempt:Number(request.headers.get('x-rpa-attempt')||1),runner_id:runnerId};
 }}catch{/* Handler retains its own authorization response. */}
 async function record(code:'api_started'|'api_completed',status?:number){if(!context)return;try{const {runner_id,...rest}=context;const event=cleanEvent({...rest,event_id:randomUUID(),source:'api',code,occurred_at:new Date().toISOString(),version:'0.1.0',data:{operation,duration_ms:Date.now()-started,...(status?{http_status:status}:{})}});if(event){const {error}=await db.from('rpa_progress_events').insert({...event,runner_id});if(error)console.warn('[rpa-progress] API event persistence unavailable');}}catch{console.warn('[rpa-progress] API event persistence unavailable');}}
 await record('api_started');
 try{const response=await handler(request);await record('api_completed',response.status);return response;}catch(e){await record('api_completed',500);throw e;}
};}
