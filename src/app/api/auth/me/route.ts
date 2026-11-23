import { NextResponse } from "next/server";
import { getCurrentUser, resolveActiveSchoolId } from "@/lib/auth";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ user: null, activeSchoolId: null });
  }
  const activeSchoolId = await resolveActiveSchoolId(user);
  return NextResponse.json({ user, activeSchoolId });
}
