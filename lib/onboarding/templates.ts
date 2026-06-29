import type { Agent, Product, RecordField, Service } from "@/lib/types";

export interface IndustryTemplate {
  id: string;
  label: string;
  description: string;
  icon: string;
  services: Omit<Service, "id" | "business_id">[];
  products: Omit<Product, "id" | "business_id">[];
  recordFields: RecordField[];
  agents: Omit<Agent, "id" | "business_id">[];
}

export const INDUSTRY_TEMPLATES: IndustryTemplate[] = [
  {
    id: "pet_grooming",
    label: "Peluquería canina / felina",
    description:
      "Baño, corte, productos de cuidado y fichas de mascotas con datos veterinarios.",
    icon: "🐾",
    services: [
      { name: "Baño", duration_minutes: 45, price: 12000, is_active: true },
      { name: "Corte", duration_minutes: 60, price: 18000, is_active: true },
      {
        name: "Baño + Corte",
        duration_minutes: 90,
        price: 25000,
        is_active: true,
      },
    ],
    products: [
      {
        name: "Shampoo hipoalergénico 250ml",
        price: 8990,
        stock: 24,
        sellable_via_whatsapp: true,
        is_active: true,
      },
      {
        name: "Snacks dentales (pack 12)",
        price: 4990,
        stock: 60,
        sellable_via_whatsapp: true,
        is_active: true,
      },
      {
        name: "Cepillo deslanador",
        price: 12990,
        stock: 8,
        sellable_via_whatsapp: true,
        is_active: true,
      },
    ],
    recordFields: [
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
        ai_visible: false,
        ai_editable: false,
      },
    ],
    agents: [
      {
        name: "Agendamiento",
        type: "scheduling",
        is_active: true,
        autonomy: "full",
        skills: ["agendar", "reagendar", "cancelar"],
        tools: ["calendario", "servicios"],
        escalation_rules: [
          { condition: "sin_cupos", action: "ofrecer_lista_espera" },
        ],
      },
      {
        name: "Ventas",
        type: "sales",
        is_active: true,
        autonomy: "supervised",
        skills: ["consultar_stock", "tomar_pedido"],
        tools: ["catalogo", "inventario"],
        escalation_rules: [
          { condition: "sin_stock", action: "ofrecer_alternativa" },
        ],
      },
      {
        name: "Fichas",
        type: "records",
        is_active: true,
        autonomy: "supervised",
        skills: ["leer_ficha", "actualizar_ficha"],
        tools: ["fichas"],
        escalation_rules: [
          { condition: "dato_sensible", action: "requiere_humano" },
        ],
      },
    ],
  },
  {
    id: "barber_shop",
    label: "Barbería",
    description:
      "Corte de pelo, barba, productos de cuidado capilar y fichas de cliente con preferencias.",
    icon: "💈",
    services: [
      { name: "Corte de pelo", duration_minutes: 30, price: 15000, is_active: true },
      { name: "Barba", duration_minutes: 20, price: 10000, is_active: true },
      {
        name: "Corte + Barba",
        duration_minutes: 45,
        price: 22000,
        is_active: true,
      },
      {
        name: "Tratamiento capilar",
        duration_minutes: 40,
        price: 18000,
        is_active: true,
      },
    ],
    products: [
      {
        name: "Pomada fijación fuerte 100ml",
        price: 12990,
        stock: 15,
        sellable_via_whatsapp: true,
        is_active: true,
      },
      {
        name: "Aceite para barba 50ml",
        price: 8990,
        stock: 20,
        sellable_via_whatsapp: true,
        is_active: true,
      },
      {
        name: "Shampoo anticaspa 250ml",
        price: 10990,
        stock: 12,
        sellable_via_whatsapp: true,
        is_active: true,
      },
    ],
    recordFields: [
      {
        name: "hair_type",
        label: "Tipo de pelo",
        type: "select",
        required: true,
        ai_visible: true,
        ai_editable: false,
        options: ["liso", "ondulado", "rizado", "afro"],
      },
      {
        name: "preferred_style",
        label: "Estilo preferido",
        type: "text",
        required: false,
        ai_visible: true,
        ai_editable: true,
      },
      {
        name: "allergies",
        label: "Alergias",
        type: "text",
        required: false,
        ai_visible: true,
        ai_editable: true,
      },
      {
        name: "last_visit",
        label: "Última visita",
        type: "date",
        required: false,
        ai_visible: true,
        ai_editable: true,
      },
    ],
    agents: [
      {
        name: "Agendamiento",
        type: "scheduling",
        is_active: true,
        autonomy: "full",
        skills: ["agendar", "reagendar", "cancelar"],
        tools: ["calendario", "servicios"],
        escalation_rules: [
          { condition: "sin_cupos", action: "ofrecer_lista_espera" },
        ],
      },
      {
        name: "Ventas",
        type: "sales",
        is_active: true,
        autonomy: "supervised",
        skills: ["consultar_stock", "tomar_pedido"],
        tools: ["catalogo", "inventario"],
        escalation_rules: [
          { condition: "sin_stock", action: "ofrecer_alternativa" },
        ],
      },
    ],
  },
  {
    id: "wellness_spa",
    label: "Spa / Bienestar",
    description:
      "Masajes, tratamientos faciales, productos de bienestar y fichas de salud del cliente.",
    icon: "🧖",
    services: [
      {
        name: "Masaje relajante",
        duration_minutes: 60,
        price: 35000,
        is_active: true,
      },
      {
        name: "Masaje descontracturante",
        duration_minutes: 60,
        price: 40000,
        is_active: true,
      },
      {
        name: "Facial básico",
        duration_minutes: 45,
        price: 28000,
        is_active: true,
      },
      {
        name: "Circuito completo",
        duration_minutes: 120,
        price: 65000,
        is_active: true,
      },
    ],
    products: [
      {
        name: "Crema hidratante facial 50ml",
        price: 18990,
        stock: 10,
        sellable_via_whatsapp: true,
        is_active: true,
      },
      {
        name: "Aceite esencial lavanda 30ml",
        price: 9990,
        stock: 15,
        sellable_via_whatsapp: true,
        is_active: true,
      },
      {
        name: "Exfoliante corporal 200ml",
        price: 14990,
        stock: 8,
        sellable_via_whatsapp: true,
        is_active: true,
      },
    ],
    recordFields: [
      {
        name: "health_conditions",
        label: "Condiciones de salud",
        type: "text",
        required: true,
        ai_visible: true,
        ai_editable: false,
      },
      {
        name: "pressure_preference",
        label: "Presión preferida",
        type: "select",
        required: false,
        ai_visible: true,
        ai_editable: true,
        options: ["suave", "media", "fuerte"],
      },
      {
        name: "focus_areas",
        label: "Zonas a enfocar",
        type: "text",
        required: false,
        ai_visible: true,
        ai_editable: true,
      },
      {
        name: "skin_type",
        label: "Tipo de piel",
        type: "select",
        required: false,
        ai_visible: true,
        ai_editable: false,
        options: ["seca", "grasa", "mixta", "sensible"],
      },
    ],
    agents: [
      {
        name: "Agendamiento",
        type: "scheduling",
        is_active: true,
        autonomy: "full",
        skills: ["agendar", "reagendar", "cancelar"],
        tools: ["calendario", "servicios"],
        escalation_rules: [
          { condition: "sin_cupos", action: "ofrecer_lista_espera" },
        ],
      },
      {
        name: "Fichas",
        type: "records",
        is_active: true,
        autonomy: "supervised",
        skills: ["leer_ficha", "actualizar_ficha"],
        tools: ["fichas"],
        escalation_rules: [
          { condition: "dato_sensible", action: "requiere_humano" },
        ],
      },
    ],
  },
];
