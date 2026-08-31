export type TrackingEvent = {
  date: string;
  time: string;
  location: string;
  status: string;
  details: string;
};

export type TrackingResult = {
  code: string;
  serviceName: string;
  category: string;
  events: TrackingEvent[];
  status: "delivered" | "in_transit" | "not_found";
  lastUpdate: string | null;
};

export const TRACKING_PROVIDERS = {
  correios: {
    name: "Correios",
    prefix: [
      "AA",
      "AC",
      "AE",
      "AN",
      "AP",
      "AR",
      "AS",
      "BA",
      "BO",
      "BR",
      "CA",
      "CC",
      "CD",
      "CE",
      "CG",
      "CH",
      "CI",
      "CN",
      "CP",
      "CT",
      "CW",
      "DE",
      "DG",
      "DJ",
      "DK",
      "DL",
      "DM",
      "DN",
      "DO",
      "DR",
      "DS",
      "DT",
      "DU",
      "DV",
      "DX",
      "EA",
      "EC",
      "EE",
      "EF",
      "EG",
      "EH",
      "EI",
      "EL",
      "EN",
      "EO",
      "EP",
      "ER",
      "ES",
      "ET",
      "EU",
      "EX",
      "EY",
      "EZ",
      "FA",
      "FB",
      "FC",
      "FD",
      "FE",
      "FF",
      "FG",
      "FH",
      "FI",
      "FJ",
      "FK",
      "FL",
      "FM",
      "FN",
      "FO",
      "FP",
      "FQ",
      "FR",
      "FS",
      "FT",
      "FU",
      "FV",
      "FW",
      "FY",
      "FZ",
      "GA",
      "GB",
      "GC",
      "GD",
      "GE",
      "GF",
      "GG",
      "GH",
      "GI",
      "GJ",
      "GK",
      "GL",
      "GM",
      "GO",
      "GP",
      "GQ",
      "GR",
      "GS",
      "GT",
      "GU",
      "GV",
      "GW",
      "GY",
      "GZ",
      "HA",
      "HB",
      "HC",
      "HD",
      "HE",
      "HF",
      "HG",
      "HH",
      "HI",
      "HJ",
      "HK",
      "HL",
      "HM",
      "HN",
      "HO",
      "HP",
      "HQ",
      "HR",
      "HS",
      "HT",
      "HU",
      "HV",
      "HW",
      "HY",
      "HZ",
      "IA",
      "IC",
      "IE",
      "IF",
      "IH",
      "II",
      "IJ",
      "IK",
      "IL",
      "IM",
      "IN",
      "IO",
      "IP",
      "IQ",
      "IR",
      "IS",
      "IT",
      "IU",
      "IV",
      "IX",
      "JA",
      "JB",
      "JC",
      "JD",
      "JE",
      "JF",
      "JG",
      "JH",
      "JI",
      "JJ",
      "JK",
      "JL",
      "JM",
      "JN",
      "JO",
      "JP",
      "JQ",
      "JR",
      "JS",
      "JT",
      "JU",
      "JV",
      "JW",
      "JX",
      "JY",
      "JZ",
    ],
  },
  totalExpress: { name: "Total Express", prefix: ["TX"] },
  jedoutransportes: { name: "Jadlog", prefix: ["JD"] },
  azul: { name: "Azul Cargo", prefix: ["AZ"] },
  dh: { name: "DHL", prefix: ["JD", "RR"] },
  fedex: { name: "FedEx", prefix: ["77", "96", "92"] },
};

export function detectProvider(code: string): keyof typeof TRACKING_PROVIDERS | "unknown" {
  const normalized = code.toUpperCase().trim();
  for (const [provider, config] of Object.entries(TRACKING_PROVIDERS)) {
    if (config.prefix.some((p) => normalized.startsWith(p))) {
      return provider as keyof typeof TRACKING_PROVIDERS;
    }
  }
  return "unknown";
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const TRACKING_CACHE = new Map<string, { result: TrackingResult; timestamp: number }>();
const CACHE_TTL = 5 * 60 * 1000;

export function getMelhorEnvioToken(storeId?: string): string {
  if (typeof window === "undefined") return "";
  if (storeId) {
    const specific = localStorage.getItem(`melhor_envio_token_${storeId}`);
    if (specific) return specific;
  }
  return localStorage.getItem("melhor_envio_token") || "";
}

export function saveMelhorEnvioToken(storeId: string, token: string): void {
  if (typeof window === "undefined") return;
  if (token.trim()) {
    localStorage.setItem(`melhor_envio_token_${storeId}`, token.trim());
    localStorage.setItem("melhor_envio_token", token.trim());
  } else {
    localStorage.removeItem(`melhor_envio_token_${storeId}`);
  }
}

export async function trackOrder(code: string, storeId?: string): Promise<TrackingResult | null> {
  const normalizedCode = code.toUpperCase().trim();
  if (!normalizedCode || normalizedCode.length < 8) return null;

  const cached = TRACKING_CACHE.get(normalizedCode);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.result;
  }

  const provider = detectProvider(code);
  const token = getMelhorEnvioToken(storeId);
  const tokenParam = token ? `&token=${encodeURIComponent(token)}` : "";

  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const response = await fetch(
        `/api/tracking?code=${encodeURIComponent(normalizedCode)}&provider=${provider}${tokenParam}`,
      );

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data: TrackingResult | { error: string } = await response.json();

      if ("error" in data) {
        throw new Error(data.error);
      }

      if (data && data.code) {
        TRACKING_CACHE.set(normalizedCode, { result: data, timestamp: Date.now() });
        return data;
      }

      return null;
    } catch (error) {
      const err = error as Error;
      if (err.message.includes("4")) {
        return null;
      }
      if (attempt < 2) {
        await sleep(1000 * attempt);
      }
    }
  }

  return null;
}

export async function trackMultipleOrders(codes: string[], storeId?: string): Promise<Map<string, TrackingResult>> {
  const results = new Map<string, TrackingResult>();

  const validCodes = codes.filter((c) => c && c.trim().length >= 8);
  if (validCodes.length === 0) return results;

  await Promise.all(
    validCodes.map(async (code) => {
      const result = await trackOrder(code, storeId);
      if (result) {
        results.set(code.toUpperCase().trim(), result);
      }
    }),
  );

  return results;
}

export async function trackCorreios(code: string): Promise<TrackingResult | null> {
  return trackOrder(code);
}

export async function trackWithMelhorRastreio(code: string): Promise<TrackingResult | null> {
  return trackOrder(code);
}

export async function trackWithEncomendaIo(code: string): Promise<TrackingResult | null> {
  return trackOrder(code);
}

export function getTrackingStatusLabel(status: TrackingResult["status"]): string {
  switch (status) {
    case "delivered":
      return "Entregue";
    case "in_transit":
      return "Em trânsito";
    case "not_found":
      return "Não localizado";
    default:
      return "Desconhecido";
  }
}

export function shouldUpdateDeliveryStatus(tracking: TrackingResult | null): boolean {
  if (!tracking) return false;
  if (tracking.status === "delivered") return true;
  return tracking.events.length > 0 && tracking.status === "in_transit";
}

export function clearTrackingCache(): void {
  TRACKING_CACHE.clear();
}
