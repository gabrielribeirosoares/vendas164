import React, { useEffect, useState } from "react";
import { ChevronDown } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export interface Country {
  code: string;
  name: string;
  ddi: string;
  flag: string;
  placeholder: string;
}

export const COUNTRIES: Country[] = [
  { code: "BR", name: "Brasil", ddi: "55", flag: "🇧🇷", placeholder: "(11) 99999-9999" },
  { code: "US", name: "Estados Unidos / Canadá", ddi: "1", flag: "🇺🇸", placeholder: "(555) 000-0000" },
  { code: "PT", name: "Portugal", ddi: "351", flag: "🇵🇹", placeholder: "912 345 678" },
  { code: "AR", name: "Argentina", ddi: "54", flag: "🇦🇷", placeholder: "9 11 1234-5678" },
  { code: "ES", name: "Espanha", ddi: "34", flag: "🇪🇸", placeholder: "612 34 56 78" },
  { code: "MX", name: "México", ddi: "52", flag: "🇲🇽", placeholder: "55 1234 5678" },
  { code: "CL", name: "Chile", ddi: "56", flag: "🇨🇱", placeholder: "9 1234 5678" },
  { code: "UY", name: "Uruguai", ddi: "598", flag: "🇺🇾", placeholder: "99 123 456" },
  { code: "PY", name: "Paraguai", ddi: "595", flag: "🇵🇾", placeholder: "981 123456" },
  { code: "CO", name: "Colômbia", ddi: "57", flag: "🇨🇴", placeholder: "300 1234567" },
  { code: "PE", name: "Peru", ddi: "51", flag: "🇵🇪", placeholder: "912 345 678" },
  { code: "GB", name: "Reino Unido", ddi: "44", flag: "🇬🇧", placeholder: "7911 123456" },
  { code: "DE", name: "Alemanha", ddi: "49", flag: "🇩🇪", placeholder: "151 12345678" },
  { code: "IT", name: "Itália", ddi: "39", flag: "🇮🇹", placeholder: "312 3456789" },
  { code: "FR", name: "França", ddi: "33", flag: "🇫🇷", placeholder: "6 12 34 56 78" },
  { code: "JP", name: "Japão", ddi: "81", flag: "🇯🇵", placeholder: "90 1234 5678" },
];

export function formatBRPhone(v: string) {
  const digits = v.replace(/\D/g, "").slice(0, 11);
  if (digits.length <= 2) return digits ? `(${digits}` : "";
  if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  if (digits.length <= 10)
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
}

export function formatRawDigits(v: string, countryCode: string) {
  const digits = v.replace(/\D/g, "");
  if (countryCode === "BR") {
    return formatBRPhone(digits);
  }
  // Para outros países, aplica espaçamento genérico por grupo de 3-4 dígitos
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 3)} ${digits.slice(3)}`;
  if (digits.length <= 10) return `${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6)}`;
  return `${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6, 10)}`;
}

export function parsePhoneWithFlag(phoneRaw: string | null | undefined) {
  if (!phoneRaw) return null;
  const digits = phoneRaw.replace(/\D/g, "");
  if (!digits) return null;

  // Ordena os países por DDI decrescente para fazer match exato dos prefixos mais longos primeiro (ex: 351 antes de 3)
  const sorted = [...COUNTRIES].sort((a, b) => b.ddi.length - a.ddi.length);
  const matched = sorted.find((c) => digits.startsWith(c.ddi));

  if (matched) {
    const localDigits = digits.slice(matched.ddi.length);
    const formattedLocal = formatRawDigits(localDigits, matched.code);
    return {
      country: matched,
      flag: matched.flag,
      ddi: `+${matched.ddi}`,
      formattedLocal,
      display: `${matched.flag} +${matched.ddi} ${formattedLocal}`,
      fullDigits: digits,
    };
  }

  return {
    country: COUNTRIES[0],
    flag: "🌐",
    ddi: "+",
    formattedLocal: digits,
    display: `🌐 ${digits}`,
    fullDigits: digits,
  };
}

interface PhoneInputProps {
  value: string;
  onChange: (fullValue: string) => void;
  id?: string;
  required?: boolean;
}

export function PhoneInput({ value, onChange, id, required }: PhoneInputProps) {
  const [selectedCountry, setSelectedCountry] = useState<Country>(COUNTRIES[0]);
  const [localInput, setLocalInput] = useState("");

  // Ref para rastrear o último value externo processado (evita loops)
  const lastExternalValue = React.useRef(value);

  useEffect(() => {
    // Só atualizar se o value externo realmente mudou (veio do banco/prop)
    if (value === lastExternalValue.current && localInput) return;
    lastExternalValue.current = value;

    if (!value) {
      setLocalInput("");
      return;
    }
    const parsed = parsePhoneWithFlag(value);
    if (parsed && parsed.country) {
      setSelectedCountry(parsed.country);
      setLocalInput(parsed.formattedLocal);
    } else {
      setLocalInput(value.replace(/\D/g, ""));
    }
  }, [value]);

  function handleCountrySelect(country: Country) {
    setSelectedCountry(country);
    const digitsOnly = localInput.replace(/\D/g, "");
    const formatted = formatRawDigits(digitsOnly, country.code);
    setLocalInput(formatted);
    const full = digitsOnly ? `${country.ddi}${digitsOnly}` : "";
    onChange(full);
  }

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const raw = e.target.value;
    const digitsOnly = raw.replace(/\D/g, "");
    const formatted = formatRawDigits(digitsOnly, selectedCountry.code);
    setLocalInput(formatted);
    const full = digitsOnly ? `${selectedCountry.ddi}${digitsOnly}` : "";
    onChange(full);
  }

  return (
    <div className="flex items-center gap-1.5">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="flex h-10 items-center gap-1 rounded-md border border-input bg-background px-2.5 py-2 text-sm font-medium shadow-sm hover:bg-accent hover:text-accent-foreground focus:outline-none"
          >
            <span className="text-base leading-none">{selectedCountry.flag}</span>
            <span className="text-xs text-muted-foreground font-mono">+{selectedCountry.ddi}</span>
            <ChevronDown className="size-3.5 opacity-50" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="max-h-64 overflow-y-auto w-56">
          {COUNTRIES.map((country) => (
            <DropdownMenuItem
              key={country.code}
              className="cursor-pointer flex items-center justify-between py-2 text-sm"
              onClick={() => handleCountrySelect(country)}
            >
              <div className="flex items-center gap-2">
                <span className="text-base">{country.flag}</span>
                <span>{country.name}</span>
              </div>
              <span className="text-xs text-muted-foreground font-mono">+{country.ddi}</span>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      <Input
        id={id}
        type="tel"
        required={required}
        placeholder={selectedCountry.placeholder}
        value={localInput}
        onChange={handleInputChange}
        className="flex-1 font-mono"
      />
    </div>
  );
}
