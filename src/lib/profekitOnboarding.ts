import crypto from "crypto";
import { getProfekitBaseUrl } from "@/lib/profekitSso";

/**
 * Registro de quien entra por SSO de ProfeKit sin cuenta en EduKit: el callback deja una cookie
 * firmada con los datos verificados por ProfeKit y la página /registro la usa para crear el
 * establecimiento y la cuenta.
 */
export const PROFEKIT_ONBOARDING_COOKIE = "profekit_onboarding";
export const PROFEKIT_ONBOARDING_MAX_AGE = 60 * 30; // 30 minutos

export interface ProfekitOnboardingPayload {
  email: string;
  name: string;
  /** RBD del establecimiento que la cuenta tiene en ProfeKit, si lo informa. */
  schoolCode: string | null;
  exp: number;
}

function getSecret(): string {
  return process.env.SESSION_SECRET || "edukit-local-dev-secret-change-in-production-32chars";
}

function sign(encoded: string): string {
  return crypto.createHmac("sha256", `onboarding:${getSecret()}`).update(encoded).digest("base64url");
}

export function signOnboardingToken(data: Omit<ProfekitOnboardingPayload, "exp">): string {
  const payload: ProfekitOnboardingPayload = {
    ...data,
    exp: Math.floor(Date.now() / 1000) + PROFEKIT_ONBOARDING_MAX_AGE,
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${encoded}.${sign(encoded)}`;
}

export function verifyOnboardingToken(token: string | undefined): ProfekitOnboardingPayload | null {
  if (!token) return null;
  const [encoded, sig] = token.split(".");
  if (!encoded || !sig) return null;
  const expected = Buffer.from(sign(encoded));
  const received = Buffer.from(sig);
  if (expected.length !== received.length || !crypto.timingSafeEqual(expected, received)) return null;
  try {
    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as ProfekitOnboardingPayload;
    if (!payload.email || payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

/** Separa "Nombre Apellido1 Apellido2" en nombre y apellidos para precargar el formulario. */
export function splitFullName(fullName: string): { firstName: string; lastName: string } {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length <= 1) return { firstName: parts[0] ?? "", lastName: "" };
  if (parts.length === 2) return { firstName: parts[0], lastName: parts[1] };
  return { firstName: parts.slice(0, -2).join(" "), lastName: parts.slice(-2).join(" ") };
}

export interface ProfekitSchool {
  rbd: number;
  dgv: string;
  name: string;
  comuna: string;
  label: string;
}

/** RBD en el formato de EduKit: número y dígito verificador ("8485-9"). */
export function formatRbd(school: Pick<ProfekitSchool, "rbd" | "dgv">): string {
  return school.dgv ? `${school.rbd}-${school.dgv}` : String(school.rbd);
}

/** Busca en el directorio de establecimientos de ProfeKit (misma lista RBD que usa ProfeKit). */
export async function searchProfekitSchools(
  params: { q: string } | { rbd: string | number }
): Promise<ProfekitSchool[]> {
  const url = new URL(`${getProfekitBaseUrl()}/api/schools/search`);
  if ("rbd" in params) {
    url.searchParams.set("rbd", String(params.rbd));
  } else {
    url.searchParams.set("q", params.q);
    url.searchParams.set("limit", "20");
  }
  const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`ProfeKit schools search failed: ${res.status}`);
  const data = (await res.json()) as { schools?: ProfekitSchool[] };
  return data.schools ?? [];
}
