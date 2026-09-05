import { createFileRoute } from "@tanstack/react-router";

type RawTrackingEvent = {
  date?: string;
  datetime?: string;
  location?: string;
  local?: string;
  city?: string;
  status?: string;
  originalTitle?: string;
  description?: string;
};

interface TrackingEvent {
  date: string;
  time: string;
  location: string;
  status: string;
  details: string;
}

interface TrackingResult {
  code: string;
  serviceName: string;
  category: string;
  events: TrackingEvent[];
  status: "delivered" | "in_transit" | "not_found";
  lastUpdate: string | null;
}

const FETCH_TIMEOUT = 3000;

async function fetchWithTimeout(
  url: string,
  optionsOrHeaders: RequestInit | Record<string, string> = {},
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT);
  try {
    let init: RequestInit;
    if ("headers" in optionsOrHeaders || "method" in optionsOrHeaders || "body" in optionsOrHeaders) {
      init = { ...(optionsOrHeaders as RequestInit), signal: controller.signal };
    } else {
      init = { headers: optionsOrHeaders as HeadersInit, signal: controller.signal };
    }
    const response = await fetch(url, init);
    return response;
  } finally {
    clearTimeout(timeoutId);
  }
}

const DEFAULT_MELHOR_ENVIO_TOKEN =
  "eyJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiJ9.eyJhdWQiOiIxIiwianRpIjoiYWM4Mzk2NDA3NDJiODhhOTcwMTQyN2EwNjU4M2Y1MmVmZjI5NDRjYTVlYzRlNDgyODI2ZWY2YmIxOTNkMDE5YjRiMmYwMDliMGJkYzczZWEiLCJpYXQiOjE3ODgyMTcxNzUuMzcxMjgzLCJuYmYiOjE3ODgyMTcxNzUuMzcxMjg1LCJleHAiOjE4MTk3NTMxNzUuMzYwODU4LCJzdWIiOiJhMmEzMjk1Yi1hZmY5LTQzMjMtOTg1OS0xYWI0N2JlZDE4ODYiLCJzY29wZXMiOlsiY2FydC1yZWFkIiwiY2FydC13cml0ZSIsImNvbXBhbmllcy1yZWFkIiwiY2FydC13cml0ZSIsImNvdXBvbnMtcmVhZCIgLCJjb3Vwb25zLXdyaXRlIiwibm90aWZpY2F0aW9ucy1yZWFkIiwib3JkZXJzLXJlYWQiLCJwcm9kdWN0cy1yZWFkIiwicHJvZHVjdHMtZGVzdHJveSIsInByb2R1Y3RzLXdyaXRlIiwicHVyY2hhc2VzLXJlYWQiLCJzaGlwcGluZy1jYWxjdWxhdGUiLCJzaGlwcGluZy1jYW5jZWwiLCJzaGlwcGluZy1jaGVja291dCIsInNoaXBwaW5nLWNvbXBhbmllcyIsInNoaXBwaW5nLWdlbmVyYXRlIiwic2hpcHBpbmctcHJldmlldyIsInNoaXBwaW5nLXByaW50Iiwic2hpcHBpbmctc2hhcmUiLCJzaGlwcGluZy10cmFja2luZyIsImVjb21tZXJjZS1zaGlwcGluZyIsInRyYW5zYWN0aW9ucy1yZWFkIiwidXNlcnMtcmVhZCIgLCJ1c2Vycy13cml0ZSIsIndlYmhvb2tzLXJlYWQiLCJ3ZWJob29rcy13cml0ZSIsIndlYmhvb2tzLWRlbGV0ZSIsInRkZWFsZXItd2ViaG9vayJdfQ.l8ybEaSHLVpXvS7wz0AjG-4K_eDaBhyD07qNUW6ZrZ_riUMYcJSzyNimDuxAtRGJl_lCEZULdGp6C39cP-cZS9v8h0yJiTmwmxsGb3SPGtKVenTejfvxmWjIDInrhBtw5NF9vGn88dHvSkcrwtsvH6gfJZinOm3DAvgvOFTG9zVpfF70zCPRkMuZ1R_NAwgNjVJ02TBDh3WDQaw7D8yLoMPCDAI083eYD5Jt05FWHI_5r-Z_m8rGdiHNW7UIuxF-JNsnTI5LGa5HSlndnBePFnRjllnXM2WhqMOs9jBKKyGpCDVHl4EQtEovFexIFszEAccmKabhrwz7hPA952uxAsTfxZDhT6I-ZRlswVavtLorEFu7XvtrlZZ8MPamAnhm3pkJtJ2rGhcaMAKhxglxxUVrPcrdD3wGAeJsZsx05SggKhm5FtE7NwDnER0p0JCIiSw3iMLH7T4Skqk6hdroy8tIniMzPnqGxlEjCjpZ1ngKGis-Uh3b5AF5iQz5Wac0TwT-6aFGBAx9jZLqKr9HWmgMkHdmb0T1rp8Tx5aB9yXGtiRxE9wPnzmpXrqRaWKKbEGZpycRvKCs-92iq5xyE0raeqJ5y4pwe_RwVXjO2L32uVubvIKnYPcEpTc3QgfLR0BNNH2tZCFqSw3JcOa2w-rgTXlUGDBEkbHiXSyKw38";

