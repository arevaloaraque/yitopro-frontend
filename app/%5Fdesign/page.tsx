"use client";

import { Bell, Bot, PawPrint, Plus, Sparkles } from "lucide-react";
import { toast } from "sonner";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { EmptyState, ErrorState, Loading } from "@/components/states";

/* ---------------------------------------------------------------- helpers */

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold tracking-tight text-foreground">
          {title}
        </h2>
        {description ? (
          <p className="text-sm text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {children}
    </section>
  );
}

/** Swatches: el valor real vive solo en globals.css; aquí solo tokens. */
const SWATCHES: { token: string; className: string; use: string }[] = [
  { token: "primary", className: "bg-primary", use: "Marca · botones · nav activa" },
  { token: "accent", className: "bg-accent", use: "IA trabajando · activos · alertas" },
  { token: "foreground", className: "bg-foreground", use: "Texto principal (navy)" },
  { token: "secondary", className: "bg-secondary", use: "Superficies sutiles" },
  { token: "muted", className: "bg-muted", use: "Fondos apagados" },
  { token: "success", className: "bg-success", use: "Confirmaciones" },
  { token: "warning", className: "bg-warning", use: "Avisos / pendientes" },
  { token: "destructive", className: "bg-destructive", use: "Errores / destructivo" },
];

const APPOINTMENTS: {
  pet: string;
  service: string;
  status: { label: string; className: string };
}[] = [
  {
    pet: "Luna",
    service: "Baño + Corte",
    status: { label: "Confirmada", className: "bg-success text-success-foreground" },
  },
  {
    pet: "Rocky",
    service: "Corte",
    status: { label: "Pendiente", className: "bg-warning text-warning-foreground" },
  },
  {
    pet: "Maya",
    service: "Baño",
    status: { label: "IA respondiendo", className: "bg-accent text-accent-foreground" },
  },
  {
    pet: "Thor",
    service: "Baño + Corte",
    status: {
      label: "Cancelada",
      className: "bg-destructive text-destructive-foreground",
    },
  },
];

/* ------------------------------------------------------------------- page */

