import { useRef, type ChangeEvent } from "react";

interface PhotographImageUploadActionsProps {
  disabled?: boolean;
  multiple?: boolean;
  onFilesSelected: (files: File[]) => void;
}

export function PhotographImageUploadActions({
  disabled = false,
  multiple = false,
  onFilesSelected,
}: PhotographImageUploadActionsProps) {
  const takePhotoInputRef = useRef<HTMLInputElement>(null);
  const chooseInputRef = useRef<HTMLInputElement>(null);

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.currentTarget.files ?? []);
    e.currentTarget.value = "";
    if (files.length > 0) {
      onFilesSelected(files);
    }
  };

  return (
    <div className="reference-upload-actions">
      <button
        type="button"
        className="btn-primary"
        onClick={() => takePhotoInputRef.current?.click()}
        disabled={disabled}
      >
        Take photo
      </button>
      <button
        type="button"
        className="btn-secondary"
        onClick={() => chooseInputRef.current?.click()}
        disabled={disabled}
      >
        Choose/upload
      </button>
      <input
        ref={takePhotoInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        disabled={disabled}
        style={{ display: "none" }}
        onChange={handleChange}
      />
      <input
        ref={chooseInputRef}
        type="file"
        accept="image/*"
        multiple={multiple}
        disabled={disabled}
        style={{ display: "none" }}
        onChange={handleChange}
      />
    </div>
  );
}
