"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { Building2, Loader2, Lock, Mail, Moon, ShieldCheck, Sun } from "lucide-react";
import { EduKitLogo } from "@/components/EduKitLogo";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/components/ui/toast";
import { useTheme } from "@/context/ThemeContext";

export default function LoginPage() {
  const router = useRouter();
  const { showToast } = useToast();
  const { theme, toggleTheme } = useTheme();
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
    <div className="flex h-screen w-screen flex-col bg-muted/30">
      <header className="flex h-14 shrink-0 items-center justify-between border-b bg-background px-6">
        <EduKitLogo width={132} height={36} imageClassName="h-7 w-auto" />
        <Button variant="ghost" size="icon" onClick={toggleTheme} aria-label="Cambiar tema">
          {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </Button>
      </header>

      <main className="flex flex-1 items-center justify-center p-8">
        <Card className="w-full max-w-md shadow-sm">
          <CardHeader className="space-y-1.5 text-center">
            <CardTitle className="text-xl font-semibold tracking-tight">
              Iniciar sesión en EduKit
            </CardTitle>
            <CardDescription>
              Ingresa con tu cuenta de Dirección, UTP o Super Administrador.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="login-email">Correo electrónico</Label>
                <div className="relative">
                  <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="login-email"
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="utp@colegio.cl"
                    className="pl-9"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="login-password">Contraseña</Label>
                <div className="relative">
                  <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="login-password"
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="pl-9"
                  />
                </div>
              </div>

              <Button type="submit" className="w-full" disabled={loading}>
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Ingresar
              </Button>
            </form>

            <Separator />

            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground">
                Cuentas de prueba
              </p>
              <div className="grid grid-cols-2 gap-2">
                <Button
                  type="button"
                  variant="outline"
                  className="h-auto flex-col items-start gap-0.5 px-3 py-2 text-left"
                  onClick={() => {
                    setEmail("utp@edukit.cl");
                    setPassword("Admin123!");
                  }}
                >
                  <span className="flex items-center gap-1.5 text-xs font-medium">
                    <Building2 className="h-3.5 w-3.5 text-primary" />
                    Admin Colegio
                  </span>
                  <span className="text-[11px] font-normal text-muted-foreground">
                    utp@edukit.cl
                  </span>
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="h-auto flex-col items-start gap-0.5 px-3 py-2 text-left"
                  onClick={() => {
                    setEmail("superadmin@edukit.cl");
                    setPassword("Admin123!");
                  }}
                >
                  <span className="flex items-center gap-1.5 text-xs font-medium">
                    <ShieldCheck className="h-3.5 w-3.5 text-primary" />
                    Super Admin
                  </span>
                  <span className="text-[11px] font-normal text-muted-foreground">
                    superadmin@edukit.cl
                  </span>
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
