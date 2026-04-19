"use client";

import { SessionProvider } from "next-auth/react";
import type { ReactNode } from "react";

type ProvidersProps = {
  children: ReactNode;
};

export function Providers({ children }: ProvidersProps) {
  const basePath = `${process.env.NEXT_PUBLIC_API_PATH ?? "/api"}/auth`;

  return <SessionProvider basePath={basePath}>{children}</SessionProvider>;
}
