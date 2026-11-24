import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { verifyPassword } from "@/lib/password";
import {
  SESSION_COOKIE_NAME,
  signSessionToken,
} from "@/lib/auth";
import { BASE_PATH } from "@/lib/basePath";

const loginSchema = z.object({
  email: z.string().email("Correo inválido"),
  password: z.string().min(1, "Ingresa tu contraseña"),
});

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = loginSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || "Datos inválidos" },
        { status: 400 }
      );
    }

    const email = parsed.data.email.trim().toLowerCase();
    const user = await prisma.user.findUnique({
      where: { email },
      include: { school: { select: { id: true, name: true, isActive: true } } },
    });

    if (!user || !user.isActive || !verifyPassword(parsed.data.password, user.passwordHash)) {
      return NextResponse.json(
        { error: "Credenciales incorrectas o cuenta inactiva." },
        { status: 401 }
      );
    }

    if (user.role === "SCHOOL_ADMIN" && (!user.schoolId || !user.school?.isActive)) {
      return NextResponse.json(
        { error: "El establecimiento asociado a esta cuenta no está activo." },
        { status: 403 }
      );
    }

    const token = signSessionToken(user.id);
    const response = NextResponse.json({
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        schoolId: user.schoolId,
        schoolName: user.school?.name ?? null,
      },
    });

    response.cookies.set(SESSION_COOKIE_NAME, token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: BASE_PATH,
      maxAge: 60 * 60 * 24 * 7,
    });

    return response;
  } catch (err) {
    console.error("Login error:", err);
    return NextResponse.json({ error: "Error al iniciar sesión." }, { status: 500 });
  }
}
