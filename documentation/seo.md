# Public and SEO surface

## Current approach

GitHub Pages serves one public single-page application. `index.html` contains a Chinese title, viewport metadata and a static description. There is no router-level metadata, prerendering, sitemap, robots policy, canonical URL, Open Graph card or bot-specific rendering.

| Route/resource | Public | Indexable intent | Data rule |
|---|---:|---:|---|
| Pages root | yes | Login shell may be indexed | Static product description only; no business data |
| Static JS/CSS/assets | yes | not content routes | Must contain no credentials or snapshot |
| `config.json` | yes | not content | Backend HTTPS URL only |
| API `/health` | yes | operational endpoint | Minimal health metadata only |
| `/api/*` data routes | no | no | Bearer authentication required |

## Security relationship

SEO is not an authorization boundary. Search bots and arbitrary visitors can download all Pages assets and the Tunnel URL. Sensitive data remains protected only because it is absent from the bundle and every data API route requires authentication.

Any future public product/share page must use public-only fields, sanitize metadata and explicitly decide indexing. Do not prerender authenticated snapshot content or embed it in HTML/social metadata.
