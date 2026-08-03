# Permissions

## Principals and claims

| Principal | Credential/scope source | Effective scope |
|---|---|---|
| Anonymous browser | None | Public Pages assets, `config.json`, API `/health`, login attempt |
| Dashboard user | HMAC session `{sub, exp}` signed by server | All protected API operations |
| Service client | `API_TOKEN` Bearer value | Same protected API scope as dashboard user |
| Local OS operator | Host account and systemd permissions | Runtime files, process control, env files and scripts |
| GitHub Actions | GitHub OIDC + Pages permissions | Read repository, build artifact, deploy Pages |

Username is the only session identity claim. There are no roles, organizations, tenants, record ownership rules or per-connector scopes. Scope is derived from the token, not from a database.

## Resource matrix

| Resource/operation | Anonymous | Session | Service Token | Local operator | Actions |
|---|---:|---:|---:|---:|---:|
| Read Pages assets / public API URL | allow | allow | allow | allow | build/deploy |
| Read `/health` | allow | allow | allow | allow | allow |
| Attempt login | allow, rate-limited | allow | allow | n/a | n/a |
| Read snapshot / dynamic Wiki | deny | allow | allow | file access | deny |
| Read masked connectors | deny | allow | allow | file access | deny |
| Save connectors | deny | allow | allow | file access | deny |
| Trigger refresh | deny | allow | allow | process access | deny |
| Request risk checklist | deny | allow | allow | n/a | deny |
| Generate titles / manage title experiments | deny | allow | allow | local file access | deny |
| Read raw connector secrets/vendor exports/audit rows | deny | deny via API | deny via API | allow by OS | deny |
| Change Tunnel URL in repository | deny | deny via API | deny via API | sync script/Git | workflow consumes |

## Enforcement

- API: `requireSession` on every `/api/*` route except `/api/login`; `/health` is public.
- Browser origin: CORS allowlist. Non-browser clients are not protected by CORS and still require auth.
- Files: Unix ownership/permissions and `.gitignore`; there is no database or row-level security.
- Pages: repository review and workflow permissions; any tracked frontend value is public.
- 标题生成器复用 `requireSession`；模型 key 只由本机 API 读取，生成历史和实验不经由 Pages 静态文件发布。

## Deny behavior and gaps

- Missing/invalid/expired Bearer token: 401 JSON.
- Invalid login: 401 and audit append; excessive failures: 429 until the in-memory window resets.
- Disallowed CORS origin currently reaches generic error handling and may return 500 rather than a dedicated 403.
- There is no logout revocation list; logout only deletes browser state. A stolen token remains valid until expiration or session secret rotation.
- Service Token bypasses session expiration and has full protected scope.
- Dashboard users can write a connector folder path that may point outside the project data directory. Treat this role as trusted operator-level access until path confinement is implemented.
- Audit data is not exposed by API, but local file permissions and retention are the only controls.
