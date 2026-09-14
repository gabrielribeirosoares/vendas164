import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const header = await readFile(new URL("../src/components/AppHeader.tsx", import.meta.url), "utf8");

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
  assert.match(header, /tab: "admin_moderation"/);
  assert.match(header, /aria-current=/);
  assert.match(header, /activeSellerTab === "reservas"/);
});
