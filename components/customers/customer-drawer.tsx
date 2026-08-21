"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  Check,
  ChevronDown,
  ChevronRight,
  Eye,
  EyeOff,
  Pencil,
  Save,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { ErrorState, Loading } from "@/components/states";
import { useBusinessOptional } from "@/lib/business/business-context";
import { listConversations } from "@/lib/api/conversations";
import { CustomerRating, ThreadRating } from "@/components/customers/rating";
import {
  addCustomerNote,
  getCustomer,
  getCustomerNotes,
  updateCustomer,
} from "@/lib/api/customers";
import { getRecord, updateRecordValues } from "@/lib/api/records";
import { useSubmitGuard } from "@/lib/hooks/use-submit-guard";
import { subscribeToEvents } from "@/lib/sse";
import type {
  Conversation,
  Customer,
  CustomerRecord,
  Note,
  RecordField,
  RecordFieldType,
  RecordValue,
} from "@/lib/types";
import { cn } from "@/lib/utils";
import { formatDateTime, relativeTime } from "@/lib/format/date";

type LoadState = "idle" | "loading" | "error" | "ready";

function fieldTypeLabel(type: RecordFieldType): string {
  const map: Record<RecordFieldType, string> = {
    text: "Texto",
    number: "Número",
    select: "Selector",
    date: "Fecha",
    datetime: "Fecha y hora",
    boolean: "Sí/No",
  };
  return map[type];
}

function convStatusBadge(status: Conversation["status"]) {
  if (status === "ai_active")
    return { label: "IA activa", variant: "default" as const };
  if (status === "human_handoff")
    return { label: "Derivada", variant: "secondary" as const };
  return { label: "Cerrada", variant: "outline" as const };
}

function renderFieldInput(
  field: RecordField,
  value: RecordValue,
  onChange: (value: RecordValue) => void,
) {
  switch (field.type) {
    case "text":
      return (
        <Input
          value={typeof value === "string" ? value : ""}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.label}
        />
      );
    case "number":
      return (
        <Input
          type="number"
          value={typeof value === "number" ? value : ""}
          onChange={(e) =>
            onChange(e.target.value === "" ? null : Number(e.target.value))
          }
          placeholder={field.label}
        />
      );
    case "date":
      return (
        <Input
          type="date"
          value={typeof value === "string" ? value : ""}
          onChange={(e) => onChange(e.target.value || null)}
        />
      );
    case "datetime":
      return (
        <Input
          type="datetime-local"
          value={typeof value === "string" ? value : ""}
          onChange={(e) => onChange(e.target.value || null)}
        />
      );
    case "select":
      // Sin `items` en el Root — las opciones de ficha son strings
      // planos (valor === label), el trigger ya muestra el texto correcto.
      return (
        <Select
          value={typeof value === "string" ? value : ""}
          onValueChange={(v) => onChange(v || null)}
        >
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Seleccionar…" />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {(field.options ?? []).map((opt) => (
                <SelectItem key={opt} value={opt}>
                  {opt}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      );
    case "boolean":
      return (
        <Switch checked={value === true} onChange={(checked) => onChange(checked)} />
      );
  }
}

/** Collapsible section inside the drawer. */
function Section({
  title,
  count,
  defaultOpen,
  children,
}: {
  title: string;
  count?: number;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen ?? false);
  return (
    <div className="rounded-xl border border-border/40">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between p-3 text-left"
      >
        <span className="text-sm font-medium text-foreground">
          {title}
          {count !== undefined ? (
            <span className="ml-1 text-xs text-muted-foreground">({count})</span>
          ) : null}
        </span>
        <ChevronDown
          className={cn(
            "size-4 text-muted-foreground transition-transform",
            open && "rotate-180",
          )}
        />
      </button>
      {open ? <div className="border-t border-border/40 p-3">{children}</div> : null}
    </div>
  );
}

interface CustomerDrawerProps {
  /** The customer to edit; the drawer is open when this is non-null. */
  customerId: string | null;
  onOpenChange: (open: boolean) => void;
  /** Called with the updated customer after a successful core-data save. */
  onCustomerSaved: (customer: Customer) => void;
}

/**
 * Single place to view and edit everything about a customer: core data
 * (name/email; phone immutable), the dynamic record fields, their conversations
 * and the staff notes log. Opens as a side sheet over the customers list.
 */
