import type {
  LibraryResponse,
  LibraryItem,
  Face,
  Job,
  JobDetail,
  Settings,
  ConnectionTestResult,
} from "./types";

const BASE = "/api";

async function fetchJSON<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json", ...init?.headers },
    ...init,
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`${res.status}: ${body}`);
  }
  return res.json();
}

// --- Library ---

export async function syncLibrary() {
  return fetchJSON<{ synced: number; new: number; updated: number }>(
    "/library/sync",
    { method: "POST" }
  );
}

export async function getLibraryItems(params?: {
  search?: string;
  type?: string;
  status?: string;
  sort?: string;
  order?: string;
  offset?: number;
  limit?: number;
}) {
  const query = new URLSearchParams();
  if (params?.search) query.set("search", params.search);
  if (params?.type) query.set("type", params.type);
  if (params?.status) query.set("status", params.status);
  if (params?.sort) query.set("sort", params.sort);
  if (params?.order) query.set("order", params.order);
  if (params?.offset) query.set("offset", String(params.offset));
  if (params?.limit) query.set("limit", String(params.limit));
  else query.set("limit", "10000");
  return fetchJSON<LibraryResponse>(`/library/items?${query}`);
}

export async function getLibraryItem(id: string) {
  return fetchJSON<LibraryItem>(`/library/items/${id}`);
}

// --- Faces ---

export async function getFaces() {
  return fetchJSON<Face[]>("/faces");
}

export async function uploadFace(file: File, gender: string) {
  const form = new FormData();
  form.append("file", file);
  form.append("gender", gender);
  const res = await fetch(`${BASE}/faces`, { method: "POST", body: form });
  if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
  return res.json();
}

export async function deleteFace(id: number) {
  return fetchJSON<{ deleted: boolean }>(`/faces/${id}`, { method: "DELETE" });
}

export function faceImageUrl(id: number) {
  return `${BASE}/faces/${id}/image`;
}

// --- Jobs ---

export async function createJob(body: {
  item_ids: string[];
  mode: string;
  image_type: string;
}) {
  return fetchJSON<Job>("/jobs", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function getJobs(status?: string) {
  const query = status ? `?status=${status}` : "";
  return fetchJSON<Job[]>(`/jobs${query}`);
}

export async function getJob(id: number) {
  return fetchJSON<JobDetail>(`/jobs/${id}`);
}

export async function cancelJob(id: number) {
  return fetchJSON<{ cancelled: boolean }>(`/jobs/${id}/cancel`, {
    method: "POST",
  });
}

// --- Items (images + restore) ---

export function posterUrl(itemId: string, cacheBust?: string) {
  const v = cacheBust ? `?v=${cacheBust}` : "";
  return `${BASE}/items/${itemId}/poster${v}`;
}

export function backdropUrl(itemId: string, cacheBust?: string) {
  const v = cacheBust ? `?v=${cacheBust}` : "";
  return `${BASE}/items/${itemId}/backdrop${v}`;
}

export function landscapeUrl(itemId: string, cacheBust?: string) {
  const v = cacheBust ? `?v=${cacheBust}` : "";
  return `${BASE}/items/${itemId}/landscape${v}`;
}

export function backupUrl(itemId: string, imageType: string) {
  return `${BASE}/items/${itemId}/backup/${imageType}`;
}

export async function restoreItem(itemId: string, imageType = "poster") {
  return fetchJSON<{ restored: boolean }>(
    `/items/${itemId}/restore?image_type=${imageType}`,
    { method: "POST" }
  );
}

export async function restoreBulk(itemIds: string[], imageType = "poster") {
  return fetchJSON<{ restored: number; failed: number; errors: string[] }>(
    "/items/restore",
    { method: "POST", body: JSON.stringify({ item_ids: itemIds, image_type: imageType }) }
  );
}

// --- Settings ---

export async function getSettings() {
  return fetchJSON<Settings>("/settings");
}

export async function testJellyfin() {
  return fetchJSON<ConnectionTestResult>("/settings/test-jellyfin", {
    method: "POST",
  });
}

export async function testGemini() {
  return fetchJSON<ConnectionTestResult>("/settings/test-gemini", {
    method: "POST",
  });
}
