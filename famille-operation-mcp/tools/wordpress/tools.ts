import { createTwoFilesPatch } from "diff";
import { z } from "zod";
import { requireScope } from "@/lib/auth/context";
import { securitySchemes } from "@/lib/auth/mcp-auth";
import { httpsBaseUrl } from "@/lib/config";
import { audited } from "@/lib/logging/audit";
import { errorResult, okResult } from "@/lib/mcp/result";
import { issueApproval, stableHash, verifyApproval } from "@/lib/security/approval";
import { wordpressRequest, wordpressUploadMedia } from "./client";

const postIdSchema = z.number().int().positive();
const postFieldsSchema = z.object({
  title: z.string().max(500).optional(),
  content: z.string().max(1_000_000).optional(),
  excerpt: z.string().max(20_000).optional(),
  slug: z.string().trim().max(200).optional(),
  categoryIds: z.array(z.number().int().positive()).max(50).optional(),
  tagIds: z.array(z.number().int().positive()).max(100).optional(),
  featuredMediaId: z.number().int().nonnegative().optional(),
}).refine((value) => Object.keys(value).length > 0, "At least one post field is required");

type PostFields = z.infer<typeof postFieldsSchema>;
type McpServer = { registerTool: (name: string, config: Record<string, unknown>, handler: (input: never) => Promise<unknown>) => void };

export function registerWordpressTools(server: McpServer): void {
  server.registerTool("wordpress_list_posts", {
    title: "List WordPress posts",
    description: "Use this to search and list WordPress posts, including drafts, before selecting an article to read or change.",
    inputSchema: z.object({
      status: z.enum(["draft", "pending", "private", "publish", "future", "any"]).default("any"),
      search: z.string().max(200).optional(),
      page: z.number().int().min(1).default(1),
      perPage: z.number().int().min(1).max(50).default(20),
    }),
    securitySchemes: securitySchemes(["famille.read"]),
    annotations: { readOnlyHint: true, destructiveHint: false },
  }, wrap(async ({ status, search, page, perPage }: { status: string; search?: string; page: number; perPage: number }) => {
    requireScope("famille.read");
    const query = new URLSearchParams({ context: "edit", status, page: String(page), per_page: String(perPage), orderby: "modified", order: "desc" });
    if (search) query.set("search", search);
    const posts = await wordpressRequest<Record<string, unknown>[]>(`/posts?${query}`);
    return { posts: posts.map(summarizePost) };
  }));

  server.registerTool("wordpress_get_post", {
    title: "Get WordPress post",
    description: "Use this to retrieve the editable title, body, status, taxonomy IDs, and featured image for one WordPress post.",
    inputSchema: z.object({ postId: postIdSchema }),
    securitySchemes: securitySchemes(["famille.read"]),
    annotations: { readOnlyHint: true, destructiveHint: false },
  }, wrap(async ({ postId }: { postId: number }) => {
    requireScope("famille.read");
    return normalizePost(await getPost(postId));
  }));

  server.registerTool("wordpress_list_terms", {
    title: "List WordPress categories or tags",
    description: "Use this to find category and tag IDs before assigning them to an article.",
    inputSchema: z.object({ taxonomy: z.enum(["categories", "tags"]), search: z.string().max(200).optional(), perPage: z.number().int().min(1).max(100).default(50) }),
    securitySchemes: securitySchemes(["famille.read"]),
    annotations: { readOnlyHint: true, destructiveHint: false },
  }, wrap(async ({ taxonomy, search, perPage }: { taxonomy: string; search?: string; perPage: number }) => {
    requireScope("famille.read");
    const query = new URLSearchParams({ per_page: String(perPage), orderby: "name", order: "asc" });
    if (search) query.set("search", search);
    const terms = await wordpressRequest<Record<string, unknown>[]>(`/${taxonomy}?${query}`);
    return { taxonomy, terms: terms.map((term) => ({ id: term.id, name: term.name, slug: term.slug, count: term.count })) };
  }));

  server.registerTool("wordpress_save_draft", {
    title: "Save WordPress draft",
    description: "Use this to create a new draft or update an existing non-public draft. It never publishes and refuses to alter published or scheduled posts.",
    inputSchema: z.object({ postId: postIdSchema.optional(), fields: postFieldsSchema }),
    securitySchemes: securitySchemes(["famille.write"]),
    annotations: { readOnlyHint: false, destructiveHint: false },
  }, wrap(async ({ postId, fields }: { postId?: number; fields: PostFields }) => {
    requireScope("famille.write");
    if (postId) {
      const current = await getPost(postId);
      if (["publish", "future"].includes(String(current.status))) {
        throw new Error("Published or scheduled posts require the approved update workflow");
      }
    }
    const target = postId ? `post:${postId}` : "new-draft";
    return audited("wordpress_save_draft", target, { postId: postId ?? null, fields: Object.keys(fields) }, async () => {
      const post = await wordpressRequest<Record<string, unknown>>(postId ? `/posts/${postId}` : "/posts", {
        method: "POST",
        body: JSON.stringify({ ...toWordpressFields(fields), status: "draft" }),
      });
      return normalizePost(post);
    });
  }));

  server.registerTool("wordpress_upload_image", {
    title: "Upload WordPress image",
    description: "Use this to upload a bounded JPEG, PNG, GIF, or WebP image and obtain a media ID for an article's featured image.",
    inputSchema: z.object({
      filename: z.string().trim().min(1).max(180),
      mimeType: z.enum(["image/jpeg", "image/png", "image/gif", "image/webp"]),
      base64Data: z.string().min(1).max(7_000_000),
      altText: z.string().max(500).optional(),
    }),
    securitySchemes: securitySchemes(["famille.write"]),
    annotations: { readOnlyHint: false, destructiveHint: false },
  }, wrap(async ({ filename, mimeType, base64Data, altText }: { filename: string; mimeType: string; base64Data: string; altText?: string }) => {
    requireScope("famille.write");
    const bytes = Buffer.from(base64Data, "base64");
    if (!bytes.length || bytes.length > 5_000_000) throw new Error("Decoded image must be between 1 byte and 5 MB");
    return audited("wordpress_upload_image", "media", { filename, mimeType, bytes: bytes.length }, async () => {
      const media = await wordpressUploadMedia({ filename, mimeType, bytes, altText });
      return { id: media.id, sourceUrl: media.source_url, mimeType: media.mime_type, altText: media.alt_text };
    });
  }));

  registerApprovedPostMutations(server);
}

