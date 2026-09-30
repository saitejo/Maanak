import type { User } from "@supabase/supabase-js";
import { USER_ROLES, type UserRole } from "@/lib/types";

export function isUserRole(value: unknown): value is UserRole {
  return (
    typeof value === "string" &&
    (USER_ROLES.includes(value as (typeof USER_ROLES)[number]) ||
      value === "auditor")
  );
}

export function getRoleFromUser(user: User | null): UserRole {
  const raw = user?.user_metadata?.role;
  return isUserRole(raw) ? raw : "citizen";
}

export function roleLabel(role: UserRole) {
  switch (role) {
    case "citizen":
      return "Citizen";
    case "manufacturer":
      return "Manufacturer";
    case "auditor":
      return "Auditor";
  }
}
