import {NextRequest,NextResponse} from 'next/server';
import {supabaseAdmin as db} from '@/lib/supabase/service';
import {authenticateRunner,RpaRunnerAuthError} from '@/lib/rpa-runner/auth';
import {requireTaimeeRpaOperator,isRpaTaimeeError} from '@/lib/rpa/taimee';
import {cleanEvent} from '@/lib/rpa-runner/progressEvent';
export const dynamic='force-dynamic';
export async function POST(request:NextRequest) {
 try {
  const raw=await request.text();if(raw.length>200000)return NextResponse.json({error:'Too large'},{status:413});
  const body=JSON.parse(raw);let runnerId:string|null=null;
  if(body.runner_id)runnerId=(await authenticateRunner(request,body.runner_id)).runnerId;
  else await requireTaimeeRpaOperator(request);
  if(!Array.isArray(body.events)||body.events.length>100)return NextResponse.json({error:'Invalid batch'},{status:400});
  const events=body.events.map(cleanEvent);
  if(events.some((e:ReturnType<typeof cleanEvent>)=>!e))return NextResponse.json({error:'Invalid event'},{status:400});
  if(!runnerId&&events.some((e:NonNullable<ReturnType<typeof cleanEvent>>)=>e.source!=='extension'||e.job_id!==null))return NextResponse.json({error:'Invalid source'},{status:403});
  if(runnerId){
   const ids=[...new Set(events.map((e:NonNullable<ReturnType<typeof cleanEvent>>)=>e.job_id))];
   if(ids.includes(null))return NextResponse.json({error:'Job required'},{status:400});
   const {data:jobs,error}=await db.from('rpa_runner_jobs').select('id').in('id',ids).eq('claimed_runner_id',runnerId);
   if(error)throw error;if(jobs?.length!==ids.length)return NextResponse.json({error:'Job ownership mismatch'},{status:403});
  }
  const {error}=await db.from('rpa_progress_events').upsert(events.map((e:object)=>({...e,runner_id:runnerId})),{onConflict:'event_id',ignoreDuplicates:true});
  if(error)throw error;
  await db.rpc('prune_rpa_progress_events');
  return NextResponse.json({ok:true});
 }catch(e){return NextResponse.json({error:'Log upload failed'},{status:e instanceof RpaRunnerAuthError?401:isRpaTaimeeError(e)?e.status:500});}
}
export async function GET(request:NextRequest){
 try{await requireTaimeeRpaOperator(request);let q=db.from('rpa_progress_events').select('*,rpa_runners(runner_name)').order('occurred_at',{ascending:false}).limit(500);
 const run=request.nextUrl.searchParams.get('run_id');if(run)q=q.eq('run_id',run);
 const {data,error}=await q;if(error)throw error;return NextResponse.json({ok:true,events:data??[]});
 }catch(e){return NextResponse.json({error:'ログを取得できませんでした'},{status:isRpaTaimeeError(e)?e.status:500});}
}
