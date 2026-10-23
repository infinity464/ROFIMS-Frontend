# Plan: runtime config (appsettings.json for Angular) — NOT YET IMPLEMENTED

## Problem
`src/app/Core/Environments/environment.ts` is compiled **into the JS bundle at
build time**. Each server (test / client / client-test) therefore needs its own
`ng build` with the right block uncommented.

We want .NET `appsettings.json` behavior: **one build**, deployed everywhere, and
each server just edits a JSON file to point at its backend — no rebuild.

## Approach
Load a static `config.json` from the server **before** the app bootstraps and pour
its values into the `environment` object. All existing `import { environment }`
usages keep working unchanged because it stays the same object, just filled in at
runtime.

`public/` is already served as static assets, so `public/config.json` lands next to
`index.html` at `/config.json` (same-origin, no CORS). IIS serves it directly — the
SPA fallback in `public/web.config` only catches non-files.

## Steps to implement (later)

1. **`environment.ts`** — make it a typed, mutable object holding only the local-dev
   defaults, and add an `applyRuntimeConfig(partial)` that deep-merges overrides in
   place (production flag, apis.core, apis.auth, jsreportUrl).

2. **`main.ts`** — before bootstrapping:
   - `fetch(new URL('config.json', document.baseURI))` with `cache: 'no-store'`
     and a `?v=<timestamp>` cache-buster.
   - On success call `applyRuntimeConfig(json)`; on 404/failure fall back to the
     compiled dev defaults (so `ng serve` still works).
   - **Then DYNAMICALLY import** `app.config` / `app.component` and bootstrap.

     > CRITICAL: this dynamic import is the whole trick. ~12 services capture the
     > URL at module-load time, e.g.
     > `const API = `${environment.apis.core}/Posting`;`
     > (see `services/posting.service.ts`, `services/identity.service.ts`,
     > `services/jsreport.service.ts`, `Components/Features/audit/audit.service.ts`,
     > `Components/basic-setup/org-tree/org.service.ts`, and others — grep
     > `^const .*environment\.`). If we import the app statically, those consts
     > evaluate BEFORE the fetch resolves and freeze the dev URL. Deferring the
     > import guarantees they see the runtime values.

     Alternatively, refactor those ~12 services to read `environment.apis.core`
     lazily (inside methods) instead of at module load — then a normal static
     bootstrap works too. The dynamic-import route is less churn.

3. **`public/config.json`** — the live default config, shipped in the build.

4. **Per-server templates** kept in source control (e.g. `deploy-configs/`):
   - `config.test.json`       → core/auth `http://114.134.95.234:31999`
   - `config.client.json`     → core/auth `http://114.134.95.238:9900`, jsreportUrl `/jsreport-api`
   - `config.client-test.json`→ core/auth `http://192.168.9.103:9900`, jsreportUrl `/jsreport-api`

## Deploy flow after implementation
1. `ng build` once → copy `dist/sakai-ng/browser/*` to the server.
2. Overwrite that server's `config.json` with the matching template.
3. Reload — no rebuild.

## Notes / gotchas
- Node bump needed: Angular CLI requires Node ≥ v20.19 (or v22.12); dev box is
  currently v20.18.1, so `ng build` won't run until upgraded.
- `config.json` is publicly fetchable — same exposure as today's bundled URLs.
  Keep secrets out of it.
- Decide whether to `.gitignore` the live `public/config.json` (so a deploy edit
  isn't overwritten) or track it as the default.
