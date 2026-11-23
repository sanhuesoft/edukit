import crypto from "crypto";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import type { UserRole } from "@prisma/client";

export const SESSION_COOKIE_NAME = "edukit_session";
export const ACTIVE_SCHOOL_COOKIE_NAME = "edukit_active_school";

export interface SessionUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: UserRole;
  schoolId: string | null;
  schoolName: string | null;
}

function getSecret(): string {
  return (
    process.env.SESSION_SECRET ||
    "edukit-local-dev-secret-change-in-production-32chars"
  );
}

interface TokenPayload {
  uid: string;
  exp: number;
}

export function signSessionToken(userId: string, ttlSeconds = 60 * 60 * 24 * 7): string {
  const payload: TokenPayload = {
    uid: userId,
    exp: Math.floor(Date.now() / 1000) + ttlSeconds,
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = crypto
    .createHmac("sha256", getSecret())
    .update(encoded)
    .digest("base64url");
  return `${encoded}.${sig}`;
}

export function verifySessionToken(token: string): TokenPayload | null {
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [encoded, sig] = parts;
  const expectedSig = crypto
    .createHmac("sha256", getSecret())
    .update(encoded)
    .digest("base64url");
  const sigBuf = Buffer.from(sig);
  const expBuf = Buffer.from(expectedSig);
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    return null;
  }
  try {
    const payload = JSON.parse(
      Buffer.from(encoded, "base64url").toString("utf8")
    ) as TokenPayload;
    if (!payload.uid || payload.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

export async function getCurrentUser(): Promise<SessionUser | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!token) return null;
  const payload = verifySessionToken(token);
  if (!payload) return null;

  const user = await prisma.user.findUnique({
    where: { id: payload.uid },
    include: { school: { select: { id: true, name: true, isActive: true } } },
  });

  if (!user || !user.isActive) return null;
  if (user.role === "SCHOOL_ADMIN" && (!user.schoolId || !user.school?.isActive)) {
    return null;
  }

  return {
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    role: user.role,
    schoolId: user.schoolId,
    schoolName: user.school?.name ?? null,
  };
}

export async function resolveActiveSchoolId(
  user: SessionUser,
  requestedSchoolId?: string | null
): Promise<string | null> {
  if (user.role === "SCHOOL_ADMIN") {
    return user.schoolId;
  }
  if (requestedSchoolId) {
    return requestedSchoolId;
  }
  const cookieStore = await cookies();
  const cookieSchoolId = cookieStore.get(ACTIVE_SCHOOL_COOKIE_NAME)?.value;
  if (cookieSchoolId) {
    const exists = await prisma.school.findUnique({
      where: { id: cookieSchoolId },
      select: { id: true },
    });
    if (exists) return exists.id;
  }
  const firstSchool = await prisma.school.findFirst({
    where: { isActive: true },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
  return firstSchool?.id ?? null;
}
