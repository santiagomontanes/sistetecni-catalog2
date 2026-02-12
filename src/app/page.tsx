import Benefits from '@/components/Benefits';
import Gallery from '@/components/Gallery';
import Hero from '@/components/Hero';
import Testimonials from '@/components/Testimonials';

export default function HomePage() {
  return (
    <div className="space-y-12">
      <Hero />
      <Benefits />
      <Gallery />
      <Testimonials />
    </div>
  );
}
