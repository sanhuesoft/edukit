import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { SESSION_COOKIE_NAME, signSessionToken } from "@/lib/auth";
import { BASE_PATH } from "@/lib/basePath";
import {
  formatRbd,
  PROFEKIT_ONBOARDING_COOKIE,
  searchProfekitSchools,
  verifyOnboardingToken,
} from "@/lib/profekitOnboarding";
import { SchoolSetupService } from "@/services/SchoolSetupService";

const onboardingSchema = z.object({
  firstName: z.string().trim().min(2, "Ingresa tu nombre.").max(60),
  lastName: z.string().trim().min(2, "Ingresa tu apellido.").max(60),
  rbd: z.coerce.number().int().positive("Elige tu establecimiento."),
  academicYear: z.coerce.number().int().min(2020).max(2040),
});

/**
 * Crea el establecimiento y la cuenta (administrador del establecimiento) de quien llegó por SSO de
 * ProfeKit sin cuenta. El correo sale de la cookie firmada; el colegio, del directorio de ProfeKit.
 */
export async function POST(request: Request) {
  const cookieStore = await cookies();
  const onboarding = verifyOnboardingToken(cookieStore.get(PROFEKIT_ONBOARDING_COOKIE)?.value);
  if (!onboarding) {
    return NextResponse.json(
      { error: "El registro caducó. Vuelve a ingresar con tu cuenta ProfeKit.", code: "onboarding_expired" },
      { status: 401 }
    );
  }

  const parsed = onboardingSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message || "Datos inválidos." }, { status: 400 });
  }
  const { firstName, lastName, rbd, academicYear } = parsed.data;

  let school;
  try {
    [school] = await searchProfekitSchools({ rbd });
  } catch (err) {
    console.error("Error validating school RBD with ProfeKit:", err);
    return NextResponse.json({ error: "No pudimos verificar el establecimiento. Intenta nuevamente." }, { status: 502 });
  }
  if (!school) {
    return NextResponse.json({ error: "No encontramos ese RBD en el directorio de establecimientos." }, { status: 400 });
  }

  const rbdWithDv = formatRbd(school);
  const existingSchool = await prisma.school.findFirst({
    where: { rbd: { in: [rbdWithDv, String(school.rbd)] } },
    select: { id: true },
  });
  if (existingSchool) {
    return NextResponse.json(
      {
        error:
          "Ese establecimiento ya está registrado en ProfeKit Horarios. Pide a quien lo administra que te dé acceso, o escríbenos a contacto@profekit.cl.",
      },
      { status: 409 }
    );
  }

  try {
    const { admin } = await SchoolSetupService.createSchoolWithAdmin(
      { name: school.name, rbd: rbdWithDv, commune: school.comuna || "Sin comuna", academicYear },
      {
        email: onboarding.email,
        // Entra con ProfeKit; esta clave aleatoria no se comunica a nadie.
        password: randomBytes(32).toString("hex"),
        firstName,
        lastName,
      }
    );

    const response = NextResponse.json({ ok: true });
    response.cookies.set(SESSION_COOKIE_NAME, signSessionToken(admin.id), {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: BASE_PATH,
      maxAge: 60 * 60 * 24 * 7,
    });
    response.cookies.set(PROFEKIT_ONBOARDING_COOKIE, "", { httpOnly: true, path: BASE_PATH, maxAge: 0 });
    return response;
  } catch (err) {
    console.error("Error creating school from ProfeKit onboarding:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "No pudimos crear tu cuenta." },
      { status: 400 }
    );
  }
}
