import twilio, { type Twilio } from "twilio";

export type SmsSendResult =
    | { status: "ok"; messageSid: string }
    | { status: "skipped"; reason: "not_configured" | "invalid_phone" }
    | { status: "error" };

function normalizeJapanesePhone(phone: string): string | null {
    const value = phone.trim();

    if (!value) return null;
    if (value.startsWith("+")) {
        const digits = value.slice(1).replace(/\D/g, "");
        return digits.length >= 10 ? `+${digits}` : null;
    }

    const digits = value.replace(/\D/g, "");
    if (!digits) return null;
    if (digits.startsWith("0")) return `+81${digits.slice(1)}`;
    if (digits.startsWith("81")) return `+${digits}`;
    return `+${digits}`;
}

function createTwilioClient(): Twilio | null {
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const apiKeySid = process.env.TWILIO_API_KEY_SID;
    const apiKeySecret = process.env.TWILIO_API_KEY_SECRET;

    if (!accountSid || !apiKeySid || !apiKeySecret) return null;

    return twilio(apiKeySid, apiKeySecret, { accountSid });
}

/** Server-only SMS sender shared by notification features. */
export async function sendSms({
    to,
    body,
}: {
    to: string;
    body: string;
}): Promise<SmsSendResult> {
    const client = createTwilioClient();
    const messagingServiceSid = process.env.TWILIO_MESSAGING_SERVICE_SID;
    const from = process.env.TWILIO_FROM;
    const normalizedPhone = normalizeJapanesePhone(to);

    if (!normalizedPhone) {
        return { status: "skipped", reason: "invalid_phone" };
    }

    if (!client || (!messagingServiceSid && !from)) {
        return { status: "skipped", reason: "not_configured" };
    }

    try {
        const message = await client.messages.create({
            to: normalizedPhone,
            body: body.slice(0, 1600),
            ...(messagingServiceSid
                ? { messagingServiceSid }
                : { from: from as string }),
        });

        return { status: "ok", messageSid: message.sid };
    } catch {
        return { status: "error" };
    }
}
