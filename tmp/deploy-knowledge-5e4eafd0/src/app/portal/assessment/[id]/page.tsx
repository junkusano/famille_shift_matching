// src/app/portal/assessment/[id]/page.tsx
import AssessmentScreen from "@/components/assessment/AssessmentScreen";

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <AssessmentScreen initialAssessmentId={id} />;
}
