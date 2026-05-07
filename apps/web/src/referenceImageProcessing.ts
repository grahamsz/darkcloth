import {
  calculateFilmResponseBrightnessBoostForAverageMatch,
  calculateBrightnessBoostForAverageMatch,
  calculateColorBrightnessBoostForAverageMatch,
  PREVIEW_FILTER_LUT_LEVELS,
  simulateColorFilterPixels,
  simulateBlackAndWhiteFilmResponsePixels,
  simulateBlackAndWhiteFilterPixelsDetailed,
  simulateBlackAndWhiteFilterPixels,
  simulateStraightBlackAndWhitePixels,
} from "./filterSimulation";
import type { FilmSpectralResponseKey } from "./filmSpectralResponse";
import type { FilterSimulationSettings } from "./photoFilters";

export interface ReferenceImageProcessingOptions {
  aspectRatio: number | null;
  cropToFrame: boolean;
  simulation: FilterSimulationSettings | null;
  simulationStack?: FilterSimulationSettings[];
  monochrome: boolean;
  filmSpectralResponseKey?: FilmSpectralResponseKey | null;
  maxLongEdge?: number;
  cropTransform?: ReferenceImageCropTransform;
  simulationMethod?: "lut" | "detailed";
  previewQuality?: boolean;
}

const DEFAULT_MAX_LONG_EDGE = 2048;

export interface ReferenceImageCropTransform {
  zoom: number;
  offsetX: number;
  offsetY: number;
  rotationDeg: number;
}

const DEFAULT_CROP_TRANSFORM: ReferenceImageCropTransform = {
  zoom: 1,
  offsetX: 0,
  offsetY: 0,
  rotationDeg: 0,
};

type LoadedReferenceImage = {
  source: CanvasImageSource;
  width: number;
  height: number;
  close: () => void;
};

export type PreparedReferenceImageBase = {
  file: File;
  width: number;
  height: number;
  imageData: ImageData;
};

async function loadImage(file: File): Promise<LoadedReferenceImage> {
  if ("createImageBitmap" in window) {
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
      return {
        source: bitmap,
        width: bitmap.width,
        height: bitmap.height,
        close: () => bitmap.close(),
      };
    } catch {
      // Fall through to HTMLImageElement below; the caller surfaces read failures.
    }
  }

  return new Promise<LoadedReferenceImage>((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve({
        source: image,
        width: image.naturalWidth,
        height: image.naturalHeight,
        close: () => {},
      });
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Unable to read image."));
    };
    image.src = url;
  });
}

function getCenteredCrop(width: number, height: number, targetAspectRatio: number | null) {
  if (!targetAspectRatio || targetAspectRatio <= 0) {
    return { sx: 0, sy: 0, sw: width, sh: height };
  }

  const imageAspectRatio = width / height;
  if (imageAspectRatio > targetAspectRatio) {
    const sw = Math.round(height * targetAspectRatio);
    return { sx: Math.round((width - sw) / 2), sy: 0, sw, sh: height };
  }

  const sh = Math.round(width / targetAspectRatio);
  return { sx: 0, sy: Math.round((height - sh) / 2), sw: width, sh };
}

function scaleDimensions(width: number, height: number, maxLongEdge: number) {
  const longEdge = Math.max(width, height);
  if (longEdge <= maxLongEdge) return { width, height };
  const scale = maxLongEdge / longEdge;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

function getOutputSourceSize(width: number, height: number, targetAspectRatio: number | null) {
  if (!targetAspectRatio || targetAspectRatio <= 0) return { width, height };
  const centered = getCenteredCrop(width, height, targetAspectRatio);
  return { width: centered.sw, height: centered.sh };
}

function canvasToJpegFile(canvas: HTMLCanvasElement, source: File) {
  return new Promise<File>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error("Unable to process reference image."));
        return;
      }
      const stem = source.name.replace(/\.[^.]+$/, "") || "reference-image";
      resolve(new File([blob], `${stem}.display.jpg`, {
        type: "image/jpeg",
        lastModified: Date.now(),
      }));
    }, "image/jpeg", 0.9);
  });
}

export async function prepareReferenceImageBase(
  file: File,
  options: Pick<ReferenceImageProcessingOptions, "aspectRatio" | "cropToFrame" | "cropTransform" | "maxLongEdge">,
): Promise<PreparedReferenceImageBase | null> {
  const transform = options.cropTransform ?? DEFAULT_CROP_TRANSFORM;
  const image = await loadImage(file);
  if (image.width === 0 || image.height === 0) {
    image.close();
    return null;
  }

  const outputSource = getOutputSourceSize(
    image.width,
    image.height,
    options.cropToFrame ? options.aspectRatio : null,
  );
  const target = scaleDimensions(outputSource.width, outputSource.height, options.maxLongEdge ?? DEFAULT_MAX_LONG_EDGE);
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) {
    image.close();
    return null;
  }

  canvas.width = target.width;
  canvas.height = target.height;
  context.save();
  context.translate(target.width / 2, target.height / 2);
  context.translate(transform.offsetX * target.width, transform.offsetY * target.height);
  context.rotate((transform.rotationDeg * Math.PI) / 180);
  const quarterTurn = Math.round(Math.abs(transform.rotationDeg) / 90) % 2 === 1;
  const rotatedWidth = quarterTurn ? image.height : image.width;
  const rotatedHeight = quarterTurn ? image.width : image.height;
  const coverScale = Math.max(target.width / rotatedWidth, target.height / rotatedHeight) * Math.max(1, transform.zoom);
  context.scale(coverScale, coverScale);
  context.drawImage(image.source, -image.width / 2, -image.height / 2);
  context.restore();

  const imageData = context.getImageData(0, 0, target.width, target.height);
  image.close();
  return {
    file,
    width: target.width,
    height: target.height,
    imageData,
  };
}

