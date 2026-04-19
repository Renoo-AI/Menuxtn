import type { NextAuthOptions, Session } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { compare } from "bcryptjs";
import { getSupabaseAdmin, isSupabaseAdminConfigured } from "@/lib/supabaseAdmin";

export type AppRole = "owner" | "manager" | "super_admin" | "viewer";

export type AppSessionUser = {
  id: string;
  email?: string | null;
  name?: string | null;
  role: AppRole;
  storeId?: string | null;
};

type AdminUserRecord = {
  id: string;
  email: string;
  display_name: string | null;
  password_hash: string;
  store_id: string | null;
};

type UserRoleRecord = {
  role: AppRole;
  store_id: string | null;
};

function normalizeRole(records: UserRoleRecord[], fallbackStoreId: string | null): AppRole {
  if (records.some((record) => record.role === "super_admin")) {
    return "super_admin";
  }

  if (records.some((record) => record.role === "owner")) {
    return "owner";
  }

  if (records.some((record) => record.role === "manager")) {
    return "manager";
  }

  if (fallbackStoreId) {
    return "owner";
  }

  return "viewer";
}

export function isAdminRole(role?: string | null): role is AppRole {
  return role === "owner" || role === "manager" || role === "super_admin";
}

export function canAccessStore(user: { role?: string | null; storeId?: string | null }, storeId: string) {
  return user.role === "super_admin" || user.storeId === storeId;
}

export function getSessionUser(session: Session | null | undefined) {
  if (!session?.user) {
    return null;
  }

  const user = session.user as Session["user"] & AppSessionUser;

  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    storeId: user.storeId,
  };
}

export const authOptions: NextAuthOptions = {
  session: {
    strategy: "jwt",
  },
  secret: process.env.NEXTAUTH_SECRET,
  providers: [
    CredentialsProvider({
      name: "Supabase Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials.password || !isSupabaseAdminConfigured()) {
          return null;
        }

        const supabase = getSupabaseAdmin();
        const userResult = await supabase
          .from("admin_users")
          .select("id, email, display_name, password_hash, store_id")
          .eq("email", credentials.email.toLowerCase())
          .maybeSingle<AdminUserRecord>();

        if (userResult.error || !userResult.data) {
          return null;
        }

        const passwordMatches = await compare(credentials.password, userResult.data.password_hash);

        if (!passwordMatches) {
          return null;
        }

        const roleResult = await supabase
          .from("user_roles")
          .select("role, store_id")
          .eq("user_id", userResult.data.id)
          .returns<UserRoleRecord[]>();

        const roles = roleResult.data ?? [];
        const role = normalizeRole(roles, userResult.data.store_id);
        const storeId =
          roles.find((record) => record.role === "owner" || record.role === "manager")?.store_id ??
          userResult.data.store_id;

        return {
          id: userResult.data.id,
          email: userResult.data.email,
          name: userResult.data.display_name ?? userResult.data.email,
          role,
          storeId,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        const typedUser = user as typeof user & AppSessionUser;
        token.userId = typedUser.id;
        token.role = typedUser.role;
        token.storeId = typedUser.storeId ?? null;
      }

      return token;
    },
    async session({ session, token }) {
      const nextSession = session as Session & {
        user: Session["user"] & AppSessionUser;
      };

      nextSession.user.id = String(token.userId ?? token.sub ?? "");
      nextSession.user.role = (token.role as AppRole | undefined) ?? "viewer";
      nextSession.user.storeId = (token.storeId as string | null | undefined) ?? null;

      return nextSession;
    },
  },
};
