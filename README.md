# LUMINHAW Administration

This repository contains two clients for the existing LUMINHAW Supabase project:

- The static HTML/JavaScript administrator app at [index.html](./index.html), deployed on GitHub Pages.
- The original PHP app under `public/` and `app/`, preserved for PHP-capable servers.

GitHub Pages cannot execute PHP. The Pages app signs in with Supabase Auth in the browser and sends authenticated requests directly to the existing `admin-api` Edge Function. The Edge Function remains responsible for authorization and privileged database access. The static app does not connect directly to PostgreSQL or replace the existing database/RLS policies.

## GitHub Pages deployment

GitHub Pages URL: <https://luminhawofficial.github.io/LUMINHAW_ADMIN/>

The `Deploy static admin app to GitHub Pages` workflow publishes on pushes to `main`. In **Settings → Pages**, set the build and deployment source to **GitHub Actions**.

Configure these repository **Actions variables** under **Settings → Secrets and variables → Actions → Variables**:

| Variable | Value |
|---|---|
| `SUPABASE_URL` | The existing Supabase project URL, for example `https://YOUR_PROJECT_REF.supabase.co` |
| `SUPABASE_PUBLISHABLE_KEY` | That project's publishable/anon client key |

These are public client configuration values: the workflow embeds them in the static site so the browser can connect to Supabase. The publishable/anon key is not a service-role key and must only be used with the existing Edge Function's authorization checks and database RLS. **Never put a service-role key, Supabase secret key, password, or private key in Actions variables, the workflow, or static files.** The workflow rejects non-publishable keys.

After adding the variables, run or re-run the workflow from the **Actions** tab. Supabase Auth must allow the Pages URL as a redirect URL for any auth email/redirect flows:

```text
https://luminhawofficial.github.io/LUMINHAW_ADMIN/**
```

The browser app stores its Supabase session in tab-scoped `sessionStorage`, refreshes tokens through Supabase Auth, checks the active administrator role through `admin-api`, and expires inactive sessions client-side. The Edge Function must continue to verify roles for every request; hiding a menu item is not an authorization boundary.

## Plant library management

The admin clients expose the Plant Library only to the `admin` role. They use
the existing `admin-api` Edge Function actions `plant_catalog.list`
(`search` matches common, scientific, Tagalog, and Bisaya names),
`plant_catalog.create`, and `plant_catalog.update`. The list response is
`{ "plants": [...] }`; plant records use `image_url`, `common_name`,
`scientific_name`, `tagalog_name`, `bisaya_name`, `description`,
`water_requirement`, `sunlight_requirement`, `soil_requirement`, `fertilizer`,
`growth_tips`, `common_diseases`, `treatment`, `toxicity`, `date_updated`, and
`field_references`. `field_references` maps each populated fact's field name
to an array of one or more source strings, for example:

```json
{
  "common_name": ["Department of Agriculture (Philippines)"],
  "scientific_name": [
    "Flora of the Philippines",
    "https://example.org/plant-entry"
  ],
  "description": ["University of the Philippines Los Baños (UPLB)"]
}
```

The admin form requires at least one source for every populated fact,
including the plant picture and a selected toxicity value. It allows several
sources per fact. Date updated is record metadata and does not require a
citation. Legacy record-level `reference` values are shown for existing data
but are not treated as proof for individual facts.

The Edge Function source is maintained separately in
[LUMINHAW-APP](https://github.com/luminhawofficial/LUMINHAW-APP/tree/main/supabase/functions/admin-api).
Deploy its plant-catalog migration and `admin-api` function before using this
UI; the function enforces admin-only create/update access and validates
per-populated-field references server-side. The existing catalog tables are
service-role only, so browser clients must not write directly to Supabase. The
user-facing library belongs to the LUMINHAW app and should expose the reference
alongside the corresponding fact. If the admin app reports
`unsupported_admin_action`, the deployed `admin-api` function has not yet been
updated to support the plant-catalog actions; deploy the function changes
before using the Plant Library.

## Existing PHP app

The original PHP authentication system remains in `public/login.php`, `public/index.php`, `public/api.php`, and `public/logout.php`, with shared services in `app/`. The PHP app uses Supabase Auth and the same `admin-api` Edge Function. It is not executed by GitHub Pages.

To run it locally, use PHP 8.1+ with the `curl`, `json`, and `session` extensions:

1. Copy `.env.example` to `.env`.
2. Set `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` to the existing project values. Keep `.env` private.
3. Run:

   ```powershell
   php -S localhost:8000 -t public
   ```

4. Open <http://localhost:8000/login.php>.

The PHP app stores session and rate-limit files under private, writable directories in `storage/`. When using a PHP host, serve only `public/` as the document root; keep `.env`, `app/`, and `storage/` outside the public web root. Use HTTPS in production.

## Supabase setup and security

Use the existing LUMINHAW Supabase project and deployed `admin-api` Edge Function. The application does not create a replacement database or disable Row Level Security. Apply or deploy migrations/functions only from the existing Supabase project workflow after reviewing them.

The static app sends user sign-in credentials directly to Supabase Auth over HTTPS. It sends the resulting user's access token to `admin-api`; no service-role credential is sent to the browser. The Edge Function must verify the user and administrator role for every operation, enforce role-specific privileges, and perform privileged database access server-side.

For administrator accounts, require confirmed email and an active row in `public.admin_roles`. A normal Supabase account must not gain administrator access merely by knowing the publishable key.

The `.gitignore` excludes `.env`, local Supabase CLI state, sessions, rate limits, and the locally generated `supabase-config.js`. Never commit credentials or secrets. The public publishable key is expected to be visible to site visitors; its safety depends on Supabase Auth, Edge Function authorization, and RLS—not on hiding that key.
