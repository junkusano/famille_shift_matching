import {NextRequest,NextResponse} from 'next/server';
import {assertCronAuth} from '@/lib/cron/auth';
import {supabaseAdmin} from '@/lib/supabase/service';
export async function GET(request:NextRequest){try{assertCronAuth(request);}catch{return NextResponse.json({error:'Unauthorized'},{status:401});}const {error}=await supabaseAdmin.rpc('prune_rpa_progress_events');return NextResponse.json({ok:!error},{status:error?500:200});}
