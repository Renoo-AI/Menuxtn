"use client";

import { FormEvent, useEffect, useState } from "react";
import { signIn, signOut, useSession } from "next-auth/react";

type SessionUser = {
  role?: string;
};

type StoreRecord = {
  id: string;
  name: string;
  slug: string | null;
  owner_id: string | null;
  description: string | null;
};

type BannedIpRecord = {
  id?: string;
  ip_address: string;
  reason: string | null;
  expires_at: string | null;
  active?: boolean;
};

export default function SuperAdminPage() {
  const apiBase = process.env.NEXT_PUBLIC_API_PATH ?? "/api";
  const { data: session, status, update } = useSession();
  const user = session?.user as SessionUser | undefined;
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [stores, setStores] = useState<StoreRecord[]>([]);
  const [bannedIps, setBannedIps] = useState<BannedIpRecord[]>([]);
  const [statusMessage, setStatusMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [storeForm, setStoreForm] = useState({
    name: "",
    slug: "",
    description: "",
    owner_id: "",
  });
  const [banForm, setBanForm] = useState({
    ip_address: "",
    reason: "",
    expires_at: "",
  });

  useEffect(() => {
    async function bootstrap() {
      if (user?.role !== "super_admin") {
        return;
      }

      setLoading(true);
      setErrorMessage("");

      try {
        const [storesResponse, bannedIpsResponse] = await Promise.all([
          fetch(`${apiBase}/admin/stores`, { credentials: "include" }),
          fetch(`${apiBase}/admin/banned-ips`, { credentials: "include" }),
        ]);

        if (!storesResponse.ok) {
          throw new Error("Unable to load stores.");
        }

        if (!bannedIpsResponse.ok) {
          throw new Error("Unable to load banned IP list.");
        }

        const storesPayload = (await storesResponse.json()) as { stores?: StoreRecord[] };
        const bannedIpsPayload = (await bannedIpsResponse.json()) as { bannedIps?: BannedIpRecord[] };

        setStores(storesPayload.stores ?? []);
        setBannedIps(bannedIpsPayload.bannedIps ?? []);
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : "Unknown dashboard error.");
      } finally {
        setLoading(false);
      }
    }

    void bootstrap();
  }, [apiBase, user?.role]);

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage("");
    setLoading(true);

    const result = await signIn("credentials", {
      email,
      password,
      redirect: false,
      callbackUrl: process.env.NEXT_PUBLIC_SUPER_ADMIN_PATH ?? "/",
    });

    if (result?.error) {
      setErrorMessage(result.error);
      setLoading(false);
      return;
    }

    await update();
    setLoading(false);
  }

  async function createStore(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatusMessage("Creating store...");

    const response = await fetch(`${apiBase}/admin/stores`, {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(storeForm),
    });

    const payload = (await response.json().catch(() => ({}))) as {
      error?: string;
      store?: StoreRecord;
    };

    if (!response.ok || !payload.store) {
      setStatusMessage(payload.error || "Unable to create store.");
      return;
    }

    setStores((current) => [payload.store as StoreRecord, ...current]);
    setStoreForm({
      name: "",
      slug: "",
      description: "",
      owner_id: "",
    });
    setStatusMessage("Store created.");
  }

  async function banIp(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatusMessage("Saving IP ban...");

    const response = await fetch(`${apiBase}/admin/banned-ips`, {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(banForm),
    });

    const payload = (await response.json().catch(() => ({}))) as {
      error?: string;
      bannedIp?: BannedIpRecord;
    };

    if (!response.ok || !payload.bannedIp) {
      setStatusMessage(payload.error || "Unable to ban IP.");
      return;
    }

    setBannedIps((current) => [payload.bannedIp as BannedIpRecord, ...current]);
    setBanForm({
      ip_address: "",
      reason: "",
      expires_at: "",
    });
    setStatusMessage("IP banned.");
  }

  async function unbanIp(ipAddress: string) {
    setStatusMessage(`Removing ban for ${ipAddress}...`);

    const response = await fetch(`${apiBase}/admin/banned-ips`, {
      method: "DELETE",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ ip_address: ipAddress }),
    });

    const payload = (await response.json().catch(() => ({}))) as { error?: string };

    if (!response.ok) {
      setStatusMessage(payload.error || "Unable to unban IP.");
      return;
    }

    setBannedIps((current) => current.filter((item) => item.ip_address !== ipAddress));
    setStatusMessage(`Removed ban for ${ipAddress}.`);
  }

  if (status === "loading") {
    return <DashboardShell title="Super Admin">Loading session...</DashboardShell>;
  }

  if (!session) {
    return (
      <DashboardShell title="Super Admin">
        <section className="mx-auto grid max-w-5xl gap-10 lg:grid-cols-[0.9fr_1.1fr]">
          <div className="space-y-4">
            <p className="text-sm font-semibold uppercase tracking-[0.3em] text-stone-500">
              Hidden control plane
            </p>
            <h1 className="text-4xl font-semibold tracking-tight text-stone-950">
              Super-admin access
            </h1>
            <p className="max-w-xl leading-7 text-stone-600">
              Sign in with a user mapped to the <code>super_admin</code> role in the
              <code>user_roles</code> table to manage stores and banned IPs.
            </p>
          </div>

          <form
            className="rounded-[2rem] border border-stone-200 bg-white p-8 shadow-sm"
            onSubmit={handleLogin}
          >
            <div className="grid gap-4">
              <input
                className="rounded-2xl border border-stone-300 px-4 py-3"
                type="email"
                placeholder="admin@menux.local"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
              />
              <input
                className="rounded-2xl border border-stone-300 px-4 py-3"
                type="password"
                placeholder="Password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
              />
              {errorMessage ? (
                <p className="rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700">
                  {errorMessage}
                </p>
              ) : null}
              <button
                className="rounded-2xl bg-stone-950 px-5 py-3 font-medium text-white"
                type="submit"
              >
                {loading ? "Signing in..." : "Sign in"}
              </button>
            </div>
          </form>
        </section>
      </DashboardShell>
    );
  }

  if (user?.role !== "super_admin") {
    return (
      <DashboardShell title="Super Admin">
        <section className="rounded-[2rem] border border-red-200 bg-red-50 p-8 text-red-900 shadow-sm">
          <h1 className="text-2xl font-semibold">Super-admin role required</h1>
          <p className="mt-3 leading-7">
            This page is reserved for users that have the <code>super_admin</code> role in
            Supabase.
          </p>
        </section>
      </DashboardShell>
    );
  }

  return (
    <DashboardShell title="Super Admin">
      <div className="grid gap-8 xl:grid-cols-[1.05fr_0.95fr]">
        <section className="space-y-8">
          <section className="rounded-[2rem] border border-stone-200 bg-white p-8 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h1 className="text-3xl font-semibold tracking-tight text-stone-950">
                  Store administration
                </h1>
                <p className="mt-2 max-w-2xl text-sm leading-7 text-stone-600">
                  Create stores, review ownership, and prepare owner dashboards.
                </p>
              </div>
              <button
                className="rounded-2xl border border-stone-300 px-4 py-2 text-sm font-medium"
                onClick={() => void signOut({ callbackUrl: process.env.NEXT_PUBLIC_SUPER_ADMIN_PATH })}
                type="button"
              >
                Sign out
              </button>
            </div>

            {errorMessage ? (
              <p className="mt-6 rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700">
                {errorMessage}
              </p>
            ) : null}

            {statusMessage ? (
              <p className="mt-6 rounded-2xl bg-stone-100 px-4 py-3 text-sm text-stone-700">
                {statusMessage}
              </p>
            ) : null}

            <div className="mt-8 space-y-4">
              {loading && !stores.length ? (
                <p className="text-sm text-stone-500">Loading stores...</p>
              ) : stores.length ? (
                stores.map((store) => (
                  <article
                    key={store.id}
                    className="rounded-3xl border border-stone-200 bg-stone-50/70 p-5"
                  >
                    <h2 className="text-lg font-semibold text-stone-950">{store.name}</h2>
                    <p className="mt-2 text-sm text-stone-600">
                      {store.description || "No description"}
                    </p>
                    <div className="mt-4 flex flex-wrap gap-2 text-xs text-stone-500">
                      <span className="rounded-full bg-white px-3 py-1">slug: {store.slug || "n/a"}</span>
                      <span className="rounded-full bg-white px-3 py-1">
                        owner: {store.owner_id || "unassigned"}
                      </span>
                    </div>
                  </article>
                ))
              ) : (
                <p className="text-sm text-stone-500">No stores yet.</p>
              )}
            </div>
          </section>
        </section>

        <aside className="space-y-8">
          <section className="rounded-[2rem] border border-stone-200 bg-white p-8 shadow-sm">
            <h2 className="text-xl font-semibold text-stone-950">Create store</h2>
            <form className="mt-6 grid gap-4" onSubmit={createStore}>
              <input
                className="rounded-2xl border border-stone-300 px-4 py-3"
                placeholder="Store name"
                value={storeForm.name}
                onChange={(event) =>
                  setStoreForm((current) => ({ ...current, name: event.target.value }))
                }
                required
              />
              <input
                className="rounded-2xl border border-stone-300 px-4 py-3"
                placeholder="Slug"
                value={storeForm.slug}
                onChange={(event) =>
                  setStoreForm((current) => ({ ...current, slug: event.target.value }))
                }
                required
              />
              <textarea
                className="min-h-24 rounded-2xl border border-stone-300 px-4 py-3"
                placeholder="Description"
                value={storeForm.description}
                onChange={(event) =>
                  setStoreForm((current) => ({ ...current, description: event.target.value }))
                }
              />
              <input
                className="rounded-2xl border border-stone-300 px-4 py-3"
                placeholder="Owner user id"
                value={storeForm.owner_id}
                onChange={(event) =>
                  setStoreForm((current) => ({ ...current, owner_id: event.target.value }))
                }
              />
              <button className="rounded-2xl bg-stone-950 px-5 py-3 font-medium text-white" type="submit">
                Create store
              </button>
            </form>
          </section>

          <section className="rounded-[2rem] border border-stone-200 bg-white p-8 shadow-sm">
            <h2 className="text-xl font-semibold text-stone-950">Banned IPs</h2>
            <form className="mt-6 grid gap-4" onSubmit={banIp}>
              <input
                className="rounded-2xl border border-stone-300 px-4 py-3"
                placeholder="IP address"
                value={banForm.ip_address}
                onChange={(event) =>
                  setBanForm((current) => ({ ...current, ip_address: event.target.value }))
                }
                required
              />
              <input
                className="rounded-2xl border border-stone-300 px-4 py-3"
                placeholder="Reason"
                value={banForm.reason}
                onChange={(event) =>
                  setBanForm((current) => ({ ...current, reason: event.target.value }))
                }
              />
              <input
                className="rounded-2xl border border-stone-300 px-4 py-3"
                type="datetime-local"
                value={banForm.expires_at}
                onChange={(event) =>
                  setBanForm((current) => ({ ...current, expires_at: event.target.value }))
                }
              />
              <button className="rounded-2xl bg-stone-950 px-5 py-3 font-medium text-white" type="submit">
                Ban IP
              </button>
            </form>

            <div className="mt-8 space-y-3">
              {bannedIps.length ? (
                bannedIps.map((entry) => (
                  <div
                    key={entry.id || entry.ip_address}
                    className="rounded-3xl border border-stone-200 bg-stone-50/70 p-4"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="font-medium text-stone-950">{entry.ip_address}</p>
                        <p className="mt-1 text-sm text-stone-600">{entry.reason || "No reason"}</p>
                        {entry.expires_at ? (
                          <p className="mt-1 text-xs text-stone-500">Expires: {entry.expires_at}</p>
                        ) : null}
                      </div>
                      <button
                        className="rounded-2xl border border-red-300 px-3 py-2 text-sm text-red-700"
                        onClick={() => void unbanIp(entry.ip_address)}
                        type="button"
                      >
                        Unban
                      </button>
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-sm text-stone-500">No banned IPs.</p>
              )}
            </div>
          </section>
        </aside>
      </div>
    </DashboardShell>
  );
}

function DashboardShell({
  children,
  title,
}: {
  children: React.ReactNode;
  title: string;
}) {
  return (
    <main className="min-h-screen px-6 py-14">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-8">
        <header className="rounded-[2rem] border border-stone-200 bg-white/80 px-8 py-6 shadow-sm">
          <p className="text-sm font-semibold uppercase tracking-[0.3em] text-stone-500">{title}</p>
        </header>
        {children}
      </div>
    </main>
  );
}
