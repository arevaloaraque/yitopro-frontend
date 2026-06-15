"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ChevronDown,
  ChevronUp,
  ClipboardList,
  MessageSquare,
  Plus,
  Users,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { EmptyState, ErrorState, Loading } from "@/components/states";
import {
  listCustomers,
  createCustomer,
} from "@/lib/api/customers";
import { listConversations } from "@/lib/api/conversations";
import type { Conversation, Customer } from "@/lib/types";

type PageState = "loading" | "error" | "ready";

function statusBadge(status: Conversation["status"]) {
  if (status === "ai_active")
    return { label: "IA activa", variant: "default" as const };
  if (status === "human_handoff")
    return { label: "Derivada", variant: "secondary" as const };
  return { label: "Cerrada", variant: "outline" as const };
}

function intentLabel(intent: string | null): string {
  if (!intent) return "—";
  const map: Record<string, string> = {
    agendar_cita: "Agendar cita",
    reagendar_cita: "Reagendar cita",
    consulta_precio: "Consulta precio",
    consulta_horario: "Consulta horario",
    reclamo: "Reclamo",
    comprar_producto: "Comprar producto",
  };
  return map[intent] ?? intent.replace(/_/g, " ");
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "ahora";
  if (mins < 60) return `hace ${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `hace ${hrs}h`;
  const days = Math.floor(hrs / 24);
  return `hace ${days}d`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("es-CL", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

interface FormData {
  name: string;
  phone: string;
}

const emptyForm: FormData = { name: "", phone: "" };

export default function CustomersPage() {
  const router = useRouter();
  const [state, setState] = useState<PageState>("loading");
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [conversationCounts, setConversationCounts] = useState<
    Record<string, number>
  >({});

  const detailReqRef = useRef(0);

  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<FormData>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setState("loading");
      setError(null);
      try {
        const [customerData, convData] = await Promise.all([
          listCustomers(),
          listConversations(),
        ]);
        if (!cancelled) {
          setCustomers(customerData);
          const counts: Record<string, number> = {};
          for (const c of convData) {
            counts[c.customer_id] = (counts[c.customer_id] ?? 0) + 1;
          }
          setConversationCounts(counts);
          setState("ready");
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Error al cargar clientes");
          setState("error");
        }
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  async function refetch() {
    setState("loading");
    setError(null);
    try {
      const [customerData, convData] = await Promise.all([
        listCustomers(),
        listConversations(),
      ]);
      setCustomers(customerData);
      const counts: Record<string, number> = {};
      for (const c of convData) {
        counts[c.customer_id] = (counts[c.customer_id] ?? 0) + 1;
      }
      setConversationCounts(counts);
      setState("ready");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cargar clientes");
      setState("error");
    }
  }

  async function loadDetail(customerId: string) {
    const reqId = ++detailReqRef.current;
    setSelectedId(customerId);
    setLoadingDetail(true);
    try {
      const convs = await listConversations();
      if (reqId !== detailReqRef.current) return;
      setConversations(
        convs.filter((c) => c.customer_id === customerId),
      );
    } catch {
      if (reqId !== detailReqRef.current) return;
      setConversations([]);
    } finally {
      if (reqId !== detailReqRef.current) return;
      setLoadingDetail(false);
    }
  }

  function openRecord(customerId: string) {
    router.push(`/records?customer=${customerId}`);
  }

  function validate(f: FormData): Record<string, string> {
    const errs: Record<string, string> = {};
    if (!f.name.trim()) errs.name = "Requerido";
    if (!f.phone.trim()) errs.phone = "Requerido";
    else if (!/^\+?[\d\s-]{7,15}$/.test(f.phone.trim()))
      errs.phone = "Teléfono inválido";
    return errs;
  }

  async function handleCreate() {
    const errs = validate(form);
    setFormErrors(errs);
    if (Object.keys(errs).length > 0) return;

    setSaving(true);
    try {
      const created = await createCustomer({
        name: form.name.trim(),
        phone: form.phone.trim(),
      });
      setCustomers((prev) => [...prev, created]);
      closeCreate();
    } catch (e) {
      setFormErrors({
        _form: e instanceof Error ? e.message : "Error al guardar",
      });
    } finally {
      setSaving(false);
    }
  }

  function openCreate() {
    setCreating(true);
    setForm(emptyForm);
    setFormErrors({});
  }

  function closeCreate() {
    setCreating(false);
    setForm(emptyForm);
    setFormErrors({});
    setSaving(false);
  }

  if (state === "loading") return <Loading rows={6} label="Cargando clientes…" />;

  if (state === "error") {
    return (
      <div className="mx-auto w-full max-w-5xl space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            Clientes
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Tus clientes y sus contactos.
          </p>
        </div>
        <ErrorState
          description={error ?? "Error desconocido"}
          onRetry={refetch}
        />
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            Clientes
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Tus clientes y sus contactos.
          </p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="size-4" />
          Nuevo cliente
        </Button>
      </div>

      {customers.length === 0 ? (
        <EmptyState
          icon={Users}
          title="Sin clientes"
          description="Agrega tu primer cliente para empezar."
          action={
            <Button onClick={openCreate}>
              <Plus className="size-4" />
              Nuevo cliente
            </Button>
          }
        />
      ) : (
        <div className="rounded-xl border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nombre</TableHead>
                <TableHead>Teléfono</TableHead>
                <TableHead className="w-32">Creado</TableHead>
                <TableHead className="w-28">Conversaciones</TableHead>
                <TableHead className="w-12" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {customers.map((c) => {
                const isSelected = selectedId === c.id;
                const customerConvs = isSelected ? conversations : [];
                const convCount = conversationCounts[c.id] ?? 0;
                return (
                  <Fragment key={c.id}>
                    <TableRow
                      className="cursor-pointer hover:bg-surface"
                      role="button"
                      tabIndex={0}
                      aria-expanded={isSelected}
                      onClick={() =>
                        isSelected
                          ? setSelectedId(null)
                          : loadDetail(c.id)
                      }
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          if (isSelected) {
                            setSelectedId(null);
                          } else {
                            loadDetail(c.id);
                          }
                        }
                      }}
                    >
                      <TableCell className="font-medium">{c.name}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {c.phone}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-xs tabular-nums">
                        {formatDate(c.created_at)}
                      </TableCell>
                      <TableCell>
                          <Badge variant="secondary" className="text-xs">
                            <MessageSquare className="mr-0.5 size-3" />
                            {convCount}
                          </Badge>
                      </TableCell>
                      <TableCell>
                        {isSelected ? (
                          <ChevronUp className="size-4 text-muted-foreground" />
                        ) : (
                          <ChevronDown className="size-4 text-muted-foreground" />
                        )}
                      </TableCell>
                    </TableRow>
                    {isSelected && (
                      <TableRow key={`${c.id}-detail`}>
                        <TableCell colSpan={5} className="bg-surface/50 p-0">
                          <div className="px-4 py-3">
                            {loadingDetail ? (
                              <Loading rows={2} label="Cargando…" />
                            ) : (
                              <div className="space-y-3">
                                <div className="flex items-center gap-4">
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      openRecord(c.id);
                                    }}
                                  >
                                    <ClipboardList className="size-3.5" />
                                    Ver ficha
                                  </Button>
                                </div>
                                {customerConvs.length === 0 ? (
                                  <p className="text-xs text-muted-foreground">
                                    Sin conversaciones.
                                  </p>
                                ) : (
                                  <div className="space-y-1.5">
                                    <p className="text-xs font-medium text-muted-foreground">
                                      Conversaciones
                                    </p>
                                    {customerConvs.map((conv) => {
                                      const s = statusBadge(conv.status);
                                      return (
                                        <div
                                          key={conv.id}
                                          className="flex items-center justify-between rounded-lg border border-border/30 px-3 py-2"
                                        >
                                          <div className="min-w-0 flex-1">
                                            <p className="text-xs font-medium">
                                              {intentLabel(
                                                conv.detected_intent,
                                              )}
                                            </p>
                                            <p className="text-[0.65rem] text-muted-foreground">
                                              {relativeTime(
                                                conv.last_message_at,
                                              )}
                                            </p>
                                          </div>
                                          <Badge
                                            variant={s.variant}
                                            className="text-[0.65rem]"
                                          >
                                            {s.label}
                                          </Badge>
                                        </div>
                                      );
                                    })}
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </Fragment>                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog
        open={creating}
        onOpenChange={(open) => !open && closeCreate()}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nuevo cliente</DialogTitle>
            <DialogDescription>
              Agrega un cliente a tu negocio.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="cust-name">Nombre</Label>
              <Input
                id="cust-name"
                value={form.name}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, name: e.target.value }))
                }
                placeholder="Ej. Ana Fuentes"
              />
              {formErrors.name && (
                <p className="text-xs text-destructive">{formErrors.name}</p>
              )}
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="cust-phone">Teléfono</Label>
              <Input
                id="cust-phone"
                value={form.phone}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, phone: e.target.value }))
                }
                placeholder="+56912345678"
              />
              {formErrors.phone && (
                <p className="text-xs text-destructive">{formErrors.phone}</p>
              )}
            </div>
            {formErrors._form && (
              <p className="text-sm text-destructive">{formErrors._form}</p>
            )}
          </div>
          <DialogFooter showCloseButton>
            <Button onClick={handleCreate} disabled={saving}>
              {saving ? "Guardando…" : "Crear"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
