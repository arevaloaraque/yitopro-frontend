"use client";

import { useEffect, useState } from "react";
import { Bot, Check, ClipboardList, Eye, EyeOff, Pencil, Save } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EmptyState, ErrorState, Loading } from "@/components/states";
import { listCustomers } from "@/lib/api/customers";
import { getRecord, updateRecordValues } from "@/lib/api/records";
import type {
  Customer,
  CustomerRecord,
  RecordField,
  RecordFieldType,
  RecordValue,
} from "@/lib/types";

type PageState = "idle" | "loading" | "error" | "ready";

function fieldTypeLabel(type: RecordFieldType): string {
  const map: Record<RecordFieldType, string> = {
    text: "Texto",
    number: "Número",
    select: "Selector",
    date: "Fecha",
    boolean: "Sí/No",
  };
  return map[type];
}

function formatAuditValue(v: RecordValue): string {
  if (v === null || v === undefined) return "—";
  if (typeof v === "boolean") return v ? "Sí" : "No";
  return String(v);
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("es-CL", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
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
          onChange={(e) => {
            const v = e.target.value;
            onChange(v === "" ? null : Number(v));
          }}
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
        <Switch
          checked={value === true}
          onChange={(checked) => onChange(checked)}
        />
      );
  }
}

export default function RecordsPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(
    () => {
      if (typeof window !== "undefined") {
        const saved = sessionStorage.getItem("records_selected_customer");
        if (saved) {
          sessionStorage.removeItem("records_selected_customer");
          return saved;
        }
      }
      return null;
    },
  );
  const [state, setState] = useState<PageState>("idle");
  const [record, setRecord] = useState<CustomerRecord | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [values, setValues] = useState<{ [field: string]: RecordValue }>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const data = await listCustomers();
        if (!cancelled) setCustomers(data);
      } catch {
        // silently fail
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!selectedCustomerId) {
        if (!cancelled) {
          setRecord(null);
          setValues({});
          setState("idle");
        }
        return;
      }

      if (!cancelled) {
        setState("loading");
        setError(null);
      }
      try {
        const r = await getRecord(selectedCustomerId);
        if (!cancelled) {
          setRecord(r);
          setValues({ ...r.values });
          setState("ready");
        }
      } catch (e) {
        if (!cancelled) {
          setError(
            e instanceof Error ? e.message : "Error al cargar la ficha",
          );
          setState("error");
        }
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [selectedCustomerId]);

  async function handleSave() {
    if (!selectedCustomerId || !record) return;

    // Validate required fields
    for (const field of record.schema) {
      if (field.required) {
        const v = values[field.name];
        if (v === null || v === undefined || v === "") {
          setSaveError(`El campo "${field.label}" es obligatorio.`);
          return;
        }
      }
    }

    setSaving(true);
    setSaveError(null);
    setSaved(false);
    try {
      const updated = await updateRecordValues(selectedCustomerId, values);
      setRecord(updated);
      setValues({ ...updated.values });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      setSaveError(
        e instanceof Error ? e.message : "Error al guardar la ficha",
      );
    } finally {
      setSaving(false);
    }
  }

  const selectedCustomer = customers.find(
    (c) => c.id === selectedCustomerId,
  );

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          Fichas
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Fichas dinámicas de tus clientes.
        </p>
      </div>

      <div className="space-y-1.5">
        <Label>Cliente</Label>
        <Select
          value={selectedCustomerId ?? ""}
          onValueChange={(v) => setSelectedCustomerId(v || null)}
        >
          <SelectTrigger className="w-full max-w-xs">
            <SelectValue placeholder="Selecciona un cliente…" />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {customers.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      </div>

      {!selectedCustomerId && (
        <EmptyState
          icon={ClipboardList}
          title="Selecciona un cliente"
          description="Elige un cliente para ver y editar su ficha."
        />
      )}

      {state === "loading" && <Loading rows={4} label="Cargando ficha…" />}

      {state === "error" && (
        <ErrorState
          description={error ?? "Error al cargar"}
          onRetry={() => setSelectedCustomerId(selectedCustomerId)}
        />
      )}

      {state === "ready" && record && (
        <div className="space-y-6">
          {/* Dynamic form */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                Ficha de {selectedCustomer?.name}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {record.schema.map((field) => (
                <div key={field.name} className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <Label>{field.label}</Label>
                    {field.required && (
                      <span className="text-xs text-destructive">*</span>
                    )}
                    <span className="text-[0.65rem] text-muted-foreground">
                      ({fieldTypeLabel(field.type)})
                    </span>
                    <div className="ml-auto flex items-center gap-1">
                      {field.ai_visible ? (
                        <Badge
                          variant="success"
                          className="cursor-default gap-0.5 text-[0.6rem]"
                        >
                          <Eye className="size-2.5" />
                          IA lee
                        </Badge>
                      ) : (
                        <Badge
                          variant="secondary"
                          className="cursor-default gap-0.5 text-[0.6rem]"
                        >
                          <EyeOff className="size-2.5" />
                          IA no lee
                        </Badge>
                      )}
                      {field.ai_editable && (
                        <Badge
                          variant="default"
                          className="cursor-default gap-0.5 text-[0.6rem]"
                        >
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

              <div className="flex items-center gap-3 pt-2">
                <Button onClick={handleSave} disabled={saving}>
                  {saving ? (
                    "Guardando…"
                  ) : (
                    <>
                      <Save className="size-4" />
                      Guardar cambios
                    </>
                  )}
                </Button>
                {saved && (
                  <span className="flex items-center gap-1 text-xs text-success">
                    <Check className="size-3.5" />
                    Guardado
                  </span>
                )}
                {saveError && (
                  <p className="text-xs text-destructive">{saveError}</p>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Audit history */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                Historial de cambios
              </CardTitle>
            </CardHeader>
            <CardContent>
              {record.audit.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Sin cambios registrados.
                </p>
              ) : (
                <div className="rounded-lg border border-border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Campo</TableHead>
                        <TableHead>Valor anterior</TableHead>
                        <TableHead>Nuevo valor</TableHead>
                        <TableHead className="w-24">Quién</TableHead>
                        <TableHead className="w-36">Cuándo</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {record.audit.map((entry, i) => {
                        const fieldLabel =
                          record.schema.find((f) => f.name === entry.field)
                            ?.label ?? entry.field;
                        return (
                          <TableRow key={i}>
                            <TableCell className="text-xs font-medium">
                              {fieldLabel}
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground">
                              {formatAuditValue(entry.old_value)}
                            </TableCell>
                            <TableCell className="text-xs">
                              {formatAuditValue(entry.new_value)}
                            </TableCell>
                            <TableCell>
                              {entry.changed_by === "ai" ? (
                                <Badge
                                  variant="default"
                                  className="gap-0.5 text-[0.6rem]"
                                >
                                  <Bot className="size-2.5" />
                                  IA
                                </Badge>
                              ) : (
                                <Badge
                                  variant="secondary"
                                  className="text-[0.6rem]"
                                >
                                  Humano
                                </Badge>
                              )}
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground tabular-nums">
                              {formatDate(entry.changed_at)}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
