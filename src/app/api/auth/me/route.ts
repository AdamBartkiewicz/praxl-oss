import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";

// Server-side admin check — derived from ADMIN_USER_IDS env var.
// We compute this on the server so the client never needs
// NEXT_PUBLIC_ADMIN_USER_IDS (which would be inlined into the build
// and require a full image rebuild every time the admin list changes).
function getAdminUserIds(): string[] {
  return (process.env.ADMIN_USER_IDS || "").split(",").map(s => s.trim()).filter(Boolean);
}

export async function GET() {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ user: null });
    }

    const user = await db.query.users.findFirst({
      where: eq(users.id, session.userId),
    });

    if (!user) {
      return NextResponse.json({ user: null });
    }

    const isAdmin = getAdminUserIds().includes(user.id);

    return NextResponse.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        imageUrl: user.imageUrl,
        isAdmin,
      },
    });
  } catch {
    return NextResponse.json({ user: null });
  }
}
