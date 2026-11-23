"use client";

export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="es">
      <body className="min-h-screen flex items-center justify-center bg-[#08090d] text-[#f0f0f8] p-6">
        <div className="max-w-md text-center space-y-4">
          <h1 className="text-2xl font-bold">Error inesperado</h1>
          <p className="text-sm text-white/60">
            No pudimos cargar la aplicación correctamente.
          </p>
          <button
            type="button"
            onClick={reset}
            className="inline-flex items-center justify-center rounded-xl bg-[#0353a4] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#1d74d8] transition-colors cursor-pointer"
          >
            Reintentar
          </button>
        </div>
      </body>
    </html>
  );
}
