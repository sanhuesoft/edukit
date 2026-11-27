import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { BASE_PATH } from "@/lib/basePath";
import {
  getProfekitSsoConfig,
  PROFEKIT_SSO_STATE_COOKIE,
  PROFEKIT_SSO_STATE_MAX_AGE,
} from "@/lib/profekitSso";

export async function GET(request: Request) {
  const { ssoBaseUrl, clientId, redirectUri } = getProfekitSsoConfig(request);
  const state = randomBytes(32).toString("hex");

  const authorizeUrl = new URL(`${ssoBaseUrl}/oauth/authorize`);
  authorizeUrl.searchParams.set("client_id", clientId);
  authorizeUrl.searchParams.set("redirect_uri", redirectUri);
  authorizeUrl.searchParams.set("state", state);

  const response = NextResponse.redirect(authorizeUrl.toString());
  response.cookies.set(PROFEKIT_SSO_STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: BASE_PATH,
    maxAge: PROFEKIT_SSO_STATE_MAX_AGE,
  });
  return response;
}
