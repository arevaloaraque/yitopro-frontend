import { http, HttpResponse } from "msw";

import type { Business, OnboardingState } from "@/lib/types";

import { db } from "../data/store";
import { API } from "./util";

export const businessHandlers = [
  http.get(`${API}/business`, () => {
    return HttpResponse.json(db.business);
  }),

  http.patch(`${API}/business`, async ({ request }) => {
    const patch = (await request.json()) as Partial<Business>;
    Object.assign(db.business, patch);
    if (patch.assistant_config) {
      db.business.assistant_config = {
        ...db.business.assistant_config,
        ...patch.assistant_config,
      };
    }
    return HttpResponse.json(db.business);
  }),

  http.get(`${API}/business/onboarding`, () => {
    const state: OnboardingState = {
      status: db.business.onboarding_status,
      steps: [
        { key: "business_info", label: "Datos del negocio", completed: true },
        { key: "services", label: "Servicios", completed: db.services.length > 0 },
        { key: "assistant", label: "Asistente de IA", completed: true },
        {
          key: "whatsapp",
          label: "Conexión de WhatsApp",
          completed: db.business.onboarding_status === "completed",
        },
      ],
    };
    return HttpResponse.json(state);
  }),
];
