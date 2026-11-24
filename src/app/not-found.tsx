import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex h-screen w-screen flex-col items-center justify-center gap-4 bg-background p-6 text-center">
      <p className="font-mono text-sm text-muted-foreground">404</p>
      <h1 className="text-2xl font-semibold tracking-tight">Página no encontrada</h1>
      <p className="max-w-sm text-sm text-muted-foreground">
        La ruta que buscas no existe en EduKit.
      </p>
      <Button asChild size="sm">
        <Link href="/app">Volver al generador de horarios</Link>
      </Button>
    </div>
  );
}
