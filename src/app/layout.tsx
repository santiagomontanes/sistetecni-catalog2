import type { Metadata } from 'next';
import './globals.css';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import WhatsAppButton from '@/components/WhatsAppButton';

export const metadata: Metadata = {
  title: 'Sistetecni',
  description: 'Catálogo de productos y soluciones tecnológicas.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es">
      <body>
        <Navbar />
        <main className="mx-auto min-h-[calc(100vh-180px)] max-w-6xl px-4 py-8">{children}</main>
        <Footer />
        <WhatsAppButton />
      </body>
    </html>
  );
}
