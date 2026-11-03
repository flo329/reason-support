import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { env } from "@/lib/env";
import { LoginForm } from "./LoginForm";
import { loginWithGoogle } from "./actions";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const session = await auth();
  if (session?.user) redirect("/");
  const { error } = await searchParams;

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-xl font-bold">Reason Support</h1>
        <p className="mb-5 mt-1 text-sm text-slate-500">Team sign-in</p>
        {error === "AccessDenied" && (
          <p className="mb-3 rounded bg-red-50 p-2 text-sm text-red-700">
            That account isn&apos;t allowed. Use your @{env.allowedEmailDomain || "company"} email.
          </p>
        )}
        {env.googleEnabled && (
          <>
            <form action={loginWithGoogle}>
              <button className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm font-medium hover:bg-slate-50">
                Continue with Google
              </button>
            </form>
            <div className="my-4 text-center text-xs text-slate-400">or</div>
          </>
        )}
        <LoginForm />
      </div>
    </div>
  );
}
