import { timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { SESSION_COOKIE_NAME, signSessionToken } from "@/lib/auth";
import { BASE_PATH, withBasePath } from "@/lib/basePath";
import { getProfekitSsoConfig, PROFEKIT_SSO_STATE_COOKIE } from "@/lib/profekitSso";
import {
  PROFEKIT_ONBOARDING_COOKIE,
  PROFEKIT_ONBOARDING_MAX_AGE,
  signOnboardingToken,
} from "@/lib/profekitOnboarding";

type ProfekitTokenPayload = {
  user?: {
    id?: string;
    email?: string;
    name?: string;
    role?: string;
    school?: { code?: string | null; name?: string | null } | null;
  };
  subscription?: { hasHorariosAccess?: boolean };
};

function isSameState(saved: string, received: string): boolean {
  const savedBuf = Buffer.from(saved, "utf8");
  const receivedBuf = Buffer.from(received, "utf8");
  if (savedBuf.length !== receivedBuf.length) return false;
  return timingSafeEqual(savedBuf, receivedBuf);
}

/**
 * Callback del SSO de ProfeKit.
 *
 * Con una cuenta EduKit activa del mismo correo, inicia sesión. Sin cuenta, lleva a /registro
 * para que elija su establecimiento: cada cuenta de EduKit pertenece a uno.
 */
export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const { ssoBaseUrl, clientId, clientSecret, appOrigin, redirectUri } =
    getProfekitSsoConfig(request);

  const loginErrorRedirect = (code: string) =>
    NextResponse.redirect(
      new URL(withBasePath(`/login?error=${encodeURIComponent(code)}`), appOrigin)
    );

  const errorParam = requestUrl.searchParams.get("error");
  if (errorParam) return loginErrorRedirect(errorParam);

  const code = requestUrl.searchParams.get("code");
  const state = requestUrl.searchParams.get("state");
  if (!code || !state) return loginErrorRedirect("missing_code");

  const cookieStore = await cookies();
  const savedState = cookieStore.get(PROFEKIT_SSO_STATE_COOKIE)?.value;
  cookieStore.delete({ name: PROFEKIT_SSO_STATE_COOKIE, path: BASE_PATH });

  if (!savedState || !isSameState(savedState, state)) {
    return loginErrorRedirect("invalid_state");
  }

  if (!clientSecret) {
    console.error("PROFEKIT_CLIENT_SECRET is not configured.");
    return loginErrorRedirect("sso_not_configured");
  }

  try {
    const tokenResponse = await fetch(`${ssoBaseUrl}/api/oauth/token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        redirect_uri: redirectUri,
      }),
      cache: "no-store",
    });

    if (!tokenResponse.ok) {
      const errorPayload = await tokenResponse.json().catch(() => ({}));
      console.error("ProfeKit OAuth exchange error:", errorPayload);
      return loginErrorRedirect("token_exchange_failed");
    }

    const payload = (await tokenResponse.json()) as ProfekitTokenPayload;
    const email = payload.user?.email?.trim().toLowerCase();
    if (!email) return loginErrorRedirect("invalid_user_data");

    // ProfeKit ya bloquea la autorización sin acceso a Horarios; esto lo confirma del lado de EduKit.
    if (payload.subscription?.hasHorariosAccess === false) {
      return loginErrorRedirect("addon_required");
    }

    const user = await prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        role: true,
        isActive: true,
        schoolId: true,
        school: { select: { isActive: true } },
      },
    });

    if (!user) {
      const response = NextResponse.redirect(new URL(withBasePath("/registro"), appOrigin));
      response.cookies.set(
        PROFEKIT_ONBOARDING_COOKIE,
        signOnboardingToken({
          email,
          name: payload.user?.name?.trim() || "",
          schoolCode: payload.user?.school?.code?.trim() || null,
        }),
        {
          httpOnly: true,
          sameSite: "lax",
          secure: process.env.NODE_ENV === "production",
          path: BASE_PATH,
          maxAge: PROFEKIT_ONBOARDING_MAX_AGE,
        }
      );
      return response;
    }
    if (!user.isActive) return loginErrorRedirect("account_inactive");
    if (user.role === "SCHOOL_ADMIN" && (!user.schoolId || !user.school?.isActive)) {
      return loginErrorRedirect("school_inactive");
    }

    const response = NextResponse.redirect(new URL(withBasePath("/app"), appOrigin));
    response.cookies.set(SESSION_COOKIE_NAME, signSessionToken(user.id), {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: BASE_PATH,
      maxAge: 60 * 60 * 24 * 7,
    });
    return response;
  } catch (err) {
    console.error("Error in ProfeKit SSO callback:", err);
    return loginErrorRedirect("sso_exception");
  }
}
