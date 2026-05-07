import { useEffect, useId, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

export function PreviewResultLink({
  title,
  description,
  disabled = false,
  initialPreviewUrl = null,
  initialPreviewName = null,
  contextText = null,
  renderPreview,
}: {
  title: string;
  description: string;
  disabled?: boolean;
  initialPreviewUrl?: string | null;
  initialPreviewName?: string | null;
  contextText?: string | null;
  renderPreview: (previewUrl: string) => ReactNode;
}) {
  const inputId = useId();
  const [open, setOpen] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(initialPreviewUrl);
  const [previewName, setPreviewName] = useState<string | null>(initialPreviewName);
  const hasInitialPreview = Boolean(initialPreviewUrl);

  useEffect(() => {
    setPreviewUrl(initialPreviewUrl);
    setPreviewName(initialPreviewName);
  }, [initialPreviewName, initialPreviewUrl]);

  useEffect(() => {
    if (!open) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  useEffect(() => {
    return () => {
      if (previewUrl && previewUrl !== initialPreviewUrl && previewUrl.startsWith("blob:")) URL.revokeObjectURL(previewUrl);
    };
  }, [initialPreviewUrl, previewUrl]);

  const handlePreviewFile = (file: File | null) => {
    setPreviewUrl((current) => {
      if (current && current !== initialPreviewUrl && current.startsWith("blob:")) URL.revokeObjectURL(current);
      return file ? URL.createObjectURL(file) : null;
    });
    setPreviewName(file?.name ?? null);
  };

  const modal = open ? (
    <div className="media-dialog-overlay preview-result-overlay" role="presentation" onClick={() => setOpen(false)}>
      <section
        className="media-dialog filter-simulation-preview-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${inputId}-title`}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="media-dialog-header">
          <div>
            <span className="eyebrow">Preview</span>
            <h2 id={`${inputId}-title`}>{title}</h2>
          </div>
          <button className="link-btn" type="button" onClick={() => setOpen(false)}>Close</button>
        </div>
        <p className="field-note filter-simulation-preview-description">{description}</p>
        {!hasInitialPreview && (
          <div className="filter-simulation-preview-header">
            <label className="filter-simulation-preview-file link-btn" htmlFor={inputId}>
              Test image
              <input
                id={inputId}
                type="file"
                accept="image/*"
                onChange={(event) => handlePreviewFile(event.target.files?.[0] ?? null)}
              />
            </label>
            {previewName && <span className="field-note">{previewName}</span>}
            {previewUrl && contextText && <span className="field-note">{contextText}</span>}
          </div>
        )}
        {hasInitialPreview && (
          <p className="field-note filter-simulation-preview-source">
            {contextText ?? `Using ${previewName ?? "this photo's reference image"}.`}
          </p>
        )}
        <div className="filter-simulation-preview-stage">
          {previewUrl
            ? renderPreview(previewUrl)
            : <p className="field-note">Choose a local image to preview the before/after result.</p>}
        </div>
      </section>
    </div>
  ) : null;

  return (
    <div className="filter-simulation-preview">
      <button
        className="link-btn filter-simulation-preview-trigger"
        type="button"
        disabled={disabled}
        onClick={() => setOpen(true)}
      >
        Preview Result &gt;
      </button>
      {modal ? createPortal(modal, document.body) : null}
    </div>
  );
}
