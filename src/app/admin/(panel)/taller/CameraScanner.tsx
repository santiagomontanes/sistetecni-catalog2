"use client";
import { useEffect, useRef, useState } from "react";
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
        const ctor = (window as unknown as { BarcodeDetector?: new (options: { formats: string[] }) => Detector }).BarcodeDetector;
        if (!ctor) throw new Error("Este navegador no permite lectura QR integrada. Use ingreso manual del código impreso.");
        const detector = new ctor({ formats: ["qr_code"] });
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false });
        if (stopped) { stream.getTracks().forEach(t => t.stop()); return; }
        if (video.current) { video.current.srcObject = stream; await video.current.play(); }
        async function scan() {
          if (stopped || !video.current) return;
          try { const codes = await detector.detect(video.current); if (codes[0]) { onScan(codes[0].rawValue); setOpen(false); return; } } catch { /* Cámara aún preparando cuadro: reintento limitado por intervalo. */ }
          timer = setTimeout(() => void scan(), 350);
        }
        void scan();
      } catch (cause) { setError(cause instanceof Error ? cause.message : "No se pudo acceder a la cámara. Revise permisos o use ingreso manual."); setOpen(false); }
    }
    void start();
    return () => { stopped = true; clearTimeout(timer); stream?.getTracks().forEach(t => t.stop()); };
  }, [open, onScan]);
  return <div><button type="button" className="rounded border px-3 py-2" onClick={() => { setError(""); setOpen(v => !v); }}>{open ? "Cerrar cámara" : "Escanear con cámara"}</button>{open && <video ref={video} muted playsInline className="mt-2 max-h-72 rounded" />}{error && <p className="text-sm text-amber-800">{error}</p>}</div>;
}
