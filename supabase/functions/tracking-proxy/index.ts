import { serve } from "https://deno.land/x/sift@0.9.1/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.44.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
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

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const code = url.searchParams.get("code");
    const provider = url.searchParams.get("provider") ?? "correios";

    if (!code || code.length < 8) {
      return new Response(JSON.stringify({ error: "Invalid tracking code" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let result: TrackingResult | null = null;

    if (provider === "correios" || provider === "unknown") {
      result = await trackCorreios(code);
      if (!result && provider !== "correios") {
        result = await trackMelhorRastreio(code);
      }
    }

    if (!result) {
      result = await trackMelhorRastreio(code);
    }

    if (!result) {
      result = await trackEncomendaIo(code);
    }

    return new Response(JSON.stringify(result ?? { error: "No tracking found" }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

async function trackCorreios(code: string): Promise<TrackingResult | null> {
  const normalizedCode = code.toUpperCase().trim();
  const apiUrl = `https://proxyapp.correios.com.br:3001/api/rastreamento/${normalizedCode}`;

  try {
    const response = await fetch(apiUrl, {
      headers: { "Content-Type": "application/json" },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

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
      code: normalizedCode,
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
  const normalizedCode = code.toUpperCase().trim();
  const apiUrl = `https://api.melhorrastreio.com.br/api/v1/track/${normalizedCode}`;

  try {
    const response = await fetch(apiUrl, {
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();
    const status = data?.status ?? "";
    const events: TrackingEvent[] = (data?.data ?? []).map((ev: any) => ({
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
      code: normalizedCode,
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
  const normalizedCode = code.toUpperCase().trim();
  const apiUrl = `https://encomenda.io/api/v1/tracking/${normalizedCode}`;

  try {
    const response = await fetch(apiUrl, {
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();
    const events: TrackingEvent[] = (data?.tracking_events ?? data?.events ?? []).map(
      (ev: any) => ({
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
      code: normalizedCode,
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
