import type { CSSProperties, ReactNode } from "react";

export type PhotographSummaryBlockProps = {
  title: string;
  dateTime?: string | null;
  cameraName?: string | null;
  lensName?: string | null;
  filmLabel?: string | null;
  exposureDisplay?: string | null;
  filterSummary?: string | null;
  thumbnailUrl?: string | null;
  thumbnailAlt?: string;
  thumbnailWidth?: number | null;
  thumbnailHeight?: number | null;
  fallbackMeta?: ReactNode;
};

export function formatPhotographFilmMediaLabel({
  filmName,
  filmHolderName,
  rollName,
  frameNumber,
}: {
  filmName?: string | null;
  filmHolderName?: string | null;
  rollName?: string | null;
  frameNumber?: string | null;
}) {
  const cleanFilmName = filmName?.trim() ?? "";
  const cleanHolderName = filmHolderName?.trim() ?? "";
  const cleanRollName = rollName?.trim() ?? "";
  const cleanFrameNumber = frameNumber?.trim() ?? "";

  if (cleanHolderName) {
    return `${cleanFilmName || "Film"} (FH: ${cleanHolderName})`;
  }

  if (cleanRollName) {
    const rollSuffix = cleanFrameNumber ? `, Frame ${cleanFrameNumber}` : "";
    return `${cleanFilmName || cleanRollName} (Roll: ${cleanRollName}${rollSuffix})`;
  }

  return cleanFilmName || null;
}

export function PhotographSummaryBlock({
  title,
  dateTime,
  cameraName,
  lensName,
  filmLabel,
  exposureDisplay,
  filterSummary,
  thumbnailUrl,
  thumbnailAlt = "",
  thumbnailWidth = null,
  thumbnailHeight = null,
  fallbackMeta,
}: PhotographSummaryBlockProps) {
  const hasThumbnailDimensions = thumbnailWidth != null && thumbnailHeight != null && thumbnailWidth > 0 && thumbnailHeight > 0;
  const isPortraitThumbnail = hasThumbnailDimensions && thumbnailHeight > thumbnailWidth;
  const thumbnailStyle: CSSProperties | undefined = hasThumbnailDimensions
    ? ({ "--photo-row-thumb-aspect": `${thumbnailWidth / thumbnailHeight}` } as CSSProperties)
    : undefined;
  const metaParts = [
    cameraName?.trim() || null,
    lensName?.trim() || null,
    filmLabel?.trim() || null,
  ].filter((part): part is string => Boolean(part));

  return (
    <>
      <div className="photo-row-content">
        <div className="photo-row-header">
          <span className="photo-row-title">{title}</span>
          <span className="photo-row-time">{dateTime ?? "Undated"}</span>
        </div>
        <div className="photo-row-meta">
          {metaParts.length > 0 && <span className="photo-row-context">{metaParts.join(" · ")}</span>}
          {exposureDisplay && <span className="photo-row-exposure">{exposureDisplay}</span>}
          {filterSummary && <span className="photo-row-filters">{filterSummary}</span>}
          {metaParts.length === 0 && !exposureDisplay && !filterSummary && fallbackMeta}
        </div>
      </div>
      {thumbnailUrl && (
        <div className={`photo-row-thumb${hasThumbnailDimensions ? " photo-row-thumb--measured" : ""}${isPortraitThumbnail ? " photo-row-thumb--portrait" : ""}`} style={thumbnailStyle}>
          <img
            src={thumbnailUrl}
            alt={thumbnailAlt}
            width={thumbnailWidth ?? undefined}
            height={thumbnailHeight ?? undefined}
            loading="lazy"
            decoding="async"
            style={{ objectFit: "contain", objectPosition: "center" }}
          />
        </div>
      )}
    </>
  );
}
