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
    "content-type": "application/json",
    ...(init.headers as Record<string, string>),
  };
  if (token) headers["authorization"] = `Bearer ${token}`;

  const res = await fetch(`/api${path}`, { ...init, headers });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw Object.assign(new Error((body as { error?: string }).error ?? res.statusText), { status: res.status });
  }
  return res.json() as Promise<T>;
}

export const api = {
  // Auth — implemented once Worker adds these endpoints
  login: (email: string, password: string) =>
    request<{ token: string }>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),

  register: (email: string, password: string) =>
    request<{ token: string }>("/auth/register", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),

  me: () => request<{ id: string; email: string }>("/auth/me"),

  // Photographs
  listPhotos: () => request<{ photographs: Photo[] }>("/photographs"),
  getPhoto: (id: string) => request<{ photograph: Photo }>(`/photographs/${id}`),
  createPhoto: (data: Partial<Photo>) =>
    request<{ photograph: Photo }>("/photographs", { method: "POST", body: JSON.stringify(data) }),
  updatePhoto: (id: string, data: Partial<Photo>) =>
    request<{ photograph: Photo }>(`/photographs/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  deletePhoto: (id: string) =>
    request<void>(`/photographs/${id}`, { method: "DELETE" }),

  // Gear
  listCameras: () => request<{ cameras: Camera[] }>("/cameras"),
  createCamera: (data: Partial<Camera>) =>
    request<{ camera: Camera }>("/cameras", { method: "POST", body: JSON.stringify(data) }),

  listLenses: () => request<{ lenses: Lens[] }>("/lenses"),
  createLens: (data: Partial<Lens>) =>
    request<{ lens: Lens }>("/lenses", { method: "POST", body: JSON.stringify(data) }),

  listFilms: () => request<{ films: FilmStock[] }>("/films"),
  createFilm: (data: Partial<FilmStock>) =>
    request<{ film: FilmStock }>("/films", { method: "POST", body: JSON.stringify(data) }),

  listRolls: () => request<{ rolls: Roll[] }>("/rolls"),
  createRoll: (data: Partial<Roll>) =>
    request<{ roll: Roll }>("/rolls", { method: "POST", body: JSON.stringify(data) }),
};

// Domain types derived from the D1 schema
export interface Photo {
  id: string;
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
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface Camera {
  id: string;
  name: string;
  maker: string | null;
  created_at: string;
}

export interface Lens {
  id: string;
  name: string;
  focal_length_mm: number | null;
  max_aperture: string | null;
  created_at: string;
}

export interface FilmStock {
  id: string;
  name: string;
  iso: number | null;
  process: string | null;
  created_at: string;
}

export interface Roll {
  id: string;
  film_id: string | null;
  name: string;
  loaded_at: string | null;
  developed_at: string | null;
  created_at: string;
}
