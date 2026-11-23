import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import type { NonTeachingActivityType } from "@prisma/client";

export async function POST(
  request: Request,
  context: { params: Promise<{ versionId: string }> }
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  try {
    const { versionId } = await context.params;
    const body = (await request.json()) as {
      teacherId: string;
      timeSlotId: string;
      activityType: NonTeachingActivityType;
      title: string;
      roomId?: string | null;
    };

    const activity = await prisma.teacherNonTeachingActivity.create({
      data: {
        versionId,
        teacherId: body.teacherId,
        timeSlotId: body.timeSlotId,
        activityType: body.activityType,
        title: body.title.trim(),
        roomId: body.roomId || null,
      },
      include: { teacher: true, timeSlot: true, room: true },
    });

    return NextResponse.json({ activity }, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Error al crear actividad no lectiva." },
      { status: 400 }
    );
  }
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ versionId: string }> }
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const { versionId } = await context.params;
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id requerido" }, { status: 400 });

  await prisma.teacherNonTeachingActivity.deleteMany({
    where: { id, versionId },
  });
  return NextResponse.json({ ok: true });
}
