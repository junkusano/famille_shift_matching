# ファミーユ操作MCP

ファミーユで許可した業務操作だけをChatGPTへ提供する、Vercel向けの独立MCP Serverです。MVPはGitHub、Vercel、WordPressに対応し、LINE WORKSとGoogle Sheetsを安全に追加できる境界を用意しています。

## 現在の完成範囲

- Streamable HTTP: `POST /mcp`（`mcp-handler` 2.x、stateless）
- OAuth 2.1 resource-server認証。開発時だけ静的Bearer Tokenも利用可能
- GitHub: 状態・ファイル・差分、複数ファイルの原子的commit
- Vercel: プロジェクト/Deployment状態、Preview作成、build/runtime logs、検証済みDeploymentのProduction昇格
- WordPress: 記事/カテゴリ/タグ参照、draft保存、承認付き更新・公開・予約、画像upload
- 破壊的操作のprepare/execute分離、短時間承認トークン、楽観的排他制御
- 構造化監査ログとsecret redaction
- 任意shell、汎用HTTP、force push、削除、一斉送信は非搭載

## リポジトリから独立させた理由

既存の `famille_shift_matching` はLINE WORKS、Supabase、cronを含む本番業務アプリです。強いサービス権限を持つMCPと障害範囲を共有させないため、このフォルダを別Vercel ProjectのRoot Directoryとして扱います。既存アプリからのimportや既存 `vercel.json` の変更は行いません。将来はこのフォルダを専用private repositoryへ切り出すことを推奨します。

## ローカル確認

Node.js 20以上を使用します。

```bash
cd famille-operation-mcp
npm install
copy .env.example .env.local
npm run check
npm run dev
```

開発用MCPクライアントから `http://localhost:3000/mcp` へ接続し、`Authorization: Bearer <MCP_STATIC_BEARER_TOKEN>` を送ります。ローカル時だけ `MCP_AUTH_MODE=static` が利用できます。Productionでは静的モードを拒否します。

## Environment Variables

秘密値はVercel Project SettingsのEnvironment VariablesへSensitiveとして登録してください。`.env.local` は開発専用で、`.env*` はGit管理対象外です。

| 変数 | 必須 | 用途・取得方法 |
|---|---:|---|
| `MCP_AUTH_MODE` | Yes | Productionは`oauth` |
| `MCP_PUBLIC_BASE_URL` | Yes | MCPのHTTPS origin。例 `https://mcp.example.jp` |
| `MCP_OAUTH_ISSUER` | Yes | 利用するIdPのissuer URL |
| `MCP_OAUTH_AUDIENCE` | Yes | このMCPを表すresource/audience |
| `MCP_OAUTH_JWKS_URL` | Yes | IdPのJWKS URL |
| `MCP_APPROVAL_SECRET` | Yes | 32 bytes以上の暗号学的乱数。承認トークン署名用 |
| `MCP_APPROVAL_TTL_SECONDS` | No | 既定300秒 |
| `GITHUB_APP_ID` | Recommended | GitHub Settings → Developer settings → GitHub Apps |
| `GITHUB_INSTALLATION_ID` | Recommended | GitHub Appを対象repoへinstallした際のinstallation ID |
| `GITHUB_PRIVATE_KEY` | Recommended | GitHub Appで発行するPEM。改行はそのまま、または`\n`形式 |
| `GITHUB_TOKEN` | Fallback | 1 repo限定fine-grained PAT。GitHub App利用時は未設定 |
| `GITHUB_OWNER` / `GITHUB_REPO` | Yes | 固定の許可repository |
| `GITHUB_DEFAULT_BRANCH` | No | 既定`main` |
| `GITHUB_ALLOWED_BRANCHES` | Recommended | カンマ区切り。完全一致、末尾`/`はprefix扱い |
| `GITHUB_ALLOWED_PATH_PREFIXES` | Recommended | 更新可能pathのカンマ区切りprefix |
| `VERCEL_TOKEN` | Yes | Vercel Account Settings → Tokens。専用・最小権限を推奨 |
| `VERCEL_TEAM_ID` | Yes | 対象Projectの`.vercel/project.json`の`orgId`またはVercel API |
| `VERCEL_PROJECT_ID` | Yes | 同ファイルの`projectId`またはProject Settings |
| `VERCEL_PROJECT_NAME` | Yes | Vercel上のProject name |
| `WORDPRESS_URL` | Yes | HTTPSのサイトorigin |
| `WORDPRESS_USERNAME` | Yes | 専用の最小権限WordPress user |
| `WORDPRESS_APP_PASSWORD` | Yes | WordPress Users → Profile → Application Passwordsで個別発行 |

Phase 2用のLINE WORKS/Google変数は `.env.example` に予約していますが、MVPコードからは読みません。

## Vercel Preview Deploy

1. GitHub上でこのフォルダを含むbranchを用意する。
2. Vercelで新規Projectとしてimportする。
3. Root Directoryを `famille-operation-mcp` に設定する。
4. Node.js 20以上、Fluid Computeを有効にする。
5. Preview環境へ開発用service credentialとOAuth test tenantを設定する。Production credentialをPreviewへ共有しない。
6. Preview deploy後、`/health`、OAuth metadata、MCP initialize、tools/list、read tool、prepare toolを順に確認する。
7. write toolは専用test repository / test Vercel project / WordPress stagingでのみ検証する。
8. 検証済みの同一Deploymentを承認後にProductionへpromoteする。

## ChatGPT接続上の注意

ChatGPTへprivate write toolを接続する場合、現行のOpenAI要件どおりOAuth 2.1（Authorization Code + PKCE）に準拠する外部IdPを使用してください。独自OAuth serverは実装しません。ChatGPTへ渡るのはMCP用の短時間access tokenであり、GitHub/Vercel/WordPressのcredentialではありません。

2026-09-24時点のOpenAI公式ヘルプには、custom MCP appのフルwrite機能はプラン・workspace設定に依存し、MCP appsはモバイル未対応との記載があります。そのため最初の接続・Tool scan・write検証はChatGPT Webで行い、スマホ対応はOpenAI側の提供状況を再確認してから最終受入としてください。MCP Server自体は端末非依存です。

詳しい安全境界は [SECURITY.md](./SECURITY.md)、Tool仕様は [docs/TOOLS.md](./docs/TOOLS.md)、構成判断は [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md) を参照してください。
