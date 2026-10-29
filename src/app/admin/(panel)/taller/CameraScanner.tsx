"use client";
import { useEffect, useRef, useState } from "react";
import jsQR from "jsqr";
type Detector = { detect(video: HTMLVideoElement): Promise<{ rawValue: string }[]> };
export default function CameraScanner({ onScan }: { onScan: (value: string) => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!open) return;
    let stopped = false; let stream: MediaStream | undefined; let timer: ReturnType<typeof setTimeout>;
    async function start() {
      try {
        if (!window.isSecureContext) throw new Error("La cámara requiere HTTPS o localhost. Use ingreso manual.");
        if (!navigator.mediaDevices?.getUserMedia) throw new Error("Este navegador no permite acceder a la cámara. Use ingreso manual del código impreso.");
        // Lector nativo si existe; si no (Safari, Firefox, Chrome de escritorio), jsQR sobre un canvas.
        const ctor = (window as unknown as { BarcodeDetector?: new (options: { formats: string[] }) => Detector }).BarcodeDetector;
        const detector = ctor ? new ctor({ formats: ["qr_code"] }) : null;
        const canvas = document.createElement("canvas");
        const detect = async (v: HTMLVideoElement): Promise<string | null> => {
          if (detector) return (await detector.detect(v))[0]?.rawValue ?? null;
          if (!v.videoWidth || !v.videoHeight) return null;
          const scale = Math.min(1, 640 / v.videoWidth);
          canvas.width = Math.round(v.videoWidth * scale); canvas.height = Math.round(v.videoHeight * scale);
          const ctx = canvas.getContext("2d", { willReadFrequently: true });
          if (!ctx) return null;
          ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
          const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
          return jsQR(image.data, image.width, image.height, { inversionAttempts: "dontInvert" })?.data ?? null;
        };
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false });
        if (stopped) { stream.getTracks().forEach(t => t.stop()); return; }
        if (video.current) { video.current.srcObject = stream; await video.current.play(); }
        async function scan() {
          if (stopped || !video.current) return;
          try { const value = await detect(video.current); if (value) { onScan(value); setOpen(false); return; } } catch { /* Cámara aún preparando cuadro: reintento limitado por intervalo. */ }
          timer = setTimeout(() => void scan(), 200);
        }
        void scan();
      } catch (cause) { setError(cause instanceof DOMException && cause.name === "NotAllowedError" ? "Permiso de cámara denegado. Habilítelo en el candado de la barra de direcciones y vuelva a intentar." : cause instanceof Error && !(cause instanceof DOMException) ? cause.message : "No se pudo acceder a la cámara. Revise permisos o use ingreso manual."); setOpen(false); }
    }
    void start();
    return () => { stopped = true; clearTimeout(timer); stream?.getTracks().forEach(t => t.stop()); };
  }, [open, onScan]);
  return <div><button type="button" className="rounded border px-3 py-2" onClick={() => { setError(""); setOpen(v => !v); }}>{open ? "Cerrar cámara" : "Escanear con cámara"}</button>{open && <video ref={video} muted playsInline className="mt-2 max-h-72 rounded" />}{error && <p className="text-sm text-amber-800">{error}</p>}</div>;
}
