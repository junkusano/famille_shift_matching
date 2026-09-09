import type { KnowledgeSource, NormalizedSourceObject, ProposedKnowledge } from "@/lib/knowledge/types";

const personalPatterns = [
  /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i,
  /(?:0\d{1,4}[-ー－ ]?\d{1,4}[-ー－ ]?\d{3,4})/,
  /(?:〒?\d{3}[-ー－]?\d{4})/,
  /利用者|患者|要介護|要支援|障害支援区分|病名|服薬|生年月日|住所|氏名|個人情報/,
];

function mayContainPersonalData(text: string) {
  return personalPatterns.some((pattern) => pattern.test(text));
}

export function secureSourceObject(source: KnowledgeSource, object: NormalizedSourceObject): NormalizedSourceObject {
  const forcedRestricted = source.source_type === "fax" || source.source_type === "lineworks_chat";
  const detected = forcedRestricted || object.containsPersonalData || mayContainPersonalData([object.title, object.safeExcerpt].filter(Boolean).join("\n"));
  if (!detected) {
    if (object.privacyLevel > 0 && object.publishability === "public") {
      return { ...object, publishability: "internal_only" };
    }
    return object;
  }
  return {
    ...object,
    safeExcerpt: undefined,
    privacyLevel: 3,
    publishability: "never_publish",
    containsPersonalData: true,
  };
}

export function secureProposedKnowledge(source: KnowledgeSource, proposal: ProposedKnowledge): ProposedKnowledge {
  const detected = source.source_type === "fax" || mayContainPersonalData([proposal.title, proposal.summary, proposal.content].filter(Boolean).join("\n"));
  if (detected) {
    return { ...proposal, privacyLevel: 3, publishability: "never_publish" };
  }
  if (proposal.privacyLevel > 0 && proposal.publishability === "public") {
    return { ...proposal, publishability: "internal_only" };
  }
  return proposal;
}

