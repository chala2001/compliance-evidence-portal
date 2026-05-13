import axios from "axios";

const api = axios.create({
  baseURL: "http://localhost:8000/api",
});

export const frameworksApi = {
  list: () => api.get("/frameworks/").then((r) => r.data),
};

export const controlsApi = {
  list: (frameworkId?: number) =>
    api
      .get("/controls/", { params: frameworkId ? { framework_id: frameworkId } : {} })
      .then((r) => r.data),
};

export const evidenceApi = {
  list: () => api.get("/evidence/").then((r) => r.data),
  get: (id: number) => api.get(`/evidence/${id}`).then((r) => r.data),
  create: (formData: FormData) =>
    api.post("/evidence/", formData, {
      headers: { "Content-Type": "multipart/form-data" },
    }).then((r) => r.data),
  delete: (id: number) => api.delete(`/evidence/${id}`),
};

export const submissionsApi = {
  list: () => api.get("/submissions/").then((r) => r.data),
  create: (data: { evidence_id: number; submitted_by: string; notes?: string }) =>
    api.post("/submissions/", data).then((r) => r.data),
};

export const agentApi = {
  run: (prompt: string) =>
    api.post("/agent/run", { prompt }).then((r) => r.data),
};
