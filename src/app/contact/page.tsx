"use client";

import { MapPin, Clock, Mail, Instagram, Facebook, Music2 } from "lucide-react";
import FadeIn from "@/components/FadeIn";

export default function ContactPage() {
  return (
    <section className="space-y-10">
      {/* Header */}
      <FadeIn>
        <header className="bleed -mt-8 bg-primary text-white">
          <div className="mx-auto max-w-6xl px-4 py-8 md:py-10">
            <h1 className="font-display text-5xl font-bold uppercase leading-none md:text-6xl">Contacto</h1>
            <p className="mt-3 text-sm text-white/85">
              Estamos listos para asesorarte en tu próxima compra.
            </p>
          </div>
        </header>
      </FadeIn>

      {/* Cards */}
      <FadeIn delay={0.08}>
        <div className="grid gap-6 lg:grid-cols-3">
          {/* Información */}
          <div className="rounded-xl border-2 border-ink bg-white p-6 lg:col-span-2">
            <h2 className="font-display text-2xl font-bold uppercase text-ink">Información</h2>

            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              {/* Dirección */}
              <div className="flex items-start gap-3 rounded-lg bg-paper p-4">
                <MapPin className="mt-0.5 h-5 w-5 text-primary" />
                <div>
                  <div className="font-display text-lg font-bold uppercase leading-tight text-ink">Dirección</div>
                  <a
                    href="https://share.google/S5Z1y5c4WmKYQc9OM"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-primary hover:underline"
                  >
                    Ver en Google Maps
                  </a>
                </div>
              </div>

              {/* Horario */}
              <div className="flex items-start gap-3 rounded-lg bg-paper p-4">
                <Clock className="mt-0.5 h-5 w-5 text-primary" />
                <div>
                  <div className="font-display text-lg font-bold uppercase leading-tight text-ink">Horario</div>
                  <div className="text-sm text-muted">
                    Lunes a Sábado · 10:00 AM a 6:00 PM
                  </div>
                </div>
              </div>

              {/* Email */}
              <div className="flex items-start gap-3 rounded-lg bg-paper p-4">
                <Mail className="mt-0.5 h-5 w-5 text-primary" />
                <div>
                  <div className="font-display text-lg font-bold uppercase leading-tight text-ink">Email</div>
                  <a
                    href="mailto:sistetecnioficial@gmail.com"
                    className="text-sm text-primary hover:underline"
                  >
                    sistetecnioficial@gmail.com
                  </a>
                </div>
              </div>

              {/* Mapa */}
              <div className="flex items-start gap-3 rounded-lg bg-paper p-4">
                <MapPin className="mt-0.5 h-5 w-5 text-primary" />
                <div>
                  <div className="font-display text-lg font-bold uppercase leading-tight text-ink">Ubicación</div>
                  <a
                    href="https://share.google/S5Z1y5c4WmKYQc9OM"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-primary hover:underline"
                  >
                    Abrir mapa completo
                  </a>
                </div>
              </div>
            </div>
          </div>

          {/* Redes Sociales */}
          <div className="rounded-xl border-2 border-ink bg-white p-6">
            <h2 className="font-display text-2xl font-bold uppercase text-ink">Redes sociales</h2>
            <p className="mt-2 text-sm text-muted">
              Síguenos y mira nuestros equipos disponibles.
            </p>

            <div className="mt-5 space-y-3">
              <a
                href="https://www.instagram.com/sistetecni_oficial"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-between rounded-lg border-2 border-ink/15 bg-white p-4 text-sm transition hover:border-primary hover:text-primary"
              >
                <div className="flex items-center gap-3">
                  <Instagram className="h-5 w-5 text-primary" />
                  <span className="font-medium text-text">Instagram</span>
                </div>
                <span className="font-data text-xs uppercase tracking-wider text-muted">Abrir</span>
              </a>

              <a
                href="https://www.facebook.com/share/1CKGvFvska/"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-between rounded-lg border-2 border-ink/15 bg-white p-4 text-sm transition hover:border-primary hover:text-primary"
              >
                <div className="flex items-center gap-3">
                  <Facebook className="h-5 w-5 text-primary" />
                  <span className="font-medium text-text">Facebook</span>
                </div>
                <span className="font-data text-xs uppercase tracking-wider text-muted">Abrir</span>
              </a>

              <a
                href="https://www.tiktok.com/@sistecnioficial?_r=1&_t=ZS-93sWMckVqVR"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-between rounded-lg border-2 border-ink/15 bg-white p-4 text-sm transition hover:border-primary hover:text-primary"
              >
                <div className="flex items-center gap-3">
                  <Music2 className="h-5 w-5 text-primary" />
                  <span className="font-medium text-text">TikTok</span>
                </div>
                <span className="font-data text-xs uppercase tracking-wider text-muted">Abrir</span>
              </a>
            </div>
          </div>
        </div>
      </FadeIn>

      {/* Mapa embebido */}
      <FadeIn delay={0.16}>
        <div className="overflow-hidden rounded-xl border-2 border-ink bg-paper p-3">
          <iframe
            src="https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3976.9078893114665!2d-74.0714662!3d4.6105063!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x8e3f99019ae5b56f%3A0xaf267f6ae4e6eeb3!2sSistetecni!5e0!3m2!1ses!2sco!4v1770958418490!5m2!1ses!2sco"
            title="Mapa de Sistetecni" className="h-[350px] w-full rounded-lg"
            loading="lazy"
          />
        </div>
      </FadeIn>
    </section>
  );
}
