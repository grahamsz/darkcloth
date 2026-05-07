import { useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent } from "react";
import { getFrameAspectRatio, formatFrameDimensions, type FilmFrameFormat, type FrameOrientation } from "../../filmFormats";
import type { FilmSpectralResponseKey } from "../../filmSpectralResponse";
import { formatFilterDisplayLabel, normalizeFilterSimulationSettings, type FilterSimulationSettings } from "../../photoFilters";
import {
  prepareReferenceImageBase,
  processReferenceImageForDisplay,
  renderReferenceImageBaseToDataUrl,
  type PreparedReferenceImageBase,
  type ReferenceImageProcessingOptions,
  type ReferenceImageCropTransform,
} from "../../referenceImageProcessing";
import type { Filter } from "../../api/client";

type PreparedReferenceImageUpload = {
  original: File;
  display?: File;
  thumbnail?: File;
  deferredDisplay?: ReferenceImageProcessingOptions;
};

type ReferenceImageImportDialogProps = {
  file: File;
  frameFormat: FilmFrameFormat | null;
  compatibleFilters: Filter[];
  selectedFilterIds: string[];
  monochrome: boolean;
  filmSpectralResponseKey?: FilmSpectralResponseKey | null;
  onCancel: () => void;
  onFilterSelectionChange: (filterIds: string[]) => void;
  onConfirm: (upload: PreparedReferenceImageUpload) => void;
};

type ImportStep = "crop" | "filter";

type PreviewOption = {
  id: string;
  label: string;
  filterId: string | null;
  simulation: FilterSimulationSettings | null;
};

type PreviewState = {
  loading: boolean;
  url: string | null;
  file: File | null;
  error: string | null;
};

function waitForPreviewPaint(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });
}

async function dataUrlToJpegFile(dataUrl: string, source: File): Promise<File | null> {
  try {
    const response = await fetch(dataUrl);
    const blob = await response.blob();
    const stem = source.name.replace(/\.[^.]+$/, "") || "reference-image";
    return new File([blob], `${stem}.display.jpg`, {
      type: "image/jpeg",
      lastModified: Date.now(),
    });
  } catch {
    return null;
  }
}

const DEFAULT_TRANSFORM: ReferenceImageCropTransform = {
  zoom: 1,
  offsetX: 0,
  offsetY: 0,
  rotationDeg: 0,
};
const REFERENCE_THUMBNAIL_MAX_LONG_EDGE = 256;
const REFERENCE_FAST_DISPLAY_MAX_LONG_EDGE = 768;
const REFERENCE_FINAL_DISPLAY_MAX_LONG_EDGE = 2048;

async function readOrientedImageSize(file: File) {
  if ("createImageBitmap" in window) {
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
      const size = { width: bitmap.width, height: bitmap.height };
      bitmap.close();
      return size;
    } catch {
      // Fall back to an HTML image below.
    }
  }

  return new Promise<{ width: number; height: number }>((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve({ width: image.naturalWidth, height: image.naturalHeight });
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Unable to read image."));
    };
    image.src = url;
  });
}

