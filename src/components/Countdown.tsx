import { useEffect, useState } from "react";

function diff(target: string) {
  return new Date(target).getTime() - Date.now();
}

export function Countdown({ expiresAt }: { expiresAt: string }) {
  const [ms, setMs] = useState(() => diff(expiresAt));

  useEffect(() => {
    setMs(diff(expiresAt));
    const id = setInterval(() => setMs(diff(expiresAt)), 1000);
    return () => clearInterval(id);
  }, [expiresAt]);

  const deadline = new Date(expiresAt).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
  if (!Number.isFinite(ms)) return null;
  if (ms <= 0) {
    return <span className="font-mono text-sm text-destructive">Vencido · {deadline}</span>;
  }

  const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  const dueDay = new Date(expiresAt).toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  const tomorrow = new Date(Date.now() + 86400000).toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  const label = dueDay === today ? "Vence hoje" : dueDay === tomorrow ? "Vence amanhã" : "Vence";
  const total = Math.floor(ms / 1000);
  const h = String(Math.floor(total / 3600)).padStart(2, "0");
  const m = String(Math.floor((total % 3600) / 60)).padStart(2, "0");
  const s = String(total % 60).padStart(2, "0");

  return (
    <span
      className={`font-mono text-sm tabular-nums ${ms <= 86400000 ? "text-primary font-semibold" : "text-muted-foreground"}`}
    >
      {label} · {deadline}
      <span className="block text-xs">Restam {h}:{m}:{s}</span>
    </span>
  );
}
