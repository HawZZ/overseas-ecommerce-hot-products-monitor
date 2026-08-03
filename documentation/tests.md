# Verification map

## Existing coverage

| Use case | Rule and expected negative case | Evidence | Status / CI |
|---|---|---|---|
| Static quality | ESLint must pass | `npm run lint`, `eslint.config.js` | existing; not CI-gated |
| Snapshot contract | Four regions, five platforms each, seven tiers, Taiwan default, max Top10, 90 points and no current synthetic products | `scripts/verify-snapshot.js`, data docs | existing; not CI-gated |
| API authentication | Anonymous snapshot and wrong password return 401; valid login can read snapshot | `scripts/smoke-api.js`, `server/index.js` | existing; not CI-gated |
| API binding/cadence | Smoke server reports loopback and 12-hour metadata | `scripts/smoke-api.js` | existing; not CI-gated |
| Title API authentication | Authenticated status, five-candidate generation and experiment creation pass | `scripts/smoke-api.js` | existing; not CI-gated |
| Main browser workflow | Login, Taiwan default, real-product view after country reset, charts, sourcing links, connector cards, no overflow/console error | `scripts/visual-check.js` | existing guarded live/manual; not CI-gated |
| Buildability | Vite production build completes | `npm run build`, Pages workflow | existing; **CI-required** |
| Pages publish | Push to main builds artifact and deploys Pages | `.github/workflows/pages.yml` | existing; CI-required for deployment |

Snapshot verification checks shape and labels, not whether numerical semantics are true, current or complete.

## Proposed tests

| Use case | Rule / expected behavior | Type | Status |
|---|---|---|---|
| Token integrity | Tampered and expired sessions return 401; rotated secret invalidates old token | automated integration | proposed |
| Login limiting | Failure threshold returns 429; success clears state; window resets | automated integration | proposed |
| CORS | Allowed origin succeeds; unlisted origin is denied without leaking stack/internal message | automated integration | proposed |
| Connector secrecy | GET masks nested secrets; POST `********` preserves prior values; response/build/log never contains secret | automated integration | proposed |
| Connector path confinement | Absolute/traversal paths outside approved import root are rejected | automated integration | proposed |
| Refresh concurrency | API/API and API/systemd overlap cannot produce partial snapshot/wiki pairs | automated integration + guarded live | proposed |
| Missing data | Missing day remains null/status-missing and does not become a real zero in summary | automated unit | proposed |
| Source semantics | Cumulative sold and daily sales cannot share one field without explicit metric definition | schema/fixture test | proposed |
| Search proxy | Trends index is labeled relative/proxy and never rendered as absolute search count | unit + UI integration | proposed |
| Derived metrics | Estimated cost, sentiment, competition and risk cannot display as observed | unit + UI integration | proposed |
| SKU identity | Stable IDs merge true variants; same-title unrelated products remain separate | unit | proposed |
| Risk evidence | Enabled connector without provider response remains “waiting,” never pass/low risk | automated integration | proposed |
| Model path | Default refresh makes no network call; AI failure falls back; output is bounded and provenance-tagged | mocked integration | proposed |
| Secret scan | Tracked files and `dist/` reject API keys, passwords, tokens and Authorization values | automated CI | proposed |
| Timer coherence | systemd cadence, API health and snapshot metadata agree | guarded live | proposed |
| Pages end-to-end | Public config target is HTTPS and healthy; login works from Pages origin | guarded live | proposed |

## Gaps ranked by exposure

| Priority | Unverified rule | Exposure |
|---|---|---|
| P0 | Connector folder cannot read arbitrary local JSON/CSV | Local file disclosure to any dashboard credential holder |
| P0 | Tracked/built artifacts contain no credentials | Public repository/Pages secret leak |
| P1 | Observed, proxy, missing and estimated metrics remain distinguishable end to end | False business decisions and inventory loss |
| P1 | Refresh writes are atomic and cross-trigger concurrency is controlled | Corrupt/partial snapshot or Wiki |
| P1 | Connector masking/preservation is correct for all nested shapes | Secret loss or disclosure |
| P1 | Session expiry, tamper resistance and rate limiting negative paths | Unauthorized data access/brute force |
| P1 | Risk connector never implies completed legal/compliance evidence | Shipment, seizure or return loss |
| P2 | Cross-platform SKU identity avoids false merges | Inflated ranking and incorrect demand aggregation |
| P2 | Runtime cadence matches displayed cadence | Stale-data monitoring and false health status |
| P2 | Audit logs rotate and redact as intended | Local PII accumulation |

Only the Pages build currently gates deployment. A green workflow does not prove API security, data truthfulness or live Tunnel health.
