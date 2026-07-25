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

  if (ms <= 0) {
    return <span className="font-mono text-sm text-destructive">Prazo expirado</span>;
  }

  const total = Math.floor(ms / 1000);
  const h = String(Math.floor(total / 3600)).padStart(2, "0");
  const m = String(Math.floor((total % 3600) / 60)).padStart(2, "0");
  const s = String(total % 60).padStart(2, "0");

  return (
    <span className="font-mono text-sm tabular-nums text-warning">
      {h}:{m}:{s}
    </span>
  );
}
