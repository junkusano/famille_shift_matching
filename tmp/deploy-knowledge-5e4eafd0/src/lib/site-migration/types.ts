export const LEGACY_HOME_URL = "https://www.shi-on.net/";
export const WORDPRESS_MIGRATION_DRAFT_TITLE = "ファミーユ トップページ 新版（画像・地図対応）";
export const WORDPRESS_MIGRATION_DRAFT_SLUG = "home-new-visual";

export type LegacyContentBlock =
  | { kind: "heading"; level: 1 | 2 | 3 | 4 | 5 | 6; text: string }
  | { kind: "paragraph"; html: string; text: string }
  | { kind: "list"; ordered: boolean; items: Array<{ html: string; text: string }> }
  | { kind: "image"; sourceUrl: string; alt: string; usage: string }
  | { kind: "cta"; text: string; href: string }
  | { kind: "youtube"; url: string; videoId: string }
  | { kind: "google-map"; url: string; title: string; width: number; height: number };

export type LegacyImage = {
  sourceUrl: string;
  alt: string;
  usage: string;
};

export type LegacyHeroImage = LegacyImage & {
  device: "desktop" | "mobile";
};

export type LegacyLink = {
  text: string;
  href: string;
  internal: boolean;
};

export type LegacyHomeAnalysis = {
  sourceUrl: string;
  fetchedAt: string;
  pageTitle: string;
  h1: string;
  blocks: LegacyContentBlock[];
  images: LegacyImage[];
  heroImages: LegacyHeroImage[];
  links: LegacyLink[];
  internalLinks: LegacyLink[];
  warnings: string[];
  fingerprint: string;
};

export type DownloadedLegacyImage = {
  sourceUrl: string;
  filename: string;
  contentType: string;
  bytes: ArrayBuffer;
};
