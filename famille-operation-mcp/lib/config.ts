import { z } from "zod";

const nonEmpty = z.string().trim().min(1);

export function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value?.trim()) throw new Error(`Missing required environment variable: ${name}`);
  return value.trim();
}

export function optionalEnv(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value || undefined;
}

export function positiveIntEnv(name: string, fallback: number): number {
  const raw = optionalEnv(name);
  if (!raw) return fallback;
  const parsed = Number(raw);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }
  return parsed;
}

export function httpsBaseUrl(name: string): string {
  const raw = requiredEnv(name);
  const url = new URL(raw);
  const localDevelopment = process.env.NODE_ENV !== "production" && ["localhost", "127.0.0.1"].includes(url.hostname);
  if (url.protocol !== "https:" && !localDevelopment) {
    throw new Error(`${name} must use HTTPS`);
  }
  url.pathname = url.pathname.replace(/\/+$/, "");
  url.search = "";
  url.hash = "";
  return url.toString().replace(/\/$/, "");
}

export const repositoryConfig = () => ({
  owner: nonEmpty.parse(requiredEnv("GITHUB_OWNER")),
  repo: nonEmpty.parse(requiredEnv("GITHUB_REPO")),
  defaultBranch: optionalEnv("GITHUB_DEFAULT_BRANCH") ?? "main",
});

export const vercelConfig = () => ({
  teamId: requiredEnv("VERCEL_TEAM_ID"),
  projectId: requiredEnv("VERCEL_PROJECT_ID"),
  projectName: requiredEnv("VERCEL_PROJECT_NAME"),
});
