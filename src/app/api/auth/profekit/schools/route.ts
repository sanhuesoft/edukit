import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import {
  PROFEKIT_ONBOARDING_COOKIE,
  searchProfekitSchools,
  verifyOnboardingToken,
} from "@/lib/profekitOnboarding";

/** Búsqueda de establecimientos por nombre, comuna o RBD, solo durante el registro por SSO. */
export async function GET(request: Request) {
  const cookieStore = await cookies();
  if (!verifyOnboardingToken(cookieStore.get(PROFEKIT_ONBOARDING_COOKIE)?.value)) {
    return NextResponse.json({ error: "El registro caducó." }, { status: 401 });
  }

  const q = new URL(request.url).searchParams.get("q")?.trim().slice(0, 80) ?? "";
  if (q.length < 2) return NextResponse.json({ schools: [] });

  try {
    const schools = await searchProfekitSchools({ q });
    return NextResponse.json({ schools });
  } catch (err) {
    console.error("Error searching ProfeKit schools:", err);
    return NextResponse.json({ error: "No pudimos buscar establecimientos." }, { status: 502 });
  }
}
