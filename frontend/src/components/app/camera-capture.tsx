"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Camera, Check, Loader2, RotateCcw, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/utils";

const MAX_SIDE = 1600;
const JPEG_QUALITY = 0.7;
/** Au-delà, la photo est considérée comme venant de la galerie plutôt que prise à l'instant. */
const FRESH_WINDOW_MS = 10 * 60 * 1000;

export type CapturedPhoto = {
  file: File;
  /** Heure de prise (horodatage de l'appareil au moment de la capture). */
  capturedAt: Date;
  /** false si le fichier date de plus de 10 min : probablement une photo de la galerie. */
  fresh: boolean;
  width: number;
  height: number;
};

async function compress(file: File): Promise<{ blob: Blob; width: number; height: number }> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas indisponible");
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY));
  if (!blob) throw new Error("Compression impossible");
  return { blob, width, height };
}

/**
 * Tuile de prise de photo : ouvre la caméra arrière, compresse l'image (1600 px, JPEG 0,7)
 * et renvoie le fichier horodaté. Utilisée par les états des lieux (8 photos obligatoires).
 */
export function CameraCapture({
  label,
  value,
  onCapture,
  required,
  flagged,
  className,
}: {
  label: string;
  value?: CapturedPhoto | null;
  onCapture: (photo: CapturedPhoto) => void;
  required?: boolean;
  /** Met la tuile en évidence (dégât détecté, photo manquante…). */
  flagged?: boolean;
  className?: string;
}) {
  const id = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const preview = useMemo(() => (value ? URL.createObjectURL(value.file) : null), [value]);

  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview);
    };
  }, [preview]);

  async function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const original = e.target.files?.[0];
    e.target.value = "";
    if (!original) return;
    setBusy(true);
    setError(null);
    try {
      const now = new Date();
      const { blob, width, height } = await compress(original);
      const stamp = now.toISOString().replace(/[:.]/g, "-");
      const file = new File([blob], `${stamp}.jpg`, { type: "image/jpeg", lastModified: now.getTime() });
      onCapture({ file, capturedAt: now, fresh: now.getTime() - original.lastModified < FRESH_WINDOW_MS, width, height });
    } catch {
      setError("Photo illisible, réessayez.");
    } finally {
      setBusy(false);
    }
  }

  const missing = required && !value;
  const stale = value && !value.fresh;

  return (
    <div className={cn("min-w-0", className)}>
      <input
        ref={inputRef}
        id={id}
        type="file"
        accept="image/*"
        capture="environment"
        className="sr-only"
        onChange={handleChange}
      />
      <label
        htmlFor={id}
        className={cn(
          "group relative flex aspect-[4/3] cursor-pointer flex-col justify-end overflow-hidden rounded-lg border bg-surface-sunken transition-colors",
          "hover:border-border-strong focus-within:ring-3 focus-within:ring-primary/20",
          (flagged || stale) && "border-warning-border ring-1 ring-warning-border",
          missing && "border-dashed border-danger-border"
        )}
      >
        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={preview} alt={label} className="absolute inset-0 size-full object-cover" />
        ) : (
          <span className="absolute inset-0 flex items-center justify-center text-subtle-foreground">
            {busy ? <Loader2 className="size-5 animate-spin" /> : <Camera className="size-5" />}
          </span>
        )}
        <span
          className={cn(
            "relative flex items-center gap-1.5 px-2.5 py-2 text-xs font-medium",
            preview ? "bg-black/55 text-white" : "text-foreground"
          )}
        >
          {value && !stale && <Check className="size-3.5 shrink-0 text-success" aria-hidden />}
          {stale && <TriangleAlert className="size-3.5 shrink-0 text-warning" aria-hidden />}
          <span className="truncate">{label}</span>
          {missing && <span className="ml-auto shrink-0 text-danger">à prendre</span>}
          {value && <RotateCcw className="ml-auto size-3.5 shrink-0 opacity-0 transition-opacity group-hover:opacity-100" aria-label="Reprendre" />}
        </span>
      </label>
      {(error || stale) && (
        <p className={cn("mt-1 text-[11px]", error ? "text-danger" : "text-warning")}>
          {error ?? "Photo ancienne : elle ne semble pas prise à l'instant."}
        </p>
      )}
      {value && !error && !stale && (
        <p className="mt-1 text-[11px] text-muted-foreground tabular">
          {value.capturedAt.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
        </p>
      )}
    </div>
  );
}