export async function renderReferenceImageBaseToFile(
  base: PreparedReferenceImageBase,
  options: Pick<ReferenceImageProcessingOptions, "simulation" | "simulationStack" | "monochrome" | "filmSpectralResponseKey" | "simulationMethod" | "previewQuality">,
): Promise<File | null> {
  const canvas = renderReferenceImageBaseToCanvas(base, options);
  return canvas ? canvasToJpegFile(canvas, base.file) : null;
}

export function renderReferenceImageBaseToDataUrl(
  base: PreparedReferenceImageBase,
  options: Pick<ReferenceImageProcessingOptions, "simulation" | "simulationStack" | "monochrome" | "filmSpectralResponseKey" | "simulationMethod" | "previewQuality">,
) {
  const canvas = renderReferenceImageBaseToCanvas(base, options);
  return canvas?.toDataURL("image/jpeg", 0.86) ?? null;
}

function renderReferenceImageBaseToCanvas(
  base: PreparedReferenceImageBase,
  options: Pick<ReferenceImageProcessingOptions, "simulation" | "simulationStack" | "monochrome" | "filmSpectralResponseKey" | "simulationMethod" | "previewQuality">,
) {
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return null;

  canvas.width = base.width;
  canvas.height = base.height;
  context.putImageData(new ImageData(new Uint8ClampedArray(base.imageData.data), base.width, base.height), 0, 0);

  const simulationStack = options.simulationStack && options.simulationStack.length > 0
    ? options.simulationStack
    : options.simulation
      ? [options.simulation]
      : [];

  if (options.monochrome) {
    const imageData = context.getImageData(0, 0, base.width, base.height);
    const filmSpectralResponseKey = options.filmSpectralResponseKey ?? null;
    const lutLevels = options.previewQuality ? PREVIEW_FILTER_LUT_LEVELS : undefined;
    if (simulationStack.length > 0) {
      const simulationMethod = options.simulationMethod ?? "lut";
      const simulate = simulationMethod === "detailed"
        ? simulateBlackAndWhiteFilterPixelsDetailed
        : simulateBlackAndWhiteFilterPixels;
      let next = new ImageData(new Uint8ClampedArray(imageData.data), imageData.width, imageData.height);
      for (const stackSimulation of simulationStack) {
        const simulation = { ...stackSimulation, filmSpectralResponseKey };
        next = simulate(next, { ...simulation, brightnessBoost: 1, lutLevels });
      }
      const brightnessBoost = calculateBrightnessBoostForAverageMatch(imageData, {
        ...simulationStack[0]!,
        filmSpectralResponseKey,
      }, simulationMethod, lutLevels);
      if (brightnessBoost !== 1) {
        for (let index = 0; index < next.data.length; index += 4) {
          const value = Math.max(0, Math.min(255, Math.round(next.data[index] * brightnessBoost)));
          next.data[index] = value;
          next.data[index + 1] = value;
          next.data[index + 2] = value;
        }
      }
      context.putImageData(next, 0, 0);
    } else if (filmSpectralResponseKey) {
      const brightnessBoost = calculateFilmResponseBrightnessBoostForAverageMatch(imageData, filmSpectralResponseKey, lutLevels);
      context.putImageData(
        simulateBlackAndWhiteFilmResponsePixels(imageData, { filmSpectralResponseKey, brightnessBoost, lutLevels }),
        0,
        0,
      );
    } else {
      context.putImageData(simulateStraightBlackAndWhitePixels(imageData), 0, 0);
    }
  } else if (simulationStack.length > 0) {
    const imageData = context.getImageData(0, 0, base.width, base.height);
    const primarySimulation = simulationStack[0]!;
    const brightnessBoost = calculateColorBrightnessBoostForAverageMatch(imageData, primarySimulation);
    context.putImageData(
      simulateColorFilterPixels(imageData, { ...primarySimulation, brightnessBoost }),
      0,
      0,
    );
  }

  return canvas;
}

export async function processReferenceImageForDisplay(
  file: File,
  options: ReferenceImageProcessingOptions,
): Promise<File | null> {
  const transform = options.cropTransform ?? DEFAULT_CROP_TRANSFORM;
  const hasTransform = transform.zoom !== 1 || transform.offsetX !== 0 || transform.offsetY !== 0 || transform.rotationDeg !== 0;
  if (!options.cropToFrame && !hasTransform && !options.simulation && !options.simulationStack?.length && !options.monochrome) return null;

  const base = await prepareReferenceImageBase(file, options);
  if (!base) return null;

  return renderReferenceImageBaseToFile(base, options);
}
