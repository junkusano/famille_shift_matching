"use client";
import AssessmentScreen from "@/components/assessment/AssessmentScreen";
import { ClientMenuBetaMount } from "@/components/client-menu-beta/ClientMenuBetaMount";
import { useParams } from "next/navigation";
export default function AssessmentBetaDetailPage() { const params = useParams<{ id: string }>(); return <><ClientMenuBetaMount /><AssessmentScreen initialAssessmentId={params.id ?? null} /></>; }
