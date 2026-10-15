"use client";
import Script from "next/script";

export default function RecruitmentTracking() {
  return <Script src="/recruitment-tracking.js" strategy="afterInteractive" onReady={() => {
    (window as Window & { __recruitmentTracking?: () => void }).__recruitmentTracking?.();
  }} />;
}
