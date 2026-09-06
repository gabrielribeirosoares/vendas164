import { parseCurrency, normalizeModelName, parseCSVText } from "../src/lib/importSpreadsheet";

interface TestCaseResult {
  name: string;
  passed: boolean;
  details?: string;
}

const results: TestCaseResult[] = [];

function assert(condition: boolean, testName: string, failureDetails?: string) {
  if (condition) {
    results.push({ name: testName, passed: true });
  } else {
    results.push({ name: testName, passed: false, details: failureDetails });
  }
}

console.log("=================================================");
console.log("🧪 INICIANDO TESTES DO PARSER DE PLANILHAS (CSV)");
console.log("=================================================\n");

// --- TESTES DE parseCurrency ---
console.log("🔹 1. Testando parseCurrency (Moedas e Formatos)");
assert(parseCurrency("189,90") === 189.9, "parseCurrency: 189,90 -> 189.9");
assert(parseCurrency("R$ 189,90") === 189.9, "parseCurrency: R$ 189,90 -> 189.9");
assert(parseCurrency("R$ 1.250,50") === 1250.5, "parseCurrency: R$ 1.250,50 (milhar BR) -> 1250.5");
assert(parseCurrency("1250.50") === 1250.5, "parseCurrency: 1250.50 (ponto decimal US) -> 1250.5");
assert(parseCurrency("1,250.50") === 1250.5, "parseCurrency: 1,250.50 (milhar US) -> 1250.5");
assert(parseCurrency(250) === 250, "parseCurrency: número direto 250 -> 250");
assert(parseCurrency("") === 0, "parseCurrency: vazio -> 0");
assert(parseCurrency("0") === 0, "parseCurrency: '0' -> 0");
assert(parseCurrency("gratis") === 0, "parseCurrency: texto não numérico -> 0");

// --- TESTES DE normalizeModelName ---
console.log("🔹 2. Testando normalizeModelName (Normalização de Nomes)");
assert(normalizeModelName("Nissan Skyline GT-R R34") === "nissanskylinegtrr34", "normalizeModelName básico");
assert(normalizeModelName("São Paulo Édition") === "saopauloedition", "normalizeModelName remove acentos");
assert(normalizeModelName("Mini-GT #123 (Chase!)") === "minigt123chase", "normalizeModelName remove pontuações e símbolos");

// --- TESTES DE parseCSVText com diferentes formatos e delimitadores ---
console.log("🔹 3. Testando parseCSVText (Delimitadores e Variações)");

const mockExistingProducts = [
  { id: "prod-1", model: "Nissan Skyline GT-R R34", brand: "Kaido House" },
  { id: "prod-2", model: "Porsche 911 GT3 RS", brand: "Mini GT" },
  { id: "prod-3", model: "Dodge Viper GTS-R", brand: "Tarmac Works" },
];

// Caso A: Padrão Ponto e Vírgula (;) padrão Brasil / Excel
const csvSemicolon = `Nome;Telefone;Email;Modelo;Marca;Valor Total;Sinal Pago;Status Pagamento;Status Entrega
Carlos Eduardo;(11) 98765-4321;carlos@email.com;Nissan Skyline GT-R R34;Kaido House;189,90;50,00;sinal_pago;pendente
Ana Paula;(21) 99887-6655;ana@email.com;Porsche 911 GT3 RS;Mini GT;149,00;149,00;quitado;entregue`;

const parsedA = parseCSVText(csvSemicolon, mockExistingProducts);
assert(parsedA.length === 2, "Caso A: leu 2 linhas");
assert(parsedA[0]?.clientName === "Carlos Eduardo", "Caso A (Linha 1): Nome correto");
assert(parsedA[0]?.totalPrice === 189.9, "Caso A (Linha 1): Preço total R$ 189,90");
assert(parsedA[0]?.downPayment === 50, "Caso A (Linha 1): Sinal R$ 50,00");
assert(parsedA[0]?.paymentStatus === "sinal_pago", "Caso A (Linha 1): Status pagamento 'sinal_pago'");
assert(parsedA[0]?.deliveryStatus === "pendente", "Caso A (Linha 1): Status entrega 'pendente'");
assert(parsedA[0]?.productId === "prod-1", "Caso A (Linha 1): Vinculou produto existente prod-1");
assert(parsedA[0]?.isValid === true, "Caso A (Linha 1): Linha válida");

assert(parsedA[1]?.clientName === "Ana Paula", "Caso A (Linha 2): Nome correto");
assert(parsedA[1]?.paymentStatus === "quitado", "Caso A (Linha 2): Status quitado");
assert(parsedA[1]?.deliveryStatus === "entregue", "Caso A (Linha 2): Status entregue");
assert(parsedA[1]?.productId === "prod-2", "Caso A (Linha 2): Vinculou produto existente prod-2");

