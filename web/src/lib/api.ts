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

function getAuthHeaders(): Record<string, string> {
  const token = localStorage.getItem("jfswap-auth-token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function fetchJSON<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json", ...getAuthHeaders(), ...init?.headers },
    ...init,
  });
  if (res.status === 401) {
    // Clear stale token and redirect to trigger login
    localStorage.removeItem("jfswap-auth-token");
    window.dispatchEvent(new Event("jfswap-auth-required"));
    throw new Error("Unauthorized");
  }
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`${res.status}: ${body}`);
  }
  return res.json();
}

// --- Auth ---

export async function checkAuth(): Promise<{ auth_required: boolean }> {
  const res = await fetch(`${BASE}/auth/check`);
  return res.json();
}

export async function login(token: string): Promise<boolean> {
  const res = await fetch(`${BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token }),
  });
  if (res.ok) {
    localStorage.setItem("jfswap-auth-token", token);
    return true;
  }
  return false;
}

export function logout() {
  localStorage.removeItem("jfswap-auth-token");
}

export function isAuthenticated(): boolean {
  return !!localStorage.getItem("jfswap-auth-token");
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
  const res = await fetch(`${BASE}/faces`, { method: "POST", body: form, headers: getAuthHeaders() });
  if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
  return res.json();
}

export async function deleteFace(id: number) {
  return fetchJSON<{ deleted: boolean }>(`/faces/${id}`, { method: "DELETE" });
}

export function faceImageUrl(id: number) {
  return `${BASE}/faces/${id}/image${imageParams()}`;
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

function imageParams(extra?: Record<string, string>): string {
  const params = new URLSearchParams();
  const token = localStorage.getItem("jfswap-auth-token");
  if (token) params.set("token", token);
  if (extra) for (const [k, v] of Object.entries(extra)) params.set(k, v);
  const str = params.toString();
  return str ? `?${str}` : "";
}

export function posterUrl(itemId: string, cacheBust?: string) {
  return `${BASE}/items/${itemId}/poster${imageParams(cacheBust ? { v: cacheBust } : undefined)}`;
}

export function backdropUrl(itemId: string, cacheBust?: string) {
  return `${BASE}/items/${itemId}/backdrop${imageParams(cacheBust ? { v: cacheBust } : undefined)}`;
}

export function landscapeUrl(itemId: string, cacheBust?: string) {
  return `${BASE}/items/${itemId}/landscape${imageParams(cacheBust ? { v: cacheBust } : undefined)}`;
}

export function backupUrl(itemId: string, imageType: string) {
  return `${BASE}/items/${itemId}/backup/${imageType}${imageParams()}`;
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
