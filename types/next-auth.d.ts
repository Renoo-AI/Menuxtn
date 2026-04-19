import { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: DefaultSession["user"] & {
      id: string;
      role: "owner" | "manager" | "super_admin" | "viewer";
      storeId?: string | null;
    };
  }

  interface User {
    id: string;
    role: "owner" | "manager" | "super_admin" | "viewer";
    storeId?: string | null;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    userId?: string;
    role?: "owner" | "manager" | "super_admin" | "viewer";
    storeId?: string | null;
  }
}
