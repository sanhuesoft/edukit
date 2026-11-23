"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="page-wrapper relative items-center justify-center px-4 text-center">
      <div className="bg-mesh" aria-hidden="true" />
      <div className="relative z-10 max-w-md space-y-4">
        <h1 className="text-3xl font-bold text-[var(--text-primary)]">
          Algo salió mal
        </h1>
        <p className="text-sm text-[var(--text-secondary)]">
          Ocurrió un error inesperado al cargar esta vista.
        </p>
        <div className="flex items-center justify-center gap-3 pt-2">
          <Button onClick={reset}>Reintentar</Button>
          <Button variant="secondary" asChild>
            <Link href="/">Ir al inicio</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
