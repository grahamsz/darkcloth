import {
  calculateFilmResponseBrightnessBoostForAverageMatch,
  calculateBrightnessBoostForAverageMatch,
  calculateColorBrightnessBoostForAverageMatch,
  PREVIEW_FILTER_LUT_LEVELS,
  simulateBlackAndWhiteFilmResponsePixels,
  simulateBlackAndWhiteFilterPixels,
  simulateBlackAndWhiteFilterPixelsDetailed,
  simulateColorFilterPixels,
  simulateStraightBlackAndWhitePixels,
} from "./filterSimulation";
import type { ReferenceImageCropTransform, ReferenceImageProcessingOptions } from "./referenceImageProcessing";

type ReferenceImageProcessingWorkerRequest = {
  id: string;
  original: Blob;
  originalName: string;
  options: ReferenceImageProcessingOptions;
};

type ReferenceImageProcessingWorkerResponse =
  | { id: string; ok: true; blob: Blob; fileName: string }
  | { id: string; ok: false; error: string };

const DEFAULT_MAX_LONG_EDGE = 2048;

const DEFAULT_CROP_TRANSFORM: ReferenceImageCropTransform = {
  zoom: 1,
  offsetX: 0,
  offsetY: 0,
  rotationDeg: 0,
};

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

function getDisplayFileName(sourceName: string) {
  const stem = sourceName.replace(/\.[^.]+$/, "") || "reference-image";
  return `${stem}.display.jpg`;
}

async function renderDisplayBlob(
  original: Blob,
  originalName: string,
  options: ReferenceImageProcessingOptions,
) {
  if (typeof OffscreenCanvas === "undefined") {
    throw new Error("Background canvas processing is not supported by this browser.");
  }

  if (typeof createImageBitmap !== "function") {
    throw new Error("Background image decoding is not supported by this browser.");
  }

  const transform = options.cropTransform ?? DEFAULT_CROP_TRANSFORM;
  const hasTransform = transform.zoom !== 1
    || transform.offsetX !== 0
    || transform.offsetY !== 0
    || transform.rotationDeg !== 0;
  if (!options.cropToFrame && !hasTransform && !options.simulation && !options.simulationStack?.length && !options.monochrome) {
    return null;
  }

  const bitmap = await createImageBitmap(original, { imageOrientation: "from-image" });
  try {
    if (bitmap.width === 0 || bitmap.height === 0) return null;

    const outputSource = getOutputSourceSize(
      bitmap.width,
      bitmap.height,
      options.cropToFrame ? options.aspectRatio : null,
    );
    const target = scaleDimensions(outputSource.width, outputSource.height, options.maxLongEdge ?? DEFAULT_MAX_LONG_EDGE);
    const canvas = new OffscreenCanvas(target.width, target.height);
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) {
      throw new Error("Unable to create background image canvas.");
    }

    context.save();
    context.translate(target.width / 2, target.height / 2);
    context.translate(transform.offsetX * target.width, transform.offsetY * target.height);
    context.rotate((transform.rotationDeg * Math.PI) / 180);
    const quarterTurn = Math.round(Math.abs(transform.rotationDeg) / 90) % 2 === 1;
    const rotatedWidth = quarterTurn ? bitmap.height : bitmap.width;
    const rotatedHeight = quarterTurn ? bitmap.width : bitmap.height;
    const coverScale = Math.max(target.width / rotatedWidth, target.height / rotatedHeight) * Math.max(1, transform.zoom);
    context.scale(coverScale, coverScale);
    context.drawImage(bitmap, -bitmap.width / 2, -bitmap.height / 2);
    context.restore();

    const simulationStack = options.simulationStack && options.simulationStack.length > 0
      ? options.simulationStack
      : options.simulation
        ? [options.simulation]
        : [];

    if (options.monochrome) {
      const imageData = context.getImageData(0, 0, target.width, target.height);
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
      const imageData = context.getImageData(0, 0, target.width, target.height);
      const primarySimulation = simulationStack[0]!;
      const brightnessBoost = calculateColorBrightnessBoostForAverageMatch(imageData, primarySimulation);
      context.putImageData(
        simulateColorFilterPixels(imageData, { ...primarySimulation, brightnessBoost }),
        0,
        0,
      );
    }

    return {
      blob: await canvas.convertToBlob({ type: "image/jpeg", quality: 0.9 }),
      fileName: getDisplayFileName(originalName),
    };
  } finally {
    bitmap.close();
  }
}

self.addEventListener("message", (event: MessageEvent<ReferenceImageProcessingWorkerRequest>) => {
  const { id, original, originalName, options } = event.data;
  void renderDisplayBlob(original, originalName, options)
    .then((result) => {
      const response: ReferenceImageProcessingWorkerResponse = result
        ? { id, ok: true, blob: result.blob, fileName: result.fileName }
        : { id, ok: false, error: "No processed display image was needed." };
      self.postMessage(response);
    })
    .catch((error) => {
      const response: ReferenceImageProcessingWorkerResponse = {
        id,
        ok: false,
        error: error instanceof Error ? error.message : "Unable to process reference image.",
      };
      self.postMessage(response);
    });
});
