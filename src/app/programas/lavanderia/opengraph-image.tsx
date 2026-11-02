import { ImageResponse } from "next/og";

export const alt = "Tu lavandería organizada: sin cuaderno y sin internet";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Imagen que se ve al compartir el enlace por WhatsApp, Instagram o Facebook.
export default function Image() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", background: "#1A56DB", color: "#fff", padding: 72 }}>
        <div style={{ display: "flex", fontSize: 40, fontWeight: 800, letterSpacing: 2, textTransform: "uppercase" }}>
          SISTE<span style={{ color: "#FFD400" }}>TECNI</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", fontSize: 92, fontWeight: 800, lineHeight: 1, textTransform: "uppercase" }}>Tu lavandería organizada:</div>
          <div style={{ display: "flex", fontSize: 92, fontWeight: 800, lineHeight: 1, textTransform: "uppercase", color: "#FFD400", marginTop: 8 }}>sin cuaderno y sin internet</div>
        </div>
        <div style={{ display: "flex", alignSelf: "flex-start", background: "#FFD400", color: "#0B1020", fontSize: 36, fontWeight: 800, textTransform: "uppercase", padding: "14px 28px", borderRadius: 8 }}>
          Agenda tu demo gratis
        </div>
      </div>
    ),
    size,
  );
}
