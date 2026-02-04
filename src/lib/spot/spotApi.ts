// src/lib/spot/spotApi.ts
export type SpotOfferTemplateUnified = {
  core_id: string;

  timee_offer_id: string | null;
  ucare_offer_id: string | null;
  kaiteku_offer_id: string | null;

  template_title: string | null;
  work_description: string | null;
  cautions: string | null;
  auto_message: string | null;
  work_address: string | null;
  emergency_phone: string | null;
  smoking_policy: string | null;
  smoking_area_work: boolean | null;

  requires_license: boolean | null;
  required_licenses: string[] | null;

  benefits: string[] | null;
  belongings: string[] | null;
  internal_label: string | null;
  photo_urls: string[] | null;

  salary: string | null;
  fare: string | null;
  kaipoke_cs_id: string | null;

  start_at: string | null; // "HH:MM:SS" 想定
  end_at: string | null;

  status: string | null;

  timee_scraped_at: string | null;
  ucare_scraped_at: string | null;
  kaiteku_scraped_at: string | null;

  created_at: string;
  updated_at: string;
};

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`API Error: ${res.status} ${text}`);
  }
  return (await res.json()) as T;
}

export const spotApi = {
  listTemplates: (params?: { q?: string; limit?: number }) => {
    const sp = new URLSearchParams();
    if (params?.q) sp.set("q", params.q);
    if (params?.limit) sp.set("limit", String(params.limit));
    const qs = sp.toString();
    return api<SpotOfferTemplateUnified[]>(`/api/spot/templates${qs ? `?${qs}` : ""}`);
  },

  createTemplate: (payload: Partial<SpotOfferTemplateUnified>) =>
    api<SpotOfferTemplateUnified>(`/api/spot/templates`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  updateTemplate: (core_id: string, payload: Partial<SpotOfferTemplateUnified>) =>
    api<SpotOfferTemplateUnified>(`/api/spot/templates/${core_id}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),

  deleteTemplate: (core_id: string) =>
    api<{ ok: true }>(`/api/spot/templates/${core_id}`, { method: "DELETE" }),
};
