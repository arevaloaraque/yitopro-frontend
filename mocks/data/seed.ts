/**
 * Seed PET Spa (peluquería/veterinaria canina y felina). Datos mock realistas
 * para los dominios que SIGUEN mockeados (el backend aún no expone su shape):
 * negocio/onboarding, fichas (records) y agentes. El resto (servicios*,
 * productos, clientes, citas, conversaciones) ya va al backend real.
 *
 * (*) `services` se conserva solo porque el endpoint mock de onboarding marca
 * el paso "Servicios" como completo según `db.services.length`.
 *
 * `createSeedData()` devuelve objetos NUEVOS en cada llamada, de modo que el
 * store en memoria pueda reiniciarse sin compartir referencias.
 */
import type {
  Agent,
  Business,
  CustomerRecord,
  RecordField,
  Service,
} from "@/lib/types";

export const BUSINESS_ID = "biz_petspa";

/** Schema de ficha compartido por todas las mascotas de PET Spa. */
const PET_RECORD_SCHEMA: RecordField[] = [
  {
    name: "pet_name",
    label: "Nombre de la mascota",
    type: "text",
    required: true,
    ai_visible: true,
    ai_editable: true,
  },
  {
    name: "species",
    label: "Especie",
    type: "select",
    required: true,
    ai_visible: true,
    ai_editable: false,
    options: ["perro", "gato"],
  },
  {
    name: "weight_kg",
    label: "Peso (kg)",
    type: "number",
    required: false,
    ai_visible: true,
    ai_editable: true,
  },
  {
    name: "vet_notes",
    label: "Notas veterinarias",
    type: "text",
    required: false,
    // Sensible: el agente de IA NO debe leer ni editar las notas del vet.
    ai_visible: false,
    ai_editable: false,
  },
];

export interface SeedData {
  business: Business;
  services: Service[];
  records: CustomerRecord[];
  agents: Agent[];
}

export function createSeedData(): SeedData {
  const business: Business = {
    id: BUSINESS_ID,
    name: "PET Spa",
    country: "CL",
    currency: "CLP",
    language: "es",
    timezone: "America/Santiago",
    is_active: true,
    onboarding_status: "completed",
    assistant_config: {
      display_name: "Maya",
      tone: "casual",
      language: "es",
      welcome_message:
        "¡Hola! 🐾 Soy Maya, la asistente de PET Spa. ¿En qué te ayudo hoy: agendar baño, corte o consultar precios?",
      autonomous: true,
    },
  };

  // Solo para el check de onboarding (paso "Servicios" completo).
  const services: Service[] = [
    { id: "svc_bano", business_id: BUSINESS_ID, name: "Baño", duration_minutes: 45, price: 12000, is_active: true },
    { id: "svc_corte", business_id: BUSINESS_ID, name: "Corte", duration_minutes: 60, price: 18000, is_active: true },
  ];

  const records: CustomerRecord[] = [
    {
      id: "rec_ana",
      customer_id: "cus_ana",
      schema: PET_RECORD_SCHEMA,
      values: {
        pet_name: "Rocky",
        species: "perro",
        weight_kg: 12.5,
        vet_notes: "Alérgico a shampoo con fragancia fuerte. Usar hipoalergénico.",
      },
      updated_at: "2026-05-30T13:00:00.000Z",
      audit: [
        {
          field: "weight_kg",
          old_value: 11.8,
          new_value: 12.5,
          changed_by: "human",
          changed_at: "2026-05-30T13:00:00.000Z",
        },
      ],
    },
    {
      id: "rec_pablo",
      customer_id: "cus_pablo",
      schema: PET_RECORD_SCHEMA,
      values: {
        pet_name: "Luna",
        species: "gato",
        weight_kg: 4.2,
        vet_notes: "Muy nerviosa. Requiere manejo con paciencia.",
      },
      updated_at: "2026-04-02T10:30:00.000Z",
      audit: [],
    },
  ];

  const agents: Agent[] = [
    {
      id: "agent_orchestrator",
      business_id: BUSINESS_ID,
      name: "Orquestador",
      type: "orchestrator",
      is_active: true,
      autonomy: "supervised",
      skills: ["detectar_intencion", "derivar_agente"],
      tools: ["routing"],
      escalation_rules: [{ condition: "cliente_molesto", action: "handoff_humano" }],
    },
    {
      id: "agent_scheduling",
      business_id: BUSINESS_ID,
      name: "Agendamiento",
      type: "scheduling",
      is_active: true,
      autonomy: "full",
      skills: ["agendar", "reagendar", "cancelar"],
      tools: ["calendario", "servicios"],
      escalation_rules: [{ condition: "sin_cupos", action: "ofrecer_lista_espera" }],
    },
    {
      id: "agent_products",
      business_id: BUSINESS_ID,
      name: "Productos",
      type: "products",
      is_active: true,
      autonomy: "supervised",
      skills: ["consultar_stock", "tomar_pedido"],
      tools: ["catalogo", "inventario"],
      escalation_rules: [{ condition: "sin_stock", action: "ofrecer_alternativa" }],
    },
    {
      id: "agent_records",
      business_id: BUSINESS_ID,
      name: "Fichas",
      type: "records",
      is_active: true,
      autonomy: "supervised",
      skills: ["leer_ficha", "actualizar_ficha"],
      tools: ["fichas"],
      escalation_rules: [{ condition: "dato_sensible", action: "requiere_humano" }],
    },
    {
      id: "agent_support",
      business_id: BUSINESS_ID,
      name: "Soporte",
      type: "support",
      is_active: false,
      autonomy: "manual",
      skills: ["responder_faq"],
      tools: ["faq"],
      escalation_rules: [{ condition: "reclamo", action: "handoff_humano" }],
    },
  ];

  return { business, services, records, agents };
}
