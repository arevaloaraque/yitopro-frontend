# SSE en tiempo real para Customers + Services (backend + frontend)

**Fecha:** 2026-07-11
**Repos:** `yitopro-backend` (emite) · `yitopro-frontend` (consume)
**Objetivo:** que las pantallas de Clientes (lista + drawer de ficha/notas) y Servicios dejen de quedarse estáticas cuando otro operador, el onboarding, o la IA (WhatsApp) cambian datos. Hoy no existe ningún evento de estos dominios en **ningún** repo — es net-new end-to-end.

Fuera de alcance (confirmado con el usuario): agentes; `cliente_eliminado` (no hay write-path de borrado); cambios vía Django admin (no pasan por estos seams); log de auditoría durable; refresco del badge de conteo de conversaciones en la lista de clientes.

## Catálogo de eventos

Nombres en Spanish snake_case (contrato con el frontend). Payloads solo IDs + datos operativos mínimos — **nunca PII** (nombres, teléfonos, emails, cuerpos de nota, valores de ficha). IDs enteros en el backend; el frontend coacciona `*_id`→string automáticamente en `mapSseEnvelope`.

| Evento                 | Payload                                        | Emit site (backend)                                                                                           | Disparadores                                                   |
| ---------------------- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| `cliente_creado`       | `{customer_id, origin}`                        | `apps/records/services.py::get_or_create_customer`, guardado en `created=True`, tras el bloque `use_business` | operador (POST /customers/) **y** WhatsApp inbound (auto-alta) |
| `cliente_actualizado`  | `{customer_id, fields}`                        | `apps/customers/api.py::update_customer`, tras `customer.save()`                                              | operador (PATCH)                                               |
| `ficha_actualizada`    | `{customer_id, record_id, changed_by, fields}` | `apps/records/services.py::update_record`, tras el bloque atómico                                             | operador **y** IA (mid-chat)                                   |
| `nota_creada`          | `{customer_id, note_id, author}`               | `apps/customers/api.py::create_customer_note`, tras `create()`                                                | operador                                                       |
| `servicio_creado`      | `{service_id, active}`                         | `apps/appointments/api.py::create_service`, tras `create()`                                                   | operador + onboarding                                          |
| `servicio_actualizado` | `{service_id, active}`                         | `apps/appointments/api.py::update_service`, tras `save()`                                                     | operador (cubre precio/duración/nombre + toggle)               |
| `servicio_eliminado`   | `{service_id}`                                 | `apps/appointments/api.py::delete_service`, tras `delete()` exitoso (no en el 409)                            | operador                                                       |

`origin` ∈ `{"operator","whatsapp"}`. `changed_by` ∈ `{"human","ai"}` (colapsa `user:<id>`→`human`). `fields` = nombres de campos cambiados (nunca valores).

## Backend

1. Añadir 7 constantes a `RealtimeEvent` (`apps/realtime/events.py`): `CLIENTE_CREADO`, `CLIENTE_ACTUALIZADO`, `FICHA_ACTUALIZADA`, `NOTA_CREADA`, `SERVICIO_CREADO`, `SERVICIO_ACTUALIZADO`, `SERVICIO_ELIMINADO`.
2. **Regla dura** (CLAUDE.md): `publish_event(business_id, RealtimeEvent.X, payload)` best-effort, **después del commit**, fuera de `use_business`/`atomic`. `business_id` explícito.
   - `get_or_create_customer`: añadir param `origin="operator"`; capturar `(customer, created)` dentro de `use_business`, emitir **después** del bloque si `created`. El caller de WhatsApp (`apps/conversations/services.py`) pasa `origin="whatsapp"`.
   - `update_record`: capturar `changed_fields`/`customer_id` dentro del `atomic`, emitir **después** del bloque si hubo cambios.
   - `update_customer`, `create_customer_note`, `create_service`, `update_service`, `delete_service`: sin `atomic` abierto (autocommit) → emitir justo después del write con `request.business_id`.
3. Sin extraer capa de servicio para services/customers-API (YAGNI: no hay `atomic` que envenenar; emit inline tras el write es correcto).

### Tests backend (pytest, TDD)

Patrón canónico (`apps/handoff/tests/test_reactivation_events.py`): `with patch("apps.<productor>.publish_event") as pub:` → ejecutar → filtrar `[c for c in pub.call_args_list if c.args[1] == RealtimeEvent.X]` → assert `calls[0].args[2] == {payload}`. Un test por evento + verificar que un fallo de Redis no rompe la mutación (best-effort ya cubierto en `test_publish.py`). Patch en el **módulo productor** (donde se importa), no en `apps.realtime.events`.

## Frontend

1. **`lib/types/events.ts`**: 7 tipos nuevos al `SSEEventType`, sus `SSEEventBase<...>` y al union `SSEEvent`. Payloads con `*_id: string`.
2. **`lib/notifications/notifications-context.tsx`**: estos 7 son **data-sync, no alertas**. `toNotification` pasa a `AppNotification | null` y devuelve `null` para ellos (sin toast, sin campana). El provider ignora `null`. Motivo: son mayormente eco de la propia acción del operador → toast propio = ruido; `cliente_creado` por WhatsApp ya viene con `mensaje_recibido` que sí notifica.
3. **Pantallas** (patrón `subscribeToEvents` + `searchRef` + suscripción única, como products/appointments):
   - `app/(app)/customers/page.tsx`: `cliente_creado`/`cliente_actualizado` → refetch lista.
   - `components/customers/customer-drawer.tsx`: solo si `event.data.customer_id === customerId` abierto. Refactor del loader a `reload()` callable. Refetch dirigido con **guarda anti-clobber**: `nota_creada`→refetch notas (siempre seguro); `ficha_actualizada`→re-aplica record **solo si no hay ediciones sin guardar**; `cliente_actualizado`→re-aplica core **solo si no dirty**.
   - `app/(app)/services/page.tsx`: `servicio_creado|actualizado|eliminado` → refetch lista.
4. Sin cambios en `mapSseEnvelope` (la coacción `*_id`→string es genérica).

### Echo

No hay campo de origen por-operador ni `correlation_id` propagado. Un refetch redundante tras la propia mutación es la norma aceptada del repo (appointments ya lo hace). No se construye dedup.

### Tests frontend (vitest, TDD)

- `sse.test.ts`: casos de envelope para los nuevos eventos (mapeo `event`→`type`, `*_id`→string).
- `notifications`: un data-sync event no produce toast ni entrada en la campana.
- customers page: emitir `cliente_creado` → `searchCustomers` se vuelve a llamar.
- services page: emitir `servicio_creado` → `searchServices` se vuelve a llamar.
- drawer: `ficha_actualizada` del cliente abierto (no dirty) → `getRecord` se re-llama; `nota_creada` → `getCustomerNotes` se re-llama; con edición sin guardar, la ficha **no** se pisa.

## Verificación

- Backend: `pytest` de los apps tocados (customers, records, appointments, realtime).
- Frontend: `npm run lint`, `npm run typecheck`, `npm run test` limpios.
