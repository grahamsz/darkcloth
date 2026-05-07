import { useEffect, useState } from "react";
import { PhotographImageUploadActions } from "../../components/PhotographImageUploadActions";
import {
  getPhotographImageUploadPreviewFile,
  getPhotographImageUploadSignature,
  type PhotographImageUploadDraft,
} from "../../photoImageUpload";

function PendingReferenceImagePreview({ upload }: { upload: PhotographImageUploadDraft }) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const file = getPhotographImageUploadPreviewFile(upload);

  useEffect(() => {
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  return previewUrl
    ? <img src={previewUrl} alt="" loading="lazy" decoding="async" />
    : <div className="reference-upload-preview-placeholder" />;
}

type ReferenceImagesFieldsetProps = {
  uploads: PhotographImageUploadDraft[];
  disabled: boolean;
  onFilesSelected: (files: File[]) => void;
  onRemove: (index: number) => void;
};

export function ReferenceImagesFieldset({
  uploads,
  disabled,
  onFilesSelected,
  onRemove,
}: ReferenceImagesFieldsetProps) {
  return (
    <fieldset>
      <legend>Reference images</legend>
      <div className="reference-upload">
        <PhotographImageUploadActions
          disabled={disabled}
          multiple
          onFilesSelected={onFilesSelected}
        />
        {uploads.length > 0 && (
          <ul className="reference-upload-list">
            {uploads.map((upload, index) => {
              const file = upload instanceof File ? upload : upload.original;
              return (
              <li key={getPhotographImageUploadSignature(upload)} className="reference-upload-item">
                <div className="reference-upload-preview">
                  <PendingReferenceImagePreview upload={upload} />
                </div>
                <button
                  type="button"
                  className="reference-upload-remove"
                  onClick={() => onRemove(index)}
                  disabled={disabled}
                  aria-label={`Remove ${file.name}`}
                >
                  ×
                </button>
              </li>
            );})}
          </ul>
        )}
      </div>
    </fieldset>
  );
}
