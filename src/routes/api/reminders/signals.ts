import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/reminders/signals")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env.SIGNAL_REMINDER_CRON_SECRET;
        const token = request.headers.get("authorization")?.replace(/^Bearer /, "") || "";
        if (!secret || secret.length < 32 || token.length !== secret.length) {
          return Response.json({ error: "unauthorized" }, { status: 401 });
        }
        const { timingSafeEqual } = await import("node:crypto");
        const expected = Buffer.from(secret);
        const actual = Buffer.from(token);
        if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
          return Response.json({ error: "unauthorized" }, { status: 401 });
        }
        if (process.env.SIGNAL_REMINDERS_ENABLED !== "true") {
          return Response.json({ error: "reminders_disabled" }, { status: 503 });
        }
        try {
          const { sendSignalExpiryReminders } = await import("@/lib/signalReminders.server");
          return Response.json(await sendSignalExpiryReminders(), {
            headers: { "Cache-Control": "no-store" },
          });
        } catch {
          // Never log subscriptions, keys or customer payloads.
          console.error("Signal reminder job failed; verify migration and push configuration.");
          return Response.json({ error: "reminder_job_failed" }, { status: 500 });
        }
      },
    },
  },
});
