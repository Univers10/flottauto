"use client";

import { useEffect, useState } from "react";
import { ImageOff, Loader2 } from "lucide-react";
import { fetchInspectionPhoto } from "@/lib/api";
import { cn } from "@/lib/utils";

/**
 * Photo privée d'un état des lieux : téléchargée avec le jeton, affichée via une URL blob
 * libérée au démontage. Ne jamais construire d'URL publique pour ces photos.
 */
export function PrivatePhoto({
  inspectionId,
  photoId,
  alt,
  className,
}: {
  inspectionId: number;
  photoId: number;
  alt: string;
  className?: string;
}) {
  const [state, setState] = useState<{ key: string; url: string | null; failed: boolean }>({ key: "", url: null, failed: false });
  const key = `${inspectionId}:${photoId}`;

  useEffect(() => {
    let cancelled = false;
    let created: string | null = null;
    fetchInspectionPhoto(inspectionId, photoId)
      .then((url) => {
        created = url;
        if (cancelled) URL.revokeObjectURL(url);
        else setState({ key, url, failed: false });
      })
      .catch(() => {
        if (!cancelled) setState({ key, url: null, failed: true });
      });
    return () => {
      cancelled = true;
      if (created) URL.revokeObjectURL(created);
    };
  }, [inspectionId, photoId, key]);

  const current = state.key === key ? state : { url: null, failed: false };

  return (
    <span className={cn("relative flex items-center justify-center overflow-hidden bg-surface-sunken text-subtle-foreground", className)}>
      {current.url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={current.url} alt={alt} className="absolute inset-0 size-full object-cover" />
      ) : current.failed ? (
        <ImageOff className="size-4" aria-label="Photo indisponible" />
      ) : (
        <Loader2 className="size-4 animate-spin" aria-label="Chargement" />
      )}
    </span>
  );
}

/** Télécharge une photo privée sous forme de fichier (pour l'afficher dans une tuile CameraCapture). */
export async function fetchInspectionPhotoFile(inspectionId: number, photoId: number): Promise<File> {
  const url = await fetchInspectionPhoto(inspectionId, photoId);
  try {
    const blob = await (await fetch(url)).blob();
    return new File([blob], `photo-${photoId}.jpg`, { type: blob.type || "image/jpeg" });
  } finally {
    URL.revokeObjectURL(url);
  }
}