function registerApprovedPostMutations(server: McpServer): void {
  server.registerTool("wordpress_prepare_update", {
    title: "Prepare WordPress article update",
    description: "Use this to review proposed changes to an existing article without changing it. Required for published or scheduled articles.",
    inputSchema: z.object({ postId: postIdSchema, fields: postFieldsSchema }),
    securitySchemes: securitySchemes(["famille.publish"]),
    annotations: { readOnlyHint: true, destructiveHint: false },
  }, wrap(async ({ postId, fields }: { postId: number; fields: PostFields }) => {
    requireScope("famille.publish");
    const current = await getPost(postId);
    const expectedModifiedGmt = String(current.modified_gmt);
    const payload = { postId, expectedModifiedGmt, fields };
    return {
      post: summarizePost(current),
      proposed: summarizeFieldChanges(current, fields),
      ...issueApproval("wordpress.update", postTarget(postId), payload),
      nextStep: "After explicit confirmation, call wordpress_update_post with unchanged fields, expectedModifiedGmt, and approvalToken.",
    };
  }));

  server.registerTool("wordpress_update_post", {
    title: "Apply approved WordPress article update",
    description: "Use this only after explicit confirmation to update an existing article while preserving its current publication status.",
    inputSchema: z.object({ postId: postIdSchema, expectedModifiedGmt: z.string().min(1), fields: postFieldsSchema, approvalToken: z.string().min(20) }),
    securitySchemes: securitySchemes(["famille.publish"]),
    annotations: { readOnlyHint: false, destructiveHint: true },
  }, wrap(async ({ postId, expectedModifiedGmt, fields, approvalToken }: { postId: number; expectedModifiedGmt: string; fields: PostFields; approvalToken: string }) => {
    requireScope("famille.publish");
    const payload = { postId, expectedModifiedGmt, fields };
    verifyApproval(approvalToken, "wordpress.update", postTarget(postId), payload);
    return audited("wordpress_update_post", postTarget(postId), { postId, fields: Object.keys(fields) }, async () => {
      await assertPostVersion(postId, expectedModifiedGmt);
      return normalizePost(await wordpressRequest<Record<string, unknown>>(`/posts/${postId}`, {
        method: "POST",
        body: JSON.stringify(toWordpressFields(fields)),
      }));
    });
  }));

  server.registerTool("wordpress_prepare_publish", {
    title: "Prepare WordPress publication",
    description: "Use this to verify an article and prepare immediate publication without publishing it.",
    inputSchema: z.object({ postId: postIdSchema }),
    securitySchemes: securitySchemes(["famille.publish"]),
    annotations: { readOnlyHint: true, destructiveHint: false },
  }, wrap(async ({ postId }: { postId: number }) => prepareStatusChange(postId, "publish")));

  server.registerTool("wordpress_publish_post", {
    title: "Publish approved WordPress article",
    description: "Use this only after explicit confirmation to publish one exact, unchanged WordPress article immediately.",
    inputSchema: z.object({ postId: postIdSchema, expectedModifiedGmt: z.string().min(1), approvalToken: z.string().min(20) }),
    securitySchemes: securitySchemes(["famille.publish"]),
    annotations: { readOnlyHint: false, destructiveHint: true },
  }, wrap(async ({ postId, expectedModifiedGmt, approvalToken }: StatusExecution) => executeStatusChange(postId, expectedModifiedGmt, approvalToken, "publish")));

  server.registerTool("wordpress_prepare_schedule", {
    title: "Prepare WordPress scheduled publication",
    description: "Use this to verify an article and a future UTC publication time without scheduling it.",
    inputSchema: z.object({ postId: postIdSchema, dateGmt: z.string().datetime({ offset: true }) }),
    securitySchemes: securitySchemes(["famille.publish"]),
    annotations: { readOnlyHint: true, destructiveHint: false },
  }, wrap(async ({ postId, dateGmt }: { postId: number; dateGmt: string }) => {
    if (Date.parse(dateGmt) <= Date.now() + 60_000) throw new Error("Scheduled publication time must be at least one minute in the future");
    return prepareStatusChange(postId, "future", dateGmt);
  }));

  server.registerTool("wordpress_schedule_post", {
    title: "Schedule approved WordPress article",
    description: "Use this only after explicit confirmation to schedule one unchanged article for the approved UTC time.",
    inputSchema: z.object({ postId: postIdSchema, expectedModifiedGmt: z.string().min(1), dateGmt: z.string().datetime({ offset: true }), approvalToken: z.string().min(20) }),
    securitySchemes: securitySchemes(["famille.publish"]),
    annotations: { readOnlyHint: false, destructiveHint: true },
  }, wrap(async ({ postId, expectedModifiedGmt, dateGmt, approvalToken }: StatusExecution & { dateGmt: string }) => executeStatusChange(postId, expectedModifiedGmt, approvalToken, "future", dateGmt)));
}

