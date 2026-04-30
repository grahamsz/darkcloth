const TOKEN_KEY = "pt_token";

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    ...(init.headers as Record<string, string>),
  };
  if (!(init.body instanceof FormData)) {
    headers["content-type"] = "application/json";
  }
  if (token) headers["authorization"] = `Bearer ${token}`;

  const res = await fetch(`/api${path}`, { ...init, headers });

  if (res.status === 204) return undefined as unknown as T;

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    const err = Object.assign(
      new Error((body as { error?: string }).error ?? res.statusText),
      { status: res.status },
    );
    throw err;
  }

  return res.json() as Promise<T>;
}

// ── Domain types ──────────────────────────────────────────────────────────────

export interface User {
  id: string;
  email: string;
  created_at: string;
  updated_at: string;
}

export interface Camera {
  id: string;
  user_id: string;
  name: string;
  maker: string | null;
  created_at: string;
}

export interface Lens {
  id: string;
  user_id: string;
  name: string;
  focal_length_mm: number | null;
  max_aperture: string | null;
  created_at: string;
}

export interface FilmStock {
  id: string;
  user_id: string;
  name: string;
  iso: number | null;
  process: string | null;
  created_at: string;
}

export interface Roll {
  id: string;
  user_id: string;
  film_id: string | null;
  name: string;
  loaded_at: string | null;
  developed_at: string | null;
  created_at: string;
}

export interface Photograph {
  id: string;
  user_id: string;
  roll_id: string | null;
  camera_id: string | null;
  lens_id: string | null;
  film_id: string | null;
  frame_number: string | null;
  taken_at: string | null;
  aperture: string | null;
  shutter_speed: string | null;
  iso: number | null;
  exposure_compensation: string | null;
  focal_length_mm: number | null;
  latitude: number | null;
  longitude: number | null;
  altitude_m: number | null;
  gps_accuracy_m: number | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface PhotographImage {
  id: string;
  photograph_id: string;
  content_type: string;
  width: number | null;
  height: number | null;
  original_filename: string | null;
  url: string | null;
  created_at: string;
}

interface ListResponse<T> {
  items: T[];
  total: number;
}

// ── API surface ───────────────────────────────────────────────────────────────

export const api = {
  // Auth
  register: (email: string, password: string) =>
    request<{ token: string; user: User }>("/auth/register", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),

  login: (email: string, password: string) =>
    request<{ token: string; user: User }>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),

  me: () => request<User>("/auth/me"),

  // Gear — cameras
  listCameras: () => request<ListResponse<Camera>>("/gear/cameras"),
  createCamera: (data: { name: string; maker?: string }) =>
    request<Camera>("/gear/cameras", { method: "POST", body: JSON.stringify(data) }),
  updateCamera: (id: string, data: { name?: string; maker?: string }) =>
    request<Camera>(`/gear/cameras/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  deleteCamera: (id: string) =>
    request<void>(`/gear/cameras/${id}`, { method: "DELETE" }),

  // Gear — lenses
  listLenses: () => request<ListResponse<Lens>>("/gear/lenses"),
  createLens: (data: { name: string; focal_length_mm?: number; max_aperture?: string }) =>
    request<Lens>("/gear/lenses", { method: "POST", body: JSON.stringify(data) }),
  updateLens: (id: string, data: { name?: string; focal_length_mm?: number; max_aperture?: string }) =>
    request<Lens>(`/gear/lenses/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  deleteLens: (id: string) =>
    request<void>(`/gear/lenses/${id}`, { method: "DELETE" }),

  // Gear — film stocks
  listFilms: () => request<ListResponse<FilmStock>>("/gear/films"),
  createFilm: (data: { name: string; iso?: number; process?: string }) =>
    request<FilmStock>("/gear/films", { method: "POST", body: JSON.stringify(data) }),
  updateFilm: (id: string, data: { name?: string; iso?: number; process?: string }) =>
    request<FilmStock>(`/gear/films/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  deleteFilm: (id: string) =>
    request<void>(`/gear/films/${id}`, { method: "DELETE" }),

  // Rolls
  listRolls: (params?: { film_id?: string }) => {
    const qs = params?.film_id ? `?film_id=${params.film_id}` : "";
    return request<ListResponse<Roll>>(`/rolls${qs}`);
  },
  createRoll: (data: { name: string; film_id?: string; loaded_at?: string }) =>
    request<Roll>("/rolls", { method: "POST", body: JSON.stringify(data) }),
  updateRoll: (id: string, data: { name?: string; film_id?: string | null; loaded_at?: string | null; developed_at?: string | null }) =>
    request<Roll>(`/rolls/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  deleteRoll: (id: string) =>
    request<void>(`/rolls/${id}`, { method: "DELETE" }),

  // Photographs
  listPhotographs: (params?: { roll_id?: string; camera_id?: string; lens_id?: string; film_id?: string }) => {
    const p = new URLSearchParams();
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        if (v) p.set(k, v);
      }
    }
    const qs = p.toString() ? `?${p}` : "";
    return request<ListResponse<Photograph>>(`/photographs${qs}`);
  },
  createPhotograph: (data: Partial<Omit<Photograph, "id" | "user_id" | "created_at" | "updated_at">>) =>
    request<Photograph>("/photographs", { method: "POST", body: JSON.stringify(data) }),
  getPhotograph: (id: string) => request<Photograph>(`/photographs/${id}`),
  updatePhotograph: (id: string, data: Partial<Omit<Photograph, "id" | "user_id" | "created_at" | "updated_at">>) =>
    request<Photograph>(`/photographs/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  deletePhotograph: (id: string) =>
    request<void>(`/photographs/${id}`, { method: "DELETE" }),

  // Photograph images
  listPhotographImages: (photoId: string) =>
    request<{ items: PhotographImage[] }>(`/photographs/${photoId}/images`),
  uploadPhotographImage: (photoId: string, file: File) => {
    const form = new FormData();
    form.append("file", file);
    return request<PhotographImage>(`/photographs/${photoId}/images`, {
      method: "POST",
      body: form,
    });
  },
  deletePhotographImage: (photoId: string, imageId: string) =>
    request<void>(`/photographs/${photoId}/images/${imageId}`, { method: "DELETE" }),
};
