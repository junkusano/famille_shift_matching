# MCP tool contract

## GitHub

| Tool | Class | Main input | Main output |
|---|---|---|---|
| `github_get_repository_status` | read | branch, optional base | repository, head SHA, ahead/behind status |
| `github_get_file` | read | path, ref | content, blob SHA, size |
| `github_get_diff` | read | base, head | changed files and bounded patches |
| `github_prepare_commit` | prepare | branch, message, file contents | diffs, expected head SHA, approval token |
| `github_commit_changes` | destructive | unchanged proposal and approval token | atomic commit SHA |

The repository is fixed by environment variables. Branches and paths must match allowlists. Commits use the Git data API and never force-update a ref.

## Vercel

| Tool | Class | Main input | Main output |
|---|---|---|---|
| `vercel_get_project_status` | read | deployment limit | fixed project summary and recent deployments |
| `vercel_list_deployments` | read | target, limit | deployment summaries |
| `vercel_get_deployment` | read | deployment ID | state and URL |
| `vercel_get_build_logs` | read | deployment ID, bounded limit | build events |
| `vercel_get_runtime_logs` | read | deployment ID, bounded limit | runtime events |
| `vercel_prepare_preview_deployment` | prepare | Git ref | pinned Git SHA and approval token |
| `vercel_create_preview_deployment` | write | pinned ref/SHA and approval token | Preview deployment |
| `vercel_prepare_production_promotion` | prepare | READY deployment ID | exact artifact and approval token |
| `vercel_promote_to_production` | destructive | deployment ID and approval token | promotion request result |

## WordPress

| Tool | Class | Main input | Main output |
|---|---|---|---|
| `wordpress_list_posts` | read | status/search/page | post summaries |
| `wordpress_get_post` | read | post ID | editable post fields |
| `wordpress_list_terms` | read | categories or tags | term IDs and names |
| `wordpress_save_draft` | write | draft fields | draft; refuses published/scheduled targets |
| `wordpress_upload_image` | write | bounded base64 image | media ID |
| `wordpress_prepare_update` / `wordpress_update_post` | prepare/destructive | exact fields | approved status-preserving update |
| `wordpress_prepare_publish` / `wordpress_publish_post` | prepare/destructive | post ID | immediate publication |
| `wordpress_prepare_schedule` / `wordpress_schedule_post` | prepare/destructive | post ID and UTC date | scheduled publication |

Delete operations are intentionally absent from the MVP.
