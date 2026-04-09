import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { hashPassword, createToken, COOKIE_NAME, isSecureContext } from "@/lib/auth";
import { v4 as uuid } from "uuid";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, email, password } = body as { name?: string; email?: string; password?: string };

    if (!email || !password) {
      return NextResponse.json({ error: "Email and password are required" }, { status: 400 });
    }

    if (password.length < 8) {
      return NextResponse.json({ error: "Password must be at least 8 characters" }, { status: 400 });
    }

    const normalizedEmail = email.toLowerCase().trim();

    // Check if user already exists
    const existing = await db.query.users.findFirst({
      where: eq(users.email, normalizedEmail),
    });

    if (existing) {
      return NextResponse.json({ error: "An account with this email already exists" }, { status: 409 });
    }

    const passwordHash = await hashPassword(password);
    const userId = uuid();

    await db.insert(users).values({
      id: userId,
      email: normalizedEmail,
      name: name?.trim() || null,
      passwordHash,
    });

    const token = createToken(userId);

    const response = NextResponse.json({
      ok: true,
      user: { id: userId, email: normalizedEmail, name: name?.trim() || null },
    });

    response.cookies.set(COOKIE_NAME, token, {
      httpOnly: true,
      secure: isSecureContext(),
      sameSite: "lax",
      path: "/",
      maxAge: 30 * 24 * 60 * 60,
    });

    return response;
  } catch (err) {
    console.error("[register]", err);
    return NextResponse.json({ error: "Registration failed" }, { status: 500 });
  }
}
