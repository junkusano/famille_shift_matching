import "server-only";

import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

type Envelope = { v: 1; iv: string; tag: string; data: string };

function encryptionKey() {
  const raw = process.env.KNOWLEDGE_TOKEN_ENCRYPTION_KEY;
  if (!raw) throw new Error("Money Forward token encryption is not configured.");
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) throw new Error("Money Forward token encryption key is invalid.");
  return key;
}

export function encryptIntegrationSecret(plainText: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plainText, "utf8"), cipher.final()]);
  const envelope: Envelope = {
    v: 1,
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
    data: encrypted.toString("base64"),
  };
  return JSON.stringify(envelope);
}

export function decryptIntegrationSecret(value: string) {
  let envelope: Envelope;
  try {
    envelope = JSON.parse(value) as Envelope;
  } catch {
    throw new Error("Stored integration token is invalid.");
  }
  if (envelope.v !== 1) throw new Error("Stored integration token version is unsupported.");
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(envelope.iv, "base64"));
  decipher.setAuthTag(Buffer.from(envelope.tag, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(envelope.data, "base64")),
    decipher.final(),
  ]).toString("utf8");
}

