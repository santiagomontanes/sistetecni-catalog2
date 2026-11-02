// Código de barras decorativo y determinista (misma salida en servidor y cliente).
function bars(seed: string, count = 46) {
  let h = 2166136261;
  for (const c of seed) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  const out: { x: number; w: number }[] = [];
  let x = 0;
  for (let i = 0; i < count; i++) {
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    const w = 1 + ((h >>> 3) % 4);
    if (i % 2 === 0) out.push({ x, w });
    x += w + 1;
  }
  return { out, width: x };
}

export default function Barcode({ seed, className = "" }: { seed: string; className?: string }) {
  const { out, width } = bars(seed);
  return (
    <svg
      viewBox={`0 0 ${width} 40`}
      preserveAspectRatio="none"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      {out.map((b, i) => (
        <rect key={i} x={b.x} y={0} width={b.w} height={40} fill="currentColor" />
      ))}
    </svg>
  );
}
