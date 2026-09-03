export const WORDPRESS_PAGE_STATUSES = ["draft", "publish", "private"] as const;

export type WordPressPageStatus = (typeof WORDPRESS_PAGE_STATUSES)[number];

export type WordPressEditorKind =
  | "classic"
  | "gutenberg"
  | "elementor"
  | "other-builder";

export type WordPressPageSummary = {
  id: number;
  title: string;
  slug: string;
  status: string;
  modified: string;
  link: string;
};

export type WordPressPageDetail = WordPressPageSummary & {
  content: string;
  editorKind: WordPressEditorKind;
  editable: boolean;
  editWarning: string | null;
};

export type WordPressPageInput = {
  title: string;
  content: string;
  slug: string;
  status: WordPressPageStatus;
};
