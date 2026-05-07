import type { Camera, FilmHolder, Roll, RollFormat } from "./api/client";

export type FrameOrientation = "landscape" | "portrait";

export interface FilmFrameFormat {
  key: string;
  label: string;
  widthMm: number;
  heightMm: number;
}

export const ROLL_FRAME_FORMATS: Record<RollFormat, FilmFrameFormat> = {
  "35mm": { key: "35mm", label: "35mm", widthMm: 36, heightMm: 24 },
  "120": { key: "120-6x6", label: "120 default 6x6", widthMm: 56, heightMm: 56 },
  "220": { key: "220-6x6", label: "220 default 6x6", widthMm: 56, heightMm: 56 },
  "127": { key: "127", label: "127", widthMm: 40, heightMm: 40 },
  "620": { key: "620-6x6", label: "620 default 6x6", widthMm: 56, heightMm: 56 },
};

export const ROLL_CAMERA_FRAME_FORMATS: Record<RollFormat, FilmFrameFormat[]> = {
  "35mm": [
    ROLL_FRAME_FORMATS["35mm"],
    { key: "35mm-half", label: "35mm half frame", widthMm: 18, heightMm: 24 },
  ],
  "120": [
    ROLL_FRAME_FORMATS["120"],
    { key: "120-6x4.5", label: "120 6x4.5", widthMm: 56, heightMm: 42 },
    { key: "120-6x7", label: "120 6x7", widthMm: 56, heightMm: 70 },
    { key: "120-6x9", label: "120 6x9", widthMm: 56, heightMm: 84 },
    { key: "120-6x17", label: "120 6x17", widthMm: 56, heightMm: 168 },
  ],
  "220": [
    ROLL_FRAME_FORMATS["220"],
    { key: "220-6x4.5", label: "220 6x4.5", widthMm: 56, heightMm: 42 },
    { key: "220-6x7", label: "220 6x7", widthMm: 56, heightMm: 70 },
    { key: "220-6x9", label: "220 6x9", widthMm: 56, heightMm: 84 },
    { key: "220-6x17", label: "220 6x17", widthMm: 56, heightMm: 168 },
  ],
  "127": [ROLL_FRAME_FORMATS["127"]],
  "620": [ROLL_FRAME_FORMATS["620"]],
};

export const SHEET_FRAME_FORMATS: Record<string, FilmFrameFormat> = {
  "2x3": { key: "2x3", label: "2x3 sheet", widthMm: 56, heightMm: 82 },
  "4x5": { key: "4x5", label: "4x5 sheet", widthMm: 102, heightMm: 127 },
  "5x7": { key: "5x7", label: "5x7 sheet", widthMm: 127, heightMm: 178 },
  "8x10": { key: "8x10", label: "8x10 sheet", widthMm: 203, heightMm: 254 },
  "11x14": { key: "11x14", label: "11x14 sheet", widthMm: 279, heightMm: 356 },
};

export const COMMON_FRAME_FORMATS: FilmFrameFormat[] = [
  ...Object.values(ROLL_CAMERA_FRAME_FORMATS).flat(),
  ...Object.values(SHEET_FRAME_FORMATS),
];

export function getFrameFormatsForRollFormat(rollFormat: RollFormat | "" | null | undefined): FilmFrameFormat[] {
  return rollFormat ? ROLL_CAMERA_FRAME_FORMATS[rollFormat] ?? [] : [];
}

const normalizeFormatKey = (value: string | null | undefined) => (
  value?.toLowerCase().replace(/\s+/g, "").replace(/×/g, "x") ?? ""
);

function formatFromHolder(holder: FilmHolder | null | undefined): FilmFrameFormat | null {
  if (!holder) return null;
  if (holder.width_mm && holder.height_mm) {
    return {
      key: `holder-${holder.type || holder.name}`,
      label: holder.type || holder.name,
      widthMm: holder.width_mm,
      heightMm: holder.height_mm,
    };
  }
  return SHEET_FRAME_FORMATS[normalizeFormatKey(holder.type)] ?? null;
}

function formatFromRollFormat(rollFormat: RollFormat | null | undefined): FilmFrameFormat | null {
  return rollFormat ? ROLL_FRAME_FORMATS[rollFormat] ?? null : null;
}

export function resolvePhotographFrameFormat({
  camera,
  roll,
  filmHolder,
}: {
  camera?: Pick<Camera, "film_type" | "roll_format" | "frame_format" | "frame_width_mm" | "frame_height_mm"> | null;
  roll?: Pick<Roll, "roll_format"> | null;
  filmHolder?: FilmHolder | null;
}): FilmFrameFormat | null {
  if (camera?.frame_width_mm && camera.frame_height_mm) {
    return {
      key: camera.frame_format ?? `camera-${camera.frame_width_mm}x${camera.frame_height_mm}`,
      label: camera.frame_format ?? "Camera frame",
      widthMm: camera.frame_width_mm,
      heightMm: camera.frame_height_mm,
    };
  }
  if (camera?.film_type === "sheet") return formatFromHolder(filmHolder);
  if (camera?.film_type === "roll") {
    return formatFromRollFormat(roll?.roll_format ?? camera.roll_format);
  }
  return formatFromHolder(filmHolder) ?? formatFromRollFormat(roll?.roll_format ?? camera?.roll_format);
}

export function getFrameAspectRatio(format: FilmFrameFormat, orientation: FrameOrientation) {
  const long = Math.max(format.widthMm, format.heightMm);
  const short = Math.min(format.widthMm, format.heightMm);
  return orientation === "landscape" ? long / short : short / long;
}

export function formatFrameDimensions(format: FilmFrameFormat) {
  return `${format.label} · ${Number(format.widthMm.toFixed(1))} x ${Number(format.heightMm.toFixed(1))}mm`;
}
