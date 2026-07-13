"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, Eye, EyeOff, Pencil, Save } from "lucide-react";

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
import { listConversations } from "@/lib/api/conversations";
import {
  addCustomerNote,
  getCustomer,
  getCustomerNotes,
  updateCustomer,
} from "@/lib/api/customers";
import { getRecord, updateRecordValues } from "@/lib/api/records";
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

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("es-CL", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "ahora";
  if (mins < 60) return `hace ${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `hace ${hrs}h`;
  return `hace ${Math.floor(hrs / 24)}d`;
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

  // Notes (the staff log about this customer)
  const [notes, setNotes] = useState<Note[]>([]);
  const [noteDraft, setNoteDraft] = useState("");
  const [savingNote, setSavingNote] = useState(false);
  const [noteError, setNoteError] = useState<string | null>(null);
  // The note shown in the full-text modal (null = closed).
  const [openNote, setOpenNote] = useState<Note | null>(null);

  const reqRef = useRef(0);
  const custTimer = useRef<ReturnType<typeof setTimeout>>(null);
  const recordTimer = useRef<ReturnType<typeof setTimeout>>(null);

  // Live refs for the SSE handler (subscribed once): the open customer, the
  // current editable state, and a snapshot of what was last loaded/saved so we
  // can tell "dirty" (unsaved edits) from "clean" and never clobber the operator.
  const customerIdRef = useRef(customerId);
  const valuesRef = useRef(values);
  const custNameRef = useRef(custName);
  const custEmailRef = useRef(custEmail);
  const onCustomerSavedRef = useRef(onCustomerSaved);
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
  });

  useEffect(
    () => () => {
      if (custTimer.current) clearTimeout(custTimer.current);
      if (recordTimer.current) clearTimeout(recordTimer.current);
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
        const [c, r, convs, ns] = await Promise.all([
          getCustomer(customerId),
          getRecord(customerId),
          listConversations(),
          getCustomerNotes(customerId),
        ]);
        if (reqId !== reqRef.current) return;
        setCustName(c.name);
        setCustEmail(c.email);
        setCustPhone(c.phone);
        setRecord(r);
        setValues({ ...r.values });
        setConversations(convs.filter((cv) => cv.customer_id === customerId));
        setNotes(ns);
        loadedRef.current = { name: c.name, email: c.email, values: { ...r.values } };
        setState("ready");
      } catch (e) {
        if (reqId !== reqRef.current) return;
        setError(e instanceof Error ? e.message : "Error al cargar el cliente");
        setState("error");
      }
    }
    load();
  }, [customerId]);

  // Live refresh while the drawer is open. Subscribe once; the handler reads
  // refs so it always sees the current open customer and edit state. It only
  // re-applies a remote change when the matching section has NO unsaved edits,
  // so it never clobbers what the operator is typing.
  useEffect(() => {
    return subscribeToEvents((event) => {
      const openId = customerIdRef.current;
      if (!openId) return;
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
        const dirty =
          custNameRef.current !== loadedRef.current.name ||
          custEmailRef.current !== loadedRef.current.email;
        if (dirty) return;
        getCustomer(openId)
          .then((c) => {
            if (customerIdRef.current !== openId) return;
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

  async function handleAddNote() {
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
          <SheetDescription>{custPhone || "—"}</SheetDescription>
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

        {state === "ready" && record && (
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
            <Section title="Datos adicionales" count={record.schema.length} defaultOpen>
              {record.schema.length === 0 ? (
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
                        <div className="ml-auto flex items-center gap-1">
                          {field.ai_visible !== false ? (
                            <Badge variant="success" className="gap-0.5 text-[0.6rem]">
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
                            <Badge variant="default" className="gap-0.5 text-[0.6rem]">
                              <Pencil className="size-2.5" />
                              IA edita
                            </Badge>
                          )}
                        </div>
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
            <Section title="Conversaciones" count={conversations.length}>
              {conversations.length === 0 ? (
                <p className="text-xs text-muted-foreground">Sin conversaciones.</p>
              ) : (
                <div className="space-y-1.5">
                  {conversations.map((conv) => {
                    const s = convStatusBadge(conv.status);
                    return (
                      <div
                        key={conv.id}
                        className="flex items-center justify-between rounded-lg border border-border/30 px-3 py-2"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="text-[0.65rem] text-muted-foreground">
                            {relativeTime(conv.last_message_at)}
                          </p>
                        </div>
                        <Badge variant={s.variant} className="text-[0.65rem]">
                          {s.label}
                        </Badge>
                      </div>
                    );
                  })}
                </div>
              )}
            </Section>

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
