"use client";

import { useRef, useState } from "react";

const ACCEPTED_TYPES = ["image/jpeg", "image/png"];
const MAX_BYTES = 10 * 1024 * 1024; // 10MB

export interface UploadedImage {
  base64: string;
  mimeType: string;
  previewUrl: string;
}

interface ImageUploadProps {
  onChange: (image: UploadedImage | null) => void;
}

// Vercel's request-body limit is 4.5MB, and base64 inflates bytes by ~33%,
// so anything much over ~3MB raw would be rejected by the platform before
// our route even runs. Large photos get downscaled to fit instead of
// bouncing the student's upload with an opaque error.
const MAX_UPLOAD_BYTES = 3 * 1024 * 1024;
const MAX_DIMENSION = 1600;

/** Reads a File into a data URL, downscaling to JPEG if it's too large. */
export function readFile(file: File): Promise<UploadedImage> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read the file."));
    reader.onload = () => {
      const dataUrl = reader.result as string;
      if (file.size <= MAX_UPLOAD_BYTES) {
        resolve({ base64: dataUrl.split(",")[1] ?? "", mimeType: file.type, previewUrl: dataUrl });
        return;
      }
      const img = new Image();
      img.onerror = () => reject(new Error("Could not read the image."));
      img.onload = () => {
        const scale = Math.min(1, MAX_DIMENSION / Math.max(img.width, img.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
        const scaledUrl = canvas.toDataURL("image/jpeg", 0.85);
        resolve({
          base64: scaledUrl.split(",")[1] ?? "",
          mimeType: "image/jpeg",
          previewUrl: scaledUrl,
        });
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
  });
}

export default function ImageUpload({ onChange }: ImageUploadProps) {
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File | undefined) {
    if (!file) return;

    if (!ACCEPTED_TYPES.includes(file.type)) {
      setError("Please upload a JPEG or PNG image.");
      setPreview(null);
      onChange(null);
      return;
    }
    if (file.size > MAX_BYTES) {
      setError("Image is too large. Max size is 10MB.");
      setPreview(null);
      onChange(null);
      return;
    }

    setError(null);
    const image = await readFile(file);
    setPreview(image.previewUrl);
    onChange(image);
  }

  return (
    <div className="w-full">
      <div
        role="button"
        tabIndex={0}
        aria-label="Upload a photo of your handwritten solution"
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            inputRef.current?.click();
          }
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setIsDragging(false);
          void handleFile(e.dataTransfer.files[0]);
        }}
        className={`flex min-h-[10rem] w-full cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-4 text-center text-sm text-ink-muted transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${
          isDragging ? "border-brand bg-brand/5" : "border-ink bg-surface-soft"
        }`}
      >
        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={preview}
            alt="Selected handwritten solution"
            className="max-h-48 rounded-md object-contain"
          />
        ) : (
          <p>Drag & drop a photo here, or click to choose a JPEG/PNG (max 10MB)</p>
        )}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png"
        className="hidden"
        onChange={(e) => void handleFile(e.target.files?.[0])}
      />
      {/* Mobile-only direct-to-camera path. capture forces the camera app,
          so it must be a SECOND input — the main picker keeps gallery
          access. Hidden on sm+ where there's usually no camera worth using. */}
      <button
        type="button"
        onClick={() => cameraRef.current?.click()}
        className="mt-2 w-full rounded-lg border-2 border-ink bg-white px-4 py-2 text-sm font-semibold text-ink shadow-brut-sm transition-[transform,box-shadow,background-color] duration-200 ease-out hover:bg-surface active:translate-x-0.5 active:translate-y-0.5 active:shadow-none sm:hidden"
      >
        Take a photo
      </button>
      <input
        ref={cameraRef}
        type="file"
        accept="image/jpeg,image/png"
        capture="environment"
        className="hidden"
        onChange={(e) => void handleFile(e.target.files?.[0])}
      />
      {error && <p className="mt-2 text-sm text-mark-error">{error}</p>}
    </div>
  );
}
