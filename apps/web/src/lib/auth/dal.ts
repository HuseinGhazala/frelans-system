import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { readSession } from "./session";

export const getCurrentUser = cache(async () => {
  const session = await readSession();
  return session?.user ?? null;
});

export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

export async function requireAdmin() {
  const user = await requireUser();
  if (user.role !== "ADMIN") redirect("/me");
  return user;
}

export async function requireEmployee() {
  const user = await requireUser();
  if (user.role !== "EMPLOYEE") redirect("/admin");
  return user;
}
