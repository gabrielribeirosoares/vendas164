-- Run only AFTER the migration, production deploy and Vercel variables are ready.
-- Add SIGNAL_REMINDER_CRON_SECRET to Vault under the name signal_reminder_cron_secret
-- using Dashboard > Integrations > Vault. Use the same value as Vercel; never commit it.
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
CREATE EXTENSION IF NOT EXISTS pg_net;
DO $$
BEGIN
  IF NOT EXISTS(SELECT 1 FROM vault.decrypted_secrets WHERE name='signal_reminder_cron_secret' AND length(decrypted_secret)>=32) THEN
    RAISE EXCEPTION 'Configure signal_reminder_cron_secret in Vault before scheduling';
  END IF;
END $$;
SELECT cron.schedule('vendas164-signal-reminders','*/15 * * * *', $job$
  SELECT net.http_post(
    url := 'https://www.vendas164.com.br/api/reminders/signals',
    headers := jsonb_build_object('Content-Type','application/json','Authorization',
      'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='signal_reminder_cron_secret')),
    body := '{}'::jsonb, timeout_milliseconds := 60000
  );
$job$);
-- Pause: SELECT cron.unschedule('vendas164-signal-reminders');
