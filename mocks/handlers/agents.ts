import { http, HttpResponse } from "msw";

import type { Agent } from "@/lib/types";

import { db } from "../data/store";
import { API, notFound } from "./util";

export const agentHandlers = [
  http.get(`${API}/agents`, () => {
    return HttpResponse.json(db.agents);
  }),

  http.patch(`${API}/agents/:id`, async ({ params, request }) => {
    const agent = db.agents.find((a) => a.id === params.id);
    if (!agent) return notFound();
    const patch = (await request.json()) as Partial<Agent>;
    Object.assign(agent, patch);
    return HttpResponse.json(agent);
  }),
];