export default function DesignGalleryPage() {
  return (
    <main className="mx-auto w-full max-w-5xl space-y-12 px-6 py-12">
      {/* Header */}
      <header className="space-y-2">
        <div className="flex items-center gap-2">
          <span className="inline-flex size-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Sparkles className="size-5" />
          </span>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            Yitopro · Design System
          </h1>
        </div>
        <p className="text-sm text-muted-foreground">
          Referencia visual de la fundación de diseño (Checkpoint 1). Todo usa tokens de
          marca — sin hex literales en componentes.
        </p>
      </header>

      {/* Paleta */}
      <Section
        title="Paleta de marca"
        description="Tokens semánticos. Cambiar --primary en globals.css repinta toda esta página."
      >
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {SWATCHES.map((s) => (
            <div
              key={s.token}
              className="overflow-hidden rounded-xl border border-border bg-card shadow-xs"
            >
              <div className={`h-16 w-full ${s.className}`} />
              <div className="space-y-0.5 p-3">
                <p className="font-mono text-xs font-medium text-foreground">
                  {s.token}
                </p>
                <p className="text-xs text-muted-foreground">{s.use}</p>
              </div>
            </div>
          ))}
        </div>
      </Section>

      {/* Tipografía */}
      <Section title="Tipografía" description="Familia Inter, modo claro primero.">
        <Card>
          <CardContent className="space-y-2 pt-6">
            <p className="text-3xl font-bold tracking-tight text-foreground">
              Display · 30px bold
            </p>
            <p className="text-xl font-semibold text-foreground">
              Título · 20px semibold
            </p>
            <p className="text-base text-foreground">
              Cuerpo · 16px regular — atiende a tus clientes por WhatsApp con agentes de
              IA.
            </p>
            <p className="text-sm text-muted-foreground">
              Secundario · 14px muted-foreground
            </p>
            <p className="font-mono text-xs text-muted-foreground">
              Mono · 12px — +56 9 1234 5678
            </p>
          </CardContent>
        </Card>
      </Section>

      {/* Botones */}
      <Section title="Botones" description="Variantes y tamaños.">
        <div className="flex flex-wrap items-center gap-3">
          <Button>Primario</Button>
          <Button variant="secondary">Secundario</Button>
          <Button variant="outline">Outline</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="destructive">Destructivo</Button>
          <Button variant="link">Link</Button>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button size="sm">Small</Button>
          <Button>Default</Button>
          <Button size="lg">Large</Button>
          <Button size="icon" aria-label="Agregar">
            <Plus />
          </Button>
          <Button
            className="bg-accent text-accent-foreground hover:bg-accent/90"
            aria-label="IA"
          >
            <Bot /> IA trabajando
          </Button>
        </div>
        <Button onClick={() => toast.success("Cita confirmada para Luna 🐶")}>
          <Bell /> Disparar toast
        </Button>
      </Section>

      {/* Inputs */}
      <Section title="Formularios" description="Inputs, select y textarea.">
        <div className="grid gap-5 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="pet">Nombre de la mascota</Label>
            <Input id="pet" placeholder="Luna" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="service">Servicio</Label>
            <Select>
              <SelectTrigger id="service">
                <SelectValue placeholder="Selecciona un servicio" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="bano">Baño</SelectItem>
                <SelectItem value="corte">Corte</SelectItem>
                <SelectItem value="bano-corte">Baño + Corte</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="notes">Notas del veterinario</Label>
            <Textarea
              id="notes"
              placeholder="Piel sensible, usar shampoo hipoalergénico…"
            />
          </div>
        </div>
      </Section>

      {/* Badges */}
      <Section title="Badges" description="Estados y etiquetas.">
        <div className="flex flex-wrap items-center gap-2">
          <Badge>Default</Badge>
          <Badge variant="secondary">Secundario</Badge>
          <Badge variant="outline">Outline</Badge>
          <Badge variant="destructive">Destructivo</Badge>
          <Badge className="bg-accent text-accent-foreground">
            <Bot /> IA
          </Badge>
          <Badge className="bg-success text-success-foreground">Confirmada</Badge>
          <Badge className="bg-warning text-warning-foreground">Pendiente</Badge>
        </div>
      </Section>

      {/* Cards */}
      <Section title="Cards" description="Superficies con borde sutil y sombra suave.">
        <div className="grid gap-4 sm:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>PET Spa</CardTitle>
              <CardDescription>Peluquería &amp; veterinaria canina</CardDescription>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              42 conversaciones activas hoy · 8 citas agendadas.
            </CardContent>
            <CardFooter className="gap-2">
              <Button size="sm">Ver panel</Button>
              <Button size="sm" variant="outline">
                Ajustes
              </Button>
            </CardFooter>
          </Card>
          <Card>
            <CardHeader className="flex-row items-center gap-3 space-y-0">
              <Avatar>
                <AvatarFallback>
                  <PawPrint className="size-4" />
                </AvatarFallback>
              </Avatar>
              <div>
                <CardTitle className="text-base">Cliente nuevo</CardTitle>
                <CardDescription>vía WhatsApp</CardDescription>
              </div>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              «Hola, quiero agendar un baño para mi perrita Luna 🐩»
            </CardContent>
          </Card>
        </div>
      </Section>

      {/* Tabla */}
      <Section title="Tabla" description="Ejemplo con datos del caso PET Spa.">
        <Card className="overflow-hidden p-0">
          <Table>
            <TableCaption className="pb-4">
              Citas recientes — caso de validación PET Spa.
            </TableCaption>
            <TableHeader>
              <TableRow>
                <TableHead>Mascota</TableHead>
                <TableHead>Servicio</TableHead>
                <TableHead className="text-right">Estado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {APPOINTMENTS.map((row) => (
                <TableRow key={row.pet}>
                  <TableCell className="font-medium">{row.pet}</TableCell>
                  <TableCell>{row.service}</TableCell>
                  <TableCell className="text-right">
                    <Badge className={row.status.className}>{row.status.label}</Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      </Section>

      {/* Estados */}
      <Section
        title="Estados reutilizables"
        description="Loading / Empty / Error — components/states/."
      >
        <Tabs defaultValue="loading">
          <TabsList>
            <TabsTrigger value="loading">Loading</TabsTrigger>
            <TabsTrigger value="empty">Empty</TabsTrigger>
            <TabsTrigger value="error">Error</TabsTrigger>
          </TabsList>
          <TabsContent value="loading" className="pt-4">
            <Card>
              <CardContent className="pt-6">
                <Loading rows={3} />
              </CardContent>
            </Card>
          </TabsContent>
          <TabsContent value="empty" className="pt-4">
            <EmptyState
              icon={PawPrint}
              title="Sin citas todavía"
              description="Cuando un cliente agende por WhatsApp, aparecerá aquí."
              action={
                <Button size="sm">
                  <Plus /> Nueva cita
                </Button>
              }
            />
          </TabsContent>
          <TabsContent value="error" className="pt-4">
            <ErrorState onRetry={() => toast("Reintentando…")} />
          </TabsContent>
        </Tabs>
      </Section>

      <Separator />
      <footer className="pb-4 text-center text-xs text-muted-foreground">
        Yitopro · F1-A — fundación de diseño
      </footer>
    </main>
  );
}
