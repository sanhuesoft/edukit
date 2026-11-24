import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import {
  ACTIVE_SCHOOL_COOKIE_NAME,
  getCurrentUser,
} from "@/lib/auth";
import { BASE_PATH } from "@/lib/basePath";
import { SchoolSetupService } from "@/services/SchoolSetupService";

const createSchoolSchema = z.object({
  school: z.object({
    name: z.string().min(2),
    rbd: z.string().min(2),
    commune: z.string().min(2),
    academicYear: z.coerce.number().int().min(2020).max(2040),
  }),
  admin: z.object({
    email: z.string().email(),
    password: z.string().min(6),
    firstName: z.string().min(2),
    lastName: z.string().min(2),
  }),
});

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  if (user.role === "SUPER_ADMIN") {
    const schools = await prisma.school.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        _count: { select: { courses: true, teachers: true, scheduleVersions: true } },
      },
    });
    return NextResponse.json({ schools });
  }

  const school = user.schoolId
    ? await prisma.school.findUnique({
        where: { id: user.schoolId },
        include: {
          _count: { select: { courses: true, teachers: true, scheduleVersions: true } },
        },
      })
    : null;

  return NextResponse.json({ schools: school ? [school] : [] });
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user || user.role !== "SUPER_ADMIN") {
    return NextResponse.json(
      { error: "Solo SUPER_ADMIN puede crear establecimientos." },
      { status: 403 }
    );
  }

  try {
    const body = await request.json();
    const parsed = createSchoolSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || "Datos inválidos" },
        { status: 400 }
      );
    }

    const result = await SchoolSetupService.createSchoolWithAdmin(
      parsed.data.school,
      parsed.data.admin
    );
    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Error al crear colegio" },
      { status: 400 }
    );
  }
}

export async function PATCH(request: Request) {
  const user = await getCurrentUser();
  if (!user || user.role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const body = (await request.json()) as { schoolId?: string };
  if (!body.schoolId) {
    return NextResponse.json({ error: "schoolId requerido" }, { status: 400 });
  }

  const exists = await prisma.school.findUnique({ where: { id: body.schoolId } });
  if (!exists) {
    return NextResponse.json({ error: "Colegio no encontrado" }, { status: 404 });
  }

  const res = NextResponse.json({ ok: true, activeSchoolId: exists.id });
  res.cookies.set(ACTIVE_SCHOOL_COOKIE_NAME, exists.id, {
    httpOnly: true,
    sameSite: "lax",
    path: BASE_PATH,
    maxAge: 60 * 60 * 24 * 30,
  });
  return res;
}
