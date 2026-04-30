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
