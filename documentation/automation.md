# Automation and model use

## Snapshot analysis automation

| Property | Current behavior |
|---|---|
| Trigger/owner | systemd timer, authenticated refresh, connector save, or local operator command |
| Approval | Timer is automatic; API requires full dashboard auth; CLI requires OS access |
| Inputs | Public platform config, local connector metadata and configured CSV/JSON files |
| Tools/APIs | Local filesystem only during `npm run refresh` |
| Steering | Deterministic functions in `scripts/update-data.js` |
| Hard guards | Synthetic generation off unless `ALLOW_SYNTHETIC_DEMO=1`; API refresh auth; one in-process lock |
| Output contract | JSON snapshot plus Markdown Wiki; snapshot structure checked separately |
| Side effects | Overwrites snapshot and dynamic Wiki; API path appends audit events |

The automation produces scores, recommendations and 4P/GTM suggestions. These are app-owned derived outputs, not agent decisions and not verified market evidence.

## Optional LLM Wiki synthesis

| Property | Current behavior |
|---|---|
| Trigger | Only `npm run refresh:ai` / `--with-ai-wiki` |
| Provider/tool | `POST https://api.openai.com/v1/responses` |
| Inputs allowed | Workflow steps, metrics, top opportunity pools, selected SKU summaries, 4P and Wiki signals |
| Steering | Prompt in `maybeCreateAiWiki` requires Chinese output, supplied-data-only analysis and PM workflow organization |
| Hard guards | CLI flag plus both `OPENAI_API_KEY` and `OPENAI_MODEL`; otherwise rule-based fallback |
| Output contract | Plain Markdown string; no schema or factual validator |
| Failure | Non-2xx or empty output falls back to rule-based Wiki |
| Side effects | Replaces local dynamic Wiki after snapshot generation |
| Kill switch | Do not run AI command, or remove either model variable |

There is no rate limit, retry/backoff, cost budget, response audit record or human approval after generation. The model cannot call tools and does not directly write inventory, orders, connectors or Git; the app writes its returned Markdown.

## Shopee Taiwan title generation

The authenticated title route calls the local `ai-crypto` provider only after an explicit user request. The primary DashScope request disables deep thinking for bounded JSON generation; transient failures alone can use the Responses fallback, which keeps `store:false` and `reasoning.effort:xhigh`. Provider output is Zod-validated and invalid or unavailable output is returned as an error; no static candidate is substituted. Local audit records contain only prompt hash, provider/model, attempt, latency, token usage and error category.

## External collectors

- Google Trends collector calls the `google-trends-api` package for interest-over-time and related queries.
- Shopee collector calls an internal public search endpoint; Lazada collector calls an AJAX catalog endpoint.
- They run only through explicit collector commands or the standalone scheduler, not during the current systemd `npm run refresh` job.
- Each collector writes raw local files. Normalization writes a second local file; connector configuration determines whether the generator reads it.
- Platform terms, endpoint stability, authorization and metric definitions must be reviewed before production reliance.

## Tunnel/Pages automation

The five-minute systemd job runs a shell script that discovers a healthy quick-tunnel URL, changes `public/config.json`, commits and pushes `main`. GitHub Actions then builds and deploys Pages.

Guardrails are URL pattern matching, `/health` status, fast-forward pull, exact-file staging and no-op when unchanged. There is no approval gate for the URL-only commit. The script must not be extended to stage broad globs or runtime data.

## Connector reality check

Connector cards are not embedded agents. Saving them stores local configuration and triggers the snapshot generator. At present:

- `csv-folder` is the only connector type consumed by snapshot generation.
- Risk connector enablement changes checklist status but makes no provider call.
- Shopee, Lazada and Amazon credential fields do not yet activate official API clients.

UI state such as `configured` or `enabled` must not be reported as validated/activated without an actual provider response and provenance record.
