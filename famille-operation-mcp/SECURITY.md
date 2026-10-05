# Security policy

- Production must use OAuth 2.1. Static bearer mode is development-only and fails closed in production.
- Use an established identity provider that supports authorization code with PKCE, refresh tokens, OAuth metadata, and the MCP resource parameter. Do not build a home-grown authorization server.
- Grant scopes separately: `famille.read`, `famille.write`, and `famille.publish`.
- Prefer a GitHub App installed only on the required repository with Contents read/write and Metadata read. If using a fine-grained PAT temporarily, restrict it to one repository and rotate it after migration.
- Use a dedicated least-privilege WordPress user and one revocable Application Password over HTTPS.
- Scope the Vercel token to the relevant team/project where the account plan supports it.
- Mark secrets as Sensitive in Vercel and never use a `NEXT_PUBLIC_` prefix.
- Do not log request headers, request bodies, article bodies, file contents, media data, tokens, passwords, private keys, or upstream raw error objects.
- Rotate `MCP_APPROVAL_SECRET` and all service credentials after suspected exposure.
- Keep Preview credentials separate from Production wherever possible.
- Keep Vercel Deployment Protection enabled for Preview deployments containing private information.
