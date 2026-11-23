import Link from "next/link";
import { AppNavbar } from "@/components/AppNavbar";
import { AppFooter } from "@/components/AppFooter";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="page-wrapper relative">
      <div className="bg-mesh" aria-hidden="true" />
      <AppNavbar />
      <main className="relative z-10 flex flex-1 flex-col items-center justify-center px-4 text-center">
        <div className="max-w-md space-y-4">
          <p className="text-sm font-semibold uppercase tracking-widest text-[var(--accent-1)]">
            404
          </p>
          <h1 className="text-3xl font-bold text-[var(--text-primary)]">
            Página no encontrada
          </h1>
          <p className="text-sm text-[var(--text-secondary)]">
            La ruta que buscas no existe o aún no ha sido creada.
          </p>
          <div className="pt-2">
            <Button asChild>
              <Link href="/">Volver al inicio</Link>
            </Button>
          </div>
        </div>
      </main>
      <AppFooter />
    </div>
  );
}