function PendingImageCropper({
  file,
  aspectRatio,
  cropToFrame,
  orientation,
  transform,
  onTransformChange,
}: {
  file: File;
  aspectRatio: number | null;
  cropToFrame: boolean;
  orientation: FrameOrientation;
  transform: ReferenceImageCropTransform;
  onTransformChange: (next: ReferenceImageCropTransform) => void;
}) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const pointersRef = useRef(new Map<number, { x: number; y: number }>());
  const gestureRef = useRef<{
    startDistance: number;
    startAngle: number;
    startZoom: number;
    startRotation: number;
  } | null>(null);

  useEffect(() => {
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const pointerValues = () => Array.from(pointersRef.current.values());

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const points = pointerValues();
    if (points.length === 2) {
      const [left, right] = points;
      gestureRef.current = {
        startDistance: Math.hypot(right.x - left.x, right.y - left.y),
        startAngle: Math.atan2(right.y - left.y, right.x - left.x),
        startZoom: transform.zoom,
        startRotation: transform.rotationDeg,
      };
    }
  };

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const previous = pointersRef.current.get(event.pointerId);
    if (!previous) return;
    pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const points = pointerValues();
    if (points.length === 1) {
      const rect = event.currentTarget.getBoundingClientRect();
      const dx = (event.clientX - previous.x) / Math.max(1, rect.width);
      const dy = (event.clientY - previous.y) / Math.max(1, rect.height);
      onTransformChange({
        ...transform,
        offsetX: Math.max(-0.8, Math.min(0.8, transform.offsetX + dx)),
        offsetY: Math.max(-0.8, Math.min(0.8, transform.offsetY + dy)),
      });
      return;
    }
    if (points.length === 2 && gestureRef.current) {
      const [left, right] = points;
      const distance = Math.hypot(right.x - left.x, right.y - left.y);
      const angle = Math.atan2(right.y - left.y, right.x - left.x);
      const nextZoom = gestureRef.current.startZoom * (distance / Math.max(1, gestureRef.current.startDistance));
      const rotationDelta = ((angle - gestureRef.current.startAngle) * 180) / Math.PI;
      onTransformChange({
        ...transform,
        zoom: Math.max(1, Math.min(6, nextZoom)),
        rotationDeg: gestureRef.current.startRotation + rotationDelta,
      });
    }
  };

  const handlePointerUp = (event: PointerEvent<HTMLDivElement>) => {
    pointersRef.current.delete(event.pointerId);
    if (pointersRef.current.size < 2) gestureRef.current = null;
  };

  if (!previewUrl) return <div className="reference-import-preview-placeholder" />;

  const cropFrameStyle = cropToFrame && aspectRatio
    ? {
        aspectRatio: `${aspectRatio}`,
        "--reference-crop-aspect-ratio": String(aspectRatio),
      } as CSSProperties
    : undefined;

  return (
    <div
      className="reference-import-preview-frame reference-import-cropper"
      style={cropFrameStyle}
      data-orientation={orientation}
      data-crop-to-frame={cropToFrame && aspectRatio ? "true" : "false"}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
    >
      <img
        src={previewUrl}
        alt=""
        draggable={false}
        style={{
          transform: `translate(${transform.offsetX * 100}%, ${transform.offsetY * 100}%) rotate(${transform.rotationDeg}deg) scale(${transform.zoom})`,
        }}
      />
    </div>
  );
}

function FilterPreviewCard({
  option,
  selected,
  aspectRatio,
  state,
  onSelect,
}: {
  option: PreviewOption;
  selected: boolean;
  aspectRatio: number | null;
  state: PreviewState | undefined;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      className={`reference-filter-preview-card${selected ? " reference-filter-preview-card--selected" : ""}`}
      aria-pressed={selected}
      onClick={onSelect}
    >
      <span
        className="reference-filter-preview-image"
        style={{ aspectRatio: aspectRatio ? `${aspectRatio}` : undefined }}
      >
        {state?.url && <img src={state.url} alt="" loading="lazy" decoding="async" />}
        {(!state || state.loading) && <span className="reference-filter-preview-loading">Processing…</span>}
        {state?.error && <span className="reference-filter-preview-error">Failed</span>}
      </span>
      <span className="reference-filter-preview-label">
        <span className="reference-filter-preview-check" aria-hidden="true">{selected ? "✓" : ""}</span>
        {option.label}
      </span>
    </button>
  );
}

