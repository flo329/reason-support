// Next.js 16 "proxy" (formerly middleware): everything except login, auth and webhooks requires a session.
export { auth as proxy } from "@/auth";

export const config = {
  matcher: ["/((?!api/auth|api/webhooks|login|_next/static|_next/image|favicon.ico).*)"],
};