export function CustomerDrawer({
  customerId,
  onOpenChange,
  onCustomerSaved,
}: CustomerDrawerProps) {
  // Cuatro superficies de este drawer son del asistente: los badges «IA lee/edita»
  // de cada campo de la ficha, el historial de conversaciones, la calificación de
  // comportamiento del encabezado y la propia consulta de conversaciones. Sin
  // asistente en el plan ninguna describe algo que exista.
  const hasAssistant =
    useBusinessOptional()?.business?.entitlements?.assistant !== false;
  const [state, setState] = useState<LoadState>("idle");
  const [error, setError] = useState<string | null>(null);

  // Customer core fields
  const [custName, setCustName] = useState("");
  const [custEmail, setCustEmail] = useState("");
  const [custPhone, setCustPhone] = useState("");
  const [savingCustomer, setSavingCustomer] = useState(false);
  const [customerSaved, setCustomerSaved] = useState(false);
  const [customerError, setCustomerError] = useState<string | null>(null);

  // Dynamic record
  const [record, setRecord] = useState<CustomerRecord | null>(null);
  const [values, setValues] = useState<{ [field: string]: RecordValue }>({});
  const [savingRecord, setSavingRecord] = useState(false);
  const [recordSaved, setRecordSaved] = useState(false);
  const [recordError, setRecordError] = useState<string | null>(null);

  const [conversations, setConversations] = useState<Conversation[]>([]);
  // Agregado del evaluador (promedio + cuántas conversaciones lo componen).
  const [rating, setRating] = useState<{ avg: number | null; count: number }>({
    avg: null,
    count: 0,
  });

  // Notes (the staff log about this customer)
  const [notes, setNotes] = useState<Note[]>([]);
  const [noteDraft, setNoteDraft] = useState("");
  const [savingNote, setSavingNote] = useState(false);
  const [noteError, setNoteError] = useState<string | null>(null);
  // The note shown in the full-text modal (null = closed).
  const [openNote, setOpenNote] = useState<Note | null>(null);

  const reqRef = useRef(0);
  const submitGuard = useSubmitGuard();
  const custTimer = useRef<ReturnType<typeof setTimeout>>(null);
  const recordTimer = useRef<ReturnType<typeof setTimeout>>(null);
  // Coalesce de `mensaje_recibido` (250 ms, espejo de /conversations): una ráfaga
  // de WhatsApp cuesta UNA recarga del historial del drawer, no una por mensaje.
  const convTimer = useRef<ReturnType<typeof setTimeout>>(null);

  // Live refs for the SSE handler (subscribed once): the open customer, the
  // current editable state, and a snapshot of what was last loaded/saved so we
  // can tell "dirty" (unsaved edits) from "clean" and never clobber the operator.
  const customerIdRef = useRef(customerId);
  const valuesRef = useRef(values);
  const custNameRef = useRef(custName);
  const custEmailRef = useRef(custEmail);
  const onCustomerSavedRef = useRef(onCustomerSaved);
  const hasAssistantRef = useRef(hasAssistant);
  const loadedRef = useRef<{
    name: string;
    email: string;
    values: { [field: string]: RecordValue };
  }>({ name: "", email: "", values: {} });
  useEffect(() => {
    customerIdRef.current = customerId;
    valuesRef.current = values;
    custNameRef.current = custName;
    custEmailRef.current = custEmail;
    onCustomerSavedRef.current = onCustomerSaved;
    hasAssistantRef.current = hasAssistant;
  });

  useEffect(
    () => () => {
      if (custTimer.current) clearTimeout(custTimer.current);
      if (recordTimer.current) clearTimeout(recordTimer.current);
      if (convTimer.current) clearTimeout(convTimer.current);
    },
    [],
  );

  useEffect(() => {
    const reqId = ++reqRef.current;
    async function load() {
      if (!customerId) {
        setState("idle");
        return;
      }
      setState("loading");
      setError(null);
      setCustomerSaved(false);
      setCustomerError(null);
      setRecordSaved(false);
      setRecordError(null);
      setNoteDraft("");
      setNoteError(null);
      setOpenNote(null);
      try {
        // `allSettled`, no `all`: solo el cliente es indispensable. Con `all`, el
        // 400 que devuelve `/record/` en un negocio SIN `RecordSchema` —el estado
        // por defecto de un tenant nuevo, porque nada en el panel llama a
        // `POST /records/schemas/`— rechazaba en bloque y se perdían también
        // nombre, email, teléfono, conversaciones y notas. Y como la ficha ya no
        // es una ruta, no quedaba ninguna vía para ver al cliente.
        const [c, r, convs, ns] = await Promise.allSettled([
          getCustomer(customerId),
          getRecord(customerId),
          // Server-side: antes bajaba TODAS las conversaciones del negocio y filtraba acá.
          hasAssistant
            ? listConversations({ customerId })
            : Promise.resolve({ items: [] }),
          getCustomerNotes(customerId),
        ]);
        if (reqId !== reqRef.current) return;
        if (c.status === "rejected") throw c.reason;
        const cust = c.value;
        const rec = r.status === "fulfilled" ? r.value : null;
        setCustName(cust.name);
        setCustEmail(cust.email);
        setCustPhone(cust.phone);
        setRating({ avg: cust.rating_avg, count: cust.rating_count });
        setRecord(rec);
        setValues(rec ? { ...rec.values } : {});
        // El fallo de la ficha se nombra en SU sección, no como error del drawer.
        setRecordError(
          r.status === "rejected"
            ? r.reason instanceof Error
              ? r.reason.message
              : "No se pudo cargar la ficha."
            : null,
        );
        // `.items`: el inbox pasó a paginarse por cursor y la respuesta es un
        // sobre. Aquí se toma solo la primera página a propósito — es el
        // historial de UN cliente en un panel lateral, no la bandeja.
        setConversations(convs.status === "fulfilled" ? convs.value.items : []);
        setNotes(ns.status === "fulfilled" ? ns.value : []);
        loadedRef.current = {
          name: cust.name,
          email: cust.email,
          values: rec ? { ...rec.values } : {},
        };
        setState("ready");
      } catch (e) {
        if (reqId !== reqRef.current) return;
        setError(e instanceof Error ? e.message : "Error al cargar el cliente");
        setState("error");
      }
    }
    load();
    // `hasAssistant` entra en las dependencias porque decide si se pide el
    // historial de conversaciones: si el negocio carga después que el drawer, la
    // ficha se recarga con el dato correcto en vez de quedarse sin hilos.
  }, [customerId, hasAssistant]);

  // Live refresh while the drawer is open. Subscribe once; the handler reads
  // refs so it always sees the current open customer and edit state. It only
  // re-applies a remote change when the matching section has NO unsaved edits,
  // so it never clobbers what the operator is typing.
  useEffect(() => {
    return subscribeToEvents((event) => {
      const openId = customerIdRef.current;
      if (!openId) return;

      // ANTES del guard por customer_id: el payload de mensaje_recibido no lo
      // trae (política PII: solo ids de conversación), así que no se puede
      // discriminar — se recarga el historial del cliente abierto, coalescido.
      // Costo asumido: mensajes de OTROS clientes también refetchean (≤1
      // request/250 ms y solo con el drawer abierto).
      if (event.type === "mensaje_recibido") {
        if (!hasAssistantRef.current) return;
        if (convTimer.current) clearTimeout(convTimer.current);
        convTimer.current = setTimeout(() => {
          const id = customerIdRef.current;
          if (!id) return;
          listConversations({ customerId: id })
            .then((page) => {
              if (customerIdRef.current === id) setConversations(page.items);
            })
            .catch(() => {});
        }, 250);
        return;
      }

      const data = event.data as { customer_id?: string };
      if (data.customer_id !== openId) return;

      if (event.type === "nota_creada") {
        getCustomerNotes(openId)
          .then((ns) => {
            if (customerIdRef.current === openId) setNotes(ns);
          })
          .catch(() => {});
      } else if (event.type === "ficha_actualizada") {
        const dirty =
          JSON.stringify(valuesRef.current) !==
          JSON.stringify(loadedRef.current.values);
        if (dirty) return; // keep the operator's unsaved edits
        getRecord(openId)
          .then((r) => {
            if (customerIdRef.current !== openId) return;
            setRecord(r);
            setValues({ ...r.values });
            loadedRef.current.values = { ...r.values };
          })
          .catch(() => {});
      } else if (event.type === "cliente_actualizado") {
        getCustomer(openId)
          .then((c) => {
            if (customerIdRef.current !== openId) return;
            // El rating no es editable en el drawer → se re-aplica SIEMPRE,
            // sin riesgo de clobber (una valoración nueva del evaluador se
            // quedaba congelada hasta un reload — auditoría 2026-08-20).
            setRating({ avg: c.rating_avg, count: c.rating_count });
            const dirty =
              custNameRef.current !== loadedRef.current.name ||
              custEmailRef.current !== loadedRef.current.email;
            if (dirty) return; // keep the operator's unsaved edits
            setCustName(c.name);
            setCustEmail(c.email);
            loadedRef.current.name = c.name;
            loadedRef.current.email = c.email;
            onCustomerSavedRef.current(c);
          })
          .catch(() => {});
      }
    });
  }, []);

  async function handleSaveCustomer() {
    if (!customerId) return;
    if (!custName.trim()) {
      setCustomerError("El nombre es obligatorio.");
      return;
    }
    if (custEmail.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(custEmail.trim())) {
      setCustomerError("Email inválido.");
      return;
    }
    setSavingCustomer(true);
    setCustomerError(null);
    setCustomerSaved(false);
    try {
      const updated = await updateCustomer(customerId, {
        name: custName.trim(),
        email: custEmail.trim(),
      });
      setCustName(updated.name);
      setCustEmail(updated.email);
      loadedRef.current.name = updated.name;
      loadedRef.current.email = updated.email;
      onCustomerSaved(updated);
      setCustomerSaved(true);
      if (custTimer.current) clearTimeout(custTimer.current);
      custTimer.current = setTimeout(() => setCustomerSaved(false), 2000);
    } catch (e) {
      setCustomerError(e instanceof Error ? e.message : "Error al guardar");
    } finally {
      setSavingCustomer(false);
    }
  }

  async function handleSaveRecord() {
    if (!customerId || !record) return;
    for (const field of record.schema) {
      if (field.required) {
        const v = values[field.name];
        if (v === null || v === undefined || v === "") {
          setRecordError(`El campo "${field.label}" es obligatorio.`);
          return;
        }
      }
    }
    setSavingRecord(true);
    setRecordError(null);
    setRecordSaved(false);
    try {
      const updated = await updateRecordValues(customerId, values);
      setRecord(updated);
      setValues({ ...updated.values });
      loadedRef.current.values = { ...updated.values };
      setRecordSaved(true);
      if (recordTimer.current) clearTimeout(recordTimer.current);
      recordTimer.current = setTimeout(() => setRecordSaved(false), 2000);
    } catch (e) {
      setRecordError(e instanceof Error ? e.message : "Error al guardar");
    } finally {
      setSavingRecord(false);
    }
  }

  const handleAddNote = () => submitGuard(addNote);

  async function addNote() {
    if (!customerId) return;
    const body = noteDraft.trim();
    if (!body) {
      setNoteError("La nota no puede estar vacía.");
      return;
    }
    setSavingNote(true);
    setNoteError(null);
    try {
      const created = await addCustomerNote(customerId, body);
      setNotes((prev) => [created, ...prev]);
      setNoteDraft("");
    } catch (e) {
      setNoteError(e instanceof Error ? e.message : "Error al guardar la nota");
    } finally {
      setSavingNote(false);
    }
  }

  return (
    <Sheet open={customerId !== null} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        // The base SheetContent caps the panel at `data-[side=right]:sm:max-w-sm`
        // (24rem). Those width utilities are data-attribute-scoped, so a plain
        // `sm:max-w-none` loses on specificity — the override must reuse the same
        // `data-[side=right]:` variant to win (and let tailwind-merge dedupe it).
        className="gap-0 overflow-y-auto data-[side=right]:w-[92vw] data-[side=right]:sm:w-[40vw] data-[side=right]:sm:max-w-none"
      >
        <SheetHeader>
          <SheetTitle>
            {state === "ready" ? custName || "Cliente" : "Cliente"}
          </SheetTitle>
          <SheetDescription className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span>{custPhone || "—"}</span>
            {state === "ready" && hasAssistant && (
              <>
                <span aria-hidden className="text-muted-foreground/50">
                  ·
                </span>
                <CustomerRating avg={rating.avg} count={rating.count} />
              </>
            )}
          </SheetDescription>
        </SheetHeader>

        {state === "loading" && (
          <div className="p-4">
            <Loading rows={4} label="Cargando cliente…" />
          </div>
        )}
        {state === "error" && (
          <div className="p-4">
            <ErrorState description={error ?? "Error al cargar"} />
          </div>
        )}

        {/* Sin `&& record`: la ficha es UNA sección del drawer, no su condición de
            existencia. Ver el `allSettled` de la carga. */}
        {state === "ready" && (
          <div className="flex flex-col gap-3 overflow-y-auto p-4 pt-0">
            {/* Datos del cliente */}
            <div className="space-y-3 rounded-xl border border-border/40 p-3">
              <p className="text-sm font-medium text-foreground">Datos del cliente</p>
              <div className="space-y-1.5">
                <Label htmlFor="drawer-name">Nombre</Label>
                <Input
                  id="drawer-name"
                  value={custName}
                  onChange={(e) => setCustName(e.target.value)}
                  placeholder="Nombre del cliente"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="drawer-email">Email (opcional)</Label>
                <Input
                  id="drawer-email"
                  type="email"
                  value={custEmail}
                  onChange={(e) => setCustEmail(e.target.value)}
                  placeholder="cliente@correo.com"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="drawer-phone">Teléfono</Label>
                <Input id="drawer-phone" value={custPhone} disabled readOnly />
                <p className="text-[0.7rem] text-muted-foreground">
                  El teléfono identifica al cliente y no se puede cambiar.
                </p>
              </div>
              <div className="flex items-center gap-3">
                <Button
                  size="sm"
                  onClick={handleSaveCustomer}
                  disabled={savingCustomer}
                >
                  {savingCustomer ? (
                    "Guardando…"
                  ) : (
                    <>
                      <Save className="size-4" />
                      Guardar
                    </>
                  )}
                </Button>
                {customerSaved && (
                  <span className="flex items-center gap-1 text-xs text-success">
                    <Check className="size-3.5" />
                    Guardado
                  </span>
                )}
                {customerError && (
                  <p className="text-xs text-destructive">{customerError}</p>
                )}
              </div>
            </div>

            {/* Datos adicionales (dynamic schema) */}
            <Section
              title="Datos adicionales"
              count={record?.schema.length ?? 0}
              defaultOpen
            >
              {!record ? (
                <p className="text-xs text-destructive">
                  No se pudo cargar la ficha
                  {recordError ? `: ${recordError}` : "."} El resto de los datos del
                  cliente sí está disponible.
                </p>
              ) : record.schema.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  Sin campos adicionales configurados.
                </p>
              ) : (
                <div className="space-y-4">
                  {record.schema.map((field) => (
                    <div key={field.name} className="space-y-1.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <Label>{field.label}</Label>
                        {field.required && (
                          <span className="text-xs text-destructive">*</span>
                        )}
                        <span className="text-[0.65rem] text-muted-foreground">
                          ({fieldTypeLabel(field.type)})
                        </span>
                        {hasAssistant && (
                          <div className="ml-auto flex items-center gap-1">
                            {field.ai_visible !== false ? (
                              <Badge
                                variant="success"
                                className="gap-0.5 text-[0.6rem]"
                              >
                                <Eye className="size-2.5" />
                                IA lee
                              </Badge>
                            ) : (
                              <Badge
                                variant="secondary"
                                className="gap-0.5 text-[0.6rem]"
                              >
                                <EyeOff className="size-2.5" />
                                IA no lee
                              </Badge>
                            )}
                            {field.ai_editable && (
                              <Badge
                                variant="default"
                                className="gap-0.5 text-[0.6rem]"
                              >
                                <Pencil className="size-2.5" />
                                IA edita
                              </Badge>
                            )}
                          </div>
                        )}
                      </div>
                      {renderFieldInput(field, values[field.name] ?? null, (v) =>
                        setValues((prev) => ({ ...prev, [field.name]: v })),
                      )}
                    </div>
                  ))}
                  <div className="flex items-center gap-3 pt-1">
                    <Button
                      size="sm"
                      onClick={handleSaveRecord}
                      disabled={savingRecord}
                    >
                      {savingRecord ? (
                        "Guardando…"
                      ) : (
                        <>
                          <Save className="size-4" />
                          Guardar
                        </>
                      )}
                    </Button>
                    {recordSaved && (
                      <span className="flex items-center gap-1 text-xs text-success">
                        <Check className="size-3.5" />
                        Guardado
                      </span>
                    )}
                    {recordError && (
                      <p className="text-xs text-destructive">{recordError}</p>
                    )}
                  </div>
                </div>
              )}
            </Section>

            {/* Conversaciones */}
            {/* Historial de conversaciones de este cliente. La lista viene filtrada por el
                servidor (`listConversations({ customerId })`); antes se bajaba la tabla
                completa del negocio y se filtraba en el navegador. Cada fila es navegable:
                el inbox acepta `?id=` y abre ese hilo. */}
            {hasAssistant && (
              <Section title="Conversaciones" count={conversations.length} defaultOpen>
                {conversations.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Sin conversaciones.</p>
                ) : (
                  <ul className="space-y-1.5">
                    {conversations.map((conv) => {
                      const s = convStatusBadge(conv.status);
                      return (
                        <li key={conv.id}>
                          <Link
                            href={`/conversations?chat=${conv.customer_id}&id=${conv.id}`}
                            className="flex items-center justify-between gap-3 rounded-lg border border-border/30 px-3 py-2 transition-colors hover:border-border hover:bg-muted/40 focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
                          >
                            <span className="min-w-0 flex-1">
                              <span className="block text-xs text-foreground">
                                {formatDateTime(conv.last_message_at)}
                              </span>
                              <span className="block text-[0.65rem] text-muted-foreground">
                                {relativeTime(conv.last_message_at)}
                              </span>
                            </span>
                            <ThreadRating
                              value={conv.customer_rating}
                              status={conv.rating_status}
                              className="shrink-0"
                            />
                            <Badge
                              variant={s.variant}
                              className="shrink-0 text-[0.65rem]"
                            >
                              {s.label}
                            </Badge>
                            <ChevronRight
                              className="size-4 shrink-0 text-muted-foreground"
                              aria-hidden
                            />
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </Section>
            )}

            {/* Notas — lo que el profesional registra del cliente en cada servicio */}
            <Section title="Notas" count={notes.length} defaultOpen>
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Textarea
                    value={noteDraft}
                    onChange={(e) => setNoteDraft(e.target.value)}
                    placeholder="Anota lo que observaste en la consulta o servicio…"
                    rows={3}
                  />
                  <div className="flex items-center gap-3">
                    <Button
                      size="sm"
                      onClick={handleAddNote}
                      disabled={savingNote || !noteDraft.trim()}
                    >
                      {savingNote ? "Guardando…" : "Agregar nota"}
                    </Button>
                    {noteError && (
                      <p className="text-xs text-destructive">{noteError}</p>
                    )}
                  </div>
                </div>

                {notes.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    Aún no hay notas sobre este cliente.
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {notes.map((note) => (
                      <li
                        key={note.id}
                        className="rounded-lg border border-border/30 px-3 py-2"
                      >
                        <div className="flex items-center gap-2">
                          <p className="min-w-0 flex-1 truncate text-sm text-foreground">
                            {note.body}
                          </p>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            className="shrink-0 text-muted-foreground"
                            onClick={() => setOpenNote(note)}
                            aria-label="Ver nota completa"
                            title="Ver nota completa"
                          >
                            <Eye className="size-4" />
                          </Button>
                        </div>
                        <p className="mt-1 text-[0.65rem] text-muted-foreground">
                          {note.author_name || "Equipo"} ·{" "}
                          {formatDateTime(note.created_at)}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </Section>

            {/* Full-text note modal (opened from a note's eye button) */}
            <Dialog
              open={openNote !== null}
              onOpenChange={(open) => {
                if (!open) setOpenNote(null);
              }}
            >
              <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                  <DialogTitle>Nota</DialogTitle>
                  <DialogDescription>
                    {openNote
                      ? `${openNote.author_name || "Equipo"} · ${formatDateTime(openNote.created_at)}`
                      : ""}
                  </DialogDescription>
                </DialogHeader>
                <div className="max-h-[60vh] overflow-y-auto text-sm whitespace-pre-wrap text-foreground">
                  {openNote?.body}
                </div>
              </DialogContent>
            </Dialog>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
