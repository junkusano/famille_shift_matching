# Architecture

## Boundary

The MCP server is an independent Next.js application deployed as its own Vercel project. It is kept under a subdirectory only so it can be reviewed alongside the existing Famille code; configure that subdirectory as the Vercel Project Root Directory. The existing shift-matching application is not imported and its deployment settings are not changed.

```text
ChatGPT / MCP client
        |
        | OAuth 2.1 + Streamable HTTP
        v
Vercel: famille-operation-mcp
        |
        +-- GitHub REST API (one installed repository)
        +-- Vercel REST API (one allowlisted project)
        +-- WordPress REST API (one HTTPS site)
```

## Trust model

- ChatGPT receives no GitHub, Vercel, or WordPress credential.
- An external OAuth 2.1 identity provider authenticates the human user. The server verifies issuer, audience, signature, expiry, and scopes.
- Service credentials live only in Vercel Environment Variables.
- GitHub authentication prefers a repository-scoped GitHub App installation token. A fine-grained PAT is a temporary single-user fallback.
- Every service target is fixed by environment configuration; tool callers cannot supply arbitrary hosts, owners, repositories, projects, or WordPress sites.
- There is no arbitrary shell, generic HTTP, file deletion, article deletion, force-push, rollback, or broadcast tool.

## Approval protocol

High-impact actions are split into two tools:

1. `prepare_*` reads the current state, produces a diff or exact target summary, and returns a short-lived signed approval token.
2. The user explicitly confirms the prepared action.
3. The execution tool verifies the token, actor, action, target, payload hash, expiry, and optimistic-concurrency version before changing state.
4. The result is re-read or returned from the upstream API and an audit record is emitted.

The token is not a general authorization token. It is bound to one exact operation. GitHub head SHAs and WordPress `modified_gmt` values prevent replay after state changes. Vercel promotion is idempotent for the same deployment.

## Why Vercel operations remain in this MCP

Vercel's official MCP already provides strong read and diagnostic tools and should be used directly when that is sufficient. This server keeps only the small deployment subset needed for the controlled GitHub-to-Preview-to-Production workflow. Production uses promotion of a verified Preview artifact rather than a separate rebuild.

## Google Sheets decision

The existing ChatGPT Google Drive/Sheets connector is preferable for ordinary sheet reads and explicitly requested cell edits because it avoids duplicating OAuth and API maintenance. Phase 2 should add custom Sheets tools only for Famille-specific records that need fixed spreadsheet IDs, schema validation, duplicate detection, optimistic concurrency, and audit logging—especially 草野ナレッジ and 教訓リマインド.
