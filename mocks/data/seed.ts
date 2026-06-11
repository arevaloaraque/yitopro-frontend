/**
 * Seed PET Spa (peluquería/veterinaria canina y felina). Datos mock
 * realistas para que la validación de la UI se sienta real.
 *
 * `createSeedData()` devuelve objetos NUEVOS en cada llamada, de modo que el
 * store en memoria pueda reiniciarse sin compartir referencias.
 */
import type {
  Agent,
  Appointment,
  Business,
  Conversation,
  Customer,
  CustomerRecord,
  Message,
  Product,
  RecordField,
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
  services: import("@/lib/types").Service[];
  customers: Customer[];
  records: CustomerRecord[];
  conversations: Conversation[];
  messages: Message[];
  appointments: Appointment[];
  products: Product[];
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

  const services: SeedData["services"] = [
    {
      id: "svc_bano",
      business_id: BUSINESS_ID,
      name: "Baño",
      duration_minutes: 45,
      price: 12000,
      is_active: true,
    },
    {
      id: "svc_corte",
      business_id: BUSINESS_ID,
      name: "Corte",
      duration_minutes: 60,
      price: 18000,
      is_active: true,
    },
    {
      id: "svc_bano_corte",
      business_id: BUSINESS_ID,
      name: "Baño + Corte",
      duration_minutes: 90,
      price: 25000,
      is_active: true,
    },
  ];

  const customers: Customer[] = [
    {
      id: "cus_ana",
      business_id: BUSINESS_ID,
      name: "Ana Fuentes",
      phone: "+56981234567",
      created_at: "2026-03-02T14:10:00.000Z",
    },
    {
      id: "cus_pablo",
      business_id: BUSINESS_ID,
      name: "Pablo Reyes",
      phone: "+56982345678",
      created_at: "2026-03-18T19:25:00.000Z",
    },
    {
      id: "cus_caro",
      business_id: BUSINESS_ID,
      name: "Carolina Soto",
      phone: "+56983456789",
      created_at: "2026-04-05T11:40:00.000Z",
    },
    {
      id: "cus_diego",
      business_id: BUSINESS_ID,
      name: "Diego Rojas",
      phone: "+56984567890",
      created_at: "2026-04-21T16:05:00.000Z",
    },
    {
      id: "cus_javi",
      business_id: BUSINESS_ID,
      name: "Javiera Lagos",
      phone: "+56985678901",
      created_at: "2026-05-09T09:15:00.000Z",
    },
    {
      id: "cus_marce",
      business_id: BUSINESS_ID,
      name: "Marcela Díaz",
      phone: "+56986789012",
      created_at: "2026-05-27T20:50:00.000Z",
    },
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
    {
      id: "rec_caro",
      customer_id: "cus_caro",
      schema: PET_RECORD_SCHEMA,
      values: {
        pet_name: "Mateo",
        species: "perro",
        weight_kg: 28.0,
        vet_notes: "Raza grande. Corte sanitario cada 6 semanas.",
      },
      updated_at: "2026-05-12T17:45:00.000Z",
      audit: [],
    },
    {
      id: "rec_diego",
      customer_id: "cus_diego",
      schema: PET_RECORD_SCHEMA,
      values: {
        pet_name: "Kira",
        species: "perro",
        weight_kg: 8.0,
        vet_notes: "",
      },
      updated_at: "2026-04-25T12:00:00.000Z",
      audit: [],
    },
    {
      id: "rec_javi",
      customer_id: "cus_javi",
      schema: PET_RECORD_SCHEMA,
      values: {
        pet_name: "Toby",
        species: "perro",
        weight_kg: 18.3,
        vet_notes: "Piel sensible en patas.",
      },
      updated_at: "2026-05-15T08:20:00.000Z",
      audit: [],
    },
    {
      id: "rec_marce",
      customer_id: "cus_marce",
      schema: PET_RECORD_SCHEMA,
      values: {
        pet_name: "Nina",
        species: "gato",
        weight_kg: 3.8,
        vet_notes: "",
      },
      updated_at: "2026-05-28T21:10:00.000Z",
      audit: [],
    },
  ];

  const conversations: Conversation[] = [
    {
      id: "conv_01",
      business_id: BUSINESS_ID,
      customer_id: "cus_ana",
      status: "ai_active",
      active_agent: "agent_scheduling",
      detected_intent: "agendar_cita",
      last_message_at: "2026-06-11T13:42:00.000Z",
      unread: 2,
    },
    {
      id: "conv_02",
      business_id: BUSINESS_ID,
      customer_id: "cus_pablo",
      status: "human_handoff",
      active_agent: null,
      detected_intent: "reclamo",
      last_message_at: "2026-06-11T12:05:00.000Z",
      unread: 1,
    },
    {
      id: "conv_03",
      business_id: BUSINESS_ID,
      customer_id: "cus_caro",
      status: "ai_active",
      active_agent: "agent_orchestrator",
      detected_intent: "consulta_precio",
      last_message_at: "2026-06-11T11:18:00.000Z",
      unread: 0,
    },
    {
      id: "conv_04",
      business_id: BUSINESS_ID,
      customer_id: "cus_diego",
      status: "closed",
      active_agent: null,
      detected_intent: "agendar_cita",
      last_message_at: "2026-06-06T15:30:00.000Z",
      unread: 0,
    },
    {
      id: "conv_05",
      business_id: BUSINESS_ID,
      customer_id: "cus_javi",
      status: "ai_active",
      active_agent: "agent_products",
      detected_intent: "comprar_producto",
      last_message_at: "2026-06-11T10:02:00.000Z",
      unread: 3,
    },
    {
      id: "conv_06",
      business_id: BUSINESS_ID,
      customer_id: "cus_marce",
      status: "human_handoff",
      active_agent: null,
      detected_intent: "reclamo",
      last_message_at: "2026-06-10T18:47:00.000Z",
      unread: 1,
    },
    {
      id: "conv_07",
      business_id: BUSINESS_ID,
      customer_id: "cus_ana",
      status: "closed",
      active_agent: null,
      detected_intent: "consulta_horario",
      last_message_at: "2026-06-02T09:12:00.000Z",
      unread: 0,
    },
    {
      id: "conv_08",
      business_id: BUSINESS_ID,
      customer_id: "cus_caro",
      status: "ai_active",
      active_agent: "agent_scheduling",
      detected_intent: "reagendar_cita",
      last_message_at: "2026-06-11T09:55:00.000Z",
      unread: 1,
    },
  ];

  const messages: Message[] = [
    // conv_01 — Ana quiere agendar baño para Rocky
    msg(
      "msg_0101",
      "conv_01",
      "inbound",
      "customer",
      "Hola! Quiero agendar un baño para Rocky 🐶",
      "2026-06-11T13:38:00.000Z",
    ),
    msg(
      "msg_0102",
      "conv_01",
      "outbound",
      "ai",
      "¡Hola Ana! 🐾 Claro. Tengo cupos el sábado 13 a las 11:00 o 15:30. ¿Cuál te acomoda?",
      "2026-06-11T13:39:00.000Z",
    ),
    msg(
      "msg_0103",
      "conv_01",
      "inbound",
      "customer",
      "El sábado a las 11 está perfecto",
      "2026-06-11T13:41:00.000Z",
    ),
    msg(
      "msg_0104",
      "conv_01",
      "outbound",
      "ai",
      "¡Listo! Reservé el baño de Rocky para el sábado 13 a las 11:00. Te recuerdo usar shampoo hipoalergénico 😉",
      "2026-06-11T13:42:00.000Z",
    ),

    // conv_02 — Pablo, reclamo, escalado a humano
    msg(
      "msg_0201",
      "conv_02",
      "inbound",
      "customer",
      "Buenas, Luna volvió del corte con una zona mal rapada 😡",
      "2026-06-11T11:58:00.000Z",
    ),
    msg(
      "msg_0202",
      "conv_02",
      "outbound",
      "ai",
      "Lamento mucho lo ocurrido con Luna. Voy a derivar tu caso a una persona del equipo para resolverlo.",
      "2026-06-11T12:00:00.000Z",
    ),
    msg(
      "msg_0203",
      "conv_02",
      "outbound",
      "human",
      "Hola Pablo, soy Daniela de PET Spa. Te ofrezco una sesión de corrección sin costo esta semana. ¿Te parece?",
      "2026-06-11T12:05:00.000Z",
    ),

    // conv_03 — Carolina consulta precios
    msg(
      "msg_0301",
      "conv_03",
      "inbound",
      "customer",
      "Cuánto sale el baño + corte para un perro grande?",
      "2026-06-11T11:15:00.000Z",
    ),
    msg(
      "msg_0302",
      "conv_03",
      "outbound",
      "ai",
      "El servicio Baño + Corte tiene un valor de $25.000 y dura unos 90 minutos. Para Mateo es ideal 🐕",
      "2026-06-11T11:18:00.000Z",
    ),

    // conv_04 — Diego, conversación cerrada
    msg(
      "msg_0401",
      "conv_04",
      "inbound",
      "customer",
      "Quiero corte para Kira el jueves",
      "2026-06-06T15:20:00.000Z",
    ),
    msg(
      "msg_0402",
      "conv_04",
      "outbound",
      "ai",
      "Agendado el corte de Kira para el jueves a las 16:00. ¡Gracias Diego!",
      "2026-06-06T15:25:00.000Z",
    ),
    msg(
      "msg_0403",
      "conv_04",
      "inbound",
      "customer",
      "Genial, gracias!",
      "2026-06-06T15:30:00.000Z",
    ),

    // conv_05 — Javiera compra producto
    msg(
      "msg_0501",
      "conv_05",
      "inbound",
      "customer",
      "Tienen shampoo para piel sensible?",
      "2026-06-11T09:50:00.000Z",
    ),
    msg(
      "msg_0502",
      "conv_05",
      "outbound",
      "ai",
      "¡Sí! Tenemos Shampoo hipoalergénico a $8.990. ¿Quieres que lo sume a tu próxima visita o lo despachamos?",
      "2026-06-11T09:55:00.000Z",
    ),
    msg(
      "msg_0503",
      "conv_05",
      "inbound",
      "customer",
      "Súmalo a la próxima visita de Toby porfa",
      "2026-06-11T09:58:00.000Z",
    ),
    msg(
      "msg_0504",
      "conv_05",
      "inbound",
      "customer",
      "Y cuánto cuesta el cepillo deslanador?",
      "2026-06-11T10:02:00.000Z",
    ),

    // conv_06 — Marcela reclamo, handoff
    msg(
      "msg_0601",
      "conv_06",
      "inbound",
      "customer",
      "Nina quedó con olor raro después del baño",
      "2026-06-10T18:40:00.000Z",
    ),
    msg(
      "msg_0602",
      "conv_06",
      "outbound",
      "human",
      "Hola Marcela, revisemos qué pasó. ¿Podrías traerla mañana para una revisión sin costo?",
      "2026-06-10T18:47:00.000Z",
    ),

    // conv_07 — Ana consulta horario (cerrada)
    msg(
      "msg_0701",
      "conv_07",
      "inbound",
      "customer",
      "A qué hora abren los domingos?",
      "2026-06-02T09:08:00.000Z",
    ),
    msg(
      "msg_0702",
      "conv_07",
      "outbound",
      "ai",
      "Los domingos atendemos de 10:00 a 14:00 🐾",
      "2026-06-02T09:12:00.000Z",
    ),

    // conv_08 — Carolina reagenda
    msg(
      "msg_0801",
      "conv_08",
      "inbound",
      "customer",
      "Necesito mover la cita de Mateo del sábado",
      "2026-06-11T09:50:00.000Z",
    ),
    msg(
      "msg_0802",
      "conv_08",
      "outbound",
      "ai",
      "Sin problema. Tengo disponible el domingo 14 a las 12:00. ¿Te sirve?",
      "2026-06-11T09:55:00.000Z",
    ),
  ];

  const appointments: Appointment[] = [
    {
      id: "apt_01",
      business_id: BUSINESS_ID,
      service_id: "svc_bano",
      customer_id: "cus_ana",
      start: "2026-06-13T14:00:00.000Z",
      end: "2026-06-13T14:45:00.000Z",
      status: "scheduled",
      created_by: "ai",
      notes: "Usar shampoo hipoalergénico (Rocky es alérgico).",
    },
    {
      id: "apt_02",
      business_id: BUSINESS_ID,
      service_id: "svc_bano_corte",
      customer_id: "cus_caro",
      start: "2026-06-14T15:00:00.000Z",
      end: "2026-06-14T16:30:00.000Z",
      status: "scheduled",
      created_by: "ai",
      notes: null,
    },
    {
      id: "apt_03",
      business_id: BUSINESS_ID,
      service_id: "svc_corte",
      customer_id: "cus_diego",
      start: "2026-06-05T20:00:00.000Z",
      end: "2026-06-05T21:00:00.000Z",
      status: "completed",
      created_by: "human",
      notes: null,
    },
    {
      id: "apt_04",
      business_id: BUSINESS_ID,
      service_id: "svc_bano",
      customer_id: "cus_javi",
      start: "2026-06-08T13:00:00.000Z",
      end: "2026-06-08T13:45:00.000Z",
      status: "cancelled",
      created_by: "ai",
      notes: "Cliente canceló por viaje.",
    },
    {
      id: "apt_05",
      business_id: BUSINESS_ID,
      service_id: "svc_bano_corte",
      customer_id: "cus_marce",
      start: "2026-06-15T16:00:00.000Z",
      end: "2026-06-15T17:30:00.000Z",
      status: "scheduled",
      created_by: "human",
      notes: null,
    },
  ];

  const products: Product[] = [
    {
      id: "prod_shampoo",
      business_id: BUSINESS_ID,
      name: "Shampoo hipoalergénico 250ml",
      price: 8990,
      stock: 24,
      sellable_via_whatsapp: true,
      is_active: true,
    },
    {
      id: "prod_snacks",
      business_id: BUSINESS_ID,
      name: "Snacks dentales (pack 12)",
      price: 4990,
      stock: 60,
      sellable_via_whatsapp: true,
      is_active: true,
    },
    {
      id: "prod_cepillo",
      business_id: BUSINESS_ID,
      name: "Cepillo deslanador",
      price: 12990,
      stock: 8,
      sellable_via_whatsapp: true,
      is_active: true,
    },
    {
      id: "prod_perfume",
      business_id: BUSINESS_ID,
      name: "Perfume canino",
      price: 6990,
      stock: 0,
      sellable_via_whatsapp: true,
      is_active: false,
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

  return {
    business,
    services,
    customers,
    records,
    conversations,
    messages,
    appointments,
    products,
    agents,
  };
}

function msg(
  id: string,
  conversation_id: string,
  direction: Message["direction"],
  sender: Message["sender"],
  text: string,
  created_at: string,
): Message {
  return {
    id,
    conversation_id,
    direction,
    sender,
    text,
    created_at,
    status: direction === "outbound" ? "delivered" : "read",
  };
}