// Caso B: Padrão Vírgula (,) padrão internacional / Google Sheets export
const csvComma = `Name,WhatsApp,E-mail,Produto,Fabricante,Preço,Entrada,Status Pagamento,Status Envio
Roberto Dias,11911112222,roberto@gmail.com,Dodge Viper,Tarmac,220.00,0,sem sinal,a caminho`;

const parsedB = parseCSVText(csvComma, mockExistingProducts);
assert(parsedB.length === 1, "Caso B: Delimitador por vírgula lido com sucesso");
assert(parsedB[0]?.clientName === "Roberto Dias", "Caso B: Nome capturado por alias 'Name'");
assert(parsedB[0]?.clientPhone === "11911112222", "Caso B: Telefone capturado por alias 'WhatsApp'");
assert(parsedB[0]?.totalPrice === 220, "Caso B: Preço lido por alias 'Preço'");
assert(parsedB[0]?.paymentStatus === "sem_sinal", "Caso B: Status mapeado para 'sem_sinal'");
assert(parsedB[0]?.deliveryStatus === "em_transito", "Caso B: Status 'a caminho' mapeado para 'em_transito'");
assert(parsedB[0]?.productId === "prod-3", "Caso B: Vinculou por inclusão 'Dodge Viper' -> prod-3");

// Caso C: Arquivo com aspas e quebras de linha Windows CRLF (\r\n)
const csvQuotesAndCRLF = "Nome;Telefone;Modelo;Valor Total\r\n\"José da Silva Sauro\";\"(19) 97777-1234\";\"Ferrari F40\";\"R$ 350,00\"\r\n";
const parsedC = parseCSVText(csvQuotesAndCRLF, mockExistingProducts);
assert(parsedC.length === 1, "Caso C: Leu linha com aspas e CRLF");
assert(parsedC[0]?.clientName === "José da Silva Sauro", "Caso C: Aspas removidas do nome");
assert(parsedC[0]?.clientPhone === "(19) 97777-1234", "Caso C: Aspas removidas do telefone");
assert(parsedC[0]?.productModel === "Ferrari F40", "Caso C: Modelo extraído");
assert(parsedC[0]?.totalPrice === 350, "Caso C: Preço R$ 350,00 tratado com aspas");
assert(parsedC[0]?.productId === undefined, "Caso C: Produto novo não existente retorna undefined para ser criado");

// Caso D: Validação e detecção de erros em linhas inválidas
console.log("🔹 4. Testando Validações e Erros");
const csvInvalidRows = `Nome;Telefone;Modelo;Valor Total
;11999998888;Nissan GT-R;150.00
Marcos Souza;;Nissan GT-R;150.00
Fernando Costa;11988887777;;150.00`;

const parsedD = parseCSVText(csvInvalidRows, []);
assert(parsedD.length === 3, "Caso D: Leu 3 linhas com inconsistências");
assert(parsedD[0]?.isValid === false && parsedD[0]?.errorReason?.includes("Nome"), "Caso D (1): Rejeitou nome vazio");
assert(parsedD[1]?.isValid === false && parsedD[1]?.errorReason?.includes("Telefone"), "Caso D (2): Rejeitou telefone vazio");
assert(parsedD[2]?.isValid === false && parsedD[2]?.errorReason?.includes("Modelo"), "Caso D (3): Rejeitou modelo vazio");

// Caso E: Inferência de status por valores
console.log("🔹 5. Testando Inferência Inteligente de Status");
const csvInference = `Nome;Telefone;Modelo;Valor Total;Sinal Pago
Cliente 1;11999991111;Carro A;100;100
Cliente 2;11999992222;Carro B;100;30
Cliente 3;11999993333;Carro C;100;0`;

const parsedE = parseCSVText(csvInference, []);
assert(parsedE[0]?.paymentStatus === "quitado", "Caso E (1): Sinal == Valor Total infere quitado");
assert(parsedE[1]?.paymentStatus === "sinal_pago", "Caso E (2): Sinal > 0 infere sinal_pago");
assert(parsedE[2]?.paymentStatus === "aguardando_sinal", "Caso E (3): Sem sinal infere aguardando_sinal");

// --- RESUMO FINAL ---
console.log("\n=================================================");
console.log("📊 RESULTADO DOS TESTES");
console.log("=================================================");
const totalTests = results.length;
const passedTests = results.filter((r) => r.passed).length;
const failedTests = results.filter((r) => !r.passed);

results.forEach((r) => {
  if (r.passed) {
    console.log(`  ✅ PASSOU: ${r.name}`);
  } else {
    console.log(`  ❌ FALHOU: ${r.name} - ${r.details}`);
  }
});

console.log(`\nTotal: ${totalTests} | Sucessos: ${passedTests} | Falhas: ${failedTests.length}`);

if (failedTests.length === 0) {
  console.log("\n🎉 TODOS OS TESTES PASSARAM COM SUCESSO! O parser está pronto e resiliente.");
} else {
  console.log("\n⚠️ ALGUNS TESTES FALHARAM. Verifique as correções necessárias acima.");
  process.exit(1);
}
