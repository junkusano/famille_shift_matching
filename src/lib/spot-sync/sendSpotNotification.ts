import { supabaseAdmin } from '@/lib/supabase/service';
import { sendLWBotMessage } from '@/lib/lineworks/sendLWBotMessage';

export type SpotNotificationTopic = 'sharefull_application' | 'sharefull_content_policy' | 'sharefull_template_review' | 'sharefull_runner_failure';
type Input = { topic: SpotNotificationTopic; key: string; channelId: string; text: string; accessToken: string; isTest?: boolean };
type Dependencies = {
  db: typeof supabaseAdmin;
  sendChannel: (channel: string, text: string, token: string) => Promise<unknown>;
  sendUser: (user: string, text: string, token: string) => Promise<unknown>;
};
class RejectedDelivery extends Error {}

async function sendUser(user: string, text: string, token: string) {
  const response = await fetch(`https://www.worksapis.com/v1.0/bots/6807751/users/${encodeURIComponent(user)}/messages`, {
    method: 'POST', headers: {Authorization:`Bearer ${token}`,'Content-Type':'application/json'},
    body: JSON.stringify({content:{type:'text',text}}), signal: AbortSignal.timeout(20000),
  });
  if (!response.ok) throw new RejectedDelivery(`HTTP_${response.status}`);
}

/** 送信先ごとに完了を保存する。部分失敗時も、成功済みの共通トークへ再送しない。 */
export async function sendSpotNotification(input: Input, overrides: Partial<Dependencies> = {}): Promise<void> {
  const deps: Dependencies = {db:supabaseAdmin,sendChannel:sendLWBotMessage,sendUser,...overrides};
  // テスト環境の既存通知先を保持し、本番の個別受信者へ流さない。
  if (input.isTest || process.env.SHAREFULL_RPA_MODE?.trim().toLowerCase()==='test') {
    await deps.sendChannel(input.channelId,input.text,input.accessToken); return;
  }
  const key = `${input.topic}:${input.key}`;
  async function deliver(type: 'channel'|'user', id: string) {
    const {data:claim,error}=await deps.db.rpc('claim_spot_notification_delivery',{p_key:key,p_type:type,p_destination:id});
    if (error) throw new Error('SPOT_NOTIFICATION_CLAIM_FAILED');
    if (claim==='sent') return;
    if (claim!=='claimed') throw new Error(claim==='busy'?'SPOT_NOTIFICATION_IN_PROGRESS':'SPOT_NOTIFICATION_OUTCOME_UNKNOWN');
    try {
      await (type==='channel'?deps.sendChannel:deps.sendUser)(id,input.text,input.accessToken);
    } catch (error) {
      // HTTPで拒否された送信だけを再試行可能にする。通信断は受理済みの可能性がある。
      const rejected=error instanceof RejectedDelivery || error instanceof Error && error.message.startsWith('LINE WORKS message send failed:');
      const {error:saveError}=await deps.db.from('spot_notification_deliveries' as never)
        .update({status:rejected?'pending':'uncertain',error_code:rejected?'DELIVERY_REJECTED':'DELIVERY_OUTCOME_UNKNOWN'})
        .eq('notification_key',key).eq('destination_type',type).eq('destination_id',id).eq('status','sending');
      if (saveError) throw new Error('SPOT_NOTIFICATION_RESULT_SAVE_FAILED');
      throw new Error(rejected?'SPOT_NOTIFICATION_REJECTED':'SPOT_NOTIFICATION_OUTCOME_UNKNOWN');
    }
    const {data:saved,error:saveError}=await deps.db.from('spot_notification_deliveries' as never)
      .update({status:'sent',sent_at:new Date().toISOString(),error_code:null})
      .eq('notification_key',key).eq('destination_type',type).eq('destination_id',id).eq('status','sending')
      .select('status').maybeSingle();
    if (saveError || !saved) throw new Error('SPOT_NOTIFICATION_RESULT_SAVE_FAILED');
  }
  await deliver('channel',input.channelId);
  const {data:recipients,error}=await deps.db.from('spot_notification_recipients' as never)
    .select('lw_user_id').eq('enabled',true).contains('topics',[input.topic]);
  if (error) throw new Error('SPOT_NOTIFICATION_RECIPIENT_LOOKUP_FAILED');
  let failed=false;
  for (const id of new Set<string>((recipients??[]).map((r: {lw_user_id:string})=>r.lw_user_id))) {
    try { await deliver('user',id); } catch { failed=true; }
  }
  if (failed) throw new Error('SPOT_NOTIFICATION_COPY_PENDING');
}
