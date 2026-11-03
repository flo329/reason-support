import { Nav } from "@/components/Nav";
import { requireUser } from "@/lib/session";
import { signOut } from "@/auth";

export default async function DashLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  return (
    <div className="min-h-screen md:flex">
      <aside className="border-b border-slate-200 bg-white px-3 py-3 md:sticky md:top-0 md:h-screen md:w-56 md:shrink-0 md:border-b-0 md:border-r md:py-5">
        <div className="mb-3 flex items-center justify-between px-1 md:mb-6 md:block">
          <div className="text-lg font-bold tracking-tight">Reason Support</div>
          <div className="text-xs text-slate-500 md:mt-1">{user.name ?? user.email}</div>
        </div>
        <Nav />
        <form
          className="mt-2 md:absolute md:bottom-5 md:left-3"
          action={async () => {
            "use server";
            await signOut({ redirectTo: "/login" });
          }}
        >
          <button className="px-3 py-1 text-xs text-slate-500 hover:text-slate-900">Sign out</button>
        </form>
      </aside>
      <main className="min-w-0 flex-1 px-4 py-5 md:px-8 md:py-8">{children}</main>
    </div>
  );
}