export function ReferenceImageImportDialog({
  file,
  frameFormat,
  compatibleFilters,
  selectedFilterIds,
  monochrome,
  filmSpectralResponseKey = null,
  onCancel,
  onFilterSelectionChange,
  onConfirm,
}: ReferenceImageImportDialogProps) {
  const [step, setStep] = useState<ImportStep>("crop");
  const [orientation, setOrientation] = useState<FrameOrientation>("landscape");
  const [cropToFrame, setCropToFrame] = useState(Boolean(frameFormat));
  const [transform, setTransform] = useState<ReferenceImageCropTransform>(DEFAULT_TRANSFORM);
  const [selectedPreviewId, setSelectedPreviewId] = useState(selectedFilterIds[0] ?? "none");
  const [previewStates, setPreviewStates] = useState<Record<string, PreviewState>>({});
  const [previewBase, setPreviewBase] = useState<PreparedReferenceImageBase | null>(null);
  const [preparingFilterStep, setPreparingFilterStep] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const onCancelRef = useRef(onCancel);
  const modalHistoryPushedRef = useRef(false);
  const previewOptions = useMemo<PreviewOption[]>(() => [
    { id: "none", label: "No Filters", filterId: null, simulation: null },
    ...compatibleFilters.map((filter) => ({
      id: filter.id,
      label: formatFilterDisplayLabel(filter),
      filterId: filter.id,
      simulation: normalizeFilterSimulationSettings(filter),
    })),
  ], [compatibleFilters]);
  const selectedPreview = previewOptions.find(option => option.id === selectedPreviewId) ?? previewOptions[0];
  const aspectRatio = frameFormat ? getFrameAspectRatio(frameFormat, orientation) : null;

  useEffect(() => {
    onCancelRef.current = onCancel;
  }, [onCancel]);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    window.history.pushState({ darkclothModal: "reference-image-import" }, "", window.location.href);
    modalHistoryPushedRef.current = true;
    const handlePopState = () => {
      modalHistoryPushedRef.current = false;
      onCancelRef.current();
    };
    window.addEventListener("popstate", handlePopState);
    return () => {
      window.removeEventListener("popstate", handlePopState);
      if (modalHistoryPushedRef.current) {
        modalHistoryPushedRef.current = false;
        window.history.back();
      }
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    void readOrientedImageSize(file)
      .then((size) => {
        if (cancelled || !frameFormat) return;
        setOrientation(size.height > size.width ? "portrait" : "landscape");
        setTransform(DEFAULT_TRANSFORM);
      })
      .catch(() => {
        // Keep the explicit orientation controls as the fallback.
      });
    return () => {
      cancelled = true;
    };
  }, [file, frameFormat]);

  useEffect(() => {
    if (previewOptions.some(option => option.id === selectedPreviewId)) return;
    setSelectedPreviewId("none");
  }, [previewOptions, selectedPreviewId]);

  useEffect(() => {
    if (step !== "filter" || !previewBase) return undefined;
    let cancelled = false;
    const setPreviewUrl = (optionId: string, url: string | null) => {
      setPreviewStates(prev => {
        const previousUrl = prev[optionId]?.url;
        if (previousUrl?.startsWith("blob:")) URL.revokeObjectURL(previousUrl);
        return { ...prev, [optionId]: { loading: false, url, file: null, error: null } };
      });
    };
    const setPreviewError = (optionId: string, err: unknown) => {
      setPreviewStates(prev => ({
        ...prev,
        [optionId]: {
          loading: false,
          url: null,
          file: null,
          error: err instanceof Error ? err.message : "Unable to process preview.",
        },
      }));
    };

    setPreviewStates(Object.fromEntries(previewOptions.map(option => [option.id, {
      loading: true,
      url: null,
      file: null,
      error: null,
    }])));

    void (async () => {
      const [plainPreview, ...filterPreviews] = previewOptions;
      if (!plainPreview) return;

      try {
        const previewUrl = renderReferenceImageBaseToDataUrl(previewBase, {
          simulation: plainPreview.simulation,
          monochrome,
          filmSpectralResponseKey,
          simulationMethod: "lut",
          previewQuality: true,
        });
        if (cancelled) return;
        setPreviewUrl(plainPreview.id, previewUrl);
      } catch (err) {
        if (cancelled) return;
        setPreviewError(plainPreview.id, err);
      }

      await waitForPreviewPaint();
      if (cancelled) return;

      for (const option of filterPreviews) {
        try {
          const previewUrl = renderReferenceImageBaseToDataUrl(previewBase, {
            simulation: option.simulation,
            monochrome,
            filmSpectralResponseKey,
            simulationMethod: "lut",
            previewQuality: true,
          });
          if (cancelled) return;
          setPreviewUrl(option.id, previewUrl);
          await waitForPreviewPaint();
          if (cancelled) return;
        } catch (err) {
          if (cancelled) return;
          setPreviewError(option.id, err);
        }
      }
    })();

    return () => {
      cancelled = true;
      setPreviewStates(prev => {
        Object.values(prev).forEach(state => {
          if (state.url) URL.revokeObjectURL(state.url);
        });
        return {};
      });
    };
  }, [filmSpectralResponseKey, monochrome, previewBase, previewOptions, step]);

  const rotate = (degrees: number) => setTransform(prev => ({ ...prev, rotationDeg: prev.rotationDeg + degrees }));
  const resetCrop = () => setTransform(DEFAULT_TRANSFORM);
  const processingPreviewCount = previewOptions.filter((option) => previewStates[option.id]?.loading).length;

  const proceedToFilterStep = async () => {
    setPreparingFilterStep(true);
    setError(null);
    try {
      const base = await prepareReferenceImageBase(file, {
        aspectRatio,
        cropToFrame,
        cropTransform: transform,
        maxLongEdge: REFERENCE_THUMBNAIL_MAX_LONG_EDGE,
      });
      if (!base) {
        setError("Unable to prepare preview image.");
        return;
      }
      setPreviewBase(base);
      setStep("filter");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to prepare preview image.");
    } finally {
      setPreparingFilterStep(false);
    }
  };

  const confirm = async () => {
    setSaving(true);
    setError(null);
    try {
      onFilterSelectionChange(selectedPreview.filterId ? [selectedPreview.filterId] : []);
      const selectedPreviewUrl = previewStates[selectedPreview.id]?.url;
      const thumbnail = selectedPreviewUrl
        ? await dataUrlToJpegFile(selectedPreviewUrl, file)
        : await processReferenceImageForDisplay(file, {
            aspectRatio,
            cropToFrame,
            cropTransform: transform,
            simulation: selectedPreview.simulation,
            monochrome,
            filmSpectralResponseKey,
            maxLongEdge: REFERENCE_THUMBNAIL_MAX_LONG_EDGE,
            simulationMethod: "lut",
            previewQuality: true,
          });
      const display = await processReferenceImageForDisplay(file, {
        aspectRatio,
        cropToFrame,
        cropTransform: transform,
        simulation: selectedPreview.simulation,
        monochrome,
        filmSpectralResponseKey,
        maxLongEdge: REFERENCE_FAST_DISPLAY_MAX_LONG_EDGE,
        simulationMethod: "lut",
        previewQuality: true,
      });
      onConfirm({
        original: file,
        ...(display ? { display } : {}),
        ...(thumbnail ? { thumbnail } : {}),
        deferredDisplay: {
          aspectRatio,
          cropToFrame,
          cropTransform: transform,
          simulation: selectedPreview.simulation,
          monochrome,
          filmSpectralResponseKey,
          maxLongEdge: REFERENCE_FINAL_DISPLAY_MAX_LONG_EDGE,
          simulationMethod: "lut",
        },
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to process reference image.");
      setSaving(false);
    }
  };

  return (
    <div className="reference-import-screen" role="dialog" aria-modal="true" aria-labelledby="reference-import-title">
      <div className="reference-import-shell">
        <div className="reference-import-header">
          <div>
            <span className="eyebrow">Reference image</span>
            <h2 id="reference-import-title">{step === "crop" ? "Crop photo" : "Simulate Filters"}</h2>
          </div>
          <button type="button" className="btn-link" onClick={onCancel} disabled={saving}>Close</button>
        </div>

        {step === "crop" ? (
          <div className="reference-import-grid reference-import-grid--crop">
            <PendingImageCropper
              file={file}
              aspectRatio={aspectRatio}
              cropToFrame={cropToFrame}
              orientation={orientation}
              transform={transform}
              onTransformChange={setTransform}
            />

            <div className="reference-import-settings">
              <div className="reference-import-setting-card">
                <span className="reference-import-setting-label">Film frame</span>
                <strong>{frameFormat ? formatFrameDimensions(frameFormat) : "No frame selected"}</strong>
                {!frameFormat && <p className="field-note">Pick a roll or film holder to crop to a frame.</p>}
              </div>

              <label className="checkbox-row">
                <input
                  type="checkbox"
                  checked={cropToFrame}
                  disabled={!frameFormat || saving}
                  onChange={(event) => setCropToFrame(event.target.checked)}
                />
                <span>Crop to film frame</span>
              </label>

              {frameFormat && (
                <div className="segmented-control reference-import-orientation" role="group" aria-label="Frame orientation">
                  <button type="button" className={orientation === "landscape" ? "active" : ""} onClick={() => setOrientation("landscape")} disabled={saving}>Landscape</button>
                  <button type="button" className={orientation === "portrait" ? "active" : ""} onClick={() => setOrientation("portrait")} disabled={saving}>Portrait</button>
                </div>
              )}

              <div className="reference-crop-controls">
                <label className="field" htmlFor="reference-crop-zoom">
                  <span>Zoom</span>
                  <input
                    id="reference-crop-zoom"
                    type="range"
                    min="1"
                    max="6"
                    step="0.01"
                    value={transform.zoom}
                    onChange={(event) => setTransform(prev => ({ ...prev, zoom: Number(event.target.value) }))}
                  />
                </label>
                <div className="reference-crop-buttons">
                  <button type="button" className="btn-secondary" onClick={() => rotate(-90)}>Rotate left</button>
                  <button type="button" className="btn-secondary" onClick={() => rotate(90)}>Rotate right</button>
                  <button type="button" className="btn-secondary" onClick={resetCrop}>Reset</button>
                </div>
                <p className="field-note">Drag to position. Pinch to zoom and rotate on touch screens.</p>
              </div>

              {error && <p className="form-error">{error}</p>}
              <div className="form-actions reference-import-actions">
                <button type="button" className="btn-primary" onClick={proceedToFilterStep} disabled={saving || preparingFilterStep}>
                  {preparingFilterStep ? "Preparing…" : "Next"}
                </button>
                <button type="button" className="btn-secondary" onClick={onCancel} disabled={saving || preparingFilterStep}>Cancel</button>
              </div>
            </div>
          </div>
        ) : (
          <div className="reference-import-filter-step">
            <p className="field-note reference-import-filter-note">
              The original is saved immediately. A fast LUT display is used now; the larger filtered display is queued after upload.
            </p>
            {processingPreviewCount > 0 && (
              <p className="field-note reference-import-filter-progress">
                Processing {processingPreviewCount} filter preview{processingPreviewCount === 1 ? "" : "s"}…
              </p>
            )}
            <div className="reference-filter-preview-grid">
              {previewOptions.map(option => (
                <FilterPreviewCard
                  key={option.id}
                  option={option}
                  selected={selectedPreview.id === option.id}
                  aspectRatio={aspectRatio}
                  state={previewStates[option.id]}
                  onSelect={() => {
                    setSelectedPreviewId(option.id);
                    onFilterSelectionChange(option.filterId ? [option.filterId] : []);
                  }}
                />
              ))}
            </div>
            {error && <p className="form-error">{error}</p>}
            <div className="form-actions reference-import-actions">
              <button type="button" className="btn-secondary" onClick={() => setStep("crop")} disabled={saving}>Back</button>
              <button type="button" className="btn-primary" onClick={confirm} disabled={saving}>
                {saving ? "Preparing…" : "Add reference image"}
              </button>
              <button type="button" className="btn-secondary" onClick={onCancel} disabled={saving}>Cancel</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
