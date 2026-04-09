import { NextRequest, NextResponse } from "next/server";
import { authMiddleware } from "@/lib/auth/middleware";

export default function middleware(request: NextRequest) {
  return authMiddleware(request) ?? NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
