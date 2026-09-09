"use client";
import AssessmentScreen from "@/components/assessment/AssessmentScreen";
import { useParams } from "next/navigation";
export default function AssessmentBetaDetailPage() { const params = useParams<{ id: string }>(); return <AssessmentScreen initialAssessmentId={params.id ?? null} />; }
