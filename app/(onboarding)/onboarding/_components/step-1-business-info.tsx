"use client";

import { useState } from "react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useOnboarding } from "@/lib/onboarding";

// Mismos catálogos que Configuración (settings/page.tsx): incluye Venezuela
// (VE → VES), que faltaba en el onboarding (QA-CONFIG-NEGOCIO-01). Las monedas
// están dentro de los choices del backend:
// CLP, ARS, BOB, BRL, COP, MXN, PEN, PYG, USD, UYU, EUR, VES.
const COUNTRIES = [
  { code: "CL", label: "Chile", currency: "CLP", zone: "America/Santiago" },
  {
    code: "AR",
    label: "Argentina",
    currency: "ARS",
    zone: "America/Argentina/Buenos_Aires",
  },
  { code: "MX", label: "México", currency: "MXN", zone: "America/Mexico_City" },
  { code: "CO", label: "Colombia", currency: "COP", zone: "America/Bogota" },
  { code: "PE", label: "Perú", currency: "PEN", zone: "America/Lima" },
  { code: "VE", label: "Venezuela", currency: "VES", zone: "America/Caracas" },
  { code: "ES", label: "España", currency: "EUR", zone: "Europe/Madrid" },
  { code: "US", label: "Estados Unidos", currency: "USD", zone: "America/New_York" },
];

const CURRENCIES = [
  { code: "CLP", label: "CLP — Peso chileno" },
  { code: "ARS", label: "ARS — Peso argentino" },
  { code: "MXN", label: "MXN — Peso mexicano" },
  { code: "COP", label: "COP — Peso colombiano" },
  { code: "PEN", label: "PEN — Sol peruano" },
  { code: "VES", label: "VES — Bolívar venezolano" },
  { code: "EUR", label: "EUR — Euro" },
  { code: "USD", label: "USD — Dólar" },
];

const LANGUAGES = [
  { code: "es", label: "Espanol" },
  { code: "en", label: "English" },
  { code: "pt", label: "Portugues" },
];

export function Step1BusinessInfo() {
  const { data, updateBusinessInfo } = useOnboarding();
  // La moneda/zona horaria se autocompletan al elegir país; el aviso hace visible
  // ese cambio (antes se sobreescribían en silencio — QA-CONFIG-NEGOCIO-01).
  const [autofillHint, setAutofillHint] = useState(false);

  // Un valor previo fuera de catálogo se agrega como ítem {code, label} para que
  // el trigger siga mostrando algo y no se pierda al re-guardar.
  const countryItems =
    !data.country || COUNTRIES.some((c) => c.code === data.country)
      ? COUNTRIES
      : [...COUNTRIES, { code: data.country, label: data.country }];
  const currencyItems =
    !data.currency || CURRENCIES.some((c) => c.code === data.currency)
      ? CURRENCIES
      : [...CURRENCIES, { code: data.currency, label: data.currency }];

  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <Label htmlFor="businessName">Nombre del negocio</Label>
        <Input
          id="businessName"
          value={data.businessName}
          onChange={(e) =>
            updateBusinessInfo({
              businessName: e.target.value,
              country: data.country,
              address: data.address,
              currency: data.currency,
              language: data.language,
              timezone: data.timezone,
            })
          }
          placeholder="Ej: Mi Negocio"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="businessAddress">Dirección</Label>
        <Input
          id="businessAddress"
          value={data.address}
          onChange={(e) =>
            updateBusinessInfo({
              businessName: data.businessName,
              country: data.country,
              address: e.target.value,
              currency: data.currency,
              language: data.language,
              timezone: data.timezone,
            })
          }
          placeholder="Dirección de la tienda (opcional)"
        />
        <p className="text-[0.7rem] text-muted-foreground">
          El asistente la usa para responder «¿dónde están?». Puedes dejarla vacía y
          completarla luego.
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="country">Pais</Label>
        <Select
          items={countryItems.map((c) => ({ value: c.code, label: c.label }))}
          value={data.country}
          onValueChange={(v) => {
            const selected = v ?? data.country;
            const c = COUNTRIES.find((x) => x.code === selected);
            updateBusinessInfo({
              businessName: data.businessName,
              country: selected,
              address: data.address,
              currency: c?.currency ?? data.currency,
              language: data.language,
              timezone: c?.zone ?? data.timezone,
            });
            if (c) setAutofillHint(true);
          }}
        >
          <SelectTrigger id="country" className="w-full">
            <SelectValue placeholder="Selecciona un pais" />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {countryItems.map((c) => (
                <SelectItem key={c.code} value={c.code}>
                  {c.label}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
        {autofillHint && (
          <p role="status" className="text-[0.7rem] text-muted-foreground">
            Se actualizaron la moneda y la zona horaria según el país.
          </p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="currency">Moneda</Label>
          <Select
            items={currencyItems.map((c) => ({ value: c.code, label: c.label }))}
            value={data.currency}
            onValueChange={(v) =>
              updateBusinessInfo({
                businessName: data.businessName,
                country: data.country,
                address: data.address,
                currency: v ?? data.currency,
                language: data.language,
                timezone: data.timezone,
              })
            }
          >
            <SelectTrigger id="currency" className="w-full">
              <SelectValue placeholder="Moneda" />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {currencyItems.map((c) => (
                  <SelectItem key={c.code} value={c.code}>
                    {c.label}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="language">Idioma</Label>
          <Select
            items={LANGUAGES.map((l) => ({ value: l.code, label: l.label }))}
            value={data.language}
            onValueChange={(v) =>
              updateBusinessInfo({
                businessName: data.businessName,
                country: data.country,
                address: data.address,
                currency: data.currency,
                language: v ?? data.language,
                timezone: data.timezone,
              })
            }
          >
            <SelectTrigger id="language" className="w-full">
              <SelectValue placeholder="Idioma" />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {LANGUAGES.map((l) => (
                  <SelectItem key={l.code} value={l.code}>
                    {l.label}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="timezone">Zona horaria</Label>
        <Input
          id="timezone"
          value={data.timezone}
          onChange={(e) =>
            updateBusinessInfo({
              businessName: data.businessName,
              country: data.country,
              address: data.address,
              currency: data.currency,
              language: data.language,
              timezone: e.target.value,
            })
          }
          placeholder="America/Santiago"
        />
        <p className="text-[0.7rem] text-muted-foreground">
          Formato IANA (ej: America/Santiago, America/Bogota).
        </p>
      </div>
    </div>
  );
}
