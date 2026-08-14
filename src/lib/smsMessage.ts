export const DEFAULT_SMS_BUSINESS_NAME = "ファミーユヘルパーサービス愛知";

type SmsMessageOptions = {
  body: string;
  managerPhone?: string | null;
  businessName: string;
  mainPhone: string;
};

export function buildSmsMessage({ body, managerPhone, businessName, mainPhone }: SmsMessageOptions) {
  const callbackPhone = managerPhone?.trim() || mainPhone.trim();
  const callbackText = managerPhone?.trim()
    ? `折り返しは担当者へお願いいたします。\n担当者携帯電話番号：${callbackPhone}`
    : `折り返しは${businessName}の代表電話番号へお願いいたします。\n代表電話番号：${callbackPhone}`;

  return [
    body.trim(),
    "---",
    `${businessName}からのSMSです。\n※このSMSは送信専用です。返信いただいても確認できません。`,
    callbackText,
  ].join("\n\n");
}

export function getClientSmsBusinessName() {
  return process.env.NEXT_PUBLIC_SMS_BUSINESS_NAME?.trim() || DEFAULT_SMS_BUSINESS_NAME;
}

export function getClientSmsMainPhone() {
  return process.env.NEXT_PUBLIC_SMS_MAIN_PHONE?.trim() || "";
}
