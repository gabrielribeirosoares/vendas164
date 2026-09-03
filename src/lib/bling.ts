import { createServerFn } from "@tanstack/react-start";

export interface BlingProductItem {
  id: number;
  nome: string;
  codigo?: string;
  preco: number;
  estoque?: {
    saldoVirtualTotal?: number;
  };
  imagemURL?: string;
  descricaoCurta?: string;
}

export interface BlingTokenData {
  access_token: string;
  refresh_token: string;
  expires_in?: number;
}

export const fetchBlingProductsServer = createServerFn({ method: "POST" })
  .validator((d: {
    accessToken?: string;
    refreshToken?: string;
    clientId?: string;
    clientSecret?: string;
    limit?: number;
  }) => d)
  .handler(async ({ data }) => {
    let token = data.accessToken;

    if (!token && (!data.refreshToken || !data.clientId || !data.clientSecret)) {
      throw new Error("Credenciais do Bling ausentes. Conecte sua conta.");
    }

    // Tentar buscar produtos com o access_token atual
    if (token) {
      const res = await fetch(`https://api.bling.com.br/Api/v3/produtos?limite=${data.limit || 100}`, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
        },
      });

      if (res.ok) {
        const json = await res.json();
        return {
          products: (json?.data || []) as BlingProductItem[],
          newTokens: null,
        };
      }

      // Se não for erro 401 (Unauthorized), lançar o erro original
      if (res.status !== 401 && res.status !== 403) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData?.error?.message || `Erro ${res.status} ao conectar na API do Bling`);
      }
    }

    // Se chegou aqui ou o token expirou (401/403), tenta renovar via refresh_token
    if (data.refreshToken && data.clientId && data.clientSecret) {
      const authHeader = "Basic " + Buffer.from(data.clientId + ":" + data.clientSecret).toString("base64");
      const refreshRes = await fetch("https://www.bling.com.br/Api/v3/oauth/token", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Authorization: authHeader,
        },
        body: new URLSearchParams({
          grant_type: "refresh_token",
          refresh_token: data.refreshToken,
        }),
      });

      if (!refreshRes.ok) {
        const refreshErr = await refreshRes.json().catch(() => ({}));
        throw new Error(
          refreshErr?.error?.description || refreshErr?.error?.message || "Sessão do Bling expirada. Por favor, reconecte sua conta."
        );
      }

      const refreshed = (await refreshRes.json()) as BlingTokenData;
      token = refreshed.access_token;

      // Nova tentativa com o novo access_token renovado
      const retryRes = await fetch(`https://api.bling.com.br/Api/v3/produtos?limite=${data.limit || 100}`, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
        },
      });

      if (!retryRes.ok) {
        const errorData = await retryRes.json().catch(() => ({}));
        throw new Error(errorData?.error?.message || `Erro ${retryRes.status} no Bling após renovação`);
      }

      const retryJson = await retryRes.json();
      return {
        products: (retryJson?.data || []) as BlingProductItem[],
        newTokens: refreshed,
      };
    }

    throw new Error("Token do Bling expirado. Por favor, reconecte sua conta.");
  });

export const exchangeBlingCodeServer = createServerFn({ method: "POST" })
  .validator((d: { clientId: string; clientSecret: string; code: string }) => d)
  .handler(async ({ data }) => {
    const authHeader = "Basic " + Buffer.from(data.clientId + ":" + data.clientSecret).toString("base64");
    const res = await fetch("https://www.bling.com.br/Api/v3/oauth/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: authHeader,
      },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code: data.code,
      }),
    });

    if (!res.ok) {
      const errorData = await res.json().catch(() => ({}));
      throw new Error(errorData?.error?.description || errorData?.error?.message || "Código inválido ou expirado no Bling.");
    }

    return (await res.json()) as BlingTokenData;
  });
