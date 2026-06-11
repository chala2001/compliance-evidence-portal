import axios from "axios";

const api = axios.create({
  baseURL: "http://localhost:8000/api",
});

export const productsApi = {
  list: () => api.get("/products/").then((r) => r.data),
  create: (data: { name: string; description?: string }) =>
    api.post("/products/", data).then((r) => r.data),
  update: (id: number, data: { name?: string; description?: string }) =>
    api.patch(`/products/${id}`, data).then((r) => r.data),
  delete: (id: number) => api.delete(`/products/${id}`),
};

export const frameworksApi = {
  list: (productId?: number) =>
    api
      .get("/frameworks/", { params: productId ? { product_id: productId } : {} })
      .then((r) => r.data),
  create: (data: { product_id: number; name: string; description?: string }) =>
    api.post("/frameworks/", data).then((r) => r.data),
  update: (id: number, data: { name?: string; description?: string }) =>
    api.patch(`/frameworks/${id}`, data).then((r) => r.data),
  delete: (id: number) => api.delete(`/frameworks/${id}`),
};

export const controlsApi = {
  list: (frameworkId?: number) =>
    api
      .get("/controls/", { params: frameworkId ? { framework_id: frameworkId } : {} })
      .then((r) => r.data),
  create: (data: { framework_id: number; control_ref: string; title: string; description?: string }) =>
    api.post("/controls/", data).then((r) => r.data),
  update: (id: number, data: { control_ref?: string; title?: string; description?: string }) =>
    api.patch(`/controls/${id}`, data).then((r) => r.data),
  delete: (id: number) => api.delete(`/controls/${id}`),
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
  run: (data: { prompt: string; control_id?: number; title?: string; region_hint?: string }) =>
    api.post("/agent/run", data).then((r) => r.data),
  startRun: (data: { prompt: string; control_id?: number; title?: string; region_hint?: string; max_steps_per_task?: number }) =>
    api.post("/agent/start-run", data).then((r) => r.data),
  getRun: (runId: string) => api.get(`/agent/runs/${runId}`).then((r) => r.data),
  modifyNext: (runId: string, additional_instruction: string) =>
    api.post(`/agent/runs/${runId}/modify-next`, { additional_instruction }).then((r) => r.data),
  openPortal: (data: { url: string }) =>
    api.post("/agent/open-portal", data).then((r) => r.data),
  resetBrowser: () => api.post("/agent/reset-browser").then((r) => r.data),
  browserStatus: () => api.get("/agent/browser-status").then((r) => r.data),
  pause: () => api.post("/agent/pause").then((r) => r.data),
  resume: () => api.post("/agent/resume").then((r) => r.data),
  runStatus: () => api.get("/agent/run-status").then((r) => r.data),
};
