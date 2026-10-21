# Archive security and deployment

## Changes

- `app-security.js` uses vendored DOMPurify 3.4.17 with an explicit rich-text tag/attribute allowlist. Scripts, event handlers, SVG/MathML, forms, embeds, DOM-clobbering IDs/names and unsafe URLs are removed. Only paragraph alignment survives inline CSS; archive divider classes survive. Safe paragraphs, headings, emphasis, lists, tables, links and raster images are retained. If DOMPurify cannot load, HTML is displayed as escaped text.
- `app-formatting.js` sanitizes before preview, editor insertion, plain-text conversion and editor export. Paste/drop imports plain text. This covers remote records, local cached edits, drafts and newly published HTML. Source JSON is not rewritten: consumers other than this site must also sanitize HTML before rendering.
- `app-core.js` escapes invalid dates and validates thumbnail URLs; `app-series-manager.js` also validates thumbnail URLs. Remaining HTML templates insert escaped text, finite numbers or static markup.
- `app-admin.js` discards expired/malformed cached sessions, refuses API redirects and omits cookies/referrers. Server responses and upstream error logs do not disclose tokens or GitHub response bodies.
- `cloudflare-worker/worker.js` uses a single globally named SQLite Durable Object for rolling-window limits: 5 attempts per IP and 50 total per 15 minutes. Successful and failed attempts both count, and blocked attempts do not extend the window. IPs are keyed by HMAC, not stored in plaintext. Atomic transactions prevent concurrent bypass; persisted state survives Worker reloads. Missing/broken limiter or missing/short session secret fails closed. The trusted IP source is Cloudflare's `CF-Connecting-IP`, never `X-Forwarded-For`.
- Only `https://hanzizon.github.io` receives CORS headers. Other supplied origins are rejected; OPTIONS validates the route, requested method and headers. Origin-less clients still require valid bearer authentication for writes. CORS is not authentication.
- Sessions last 10,800 seconds (3 hours); `expiresIn` matches. Verification requires a signed integer `iat`/`exp`, valid lifetime, expiry and exactly two token segments. Old 12-hour tokens are rejected.

## Cloudflare deployment

1. Merge/deploy the frontend files together, including both `vendor` files and `app-security.js`. GitHub Pages requires no npm build. Do not upload `node_modules` or test output.
2. In a local checkout run `npm ci`, then `npx wrangler login` with the account owning `aotsuba-archive-admin`.
3. Confirm the existing Worker secrets `ADMIN_PASSWORD`, `SESSION_SECRET`, and `GITHUB_TOKEN`. Set missing values using `npx wrangler secret put NAME --config cloudflare-worker/wrangler.jsonc`. Use a strong unique password and a cryptographically random secret of at least 32 characters. Never commit these values. Restrict the GitHub token to this repository with Contents read/write. Rotate `SESSION_SECRET` if compromise is suspected; all sessions then need login again.
4. Run `npm run check:worker`, then `npx wrangler deploy --config cloudflare-worker/wrangler.jsonc`. Deploy the complete config, not worker.js alone: it creates binding `LOGIN_LIMITER`, class `LoginLimiter` and SQLite migration `v1-login-limiter`. No KV namespace or manually copied namespace ID is needed. The account must support SQLite Durable Objects. Preserve this migration in later deployments; do not delete/reset the object to clear limits.
5. Verify `/health`, approved-origin preflight and rejected-origin preflight. Log in from the site, check `expiresIn: 10800`, and verify editing with a disposable test post if desired. Avoid brute-force smoke tests against production: they consume the real limits. Existing administrators must log in again.

Official references: [SQLite Durable Object storage](https://developers.cloudflare.com/durable-objects/api/sqlite-storage-api/), [Durable Object storage setup](https://developers.cloudflare.com/durable-objects/best-practices/access-durable-objects-storage/), [DOMPurify releases](https://github.com/cure53/DOMPurify/releases).

## Verification

Run `npx playwright install chromium --only-shell`, then `npm test`. Tests exercise hostile and safe rich text, sanitizer failure, actual stored rich-text preservation, CORS/preflights, concurrent per-IP and global limits, persistence through Worker reload, missing configuration, valid/tampered/expired/legacy/overlong sessions, browser preview/editor injection and title click/Enter/Space navigation. The browser test compares the home screenshot with baseline commit `bb1c4b592c168dc9b3f70a052b4c64c84aabe694`; fetch that commit for shallow clones. API calls are mocked/isolated and no archive content is written during tests. `npm run check:worker` bundles without deploying. `npm audit --omit=dev` checks the runtime dependency.

## Remaining boundaries

- The repository and GitHub Pages remain public. Posts, JSON, source and images can be downloaded without login; `noindex`/robots.txt do not provide access control. This change protects administrator writes, not private reading.
- Session storage remains readable by same-origin JavaScript. A future XSS or a compromised script on another project under `https://hanzizon.github.io` can compromise sessions. CORS cannot isolate paths on the same origin. A dedicated origin and server-managed HttpOnly sessions would require a larger architecture change.
- Logout clears the local token; it does not revoke a copied token before its 3-hour expiry. Rotate the signing secret for emergency global revocation.
- Global rate limiting bounds distributed guessing but permits attackers to temporarily exhaust login capacity. Existing authenticated writes and public reading remain available. Strong passwords and optional edge bot/WAF protection remain useful. The object receives every allowed-origin login attempt, so high-volume traffic can consume Cloudflare resources. Trust `CF-Connecting-IP` only behind Cloudflare; review any additional Worker/proxy routing before deployment.
- Allowlisted external images can still contact their hosts. The sanitizer is not a substitute for maintaining DOMPurify updates. Raw HTML in JSON is retained to avoid destructive data migration; new renderers must reuse equivalent sanitization.
- Concurrent valid editors can still overwrite each other's full-array updates; this pre-existing data-model limitation is outside this security change.

Production Worker deployment and real credential checks are separate from the local tests; a dry run does not confirm production settings.
