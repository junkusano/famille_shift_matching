export async function sendLWBotMessage(channelId: string, text: string, accessToken: string) {
  const botId = "6807147";  //ヘルパーサービス管理者
  const url = `https://www.worksapis.com/v1.0/bots/${botId}/channels/${channelId}/messages`;

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      content: {
        type: 'text',
        text,
      },
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    console.error(`❌ メッセージ送信失敗: ${err}`);
  }
}
