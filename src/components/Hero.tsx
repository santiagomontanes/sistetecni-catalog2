interface HeroProps {
  companyName: string;
  description: string;
}

export default function Hero({ companyName, description }: HeroProps) {
  return (
    <section className="rounded-2xl bg-slate-900 px-6 py-12 text-white">
      <p className="text-sm uppercase tracking-widest text-slate-300">Sistetecni</p>
      <h1 className="mt-2 text-3xl font-bold md:text-4xl">{companyName}</h1>
      <p className="mt-4 max-w-2xl text-sm text-slate-200 md:text-base">{description || 'Soluciones tecnológicas para empresas y hogares.'}</p>
    </section>
  );
}
