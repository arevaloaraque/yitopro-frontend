"use client";

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

const COUNTRIES = [
  { code: "CL", label: "Chile", currency: "CLP", zone: "America/Santiago" },
  { code: "AR", label: "Argentina", currency: "ARS", zone: "America/Argentina/Buenos_Aires" },
  { code: "MX", label: "Mexico", currency: "MXN", zone: "America/Mexico_City" },
  { code: "CO", label: "Colombia", currency: "COP", zone: "America/Bogota" },
  { code: "PE", label: "Peru", currency: "PEN", zone: "America/Lima" },
  { code: "ES", label: "Espana", currency: "EUR", zone: "Europe/Madrid" },
  { code: "US", label: "Estados Unidos", currency: "USD", zone: "America/New_York" },
];

const LANGUAGES = [
  { code: "es", label: "Espanol" },
  { code: "en", label: "English" },
  { code: "pt", label: "Portugues" },
];

export function Step1BusinessInfo() {
  const { data, updateBusinessInfo } = useOnboarding();

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
              currency: data.currency,
              language: data.language,
              timezone: data.timezone,
            })
          }
          placeholder="Ej: Mi Negocio"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="country">Pais</Label>
        <Select
          value={data.country}
          onValueChange={(v) => {
            const selected = v ?? data.country;
            const c = COUNTRIES.find((x) => x.code === selected);
            updateBusinessInfo({
              businessName: data.businessName,
              country: selected,
              currency: c?.currency ?? data.currency,
              language: data.language,
              timezone: c?.zone ?? data.timezone,
            });
          }}
        >
          <SelectTrigger id="country" className="w-full">
            <SelectValue placeholder="Selecciona un pais" />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {COUNTRIES.map((c) => (
                <SelectItem key={c.code} value={c.code}>
                  {c.label}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="currency">Moneda</Label>
          <Select
            value={data.currency}
            onValueChange={(v) =>
              updateBusinessInfo({
                businessName: data.businessName,
                country: data.country,
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
                <SelectItem value="CLP">CLP — Peso chileno</SelectItem>
                <SelectItem value="ARS">ARS — Peso argentino</SelectItem>
                <SelectItem value="MXN">MXN — Peso mexicano</SelectItem>
                <SelectItem value="COP">COP — Peso colombiano</SelectItem>
                <SelectItem value="PEN">PEN — Sol peruano</SelectItem>
                <SelectItem value="EUR">EUR — Euro</SelectItem>
                <SelectItem value="USD">USD — Dolar</SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="language">Idioma</Label>
          <Select
            value={data.language}
            onValueChange={(v) =>
              updateBusinessInfo({
                businessName: data.businessName,
                country: data.country,
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
