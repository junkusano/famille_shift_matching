import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

const { prepareMonitoringSignedPlan } = await import(
  "../src/lib/monitoring/signed-plan"
);

const result = await prepareMonitoringSignedPlan({
  kaipokeCsId: "13623198",
  periodEnd: "2026-09-30",
  accessToken: "",
});

if (!result) {
  throw new Error("署名済みプランが見つかりませんでした");
}

console.log(
  JSON.stringify({
    cs_doc_id: result.cs_doc_id,
    document_date: result.document_date,
    ocr_ready: result.ocr_ready,
    summary_ready: result.summary_ready,
    client_request_chars: result.client_request.length,
    family_request_chars: result.family_request.length,
    issues_chars: result.issues.length,
    assistance_goal_chars: result.assistance_goal.length,
  }),
);
