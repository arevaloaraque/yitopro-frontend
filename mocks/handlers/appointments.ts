import { http, HttpResponse } from "msw";

import type { Appointment, AppointmentAuditEntry } from "@/lib/types";

import { emitMockEvent, nextEventId } from "@/lib/sse";

import { BUSINESS_ID } from "../data/seed";
import { db, genId } from "../data/store";
import { API, notFound } from "./util";

function pushAudit(appointmentId: string, event: AppointmentAuditEntry["event"], details: string | null): void {
  db.appointmentAudit.push({
    id: genId("aud"),
    appointment_id: appointmentId,
    event,
    timestamp: new Date().toISOString(),
    details,
  });
}

export const appointmentHandlers = [
  http.get(`${API}/appointments`, ({ request }) => {
    const url = new URL(request.url);
    const status = url.searchParams.get("status");
    const from = url.searchParams.get("from");
    const to = url.searchParams.get("to");
    const customerId = url.searchParams.get("customer_id");

    let result = db.appointments;
    if (status) result = result.filter((a) => a.status === status);
    if (customerId) result = result.filter((a) => a.customer_id === customerId);
    if (from) result = result.filter((a) => a.start >= from);
    if (to) result = result.filter((a) => a.start <= to);

    return HttpResponse.json({ items: result, count: result.length });
  }),

  http.post(`${API}/appointments`, async ({ request }) => {
    const input = (await request.json()) as {
      service_id: string;
      customer_id: string;
      start: string;
      end: string;
      notes?: string | null;
    };
    const appointment: Appointment = {
      id: genId("apt"),
      business_id: BUSINESS_ID,
      service_id: input.service_id,
      customer_id: input.customer_id,
      start: input.start,
      end: input.end,
      status: "scheduled",
      // Una cita creada desde el panel la origina un humano.
      created_by: "human",
      notes: input.notes ?? null,
    };
    db.appointments.push(appointment);

    pushAudit(appointment.id, "created", "Cita creada manualmente desde el panel.");

    emitMockEvent({
      id: nextEventId(),
      type: "nueva_cita",
      emitted_at: new Date().toISOString(),
      data: {
        appointment_id: appointment.id,
        customer_id: appointment.customer_id,
        service_id: appointment.service_id,
        start: appointment.start,
        created_by: appointment.created_by,
      },
    });

    return HttpResponse.json(appointment, { status: 201 });
  }),

  http.post(`${API}/appointments/:id/cancel`, async ({ params, request }) => {
    const appointment = db.appointments.find((a) => a.id === params.id);
    if (!appointment) return notFound();
    const body = (await request.json().catch(() => ({}))) as {
      reason?: string | null;
    };
    appointment.status = "cancelled";
    if (body.reason) appointment.notes = body.reason;

    pushAudit(appointment.id, "cancelled", body.reason ?? null);

    emitMockEvent({
      id: nextEventId(),
      type: "cita_cancelada",
      emitted_at: new Date().toISOString(),
      data: {
        appointment_id: appointment.id,
        customer_id: appointment.customer_id,
        reason: body.reason ?? null,
      },
    });

    return HttpResponse.json(appointment);
  }),

  http.post(`${API}/appointments/:id/reschedule`, async ({ params, request }) => {
    const appointment = db.appointments.find((a) => a.id === params.id);
    if (!appointment) return notFound();
    const body = (await request.json()) as { start: string; end: string };
    const oldStart = appointment.start;
    appointment.start = body.start;
    appointment.end = body.end;
    appointment.status = "rescheduled";

    pushAudit(
      appointment.id,
      "rescheduled",
      `De ${new Date(oldStart).toLocaleString("es-CL")} a ${new Date(appointment.start).toLocaleString("es-CL")}`,
    );

    emitMockEvent({
      id: nextEventId(),
      type: "cita_reagendada",
      emitted_at: new Date().toISOString(),
      data: {
        appointment_id: appointment.id,
        customer_id: appointment.customer_id,
        old_start: oldStart,
        new_start: appointment.start,
      },
    });

    return HttpResponse.json(appointment);
  }),

  http.get(`${API}/appointments/:id/history`, ({ params }) => {
    const entries = db.appointmentAudit.filter(
      (e) => e.appointment_id === params.id,
    );
    return HttpResponse.json({ items: entries, count: entries.length });
  }),
];
