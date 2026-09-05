import { supabase } from "@/integrations/supabase/client";

export interface ParsedSpreadsheetRow {
  rowIndex: number;
  clientName: string;
  clientPhone: string;
  clientEmail?: string;
  productModel: string;
  productBrand?: string;
  totalPrice: number;
  downPayment: number;
  paymentStatus: string;
  deliveryStatus: string;
  productId?: string;
  isValid: boolean;
  errorReason?: string;
}

/**
 * Baixa um modelo CSV pré-formatado para o usuário preencher
 */
export function downloadCSVTemplate() {
  const headers = [
    "Nome",
    "Telefone",
    "Email",
    "Modelo",
    "Marca",
    "Valor Total",
    "Sinal Pago",
    "Status Pagamento",
    "Status Entrega",
  ];

  const sampleRows = [
    [
      "João da Silva",
      "(11) 99999-8888",
      "joao@email.com",
      "Nissan Skyline GT-R R34",
      "Kaido House",
      "189.90",
      "50.00",
      "sinal_pago",
      "pendente",
    ],
    [
      "Maria Souza",
      "(21) 98888-7777",
      "maria@email.com",
      "Porsche 911 GT3 RS",
      "Mini GT",
      "149.00",
      "0",
      "aguardando_sinal",
      "pendente",
    ],
  ];

  const csvContent =
    "\uFEFF" +
    [headers.join(";"), ...sampleRows.map((r) => r.join(";"))].join("\n");

  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute("download", "modelo_importacao_cadastros_reservas.csv");
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

export function parseCurrency(val: string | number): number {
  if (typeof val === "number") return isNaN(val) ? 0 : val;
  if (!val) return 0;

  let str = String(val).replace("R$", "").trim();
  if (!str) return 0;

  // Se contiver tanto ponto quanto vírgula (ex: 1.234,56 ou 1,234.56)
  if (str.includes(".") && str.includes(",")) {
    const lastDot = str.lastIndexOf(".");
    const lastComma = str.lastIndexOf(",");
    if (lastComma > lastDot) {
      // Formato PT-BR: 1.234,56 -> remove pontos de milhar, substitui vírgula decimal por ponto
      str = str.replace(/\./g, "").replace(",", ".");
    } else {
      // Formato US: 1,234.56 -> remove vírgulas de milhar
      str = str.replace(/,/g, "");
    }
  } else if (str.includes(",")) {
    // Apenas vírgula (ex: 189,90) -> substitui por ponto decimal
    str = str.replace(",", ".");
  }

  const parsed = parseFloat(str);
  return isNaN(parsed) ? 0 : parsed;
}

/**
 * Converte texto CSV em objetos para pré-visualização
 */
export function parseCSVText(
  csvText: string,
  existingProducts: Array<{ id: string; model: string; brand: string }>
): ParsedSpreadsheetRow[] {
  // Trata quebras de linha Windows e Unix
  const lines = csvText.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length > 0);
  if (lines.length <= 1) return [];

  // Detecta delimitador (; ou ,)
  const headerLine = lines[0];
  const delimiter = headerLine.includes(";") ? ";" : ",";

  const headers = headerLine
    .split(delimiter)
    .map((h) => h.replace(/^["']|["']$/g, "").trim().toLowerCase());

  const getColIndex = (names: string[]) =>
    headers.findIndex((h) => names.some((n) => h.includes(n)));

  const idxName = getColIndex(["nome", "name", "cliente"]);
  const idxPhone = getColIndex(["telefone", "phone", "whatsapp", "celular", "tel"]);
  const idxEmail = getColIndex(["email", "e-mail", "mail"]);
  const idxModel = getColIndex(["modelo", "model", "produto", "miniatura"]);
  const idxBrand = getColIndex(["marca", "brand", "fabricante"]);
  const idxTotalPrice = getColIndex(["valor total", "valor", "preco", "preço", "total"]);
  const idxDownPayment = getColIndex(["sinal pago", "sinal", "entrada"]);
  const idxPayStatus = getColIndex(["status pagamento", "pagamento", "payment"]);
  const idxDelivStatus = getColIndex(["status entrega", "status envio", "entrega", "envio", "delivery"]);

  const result: ParsedSpreadsheetRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    const rawLine = lines[i];
    if (!rawLine) continue;

    // Split respeitando aspas simples/duplas
    const cols = rawLine
      .split(new RegExp(`${delimiter}(?=(?:(?:[^"]*"){2})*[^"]*$)`))
      .map((c) => c.replace(/^["']|["']$/g, "").trim());

    const clientName = idxName >= 0 ? cols[idxName] || "" : "";
    const clientPhone = idxPhone >= 0 ? cols[idxPhone] || "" : "";
    const clientEmail = idxEmail >= 0 ? cols[idxEmail] || "" : "";
    const productModel = idxModel >= 0 ? cols[idxModel] || "" : "";
    const productBrand = idxBrand >= 0 ? cols[idxBrand] || "" : "";
    
    const rawPrice = idxTotalPrice >= 0 ? cols[idxTotalPrice] || "0" : "0";
    const rawSignal = idxDownPayment >= 0 ? cols[idxDownPayment] || "0" : "0";

    const totalPrice = parseCurrency(rawPrice);
    const downPayment = parseCurrency(rawSignal);

    let paymentStatus = (idxPayStatus >= 0 ? cols[idxPayStatus] || "" : "").toLowerCase().trim();
    if (!["aguardando_sinal", "sinal_pago", "quitado", "pronta_entrega", "sem_sinal", "cancelado"].includes(paymentStatus)) {
      if (paymentStatus.includes("sinal") || paymentStatus.includes("pago") || downPayment > 0) {
        paymentStatus = downPayment >= totalPrice ? "quitado" : "sinal_pago";
      } else if (paymentStatus.includes("quit") || paymentStatus.includes("total")) {
        paymentStatus = "quitado";
      } else {
        paymentStatus = "aguardando_sinal";
      }
    }

    let deliveryStatus = (idxDelivStatus >= 0 ? cols[idxDelivStatus] || "" : "").toLowerCase().trim();
    if (!["pendente", "aguardando_chegada", "disponivel", "em_transito", "enviado", "entregue", "cancelado"].includes(deliveryStatus)) {
      if (deliveryStatus.includes("pend") || deliveryStatus.includes("aguarda")) {
        deliveryStatus = "pendente";
      } else if (deliveryStatus.includes("envia") || deliveryStatus.includes("transito") || deliveryStatus.includes("caminho")) {
        deliveryStatus = "em_transito";
      } else if (deliveryStatus.includes("entrega") || deliveryStatus.includes("recebid")) {
        deliveryStatus = "entregue";
      } else if (deliveryStatus.includes("dispon") || deliveryStatus.includes("chegou")) {
        deliveryStatus = "disponivel";
      } else {
        deliveryStatus = "pendente";
      }
    }

    // Tentar vincular produto existente na loja por modelo/marca
    let matchedProductId: string | undefined = undefined;
    if (productModel) {
      const normalizedModel = productModel.toLowerCase().replace(/\s+/g, "");
      const matched = existingProducts.find((p) => {
        const pModelNorm = p.model.toLowerCase().replace(/\s+/g, "");
        return pModelNorm.includes(normalizedModel) || normalizedModel.includes(pModelNorm);
      });
      if (matched) matchedProductId = matched.id;
    }

    let isValid = true;
    let errorReason = "";

    if (!clientName) {
      isValid = false;
      errorReason = "Nome do cliente em branco";
    } else if (!clientPhone) {
      isValid = false;
      errorReason = "Telefone em branco";
    } else if (!productModel && !matchedProductId) {
      isValid = false;
      errorReason = "Modelo da miniatura não informado";
    }

    result.push({
      rowIndex: i + 1,
      clientName,
      clientPhone,
      clientEmail,
      productModel: productModel || "Miniatura",
      productBrand: productBrand || "Geral",
      totalPrice,
      downPayment,
      paymentStatus,
      deliveryStatus,
      productId: matchedProductId,
      isValid,
      errorReason,
    });
  }

  return result;
}

/**
 * Importa as linhas validadas no banco Supabase
 */
export async function processSpreadsheetImport({
  storeId,
  rows,
  onProgress,
}: {
  storeId: string;
  rows: ParsedSpreadsheetRow[];
  onProgress: (current: number, total: number) => void;
}) {
  const { data: authData } = await supabase.auth.getUser();
  const currentSellerId = authData?.user?.id;

  if (!currentSellerId) {
    throw new Error("Sessão de vendedor não encontrada. Por favor, faça login novamente.");
  }

  const validRows = rows.filter((r) => r.isValid);
  let successCount = 0;
  let errorCount = 0;
  const errors: string[] = [];

  for (let i = 0; i < validRows.length; i++) {
    const row = validRows[i];
    onProgress(i + 1, validRows.length);

    try {
      // 1. Tratar telefone
      const cleanPhoneDigits = row.clientPhone.replace(/\D/g, "");
      let formattedPhone = row.clientPhone.trim();
      if (!formattedPhone.startsWith("+") && cleanPhoneDigits.length >= 10) {
        formattedPhone = cleanPhoneDigits.startsWith("55") ? `+${cleanPhoneDigits}` : `+55${cleanPhoneDigits}`;
      }

      // 2. Buscar ou vincular perfil do cliente
      let effectiveUserId = currentSellerId;
      let isGuest = true;

      // Buscar por telefone no banco de perfis registrados em auth.users
      const { data: foundProfile } = await supabase
        .from("profiles")
        .select("id")
        .or(`phone.eq.${formattedPhone},phone.eq.${cleanPhoneDigits}`)
        .maybeSingle();

      if (foundProfile) {
        effectiveUserId = foundProfile.id;
        isGuest = false;
        if (row.clientEmail) {
          await supabase.from("profiles").update({ email: row.clientEmail }).eq("id", effectiveUserId);
        }
      }

      // 3. Vincular cliente à loja se tiver id de usuário registrado
      if (!isGuest && effectiveUserId) {
        try {
          await supabase
            .from("customer_store_link")
            .upsert({ user_id: effectiveUserId, store_id: storeId }, { onConflict: "user_id,store_id" });
        } catch {}
      }

      // 4. Tratar Produto (Usar existente ou Criar Produto em estoque para a reserva)
      let productId = row.productId;
      if (!productId) {
        const { data: newProd, error: prodErr } = await supabase
          .from("products")
          .insert({
            store_id: storeId,
            model: row.productModel,
            brand: row.productBrand || "Importado",
            price: row.totalPrice,
            stock: 1,
            is_open: true,
            scale: "1:64",
          })
          .select("id")
          .single();

        if (!prodErr && newProd) {
          productId = newProd.id;
        } else {
          const { data: fallbackProd } = await supabase
            .from("products")
            .select("id")
            .eq("store_id", storeId)
            .limit(1)
            .maybeSingle();

          if (fallbackProd) {
            productId = fallbackProd.id;
          }
        }
      }

      if (!productId) {
        errorCount++;
        errors.push(`Linha ${row.rowIndex}: Não foi possível associar miniatura/produto`);
        continue;
      }

      // 5. Se for cliente convidado (não registrado), salvar os dados em pix_key no padrão GUEST
      const pixKeyPayload = isGuest
        ? `GUEST:${JSON.stringify({ name: row.clientName, phone: formattedPhone, email: row.clientEmail || null })}`
        : null;

      // 6. Criar Pedido / Reserva no Supabase
      const { error: orderErr } = await supabase.from("orders").insert({
        store_id: storeId,
        user_id: effectiveUserId,
        product_id: productId,
        total_price: row.totalPrice,
        down_payment: row.downPayment,
        payment_status: row.paymentStatus,
        delivery_status: row.deliveryStatus,
        pix_key: pixKeyPayload,
      });

      if (orderErr) {
        errorCount++;
        errors.push(`Linha ${row.rowIndex}: Erro ao criar reserva - ${orderErr.message}`);
      } else {
        successCount++;
      }
    } catch (err: any) {
      errorCount++;
      errors.push(`Linha ${row.rowIndex}: ${err?.message || "Erro inesperado"}`);
    }
  }

  return {
    successCount,
    errorCount,
    errors,
  };
}
