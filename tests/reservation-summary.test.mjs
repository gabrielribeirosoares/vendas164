import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";

const source = await readFile(new URL("../src/lib/reservationSummary.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext },
}).outputText;
const { summarizeReservation } = await import(
  `data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`
);
const order = {
  total_price: 100,
  down_payment: 0,
  signal_amount: 1,
  payment_status: "aguardando_sinal",
  delivery_status: "pendente",
  order_installments: [],
};

test("sinal pendente de R$ 1 não vira cobrança do total de R$ 100", () => {
  assert.deepEqual(summarizeReservation([order]), {
    total: 100,
    received: 0,
    balance: 100,
    dueNow: 1,
  });
});
test("parcelas pertencem a cada unidade e não são multiplicadas pelo grupo", () => {
  const rows = [
    {
      ...order,
      payment_status: "sinal_pago",
      down_payment: 10,
      order_installments: [
        { amount: 20, status: "paid" },
        { amount: 70, status: "pending" },
      ],
    },
    {
      ...order,
      payment_status: "sinal_pago",
      down_payment: 10,
      order_installments: [{ amount: 30, status: "paid" }],
    },
  ];
  assert.deepEqual(summarizeReservation(rows), {
    total: 200,
    received: 70,
    balance: 130,
    dueNow: 130,
  });
});
test("quitado não duplica valores mesmo com sinal e parcelas integrais registrados", () => {
  assert.deepEqual(
    summarizeReservation([
      {
        ...order,
        payment_status: "quitado",
        down_payment: 100,
        order_installments: [{ amount: 100, status: "paid" }],
      },
    ]),
    { total: 100, received: 100, balance: 0, dueNow: 0 },
  );
});
test("reserva cancelada não apresenta cobrança pendente", () => {
  assert.equal(summarizeReservation([{ ...order, payment_status: "cancelado" }]).dueNow, 0);
});
test("centavos e recebimento parcial do sinal são preservados", () => {
  assert.deepEqual(
    summarizeReservation([
      {
        ...order,
        total_price: 10.01,
        signal_amount: 1.01,
        order_installments: [{ amount: 0.5, status: "paid" }],
      },
    ]),
    { total: 10.01, received: 0.5, balance: 9.51, dueNow: 0.51 },
  );
});
