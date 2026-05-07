import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import {
  calculateBrightnessBoostForAverageMatch,
  calculateColorBrightnessBoostForAverageMatch,
  calculateFilmResponseBrightnessBoostForAverageMatch,
  simulateBlackAndWhiteFilterPixels,
  simulateBlackAndWhiteFilmResponsePixels,
  simulateColorFilterPixels,
  simulateStraightBlackAndWhitePixels,
} from "../filterSimulation";
import type { FilmSpectralResponseKey } from "../filmSpectralResponse";
import type { FilterSimulationSettings } from "../photoFilters";

const MAX_RENDER_LONG_EDGE = 2200;
const MAX_RENDER_PIXELS = 3_000_000;

type FilterSimulationImageProps = {
  src: string;
  alt: string;
  settings: FilterSimulationSettings | null;
  settingsStack?: FilterSimulationSettings[];
  className?: string;
  mode?: "comparison" | "filtered";
  monochrome?: boolean;
  filmSpectralResponseKey?: FilmSpectralResponseKey | null;
  beforeLabel?: string;
  afterLabel?: string;
};

const getDisplayRenderSize = (
  image: HTMLImageElement,
  container: HTMLElement | null,
) => {
  const naturalWidth = image.naturalWidth;
  const naturalHeight = image.naturalHeight;
  const rect = container?.getBoundingClientRect();
  const deviceScale = Math.min(window.devicePixelRatio || 1, 2);
  const visibleWidth = rect && rect.width > 0
    ? rect.width * deviceScale
    : Math.min(naturalWidth, Math.max(360, window.innerWidth * deviceScale));
  const visibleScale = Math.min(1, visibleWidth / naturalWidth);
  const longEdgeScale = Math.min(1, MAX_RENDER_LONG_EDGE / Math.max(naturalWidth, naturalHeight));
  const pixelScale = Math.min(1, Math.sqrt(MAX_RENDER_PIXELS / (naturalWidth * naturalHeight)));
  const scale = Math.min(visibleScale, longEdgeScale, pixelScale);

  return {
    width: Math.max(1, Math.round(naturalWidth * scale)),
    height: Math.max(1, Math.round(naturalHeight * scale)),
  };
};

function simulateBlackAndWhiteFilterStackPixels(
  imageData: ImageData,
  settingsStack: FilterSimulationSettings[],
  brightnessBoost: number,
  filmSpectralResponseKey?: FilmSpectralResponseKey | null,
) {
  let next = imageData;
  settingsStack.forEach((stackSettings) => {
    next = simulateBlackAndWhiteFilterPixels(next, {
      ...stackSettings,
      brightnessBoost: 1,
      filmSpectralResponseKey,
    });
  });

  if (brightnessBoost !== 1) {
    const data = next.data;
    for (let index = 0; index < data.length; index += 4) {
      const value = Math.max(0, Math.min(255, Math.round(data[index] * brightnessBoost)));
      data[index] = value;
      data[index + 1] = value;
      data[index + 2] = value;
    }
  }

  return next;
}

function calculateFilterStackBrightnessBoostForAverageMatch(
  sourceData: ImageData,
  settingsStack: FilterSimulationSettings[],
  filmSpectralResponseKey?: FilmSpectralResponseKey | null,
) {
  if (settingsStack.length === 0) return 1;
  const straight = filmSpectralResponseKey
    ? simulateBlackAndWhiteFilmResponsePixels(new ImageData(
        new Uint8ClampedArray(sourceData.data),
        sourceData.width,
        sourceData.height,
      ), { filmSpectralResponseKey })
    : simulateStraightBlackAndWhitePixels(new ImageData(
        new Uint8ClampedArray(sourceData.data),
        sourceData.width,
        sourceData.height,
      ));
  const filtered = simulateBlackAndWhiteFilterStackPixels(new ImageData(
    new Uint8ClampedArray(sourceData.data),
    sourceData.width,
    sourceData.height,
  ), settingsStack, 1, filmSpectralResponseKey);

  let straightTotal = 0;
  let filteredTotal = 0;
  let samples = 0;
  for (let index = 0; index < sourceData.data.length; index += 4) {
    straightTotal += straight.data[index];
    filteredTotal += filtered.data[index];
    samples += 1;
  }

  if (samples === 0 || filteredTotal <= 0) return 1;
  return Math.max(0.05, Math.min(12, straightTotal / filteredTotal));
}

