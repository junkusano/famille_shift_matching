// src/app/portal/plans/[id]/print/page.tsx
import PlanPrintView from "@/components/assessment/PlanPrintView";

export const dynamic = "force-dynamic";

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <PlanPrintView planId={id} />;
}