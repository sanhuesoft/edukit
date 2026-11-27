import { BASE_PATH } from "@/lib/basePath";

export const PROFEKIT_SSO_STATE_COOKIE = "profekit_sso_state";
export const PROFEKIT_SSO_STATE_MAX_AGE = 60 * 10; // 10 minutos

function normalizeBaseUrl(rawUrl: string): string {
  const trimmed = rawUrl.trim().replace(/\/$/, "");
  return trimmed.startsWith("http://") || trimmed.startsWith("https://")
    ? trimmed
    : `https://${trimmed}`;
}

function resolveRequestOrigin(request: Request): string {
  const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  const host = forwardedHost || request.headers.get("host")?.trim();

  if (host) {
    const forwardedProto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
    const isLocal = host.startsWith("localhost") || host.startsWith("127.0.0.1");
    const proto = forwardedProto || (isLocal ? "http" : "https");
    return `${proto}://${host}`;
  }

  return new URL(request.url).origin;
}

export function getProfekitBaseUrl(): string {
  return normalizeBaseUrl(process.env.PROFEKIT_SSO_URL || "https://www.profekit.cl");
}

export function getProfekitSsoConfig(request: Request) {
  const ssoBaseUrl = getProfekitBaseUrl();
  const clientId = process.env.PROFEKIT_CLIENT_ID?.trim() || "horarios_app";
  const clientSecret = process.env.PROFEKIT_CLIENT_SECRET?.trim() || "";

  const rawAppUrl = process.env.NEXT_PUBLIC_APP_URL?.trim()
    ? normalizeBaseUrl(process.env.NEXT_PUBLIC_APP_URL)
    : resolveRequestOrigin(request);
  const appOrigin = new URL(rawAppUrl).origin;

  const redirectUri =
    process.env.PROFEKIT_REDIRECT_URI?.trim() ||
    `${appOrigin}${BASE_PATH}/api/auth/callback/profekit`;

  return { ssoBaseUrl, clientId, clientSecret, appOrigin, redirectUri };
}

export function getProfekitSsoErrorMessage(errorCode: string | null | undefined): string | null {
  if (!errorCode) return null;

  switch (errorCode) {
    case "token_exchange_failed":
      return "No fue posible verificar tus credenciales con ProfeKit. Por favor intenta nuevamente.";
    case "invalid_state":
      return "La sesión de autorización caducó o no es válida. Por favor vuelve a intentarlo.";
    case "missing_code":
      return "La respuesta de autenticación de ProfeKit fue incompleta.";
    case "invalid_user_data":
      return "No pudimos obtener los datos de tu cuenta de ProfeKit. Intenta nuevamente.";
    case "sso_not_configured":
      return "El acceso con cuenta ProfeKit aún no está configurado en este entorno.";
    case "access_denied":
      return "Se canceló la autorización con ProfeKit.";
    case "no_account":
      return "Tu cuenta ProfeKit no está asociada a ninguna cuenta de ProfeKit Horarios. Pide acceso a tu establecimiento o escríbenos a contacto@profekit.cl.";
    case "addon_required":
      return "Tu cuenta ProfeKit no tiene acceso a ProfeKit Horarios. Pide acceso a tu establecimiento o escríbenos a contacto@profekit.cl.";
    case "onboarding_expired":
      return "El registro con tu cuenta ProfeKit caducó. Vuelve a ingresar con ProfeKit para continuar.";
    case "account_inactive":
      return "Tu cuenta de ProfeKit Horarios está inactiva.";
    case "school_inactive":
      return "El establecimiento asociado a tu cuenta no está activo.";
    default:
      return "Ocurrió un inconveniente durante el inicio de sesión con ProfeKit. Por favor reintenta.";
  }
}
