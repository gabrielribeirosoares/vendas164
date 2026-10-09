// Pure helpers: safe to exercise without calling a provider or remote database.
export function reminderTestUser(env: Record<string, string | undefined>) {
  if (env.SIGNAL_REMINDERS_ENABLED !== "true") throw new Error("reminders_disabled");
  if (env.VERCEL_ENV === "production") return null;
  const user = env.SIGNAL_REMINDER_TEST_USER_ID;
  if (!user || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(user)) {
    throw new Error("reminder_test_user_required");
  }
  return user;
}

export function signalEmailPayload(orderId: string, expiresAt: string, email: string) {
  return {
    key: `signal-email-${orderId}-${Date.parse(expiresAt)}`,
    subject: "Seu sinal está próximo do vencimento",
    text: "Uma reserva tem sinal próximo do vencimento. Acesse https://vendas164.com.br/painel para consultar o prazo e pagar.\n\nVocê autorizou lembretes de sinal por e-mail. Para desativar, entre no painel e abra o sino de notificações.",
    to: [email],
  };
}

export function hasActiveSignalDelivery(
  deliveries: { status: string; updated_at: string }[],
  now = Date.now(),
) {
  return deliveries.some(
    (delivery) =>
      delivery.status === "sent" ||
      (delivery.status === "sending" && Date.parse(delivery.updated_at) > now - 10 * 60 * 1000),
  );
}
