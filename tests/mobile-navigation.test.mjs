import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const header = await readFile(new URL("../src/components/AppHeader.tsx", import.meta.url), "utf8");
const sellerRoute = await readFile(new URL("../src/routes/_authenticated/vendedor.tsx", import.meta.url), "utf8");
const sellerSectionHeader = await readFile(new URL("../src/components/vendedor/SellerSectionHeader.tsx", import.meta.url), "utf8");

test("mobile navigation covers the gap below the md breakpoint", () => {
  assert.match(header, /className="flex md:hidden"/);
  assert.match(header, /className="hidden md:flex items-center/);
});

test("mobile navigation uses controlled accessible sheet semantics", () => {
  assert.match(header, /<Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>/);
  assert.match(header, /<SheetTitle/);
  assert.match(header, /<SheetDescription/);
  assert.doesNotMatch(header, /new KeyboardEvent/);
});

test("seller navigation exposes and identifies the active destination", () => {
  assert.match(header, /getSellerNavigation/);
  assert.match(header, /aria-current=/);
  assert.match(header, /activeSellerTab === section\.id/);
});

test("mobile seller sections live in the hamburger menu, including payments", () => {
  assert.match(header, /search=\{\{ tab: section\.id \}\}/);
  assert.doesNotMatch(sellerRoute, /Navegação de Abas no Mobile/);
  assert.doesNotMatch(sellerRoute, /className="flex md:hidden items-center gap-1\.5 overflow-x-auto/);
});

test("store and operation breadcrumb is hidden with the mobile content", () => {
  assert.match(sellerSectionHeader, /className="mb-3 hidden flex-wrap items-center gap-2 text-xs text-muted-foreground md:flex"/);
});
