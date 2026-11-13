# LUMINHAW Supabase schema mapping

## Inspection scope

This mapping is based on the Flutter source, local Supabase migrations, Edge
Functions, and payment documentation in the LUMINHAW project at
`C:\Users\eldri\Desktop\LUMINHAW`. No files in that project were modified.
The SQL backup files were not opened because they may contain production user
data. The deployed Supabase database was not queried, so production migration
state and settings still need to be verified before deployment.

## Existing data and access patterns

| Admin area | Existing source | Current shape / constraints |
|---|---|---|
| Accounts | Supabase `auth.users`; `public.profiles` | `profiles.id` references Auth. Profile fields include display name and avatar path. Flutter uses Supabase Auth for sign-up, sign-in, email verification, password reset, and account deletion. Account suspension/reactivation is not implemented by a local migration. |
| Garden | `public.plants`, `public.growth_entries`, `public.care_activities` | All are owner-scoped and cascade with account deletion. Plant rows contain common/scientific name, family, category, image path, and creation time. Growth and care entries reference a user's plant. No watering schedule table was found. |
| Identifications | `public.plant_identifications` | Owner, optional image path and plant, status (`pending`, `completed`, `failed`), provider, JSON result, and timestamps. User RLS is in force. |
| Health | `public.plant_health_assessments` | Owner, optional plant, image path, status, provider, JSON result, and timestamps. User RLS is in force. The dashboard must label AI results as unverified. |
| Plant library | `public.plant_catalog`, `public.plant_care`, `public.plant_images`, `public.plant_provider_cache` | Catalog data includes scientific/common names, family, genus, description/source, GBIF key, care, and image attribution/license metadata. Catalog and care tables are service-role-only; Flutter accesses catalog/provider functionality through Edge Functions. Do not write unreviewed AI results into verified source fields. |
| Entitlements | `public.subscription_entitlements` | Keyed by user and product; includes status, expiry, verification, and update times. Authenticated users can read only their own rows; clients cannot write entitlements. |
| Payments | `public.payment_plans`, `public.premium_payment_requests`, `public.premium_payment_events`, `public.payment_gateway_events`, `public.payment_admins` | Payment requests link to Auth users and plans and retain status, amount, reference, receipt path, review details, and timestamps. Private receipt objects are stored outside public access. Service-role access is required for administrative data. |
| Payment email review | `public.payment_email_notifications`, `public.payment_email_action_tokens`, `public.payment_email_action_rate_limits` | Approval/rejection uses expiring, one-use email action tokens restricted to the configured reviewer mailbox. Approval requires explicit confirmation that funds were received; the database transaction records the decision and grants/extends the entitlement. Tokens and notification rows are not readable by browser roles. |
| Announcements | `public.system_announcements` | Database-backed announcements have title, body, category, publish/expiry times, and active state. The app can read published announcements. No audience-targeted push delivery or delivery receipt workflow was found. |
| Administration | `public.admin_roles`, `public.admin_activity_logs` | At most one active Admin is enforced by SQL and manages administrator roles through the guarded `admin-api`; a fresh local roster remains empty until an Admin is bootstrapped. Moderators have limited access. |

Important migrations include `20261027060000_luminhaw_schema.sql`,
`20261027100000_security_controls.sql`, `202610290001_plants.sql`,
`20261030120000_manual_premium_payments.sql`,
`20261106210000_gcash_receipt_review.sql`,
`20261106230000_email_payment_approval_and_strict_receipts.sql`, and
`20261110100000_system_announcements.sql`,
`20261110220000_admin_dashboard_foundation.sql`,
`20261113000000_admin_payment_review_admin_role.sql`, and
`20261113010000_remove_super_admin_role.sql`.

## Payment workflow must be preserved

The legacy `review_premium_payment(...)` function remains disabled. The
email-token review flow remains available. Dashboard payment review and
administrator management belong to the single active `admin` account;
moderators do not have these capabilities. The dashboard calls the guarded
`admin_review_premium_payment(...)` function through `admin-api`, and the
database transaction activates Premium only after the Admin confirms receipt.
Client code cannot update payment status or entitlements directly. The role
change is local until the matching Edge Function and migration are deployed.

There is also a pricing mismatch: the brief says PHP 599 per year, while the
latest local migration `20261110120000_update_yearly_premium_price.sql` sets
the 365-day plan to PHP 499. Do not change prices without confirmation.

## Requirements not represented in the current schema

- Admin-reviewed catalog edits / verification history.
- The requested Tagalog/Bisaya names, expanded care and toxicity fields, date
  updated, and mandatory references need a compatible catalog schema and
  admin-only `admin-api` actions. The deployed Edge Function is not present in
  this repository; do not write to the service-role-only catalog from a
  browser client.
- User-targeted notification campaigns, push-delivery status, and schedules.
- Dedicated subscription history beyond payment requests and current
  entitlements.
- Care schedules, watering schedules, and some requested garden progress
  fields.
- Historical snapshots for metrics that cannot be reconstructed from current
  Auth/data timestamps.

These are gaps, not permission to assume table names or silently add duplicate
tables. Any new migration must be additive, reviewed against the live schema,
use restrictive RLS, and be tested locally before rollout.

## Phased implementation

1. **Inspection and mapping — complete locally.** Confirm the Flutter source,
   migration history, data ownership, and existing payment review workflow.
2. **Foundation — complete locally.** Supabase Auth login, server-side role
   checks, secure PHP sessions, CSRF protection, and a single active Admin are
   implemented. Never put service-role credentials in browser code.
3. **Live dashboard — pending.** Replace sample figures only where real
   authorized queries and time-series data exist; show unavailable states for
   unsupported metrics.
4. **Read-only operational modules — pending.** Add user, catalog, scan,
   health, garden, subscription, and payment views using existing structures
   and private signed asset access.
5. **Controlled changes — pending.** Add narrowly scoped, auditable server
   actions and only the additive database structures justified by the chosen
   role and payment workflows.
6. **Notifications, reports, and settings — pending.** Distinguish saved
   announcements from delivered push notifications; implement exports from
   real authorized data.
7. **Security, tests, and deployment — pending.** Run PHP checks, local
   Supabase migration/RLS tests, authorization tests, and deployment-specific
   checks. Do not apply migrations to production until separately reviewed.
