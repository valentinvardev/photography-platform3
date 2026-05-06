import { TestUploader } from "./TestUploader";

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return (
    <main className="min-h-screen bg-[#0a0a0a] text-white p-8">
      <div className="max-w-2xl mx-auto">
        <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-[#FFE600] mb-2">
          Subida de prueba — sin auth
        </p>
        <h1 className="font-display font-black italic text-4xl mb-2">Subir fotos</h1>
        <p className="font-mono text-[11px] text-white/50 mb-8">colección: {slug}</p>
        <TestUploader slug={slug} />
      </div>
    </main>
  );
}