export function FilterSimulationImage({
  src,
  alt,
  settings,
  settingsStack,
  className,
  mode = "comparison",
  monochrome = true,
  filmSpectralResponseKey = null,
  beforeLabel,
  afterLabel,
}: FilterSimulationImageProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const straightCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const filteredCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const [failed, setFailed] = useState(false);
  const [split, setSplit] = useState(50);
  const [dragging, setDragging] = useState(false);
  const [dimensions, setDimensions] = useState<{ width: number; height: number } | null>(null);
  const activeSettingsStack = useMemo(
    () => settingsStack && settingsStack.length > 0 ? settingsStack : settings ? [settings] : [],
    [settings, settingsStack],
  );
  const primarySettings = activeSettingsStack[0] ?? null;

  const updateSplitFromPointer = (clientX: number) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect || rect.width <= 0) return;
    const next = ((clientX - rect.left) / rect.width) * 100;
    setSplit(Math.min(95, Math.max(5, next)));
  };

  useEffect(() => {
    if (activeSettingsStack.length === 0 && !filmSpectralResponseKey) {
      setFailed(false);
      setDimensions(null);
      return;
    }

    let cancelled = false;
    const image = new Image();
    if (!src.startsWith("blob:") && !src.startsWith("data:")) {
      image.crossOrigin = "anonymous";
    }
    image.onload = () => {
      if (cancelled) return;
      void (async () => {
        const straightCanvas = straightCanvasRef.current;
        const filteredCanvas = filteredCanvasRef.current;
        const sourceCanvas = straightCanvas ?? document.createElement("canvas");
        const straightContext = sourceCanvas.getContext("2d", { willReadFrequently: true });
        const filteredContext = filteredCanvas?.getContext("2d", { willReadFrequently: true });
        if (
          !filteredCanvas
          || !straightContext
          || !filteredContext
          || image.naturalWidth === 0
          || image.naturalHeight === 0
        ) {
          setFailed(true);
          setDimensions(null);
          return;
        }

        try {
          const renderSize = getDisplayRenderSize(image, containerRef.current);
          sourceCanvas.width = renderSize.width;
          sourceCanvas.height = renderSize.height;
          filteredCanvas.width = renderSize.width;
          filteredCanvas.height = renderSize.height;

          straightContext.drawImage(image, 0, 0, renderSize.width, renderSize.height);
          const sourceData = straightContext.getImageData(0, 0, sourceCanvas.width, sourceCanvas.height);
          const straightData = new ImageData(
            new Uint8ClampedArray(sourceData.data),
            sourceData.width,
            sourceData.height,
          );
          const filteredData = new ImageData(
            new Uint8ClampedArray(sourceData.data),
            sourceData.width,
            sourceData.height,
          );

          const resolvedFilmSpectralResponseKey = filmSpectralResponseKey ?? null;
          if (straightCanvas && monochrome) {
            straightContext.putImageData(simulateStraightBlackAndWhitePixels(straightData), 0, 0);
          }

          const fallbackFilmSpectralResponseKey = resolvedFilmSpectralResponseKey ?? "generic_panchromatic";
          const brightnessBoost = monochrome
            ? activeSettingsStack.length > 1
              ? calculateFilterStackBrightnessBoostForAverageMatch(sourceData, activeSettingsStack, resolvedFilmSpectralResponseKey)
              : primarySettings
                ? calculateBrightnessBoostForAverageMatch(sourceData, { ...primarySettings, filmSpectralResponseKey: resolvedFilmSpectralResponseKey }, "lut")
                : calculateFilmResponseBrightnessBoostForAverageMatch(sourceData, fallbackFilmSpectralResponseKey)
            : primarySettings
              ? calculateColorBrightnessBoostForAverageMatch(sourceData, primarySettings)
              : 1;

          let nextFilteredData = filteredData;
          if (monochrome && activeSettingsStack.length > 0) {
            nextFilteredData = activeSettingsStack.length > 1
              ? simulateBlackAndWhiteFilterStackPixels(nextFilteredData, activeSettingsStack, brightnessBoost, resolvedFilmSpectralResponseKey)
              : simulateBlackAndWhiteFilterPixels(nextFilteredData, {
                  ...activeSettingsStack[0],
                  brightnessBoost,
                  filmSpectralResponseKey: resolvedFilmSpectralResponseKey,
                });
          }
          const colorFilteredData = !monochrome && primarySettings
            ? activeSettingsStack.length > 1
              ? activeSettingsStack.reduce((currentData, stackSettings, index) => simulateColorFilterPixels(currentData, {
                  ...stackSettings,
                  brightnessBoost: index === 0 ? brightnessBoost : 1,
                }), filteredData)
              : simulateColorFilterPixels(filteredData, { ...primarySettings, brightnessBoost })
            : filteredData;

          filteredContext.putImageData(
            monochrome
              ? activeSettingsStack.length > 0
                ? nextFilteredData
                : simulateBlackAndWhiteFilmResponsePixels(filteredData, {
                    filmSpectralResponseKey: fallbackFilmSpectralResponseKey,
                    brightnessBoost,
                  })
              : primarySettings
                ? colorFilteredData
                : filteredData,
            0,
            0,
          );
          setDimensions(renderSize);
          setFailed(false);
        } catch {
          setFailed(true);
          setDimensions(null);
        }
      })();
    };
    image.onerror = () => {
      if (!cancelled) {
        setFailed(true);
        setDimensions(null);
      }
    };
    image.src = src;

    return () => {
      cancelled = true;
    };
  }, [activeSettingsStack, filmSpectralResponseKey, mode, monochrome, primarySettings, src]);

  if ((activeSettingsStack.length === 0 && !filmSpectralResponseKey) || failed) {
    return <img className={className} src={src} alt={alt} />;
  }

  if (mode === "filtered") {
    return (
      <div
        ref={containerRef}
        className={[
          "filter-simulation-filtered",
          !dimensions ? "filter-simulation-filtered--pending" : "",
          className,
        ].filter(Boolean).join(" ")}
        data-app-swipe-ignore="true"
        style={{
          aspectRatio: dimensions ? `${dimensions.width} / ${dimensions.height}` : undefined,
        }}
      >
        <canvas
          ref={filteredCanvasRef}
          className="filter-simulation-filtered-canvas"
          role="img"
          aria-label={`${alt}, filtered ${monochrome ? "black and white" : "color"}`}
        />
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className={[
        "filter-simulation-comparison",
        dragging ? "filter-simulation-comparison--dragging" : "",
        !dimensions ? "filter-simulation-comparison--pending" : "",
        className,
      ].filter(Boolean).join(" ")}
      style={{
        "--filter-simulation-split": `${split}%`,
        aspectRatio: dimensions ? `${dimensions.width} / ${dimensions.height}` : undefined,
      } as CSSProperties}
      data-app-swipe-ignore="true"
      role="slider"
      tabIndex={0}
      aria-label="Filter simulation comparison split"
      aria-valuemin={5}
      aria-valuemax={95}
      aria-valuenow={Math.round(split)}
      onPointerDown={(event) => {
        event.stopPropagation();
        event.currentTarget.setPointerCapture(event.pointerId);
        setDragging(true);
        updateSplitFromPointer(event.clientX);
      }}
      onPointerMove={(event) => {
        event.stopPropagation();
        if (dragging) updateSplitFromPointer(event.clientX);
      }}
      onPointerUp={(event) => {
        event.stopPropagation();
        event.currentTarget.releasePointerCapture(event.pointerId);
        setDragging(false);
      }}
      onPointerCancel={(event) => {
        event.stopPropagation();
        setDragging(false);
      }}
      onTouchStart={(event) => event.stopPropagation()}
      onTouchMove={(event) => event.stopPropagation()}
      onTouchEnd={(event) => event.stopPropagation()}
      onKeyDown={(event) => {
        if (event.key === "ArrowLeft") {
          event.preventDefault();
          setSplit(current => Math.max(5, current - 2));
        }
        if (event.key === "ArrowRight") {
          event.preventDefault();
          setSplit(current => Math.min(95, current + 2));
        }
      }}
    >
      <canvas
        ref={straightCanvasRef}
        className="filter-simulation-comparison-canvas"
        role="img"
        aria-label={`${alt}, ${monochrome ? "straight black and white" : "unfiltered color"}`}
      />
      <canvas
        ref={filteredCanvasRef}
        className="filter-simulation-comparison-canvas filter-simulation-comparison-canvas--filtered"
        role="img"
        aria-label={`${alt}, filtered ${monochrome ? "black and white" : "color"}`}
      />
      <div className="filter-simulation-comparison-label filter-simulation-comparison-label--left">{beforeLabel ?? (monochrome ? "B&W" : "Original")}</div>
      <div className="filter-simulation-comparison-label filter-simulation-comparison-label--right">{afterLabel ?? "Filtered"}</div>
      <div className="filter-simulation-comparison-divider" aria-hidden="true" />
    </div>
  );
}
