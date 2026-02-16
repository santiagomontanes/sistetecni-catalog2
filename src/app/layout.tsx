import type { Metadata } from "next";
import "./globals.css";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import WhatsAppButton from "@/components/WhatsAppButton";

const siteUrl = "https://sistetecni.com";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),

  title: {
    default: "Sistetecni | Laptops corporativas reacondicionadas en Bogotá",
    template: "%s | Sistetecni",
  },

  description:
    "Venta de laptops y computadores corporativos reacondicionados en Bogotá. Equipos verificados, garantía real y soporte técnico. Envíos nacionales. Visítanos en San Diego (Centro).",

  alternates: {
    canonical: siteUrl,
  },

  keywords: [
    "laptops reacondicionadas",
    "computadores corporativos",
    "venta de laptops Bogotá",
    "portátiles usados Bogotá",
    "laptops con garantía",
    "Sistetecni",
    "San Diego Bogotá",
  ],

  openGraph: {
    type: "website",
    url: siteUrl,
    title: "Sistetecni | Laptops corporativas reacondicionadas en Bogotá",
    description:
      "Laptops corporativas reacondicionadas con garantía y soporte técnico. Envíos nacionales y atención en Bogotá (San Diego).",
    siteName: "Sistetecni",
    locale: "es_CO",
  },

  twitter: {
    card: "summary_large_image",
    title: "Sistetecni | Laptops corporativas reacondicionadas en Bogotá",
    description:
      "Laptops corporativas reacondicionadas con garantía. Envíos nacionales y atención en Bogotá.",
  },

  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es">
      <body className="min-h-screen bg-bg text-text antialiased">
        <div className="flex min-h-screen flex-col">
          <Navbar />
          <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">
            {children}
          </main>
          <Footer />
        </div>
        <WhatsAppButton />
      </body>
    </html>
  );
}