type StatusExecution = { postId: number; expectedModifiedGmt: string; approvalToken: string };

async function prepareStatusChange(postId: number, status: "publish" | "future", dateGmt?: string) {
  requireScope("famille.publish");
  const post = await getPost(postId);
  const expectedModifiedGmt = String(post.modified_gmt);
  const payload = { postId, expectedModifiedGmt, status, dateGmt: dateGmt ?? null };
  const action = status === "publish" ? "wordpress.publish" : "wordpress.schedule";
  return {
    post: summarizePost(post),
    intendedStatus: status,
    dateGmt: dateGmt ?? null,
    expectedModifiedGmt,
    ...issueApproval(action, postTarget(postId), payload),
    nextStep: `After explicit confirmation, call ${status === "publish" ? "wordpress_publish_post" : "wordpress_schedule_post"}.`,
  };
}

async function executeStatusChange(postId: number, expectedModifiedGmt: string, approvalToken: string, status: "publish" | "future", dateGmt?: string) {
  requireScope("famille.publish");
  const payload = { postId, expectedModifiedGmt, status, dateGmt: dateGmt ?? null };
  const action = status === "publish" ? "wordpress.publish" : "wordpress.schedule";
  verifyApproval(approvalToken, action, postTarget(postId), payload);
  return audited(status === "publish" ? "wordpress_publish_post" : "wordpress_schedule_post", postTarget(postId), { postId, status, dateGmt: dateGmt ?? null }, async () => {
    await assertPostVersion(postId, expectedModifiedGmt);
    const body = status === "future" ? { status, date_gmt: dateGmt } : { status };
    return normalizePost(await wordpressRequest<Record<string, unknown>>(`/posts/${postId}`, { method: "POST", body: JSON.stringify(body) }));
  });
}