export const Route = createFileRoute("/api/tracking")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const code = url.searchParams.get("code");
        const provider = url.searchParams.get("provider") ?? "correios";
        const token = url.searchParams.get("token") || request.headers.get("x-melhor-envio-token") || DEFAULT_MELHOR_ENVIO_TOKEN;

        if (!code || code.trim().length < 8) {
          return new Response(JSON.stringify({ error: "Invalid tracking code" }), {
            status: 400,
            headers: { "Content-Type": "application/json" },
          });
        }

        const normalizedCode = code.toUpperCase().trim();

        let result: TrackingResult | null = null;

        // Se houver token do Melhor Envio, tentar primeiro a API oficial do Melhor Envio
        if (token) {
          try {
            result = await trackWithMelhorEnvioApi(normalizedCode, token);
          } catch (e) {
            console.error("[MelhorEnvioAPI] Error:", e);
          }
        }

        // Try standard providers if no result yet
        if (!result) {
          try {
            result = await trackCorreios(normalizedCode);
          } catch {}
        }

        if (!result) {
          try {
            result = await trackMelhorRastreio(normalizedCode);
          } catch {}
        }

        if (!result) {
          try {
            result = await trackEncomendaIo(normalizedCode);
          } catch {}
        }

        if (!result) {
          return new Response(JSON.stringify({ error: "No tracking found", code: normalizedCode, status: "not_found" }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }

        return new Response(JSON.stringify(result), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      },
    },
  },
});

