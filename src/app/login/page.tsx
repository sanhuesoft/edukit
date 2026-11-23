"use client";

import React, { useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Loader2, Lock, Mail, ShieldCheck, Building2 } from "lucide-react";
import { AppNavbar } from "@/components/AppNavbar";
import { AppFooter } from "@/components/AppFooter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/toast";

export default function LoginPage() {
  const router = useRouter();
  const { showToast } = useToast();
  const [email, setEmail] = useState("utp@edukit.cl");
  const [password, setPassword] = useState("Admin123!");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        showToast({
          variant: "error",
          title: "No se pudo iniciar sesión",
          description: data.error || "Revisa tus credenciales.",
        });
        return;
      }
      router.push("/horarios");
      router.refresh();
    } catch {
      showToast({
        variant: "error",
        title: "Error de conexión",
        description: "No pudimos comunicarnos con el servidor.",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="page-wrapper relative">
      <div className="bg-mesh" aria-hidden="true" />
      <AppNavbar />

      <main className="relative z-10 flex flex-1 items-center justify-center px-4 py-12">
        <Card className="w-full max-w-md">
          <CardHeader className="space-y-1.5 text-center">
            <Image
              src="/isotipo_450.png"
              alt="EduKit"
              width={56}
              height={56}
              priority
              className="mx-auto mb-1 h-14 w-14 rounded-2xl object-cover shadow-[var(--shadow-btn)]"
            />
            <CardTitle className="text-2xl">Acceso a EduKit</CardTitle>
            <CardDescription>
              Ingresa con tu cuenta de Dirección, UTP o Super Administrador.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="login-email">Correo electrónico</Label>
                <div className="relative">
                  <Mail className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--text-muted)]" />
                  <Input
                    id="login-email"
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="utp@colegio.cl"
                    className="h-10 pl-9"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="login-password">Contraseña</Label>
                <div className="relative">
                  <Lock className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--text-muted)]" />
                  <Input
                    id="login-password"
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="h-10 pl-9"
                  />
                </div>
              </div>

              <Button type="submit" className="w-full" disabled={loading}>
                {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                Ingresar al módulo
              </Button>
            </form>

            <div className="space-y-2 border-t border-[var(--border-subtle)] pt-4">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                Cuentas demo precargadas
              </p>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setEmail("utp@edukit.cl");
                    setPassword("Admin123!");
                  }}
                  className="flex flex-col items-start gap-0.5 rounded-xl border border-[var(--border-card)] bg-[var(--bg-card-subtle)] p-2.5 text-left transition-colors hover:border-[var(--accent-1)] cursor-pointer"
                >
                  <span className="flex items-center gap-1 text-xs font-semibold text-[var(--text-primary)]">
                    <Building2 className="h-3.5 w-3.5 text-[var(--accent-1)]" />
                    Admin Colegio
                  </span>
                  <span className="text-[11px] text-[var(--text-muted)]">utp@edukit.cl</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setEmail("superadmin@edukit.cl");
                    setPassword("Admin123!");
                  }}
                  className="flex flex-col items-start gap-0.5 rounded-xl border border-[var(--border-card)] bg-[var(--bg-card-subtle)] p-2.5 text-left transition-colors hover:border-[var(--accent-1)] cursor-pointer"
                >
                  <span className="flex items-center gap-1 text-xs font-semibold text-[var(--text-primary)]">
                    <ShieldCheck className="h-3.5 w-3.5 text-[var(--accent-2)]" />
                    Super Admin
                  </span>
                  <span className="text-[11px] text-[var(--text-muted)]">superadmin@edukit.cl</span>
                </button>
              </div>
            </div>
          </CardContent>
        </Card>
      </main>

      <AppFooter />
    </div>
  );
}
