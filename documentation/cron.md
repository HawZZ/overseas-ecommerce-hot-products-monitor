# Scheduled work

## Inventory

Runtime values below were checked on 2026-08-03 UTC.

| Job | Actual schedule/trigger | Function | Secrets/data | Retry/idempotency |
|---|---|---|---|---|
| Snapshot refresh timer | systemd: 5 min after boot, then every 12h | `npm run refresh` | `/etc/overseas-ecommerce-monitor.env`, local data | Persistent timer retries only at next schedule; collector uploads trigger an additional snapshot rebuild |
| Shopee TW CDP collector | user macOS launchd: every 12h | `collector-client/collector.mjs run` | local Chrome profile and scoped collector token | Stops on platform verification, rate limits or schema drift; preserves previous valid batch |
| Pages Tunnel sync timer | systemd: 3 min after boot, then every 5m | `scripts/sync-pages-tunnel-url.sh` | Git credential available to OS user; public URL | URL/health comparison avoids duplicate commit; Git/network failures wait for next run |
| API manual refresh | authenticated `POST /api/refresh` | spawn generator | inherited API environment | In-process lock only; 202 accepted before completion |
| Connector-save refresh | authenticated connector POST | write config then spawn generator | connector values and inherited env | Same in-process lock; config write precedes refresh |
| Standalone scheduler | `npm run scheduler`; default 24h unless env overrides | collect all, then refresh | proxy/provider access and local data | Continues refresh after collector failure; long-running interval |
| GitHub Pages | push main or manual dispatch | npm install, build, deploy | GitHub Pages/OIDC and optional public build URL | Actions rerun; no behavior-test gate |

The server snapshot cadence is 12 hours. The macOS collector is independent: it supplies a new Taiwan batch only when the user's Chrome profile is initialized and available.

## Operation

Safe status checks:

```bash
systemctl status overseas-ecommerce-monitor.service --no-pager
systemctl status overseas-ecommerce-monitor-tunnel.service --no-pager
systemctl list-timers overseas-ecommerce-monitor-refresh.timer overseas-ecommerce-monitor-pages-sync.timer --all --no-pager
journalctl -u overseas-ecommerce-monitor-refresh.service -n 100 --no-pager
journalctl -u overseas-ecommerce-monitor-pages-sync.service -n 100 --no-pager
```

Do not print the environment file. Use `/health`, snapshot metadata and safe file stats to verify outcome.

## Failure and overlap behavior

- Systemd refresh runs only the generator; it does not fetch new Trends/Shopee/Lazada data.
- Generator writes snapshot and Wiki sequentially to final paths. A crash can leave old/new mismatched or a partially written file.
- `refreshInProgress` exists only inside the API process. A systemd job can overlap an API-triggered child.
- Standalone scheduler uses `setInterval` without a cycle lock; a cycle longer than its cadence could overlap.
- Tunnel sync runs Git operations in the working tree. It stages only `public/config.json`, but pulls can fail when history diverges or overlapping edits conflict.
- API-triggered jobs append audit events; systemd jobs rely on journal output and do not append equivalent application audit records.

## Change procedure

When changing cadence, update and verify all applicable sources: systemd timer, `/etc/overseas-ecommerce-monitor.env`, `.env.example`, scheduler default, server `/health`, snapshot metadata, README/deployment docs and this page. Then observe at least one timer run and verify snapshot `generatedAt`.