async function getPost(postId: number): Promise<Record<string, unknown>> {
  return wordpressRequest<Record<string, unknown>>(`/posts/${postId}?context=edit`);
}

async function assertPostVersion(postId: number, expectedModifiedGmt: string): Promise<void> {
  const current = await getPost(postId);
  if (String(current.modified_gmt) !== expectedModifiedGmt) throw new Error("Article changed after approval; prepare the operation again");
}

function toWordpressFields(fields: PostFields): Record<string, unknown> {
  return {
    ...(fields.title !== undefined ? { title: fields.title } : {}),
    ...(fields.content !== undefined ? { content: fields.content } : {}),
    ...(fields.excerpt !== undefined ? { excerpt: fields.excerpt } : {}),
    ...(fields.slug !== undefined ? { slug: fields.slug } : {}),
    ...(fields.categoryIds !== undefined ? { categories: fields.categoryIds } : {}),
    ...(fields.tagIds !== undefined ? { tags: fields.tagIds } : {}),
    ...(fields.featuredMediaId !== undefined ? { featured_media: fields.featuredMediaId } : {}),
  };
}

function normalizePost(post: Record<string, unknown>) {
  const title = post.title as Record<string, unknown> | undefined;
  const content = post.content as Record<string, unknown> | undefined;
  const excerpt = post.excerpt as Record<string, unknown> | undefined;
  return { ...summarizePost(post), title: title?.raw ?? title?.rendered, content: content?.raw ?? content?.rendered, excerpt: excerpt?.raw ?? excerpt?.rendered, slug: post.slug, categoryIds: post.categories, tagIds: post.tags, featuredMediaId: post.featured_media };
}

function summarizePost(post: Record<string, unknown>) {
  const title = post.title as Record<string, unknown> | undefined;
  return { id: post.id, status: post.status, title: title?.raw ?? title?.rendered, link: post.link, modifiedGmt: post.modified_gmt, dateGmt: post.date_gmt };
}

function summarizeFieldChanges(current: Record<string, unknown>, fields: PostFields) {
  const currentTitle = stringField(current.title);
  const currentContent = stringField(current.content);
  return {
    fields: Object.keys(fields),
    title: fields.title === undefined ? undefined : { from: currentTitle, to: fields.title },
    contentSha256: fields.content === undefined ? undefined : { from: stableHash(currentContent), to: stableHash(fields.content) },
    contentDiff: fields.content === undefined ? undefined : createTwoFilesPatch("current", "proposed", currentContent, fields.content, "current", "proposed", { context: 3 }).slice(0, 50_000),
  };
}

function stringField(value: unknown): string {
  if (!value || typeof value !== "object") return "";
  const record = value as Record<string, unknown>;
  return String(record.raw ?? record.rendered ?? "");
}

function postTarget(postId: number): string {
  return `${httpsBaseUrl("WORDPRESS_URL")}:post:${postId}`;
}

function wrap<TInput>(handler: (input: TInput) => Promise<unknown>) {
  return (async (input: TInput) => {
    try { return okResult(await handler(input)); }
    catch (error) { return errorResult(error); }
  }) as never;
}
