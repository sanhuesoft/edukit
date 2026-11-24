import { NextResponse } from "next/server";
import {
  ACTIVE_SCHOOL_COOKIE_NAME,
  SESSION_COOKIE_NAME,
} from "@/lib/auth";
import { BASE_PATH } from "@/lib/basePath";

export async function POST() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE_NAME, "", {
    httpOnly: true,
    path: BASE_PATH,
    maxAge: 0,
  });
  response.cookies.set(ACTIVE_SCHOOL_COOKIE_NAME, "", {
    httpOnly: true,
    path: BASE_PATH,
    maxAge: 0,
  });
  return response;
}
