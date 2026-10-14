# Push hardening rollout

Apply `supabase/migrations/20261008172515_harden_push_and_restore_sale_type.sql` after the signal reminder migration. It restores order sale_type precedence, preserves the due-soon filter and removes broad device management policies. Store owners receive notifications on their own devices; they do not need access to customer device credentials.

Set both `VITE_VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY` in the deployment environment. The committed fallback pair was removed and must not be reused. If that pair was used, generate a new matching VAPID pair and replace both variables. Redeploy to propagate the public key to the browser. Customers must activate notifications again after key rotation; the activation flow replaces a subscription using an older key.

The status button verifies the browser subscription against the signed-in user's server record. It resets on auth changes and remains inactive if verification fails. Saving a subscription also requires valid server VAPID configuration.

Verify with two accounts that one cannot delete or reassign the other's subscription; verify a real device receives a reminder. Repository tests use PGlite and do not establish production migration, cron or device delivery status.
