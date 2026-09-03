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

// Credenciais e tokens gerenciados no backend para as lojas integradas
const STORE_ACCOUNTS: Record<
  string,
  { clientId: string; clientSecret: string; accessToken: string; refreshToken?: string }
> = {
  gabriel: {
    clientId: "a9edee22552004de6910069d7b6de18064bd313a",
    clientSecret: "aa8fcc07a56cfec1df445900ff89649db8b0c52eba1b38e49625d7b739cd",
    accessToken: "eyJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiJ9.eyJpZCI6ImJmMWE5YjRmNGYxZWQ3NzJlMDFkZGM4YjU3ZWQxMDhmMWUxMjdhYjQiLCJqdGkiOiJiZjFhOWI0ZjRmMWVkNzcyZTAxZGRjOGI1N2VkMTA4ZjFlMTI3YWI0IiwiaXNzIjpudWxsLCJhdWQiOiJhOWVkZWUyMjU1MjAwNGRlNjkxMDA2OWQ3YjZkZTE4MDY0YmQzMTNhIiwic3ViIjoiMTQ3ODUwMjY4MDQiLCJleHAiOjE3ODg0MjA1NzEsImlhdCI6MTc4ODM5ODk3MSwidG9rZW5fdHlwZSI6ImJlYXJlciIsInNjb3BlIjpudWxsLCJwZXJtIjoiMmU4MGEzMzg0ZTNlMDAwMDEwMDAwMGUxIiwiZ3JhbnRUeXBlcyI6ImF1dGhvcml6YXRpb25fY29kZSByZWZyZXNoX3Rva2VuIiwiYXBwX2lkIjoiMzk1MjY0IiwiY29tcGFueV9pZCI6MTQ5MTgxOTI3NjUsInJvbGUiOiJhZG0iLCJwbGFuX25hbWUiOiJQbGFub1RpdGFuaW9UaWVyMSIsImFwcHJvdmVkIjpmYWxzZX0.nFp83hCYcCXH5JSkc4RbYn69OJ1BWcrbMmuvOOEZjkXr5-wu3ll3RZAL75pdf-Nfdq7AOfLSV-hwXQaZKxJkdmFuRoNDbbwLfOY0PVzNBAnUlYGx3TKa89uu6_Xvh6r5k68xj5s4viEi737TKbS74UNtRwlkRMf4h0HEW2ZberlMEL--Vwma-EzPtrzsQgeBW4RzleGxl_-fR_3K2c33s8pFrJZF-yy06HbUGxXaItYJss1kSU7lYgBVmMtUTkCYFQXtbFPf4U3N6My_8bSl4X_6jdd6YpI1E-sLVOq-tEZTS1sZk5I54G0j9UueSgWMOmIl_DMtc4MC2uOBx28L8g",
    refreshToken: "e46824420f854fe643142189c715d8cf454b5870",
  },
  mf: {
    clientId: "fc7160470be3728be6287c8f6e04d8f8c8718275",
    clientSecret: "01bce5db8c136fb793d844dcc8869ec0ed7b69e652c3adf2411cf200772b",
    accessToken: "eyJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiJ9.eyJpZCI6IjY4MjRhNWU3NTVlY2JjOWEzOTYyODJmMGM0NDc0MjgxOTExZGVhMzYiLCJqdGkiOiI2ODI0YTVlNzU1ZWNiYzlhMzk2MjgyZjBjNDQ3NDI4MTkxMWRlYTM2IiwiaXNzIjpudWxsLCJhdWQiOiJmYzcxNjA0NzBiZTM3MjhiZTYyODdjOGY2ZTA0ZDhmOGM4NzE4Mjc1Iiwic3ViIjoiMTQ5OTcwOTA1NTAiLCJleHAiOjE3ODg0MjI1NjAsImlhdCI6MTc4ODQwMDk2MCwidG9rZW5fdHlwZSI6ImJlYXJlciIsInNjb3BlIjpudWxsLCJwZXJtIjoiMDAwMDAwMDAwMDAwMDAwMDEwMDAwMGUxIiwiZ3JhbnRUeXBlcyI6ImF1dGhvcml6YXRpb25fY29kZSByZWZyZXNoX3Rva2VuIiwiYXBwX2lkIjoiMzk1MjY5IiwiY29tcGFueV9pZCI6MTQ5MTgxOTI3NjUsInJvbGUiOiJhZG0iLCJwbGFuX25hbWUiOiJQbGFub1RpdGFuaW9UaWVyMSIsImFwcHJvdmVkIjpmYWxzZX0.T-94m5V-s_wR0tH_z_mI2e-Xl-7kYVd5Kx8L5qKkY0M-Xy7Q9g_u8I6L6kL3l7K9j9O8p6M8L4kL3l7K9j9O8p6M8L4kL3l7K9j9O8p6M8L4kL3l7K9j9O8p6M8L4kL3l7K9j9O8p",
    refreshToken: "59846b0a1d95ec70d38a531b744ea9e79435b6da",
  },
};

export const fetchBlingProductsServer = createServerFn({ method: "POST" })
  .validator((d: { storeKey?: string; accessToken?: string; limit?: number }) => d)
  .handler(async ({ data }) => {
    let token = data.accessToken;

    if (!token && data.storeKey) {
      const key = data.storeKey.toLowerCase().includes("mf") ? "mf" : "gabriel";
      token = STORE_ACCOUNTS[key]?.accessToken;
    }

    if (!token) {
      // Fallback para Gabriel se não informado
      token = STORE_ACCOUNTS.gabriel.accessToken;
    }

    const res = await fetch(`https://api.bling.com.br/Api/v3/produtos?limite=${data.limit || 100}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      },
    });

    if (!res.ok) {
      const errorData = await res.json().catch(() => ({}));
      throw new Error(errorData?.error?.message || `Erro ${res.status} ao conectar na API do Bling`);
    }

    const json = await res.json();
    return (json?.data || []) as BlingProductItem[];
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
      throw new Error(errorData?.error?.message || errorData?.error_description || "Erro ao autenticar código no Bling");
    }

    return await res.json();
  });
