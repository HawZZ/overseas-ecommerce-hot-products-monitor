# Variables and secrets

## Inventory

| Name | Used by | Scope/source | Secret | Rotation/risk |
|---|---|---|---:|---|
| `API_HOST` | API | server env; default loopback | no | Keep `127.0.0.1` when tunneled |
| `API_PORT` | API | server env; default 8787 | no | Coordinate cloudflared target |
| `API_TOKEN` | `requireSession` | server env | yes | Full API access; rotate on exposure |
| `DASHBOARD_USERNAME` | login | server env | account identifier | Change with user ownership |
| `DASHBOARD_PASSWORD` | login | server env | yes | Strong, unique; rotate on exposure |
| `SESSION_SECRET` | HMAC sessions | server env | yes | Rotation invalidates all sessions |
| `SESSION_TTL_HOURS` | sessions | server env; default 12 | no | Reduce to limit stolen-token lifetime |
| `LOGIN_RATE_LIMIT_WINDOW_MS` | login | server env | no | Availability/security tuning |
| `LOGIN_RATE_LIMIT_MAX_FAILURES` | login | server env | no | Availability/security tuning |
| `CORS_ORIGINS` | API | server env | no | Restrict to Pages and local dev origins |
| `DATA_DIR` | API/generator | server env | path may be sensitive | Must point to protected local storage |
| `REFRESH_CADENCE_HOURS` | API metadata/generator/scheduler | server env | no | Currently differs from systemd cadence |
| `NODE_ENV` | startup validation | server env | no | `production` makes weak config fatal |
| `REQUIRE_STRONG_CONFIG` | startup validation | server env | no | Set `1` for tunneled environments |
| `VITE_DEFAULT_API_BASE` | Vite build | GitHub secret or build env | **public after build** | Never put credentials in URL |
| `OPENAI_API_KEY` | optional AI Wiki | generator env | yes | Used only with explicit AI command |
| `OPENAI_MODEL` | optional AI Wiki | generator env | no | Cost/behavior configuration |
| `ALLOW_SYNTHETIC_DEMO` | generator | process env | no, dangerous | Must remain unset in production |
| `HTTP_PROXY` / `HTTPS_PROXY` and lowercase forms | collectors | process env | may contain credentials | Current code logs full URL; avoid embedded credentials until fixed |
| `SKIP_COLLECT` | standalone scheduler | process env | no | Controls external collection side effects |
| `SMOKE_API_PORT` | API smoke test | test env | no | Isolated test port only |
| `VISUAL_BASE_URL` | visual check | test env | no | Must target intended local/test app |
| `HOT_PRODUCTS_*` | Tunnel sync script | service/process env | paths/settings | Do not point at unrelated repos/services |

Production systemd reads secrets from `/etc/overseas-ecommerce-monitor.env`; the file contents must not be copied into the repository, Wiki, terminal transcript or Pages artifact.

## Connector values

`data/connectors.json` may contain provider API keys, client secrets, tokens, passwords and local paths. The API masks keys matching secret-like names before returning them to the browser and preserves prior values when the browser sends `********`.

Masking is presentation protection, not encryption at rest. The JSON file relies on OS permissions and must remain ignored.

## Client exposure statement

No server credential is intentionally bundled client-side. These values are public by design:

- GitHub Pages HTML/CSS/JavaScript.
- `public/config.json` and any `VITE_*` build value.
- API `/health` response.

Session tokens exist in browser `sessionStorage` after login and are therefore accessible to same-origin JavaScript. Preventing XSS and avoiding third-party scripts remain important.

## Pre-go-live checks

- Set strong, distinct `API_TOKEN`, `DASHBOARD_PASSWORD` and `SESSION_SECRET`.
- Enable production/strong-config startup failure.
- Confirm API binds loopback and CORS includes only required origins.
- Scan tracked files and built `dist/` for credential patterns.
- Confirm `.env`, connector values, exports, snapshot, audit log and reports are ignored.
- Ensure proxy logs cannot include embedded credentials.
- Rotate quick-tunnel-independent credentials after any accidental exposure; changing only the Tunnel URL is not credential rotation.
