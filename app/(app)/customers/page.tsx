"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ChevronRight, MessageSquare, Plus, Search, Users } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CharCountInput } from "@/components/ui/char-count-input";
import { CustomerRating } from "@/components/customers/rating";
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
import { CustomerDrawer } from "@/components/customers/customer-drawer";
import { searchCustomers, createCustomer } from "@/lib/api/customers";
import { listConversations } from "@/lib/api/conversations";
import { subscribeToEvents } from "@/lib/sse";
import type { Customer } from "@/lib/types";

type PageState = "loading" | "error" | "ready";

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
  email: string;
}

const emptyForm: FormData = { name: "", phone: "", email: "" };

const PAGE_SIZE = 20;

function CustomersPageContent() {
  const searchParams = useSearchParams();
  const [state, setState] = useState<PageState>("loading");
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [count, setCount] = useState(0);
  const [search, setSearch] = useState("");
  const [listLoading, setListLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [conversationCounts, setConversationCounts] = useState<Record<string, number>>(
    {},
  );

  // The customer whose detail drawer is open (null = closed). Seeded from `?id=` so
  // other screens can link straight to a person — the orders detail links here to
  // answer "who is this?" without making the operator search for them by hand.
  const [openCustomerId, setOpenCustomerId] = useState<string | null>(() =>
    searchParams.get("id"),
  );

  // `replaceState`, not `router.push`: pushing would re-render the route and refetch the
  // whole list just to open a drawer (same reasoning as the conversations inbox).
  const openCustomer = useCallback((id: string) => {
    setOpenCustomerId(id);
    window.history.replaceState(null, "", `?id=${id}`);
  }, []);

  const closeCustomer = useCallback(() => {
    setOpenCustomerId(null);
    window.history.replaceState(null, "", window.location.pathname);
  }, []);

  const searchTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<FormData>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  // Conversation count per customer (for the row badge). Re-runs on demand
  // from the SSE handler below (a new message can create/bump a conversation).
  const loadConversationCounts = useCallback(async () => {
    try {
      const convs = await listConversations();
      const counts: Record<string, number> = {};
      for (const c of convs) counts[c.customer_id] = (counts[c.customer_id] ?? 0) + 1;
      setConversationCounts(counts);
    } catch {
      // best-effort — the badge just keeps its last known count
    }
  }, []);

  useEffect(() => {
    // Deferred: keeps setState out of the effect's synchronous path
    // (react-hooks/set-state-in-effect), same idiom as products/page.tsx.
    const t = setTimeout(loadConversationCounts, 0);
    return () => clearTimeout(t);
  }, [loadConversationCounts]);

  // Customer list: search + server-side pagination ("load more").
  const loadCustomers = useCallback(
    async (opts: { search: string; offset: number; append: boolean }) => {
      setListLoading(true);
      setError(null);
      try {
        const res = await searchCustomers({
          search: opts.search || undefined,
          limit: PAGE_SIZE,
          offset: opts.offset,
        });
        setCustomers((prev) => (opts.append ? [...prev, ...res.items] : res.items));
        setCount(res.count);
        setState("ready");
      } catch (e) {
        setError(e instanceof Error ? e.message : "Error al cargar clientes");
        setState("error");
      } finally {
        setListLoading(false);
      }
    },
    [],
  );

  // Search debounce (resets to the first page on each change).
  useEffect(() => {
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(
      () => loadCustomers({ search, offset: 0, append: false }),
      250,
    );
    return () => clearTimeout(searchTimer.current);
  }, [search, loadCustomers]);

  // Live refresh: another operator (or the WhatsApp auto-create) added/edited a
  // customer. Subscribe once; read the live search term via a ref so we don't
  // re-subscribe on every keystroke. Back to the first page (low-frequency event).
  const searchRef = useRef(search);
  useEffect(() => {
    searchRef.current = search;
  });
  useEffect(() => {
    return subscribeToEvents((event) => {
      if (event.type === "cliente_creado" || event.type === "cliente_actualizado") {
        loadCustomers({ search: searchRef.current, offset: 0, append: false });
      }
      if (event.type === "mensaje_recibido" || event.type === "cliente_creado") {
        loadConversationCounts();
      }
    });
  }, [loadCustomers, loadConversationCounts]);

  function refetch() {
    loadCustomers({ search, offset: 0, append: false });
  }

  function validate(f: FormData): Record<string, string> {
    const errs: Record<string, string> = {};
    if (!f.name.trim()) errs.name = "Requerido";
    else if (f.name.trim().length > 120) errs.name = "Máximo 120 caracteres";
    if (!f.phone.trim()) errs.phone = "Requerido";
    else if (!/^\+?[\d\s-]{7,15}$/.test(f.phone.trim()))
      errs.phone = "Teléfono inválido";
    if (f.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email.trim()))
      errs.email = "Email inválido";
    return errs;
  }

  async function handleCreate() {
    const errs = validate(form);
    setFormErrors(errs);
    if (Object.keys(errs).length > 0) return;

    setSaving(true);
    try {
      const { created } = await createCustomer({
        name: form.name.trim(),
        phone: form.phone.trim(),
        email: form.email.trim() || undefined,
      });
      closeCreate();
      loadCustomers({ search, offset: 0, append: false });
      if (created) {
        toast.success("Cliente creado");
      } else {
        toast.warning("Ya existía un cliente con ese teléfono", {
          description:
            "Se muestra el registro existente; los datos escritos no se guardaron.",
        });
      }
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

  /** Reflect a drawer save back into the list row. */
  function handleCustomerSaved(updated: Customer) {
    setCustomers((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
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
            Tus clientes y sus datos.
          </p>
        </div>
        <ErrorState description={error ?? "Error desconocido"} onRetry={refetch} />
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
            Tus clientes y sus datos.
          </p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="size-4" />
          Nuevo cliente
        </Button>
      </div>

      <div className="relative max-w-xs">
        <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por nombre o teléfono…"
          aria-label="Buscar clientes"
          className="pl-8"
        />
      </div>

      {customers.length === 0 ? (
        search ? (
          <EmptyState
            icon={Search}
            title="Sin resultados"
            description={`No hay clientes que coincidan con "${search}".`}
          />
        ) : (
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
        )
      ) : (
        <div className="rounded-xl border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nombre</TableHead>
                <TableHead>Teléfono</TableHead>
                <TableHead className="w-32">Creado</TableHead>
                <TableHead className="w-28">Conversaciones</TableHead>
                {/* Comportamiento DEL cliente (1-5), del evaluador de conversaciones. El
                    encabezado nombra la dirección: un "Rating" pelado se lee como la
                    calificación que el cliente nos dio. */}
                <TableHead className="w-40">Comportamiento</TableHead>
                <TableHead className="w-12" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {customers.map((c) => {
                const convCount = conversationCounts[c.id] ?? 0;
                return (
                  <TableRow
                    key={c.id}
                    className="cursor-pointer hover:bg-surface"
                    role="button"
                    tabIndex={0}
                    aria-label={`Ver datos de ${c.name}`}
                    onClick={() => openCustomer(c.id)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        openCustomer(c.id);
                      }
                    }}
                  >
                    <TableCell className="font-medium">{c.name}</TableCell>
                    <TableCell className="text-muted-foreground">{c.phone}</TableCell>
                    <TableCell className="text-xs text-muted-foreground tabular-nums">
                      {formatDate(c.created_at)}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="text-xs">
                        <MessageSquare className="mr-0.5 size-3" />
                        {convCount}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <CustomerRating avg={c.rating_avg} count={c.rating_count} />
                    </TableCell>
                    <TableCell>
                      <ChevronRight className="size-4 text-muted-foreground" />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {customers.length > 0 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>
            Mostrando {customers.length} de {count}
          </span>
          {customers.length < count && (
            <Button
              variant="outline"
              size="sm"
              disabled={listLoading}
              onClick={() =>
                loadCustomers({
                  search,
                  offset: customers.length,
                  append: true,
                })
              }
            >
              {listLoading ? "Cargando…" : "Cargar más"}
            </Button>
          )}
        </div>
      )}

      {/* Create dialog (editing happens in the drawer) */}
      <Dialog open={creating} onOpenChange={(open) => !open && closeCreate()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nuevo cliente</DialogTitle>
            <DialogDescription>Agrega un cliente a tu negocio.</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="cust-name">Nombre</Label>
              <CharCountInput
                id="cust-name"
                max={120}
                value={form.name}
                onChange={(name) => setForm((prev) => ({ ...prev, name }))}
                placeholder="Ej. Ana Fuentes"
                aria-invalid={formErrors.name ? true : undefined}
                describedBy={formErrors.name ? "cust-name-error" : undefined}
              />
              {formErrors.name && (
                <p id="cust-name-error" role="alert" className="text-xs text-destructive">
                  {formErrors.name}
                </p>
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
                aria-invalid={formErrors.phone ? true : undefined}
                aria-describedby={formErrors.phone ? "cust-phone-error" : undefined}
              />
              {formErrors.phone && (
                <p
                  id="cust-phone-error"
                  role="alert"
                  className="text-xs text-destructive"
                >
                  {formErrors.phone}
                </p>
              )}
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="cust-email">Email (opcional)</Label>
              <Input
                id="cust-email"
                type="email"
                value={form.email}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, email: e.target.value }))
                }
                placeholder="cliente@correo.com"
                aria-invalid={formErrors.email ? true : undefined}
                aria-describedby={formErrors.email ? "cust-email-error" : undefined}
              />
              {formErrors.email && (
                <p
                  id="cust-email-error"
                  role="alert"
                  className="text-xs text-destructive"
                >
                  {formErrors.email}
                </p>
              )}
            </div>
            {formErrors._form && (
              <p role="alert" className="text-sm text-destructive">
                {formErrors._form}
              </p>
            )}
          </div>
          <DialogFooter showCloseButton>
            <Button onClick={handleCreate} disabled={saving}>
              {saving ? "Guardando…" : "Crear"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <CustomerDrawer
        customerId={openCustomerId}
        onOpenChange={(open) => {
          if (!open) closeCustomer();
        }}
        onCustomerSaved={handleCustomerSaved}
      />
    </div>
  );
}

// `useSearchParams` requires a Suspense boundary in the App Router.
export default function CustomersPage() {
  return (
    <Suspense fallback={null}>
      <CustomersPageContent />
    </Suspense>
  );
}