async function trackWithMelhorEnvioApi(code: string, token: string): Promise<TrackingResult | null> {
  const apiUrl = "https://melhorenvio.com.br/api/v2/me/shipment/tracking";

  try {
    const cleanToken = token.trim().replace(/^Bearer\s+/i, "");
    const response = await fetchWithTimeout(apiUrl, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${cleanToken}`,
        "Content-Type": "application/json",
        "Accept": "application/json",
        "User-Agent": "Vendas164 (contato@vendas164.com.br)",
      },
      body: JSON.stringify({ orders: [code] }),
    });

    if (!response.ok) {
      console.warn(`[MelhorEnvioAPI] Response not OK: ${response.status}`);
      return null;
    }

    const data = await response.json();
    const item = data?.[code] || Object.values(data || {})[0];
    if (!item) return null;

    const events: TrackingEvent[] = [];
    const rawEvents = item?.events || [];

    for (const ev of rawEvents) {
      const dt = ev?.created_at ? new Date(ev.created_at) : null;
      events.push({
        date: dt ? dt.toLocaleDateString("pt-BR") : "",
        time: dt ? dt.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : "",
        location: ev?.location || "Em trânsito",
        status: ev?.description || ev?.status || "Atualização",
        details: ev?.description || "",
      });
    }

    let status: TrackingResult["status"] = "in_transit";
    const rawStatus = (item?.status || "").toLowerCase();

    if (
      rawStatus === "delivered" ||
      rawStatus === "entregue" ||
      item?.delivered_at ||
      events.some(
        (e) =>
          e.status.toLowerCase().includes("entregue") ||
          e.details.toLowerCase().includes("entregue")
      )
    ) {
      status = "delivered";
    } else if (rawStatus === "canceled" || rawStatus === "cancelado") {
      status = "not_found";
    } else if (events.length > 0 || rawStatus === "posted" || rawStatus === "in_transit") {
      status = "in_transit";
    }

    return {
      code,
      serviceName: item?.service?.name || "Melhor Envio (Correios/Transportadora)",
      category: "Encomenda",
      events,
      status,
      lastUpdate: events.length > 0 ? `${events[0].date} ${events[0].time}` : (item?.posted_at || null),
    };
  } catch (err) {
    console.error("[MelhorEnvioAPI] Fetch exception:", err);
    return null;
  }
}

async function trackCorreios(code: string): Promise<TrackingResult | null> {
  const apiUrl = `https://proxyapp.correios.com.br:3001/api/rastreamento/${code}`;

  try {
    const response = await fetchWithTimeout(apiUrl, { "Content-Type": "application/json" });

    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const data = await response.json();
    const resultado = data?.Resultado ?? data;

    const events: TrackingEvent[] = [];
    let serviceName = "Correios";
    let lastStatus: TrackingResult["status"] = "not_found";
    let lastUpdate: string | null = null;

    const objetos = resultado?.Objetos ?? resultado?.objeto ?? [resultado];
    if (Array.isArray(objetos)) {
      for (const obj of objetos) {
        serviceName = obj?.Servico ?? serviceName;
        const eventos = obj?.Eventos?.Evento ?? obj?.eventos ?? [];
        if (Array.isArray(eventos)) {
          for (const ev of eventos) {
            events.push({
              date: ev?.data ?? "",
              time: ev?.hora ?? "",
              location:
                ([ev?.uf, ev?.local, ev?.cidade].filter(Boolean).join(" - ") || ev?.local) ?? "",
              status: ev?.status ?? ev?.descricao ?? "",
              details: ev?.descricao ?? "",
            });
          }
        }
      }
    }

    if (events.length > 0) {
      const lastEvent = events[events.length - 1];
      lastUpdate = `${lastEvent.date} ${lastEvent.time}`;
      if (lastEvent.status.toLowerCase().includes("entregue")) {
        lastStatus = "delivered";
      } else {
        lastStatus = "in_transit";
      }
    }

    return {
      code,
      serviceName,
      category: "Correios",
      events,
      status: lastStatus,
      lastUpdate,
    };
  } catch {
    return null;
  }
}

async function trackMelhorRastreio(code: string): Promise<TrackingResult | null> {
  const apiUrl = `https://api.melhorrastreio.com.br/api/v1/track/${code}`;

  try {
    const response = await fetchWithTimeout(apiUrl, {
      "Content-Type": "application/json",
      Accept: "application/json",
    });

    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const data = await response.json();
    const status = data?.status ?? "";
    const events: TrackingEvent[] = (data?.data ?? []).map((ev: RawTrackingEvent) => ({
      date: ev?.date?.split(" ")[0] ?? "",
      time: ev?.date?.split(" ")[1] ?? "",
      location: ev?.location ?? ev?.local ?? "",
      status: ev?.status ?? ev?.originalTitle ?? "",
      details: ev?.description ?? ev?.originalTitle ?? "",
    }));

    let mappedStatus: TrackingResult["status"] = "not_found";
    if (typeof status === "string" && status.toUpperCase() === "DELIVERED") {
      mappedStatus = "delivered";
    } else if (events.length > 0) {
      mappedStatus = "in_transit";
    }

    return {
      code,
      serviceName: data?.service_provider ?? "Melhor Rastreio",
      category: "Correios",
      events,
      status: mappedStatus,
      lastUpdate:
        events.length > 0
          ? `${events[events.length - 1].date} ${events[events.length - 1].time}`
          : null,
    };
  } catch {
    return null;
  }
}

async function trackEncomendaIo(code: string): Promise<TrackingResult | null> {
  const apiUrl = `https://encomenda.io/api/v1/tracking/${code}`;

  try {
    const response = await fetchWithTimeout(apiUrl, {
      "Content-Type": "application/json",
      Accept: "application/json",
    });

    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const data = await response.json();
    const events: TrackingEvent[] = (data?.tracking_events ?? data?.events ?? []).map(
      (ev: RawTrackingEvent) => ({
        date: ev?.date ?? ev?.datetime?.split("T")[0] ?? "",
        time: ev?.datetime?.split("T")[1]?.slice(0, 5) ?? "",
        location: ev?.location ?? ev?.city ?? "",
        status: ev?.status ?? ev?.description ?? "",
        details: ev?.description ?? "",
      }),
    );

    let mappedStatus: TrackingResult["status"] = "not_found";
    if (events.length > 0) {
      const lastEvent = events[events.length - 1];
      if (
        lastEvent.status.toLowerCase().includes("entregue") ||
        lastEvent.status.toLowerCase().includes("delivered")
      ) {
        mappedStatus = "delivered";
      } else {
        mappedStatus = "in_transit";
      }
    }

    return {
      code,
      serviceName: data?.carrier ?? "Encomenda.io",
      category: "Correios",
      events,
      status: mappedStatus,
      lastUpdate:
        events.length > 0
          ? `${events[events.length - 1].date} ${events[events.length - 1].time}`
          : null,
    };
  } catch {
    return null;
  }
}
