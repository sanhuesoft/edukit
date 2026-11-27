"use client";

import React, { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Eye, EyeOff, Loader2, LockKeyhole, Mail } from "lucide-react";
import { AuthShell } from "@/components/auth/AuthShell";
import { ProfekitIcon } from "@/components/icons/ProfekitIcon";
import { withBasePath } from "@/lib/basePath";
import { getProfekitSsoErrorMessage } from "@/lib/profekitSso";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function LoginPage() {
  return (
    <Suspense fallback={<main className="min-h-dvh bg-[#f2f5fc] dark:bg-background" />}>
      <LoginView />
    </Suspense>
  );
}

function LoginView() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(() =>
    getProfekitSsoErrorMessage(searchParams.get("error"))
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(withBasePath("/api/auth/login"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(data.error || "Revisa tus credenciales.");
        return;
      }
      router.push("/app");
      router.refresh();
    } catch {
      setError("No pudimos comunicarnos con el servidor.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell
      title="Iniciar sesión"
      description="Ingresa con tu cuenta de ProfeKit o con tus credenciales."
      error={error}
    >
      <a
        href={withBasePath("/api/auth/profekit")}
        className="group tactile flex w-full items-center justify-center gap-2.5 bg-[#1f5bff] px-4 py-2.5 text-sm text-white shadow-sm hover:bg-[#1849d9] focus-visible:ring-2 focus-visible:ring-[#1f5bff] focus-visible:ring-offset-2 focus-visible:outline-none"
      >
        <ProfekitIcon className="size-5 shrink-0 fill-white transition-transform group-hover:scale-105" />
        <span>Ingresar con cuenta ProfeKit</span>
      </a>

      <div className="relative my-5">
        <div className="absolute inset-0 flex items-center" aria-hidden="true">
          <span className="w-full border-t" />
        </div>
        <div className="relative flex justify-center text-xs">
          <span className="bg-card px-2.5 font-medium text-muted-foreground">
            o con correo y contraseña
          </span>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="login-email">Correo electrónico</Label>
          <div className="relative">
            <Mail className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="login-email"
              type="email"
              required
              autoComplete="username"
              maxLength={254}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="tu@colegio.cl"
              className="h-11 pl-10"
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="login-password">Contraseña</Label>
          <div className="relative">
            <LockKeyhole className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="login-password"
              type={showPassword ? "text" : "password"}
              required
              autoComplete="current-password"
              maxLength={72}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Ingresa tu contraseña"
              className="h-11 pr-11 pl-10"
            />
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="absolute top-1/2 right-1 -translate-y-1/2 text-muted-foreground"
              aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
              onClick={() => setShowPassword((v) => !v)}
            >
              {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </Button>
          </div>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="tactile tactile-light mt-2 flex w-full items-center justify-center gap-2 bg-[#e8eeff] px-4 py-2.5 text-sm text-[#1238b8] hover:bg-[#dbe4ff] focus-visible:ring-2 focus-visible:ring-[#1f5bff] focus-visible:ring-offset-2 focus-visible:outline-none disabled:opacity-70 dark:bg-[#1a2547] dark:text-blue-100 dark:hover:bg-[#213061]"
        >
          {loading && <Loader2 className="size-4 animate-spin" />}
          {loading ? "Ingresando…" : "Iniciar sesión"}
        </button>
      </form>
    </AuthShell>
  );
}
