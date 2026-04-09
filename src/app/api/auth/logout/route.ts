import { NextResponse } from "next/server";
import { COOKIE_NAME, isSecureContext } from "@/lib/auth";

export async function POST() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set(COOKIE_NAME, "", {
    httpOnly: true,
    secure: isSecureContext(),
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  return response;
}
