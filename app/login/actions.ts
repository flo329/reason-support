"use server";

import { AuthError } from "next-auth";
import { signIn } from "@/auth";

export async function loginWithPassword(_prev: string | null, formData: FormData): Promise<string | null> {
  try {
    await signIn("credentials", {
      email: formData.get("email"),
      password: formData.get("password"),
      redirectTo: "/",
    });
    return null;
  } catch (err) {
    if (err instanceof AuthError) return "Invalid email or password.";
    throw err; // NEXT_REDIRECT must propagate
  }
}

export async function loginWithGoogle() {
  await signIn("google", { redirectTo: "/" });
}
