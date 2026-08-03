# Load-bearing flows

## Login and load dashboard data

**Actor:** visitor with dashboard credentials. **Precondition:** Pages can reach the HTTPS API and the browser origin is allowed. **Outcome:** the tab receives a time-limited session and renders the local snapshot.

1. Browser loads public `config.json`; no authorization is required and no business data is returned.
2. Browser posts username/password to `/api/login`.
3. CORS rejects an unapproved browser origin. Login limiter rejects a client after the configured failure count. Invalid credentials return 401.
4. Server signs a session and appends a success/failure audit event.
5. Browser keeps the token in `sessionStorage`, then calls `/api/snapshot` with Bearer auth.
6. `requireSession` rejects missing, malformed, tampered or expired tokens with 401.
7. Server reads `data/latest-snapshot.json` and returns it. No file is changed.

Trust crossings: public browser → tunnel → local API → ignored local file. Password and token must never enter Pages, URL parameters or logs.

## Read and save connector configuration

**Actor:** authenticated dashboard user. **Precondition:** valid session or service Token. **Outcome:** connector configuration is stored locally and a refresh is requested.

1. `GET /api/connectors` passes `requireSession`, reads local config and recursively masks secret-like keys.
2. Anonymous access is denied with 401. The response must not include prior secret values.
3. Browser edits fields and posts the whole connector map to `/api/connectors`.
4. Server restores prior secret values only where the submitted value is exactly `********`, then writes `data/connectors.json`.
5. Server spawns `scripts/update-data.js`, writes `connectors_saved` and refresh audit events, and responds 202.
6. A concurrent API-triggered refresh returns 409. This lock does not cover systemd-triggered refreshes.

Side effects: local connector overwrite, child process, snapshot/wiki rewrite and audit append. An authenticated caller can choose a folder path; current code does not enforce an allowlisted data root.

## Manual refresh

**Actor:** authenticated dashboard user or service Token. **Outcome:** refresh is accepted once and runs asynchronously.

1. `POST /api/refresh` passes `requireSession`.
2. `runRefresh` rejects a second in-process request with 409.
3. Child runs `scripts/update-data.js` with inherited server environment.
4. Generator reads platform config, connector config and configured vendor files.
5. Generator writes the full snapshot, then the dynamic Wiki; writes are not atomic as a pair.
6. Exit/error is appended to audit log. HTTP caller does not receive completion status, only acceptance.

Deny cases: 401 without auth, 409 when API lock is held, 500 on synchronous spawn failure.

## Submit sourcing-risk analysis

**Actor:** authenticated dashboard user. **Precondition:** selected market and optional 1688 URL. **Outcome:** a checklist and evidence requirements are returned.

1. Browser sends product metadata, target market and sourcing URL to `/api/risk/analyze`.
2. `requireSession` rejects anonymous requests.
3. Server reads connector metadata and checks whether a risk-like connector is enabled.
4. Server validates only that the URL host matches `1688.com`.
5. Response contains fixed materials/data-needs sections and status `needs-configuration` or `evidence-required`.

There is no outbound evidence query, legal decision, risk score or stored case. `evidence-required` means “a connector is marked enabled,” not “evidence was obtained.”

## Scheduled snapshot refresh

**Actor:** systemd timer running as `ec2-user`. **Outcome:** current vendor exports are re-aggregated.

1. `overseas-ecommerce-monitor-refresh.timer` fires every 6 hours after its last activation.
2. Oneshoot service runs `npm run refresh` with `/etc/overseas-ecommerce-monitor.env`.
3. It does not run collectors; it reads existing configured export files.
4. Snapshot and dynamic Wiki are overwritten.

There is no application auth because this is an OS-level path. Failure is visible in `journalctl`; no API audit event is written.

## Scheduled Tunnel URL synchronization

**Actor:** systemd timer running as `ec2-user`. **Outcome:** Pages eventually points to the currently healthy quick tunnel.

1. Five-minute timer runs `scripts/sync-pages-tunnel-url.sh`.
2. Script finds URL candidates from cloudflared metrics, journal, state file and current config.
3. Each candidate must return HTTP 200 from `/health`.
4. Script performs `git pull --ff-only`.
5. If URL differs, it updates only `public/config.json`, commits and pushes `main`.
6. GitHub Actions builds and deploys Pages. If URL is unchanged, no commit occurs.

Trust crossings: local service → public Tunnel → Git working tree → GitHub. A dirty or diverged worktree can make this automation fail; it must never stage secrets or unrelated files.
