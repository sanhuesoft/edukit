import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  PROFEKIT_ONBOARDING_COOKIE,
  searchProfekitSchools,
  splitFullName,
  verifyOnboardingToken,
  type ProfekitSchool,
} from "@/lib/profekitOnboarding";
import { RegistroForm } from "./RegistroForm";

export const metadata = { title: "Crear cuenta | ProfeKit Horarios" };

export default async function RegistroPage() {
  const cookieStore = await cookies();
  const onboarding = verifyOnboardingToken(cookieStore.get(PROFEKIT_ONBOARDING_COOKIE)?.value);
  if (!onboarding) redirect("/login?error=onboarding_expired");

  // Si ProfeKit informa el establecimiento de la cuenta, se precarga (solo si es un RBD del directorio).
  let suggestedSchool: ProfekitSchool | null = null;
  const rbd = onboarding.schoolCode?.match(/^\d+/)?.[0];
  if (rbd) {
    suggestedSchool = (await searchProfekitSchools({ rbd }).catch(() => []))[0] ?? null;
  }

  return (
    <RegistroForm
      email={onboarding.email}
      initialName={splitFullName(onboarding.name)}
      suggestedSchool={suggestedSchool}
      defaultAcademicYear={new Date().getFullYear()}
    />
  );
}
