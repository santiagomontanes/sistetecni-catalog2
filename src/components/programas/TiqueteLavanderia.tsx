"use client";

import { motion, useReducedMotion } from "framer-motion";
import Barcode from "@/components/home/Barcode";

const ease = [0.22, 1, 0.36, 1] as const;

// Tiquete de orden de ejemplo: el objeto que la lavandería entrega al cliente.
// Se imprime de arriba hacia abajo (mismo gesto que la guía de envío de la portada).
export default function TiqueteLavanderia() {
  const reduce = useReducedMotion();

  return (
    <div className="relative mx-auto w-full max-w-[380px] lg:mx-0 lg:justify-self-end">
      <div className="relative rotate-2">
        <motion.div
          initial={reduce ? false : { clipPath: "inset(0 0 100% 0)" }}
          animate={{ clipPath: "inset(-40px -40px -60px -40px)" }}
          transition={{ duration: 0.9, ease, delay: 0.15 }}
          className="relative rounded-md bg-white p-6 text-ink shadow-[0_24px_40px_-18px_rgba(5,12,40,0.55)]"
        >
          <div className="flex items-start justify-between border-b-2 border-ink pb-3">
            <div>
              <p className="font-display text-3xl font-extrabold uppercase leading-none">Tu lavandería</p>
              <p className="mt-1 font-data text-[11px] font-medium uppercase tracking-wider text-ink/70">Tiquete de orden</p>
            </div>
          </div>

          <dl className="divide-y divide-ink/15 font-body">
            {[
              ["Cliente", "Nombre del cliente"],
              ["Prendas", "2 camisas · 1 chaqueta"],
              ["Pago", "Abono recibido"],
              ["Entrega", "Lista para entregar"],
            ].map(([k, v]) => (
              <div key={k} className="grid grid-cols-[5.5rem_1fr] items-baseline gap-3 py-2.5">
                <dt className="font-data text-[11px] font-medium uppercase tracking-wider text-ink/60">{k}</dt>
                <dd className="text-lg font-semibold leading-tight">{v}</dd>
              </div>
            ))}
          </dl>

          <div className="relative mt-2 overflow-hidden text-ink">
            <Barcode seed="orden-lavanderia-ejemplo" className="h-16 w-full" />
            <div className="pointer-events-none absolute inset-x-0 top-0 h-3 animate-scan bg-gradient-to-b from-transparent via-primary/50 to-transparent motion-reduce:hidden" aria-hidden="true" />
          </div>
          <p className="mt-1 text-center font-data text-[11px] font-medium uppercase tracking-[0.3em] text-ink/70">tiquete de ejemplo</p>
        </motion.div>

        <motion.div
          role="img"
          aria-label="Sello: lista para entregar"
          initial={reduce ? false : { scale: 0.4, rotate: -30, opacity: 0 }}
          animate={{ scale: 1, rotate: 9, opacity: 1 }}
          transition={{ type: "spring", stiffness: 260, damping: 18, delay: 1.0 }}
          className="absolute -right-3 -top-7 flex h-24 w-24 select-none flex-col items-center justify-center rounded-full bg-tape text-center text-ink shadow-[0_10px_18px_-8px_rgba(0,0,0,0.55)]"
        >
          <span className="font-display text-3xl font-extrabold uppercase leading-[0.9]">Lista</span>
          <span className="font-display text-base font-bold uppercase leading-tight">para<br />entregar</span>
        </motion.div>
      </div>
    </div>
  );
}
