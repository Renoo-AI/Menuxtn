"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { signIn, signOut, useSession } from "next-auth/react";

type SessionUser = {
  id?: string;
  name?: string | null;
  email?: string | null;
  role?: string;
  storeId?: string | null;
};

type MenuItem = {
  id: string;
  name: string;
  description: string | null;
  category: string | null;
  price: number | string;
  is_available: boolean | null;
};

type StorePayload = {
  store: {
    id: string;
    name: string;
    slug: string | null;
    description: string | null;
  };
  items: MenuItem[];
};

const defaultItem = {
  id: "",
  name: "",
  description: "",
  category: "",
  price: "",
};

export default function AdminPage() {
  const apiBase = process.env.NEXT_PUBLIC_API_PATH ?? "/api";
  const { data: session, status, update } = useSession();
  const user = session?.user as SessionUser | undefined;
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [loading, setLoading] = useState(false);
  const [storePayload, setStorePayload] = useState<StorePayload | null>(null);
  const [loadError, setLoadError] = useState("");
  const [formState, setFormState] = useState(defaultItem);
  const [submitMessage, setSubmitMessage] = useState("");

  const canAccess = useMemo(
    () => ["owner", "manager", "super_admin"].includes(user?.role ?? ""),
    [user?.role],
  );

  useEffect(() => {
    async function loadDashboard() {
      if (!user?.storeId || !canAccess) {
        return;
      }

      setLoading(true);
      setLoadError("");

      try {
        const response = await fetch(`${apiBase}/stores/${user.storeId}`, {
          credentials: "include",
        });

        if (!response.ok) {
          const payload = (await response.json().catch(() => ({}))) as { error?: string };
          throw new Error(payload.error || "Unable to load store dashboard.");
        }

        const payload = (await response.json()) as StorePayload;
        setStorePayload(payload);
      } catch (error) {
        setLoadError(error instanceof Error ? error.message : "Unknown dashboard error.");
      } finally {
        setLoading(false);
      }
    }

    void loadDashboard();
  }, [apiBase, canAccess, user?.storeId]);

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoginError("");
    setLoading(true);

    const result = await signIn("credentials", {
      email,
      password,
      redirect: false,
      callbackUrl: process.env.NEXT_PUBLIC_ADMIN_PATH ?? "/",
    });

    if (result?.error) {
      setLoginError(result.error);
      setLoading(false);
      return;
    }

    await update();
    setPassword("");
    setLoading(false);
  }

  async function handleCreateItem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!user?.storeId) {
      setSubmitMessage("No store linked to this account.");
      return;
    }

    setSubmitMessage("Saving item...");

    const response = await fetch(`${apiBase}/stores/${user.storeId}`, {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: formState.name,
        description: formState.description,
        category: formState.category,
        price: Number(formState.price),
        is_available: true,
      }),
    });

    const payload = (await response.json().catch(() => ({}))) as { error?: string; item?: MenuItem };

    if (!response.ok || !payload.item) {
      setSubmitMessage(payload.error || "Unable to create menu item.");
      return;
    }

    const createdItem = payload.item;

    setStorePayload((current) =>
      current
        ? {
            ...current,
            items: [...current.items, createdItem],
          }
        : current,
    );
    setFormState(defaultItem);
    setSubmitMessage("Menu item created.");
  }

  async function toggleAvailability(item: MenuItem) {
    if (!user?.storeId) {
      return;
    }

    setSubmitMessage(`Updating ${item.name}...`);

    const response = await fetch(`${apiBase}/stores/${user.storeId}`, {
      method: "PUT",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        id: item.id,
        name: item.name,
        description: item.description,
        category: item.category,
        price: Number(item.price),
        is_available: !(item.is_available ?? true),
      }),
    });

    const payload = (await response.json().catch(() => ({}))) as { error?: string; item?: MenuItem };

    if (!response.ok || !payload.item) {
      setSubmitMessage(payload.error || "Unable to update menu item.");
      return;
    }

    const updatedItem = payload.item;

    setStorePayload((current) =>
      current
        ? {
            ...current,
            items: current.items.map((currentItem) =>
              currentItem.id === updatedItem.id ? updatedItem : currentItem,
            ),
          }
        : current,
    );
    setSubmitMessage(`Updated ${item.name}.`);
  }

  async function deleteItem(itemId: string) {
    if (!user?.storeId) {
      return;
    }

    setSubmitMessage("Deleting item...");

    const response = await fetch(`${apiBase}/stores/${user.storeId}?itemId=${itemId}`, {
      method: "DELETE",
      credentials: "include",
    });

    if (!response.ok) {
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      setSubmitMessage(payload.error || "Unable to delete menu item.");
      return;
    }

    setStorePayload((current) =>
      current
        ? {
            ...current,
            items: current.items.filter((item) => item.id !== itemId),
          }
        : current,
    );
    setSubmitMessage("Item deleted.");
  }

  if (status === "loading") {
    return <Shell title="Owner Admin">Loading session...</Shell>;
  }

  if (!session) {
    return (
      <Shell title="Owner Admin">
        <section className="grid gap-10 lg:grid-cols-[0.9fr_1.1fr]">
          <div className="space-y-4">
            <p className="text-sm font-semibold uppercase tracking-[0.3em] text-amber-700">
              Randomized owner path
            </p>
            <h1 className="text-4xl font-semibold tracking-tight text-stone-950">
              Secure store owner login
            </h1>
            <p className="max-w-xl text-base leading-7 text-stone-600">
              Sign in with the store-owner credentials stored in Supabase. Once authenticated,
              the dashboard lets you publish, hide, and remove menu items for your assigned
              store.
            </p>
          </div>

          <form
            onSubmit={handleLogin}
            className="rounded-[2rem] border border-stone-200 bg-white p-8 shadow-sm"
          >
            <div className="grid gap-5">
              <label className="grid gap-2">
                <span className="text-sm font-medium text-stone-700">Email</span>
                <input
                  className="rounded-2xl border border-stone-300 px-4 py-3 outline-none transition focus:border-stone-950"
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  required
                />
              </label>

              <label className="grid gap-2">
                <span className="text-sm font-medium text-stone-700">Password</span>
                <input
                  className="rounded-2xl border border-stone-300 px-4 py-3 outline-none transition focus:border-stone-950"
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  required
                />
              </label>

              {loginError ? (
                <p className="rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700">
                  {loginError}
                </p>
              ) : null}

              <button
                className="rounded-2xl bg-stone-950 px-5 py-3 font-medium text-white transition hover:bg-stone-800 disabled:cursor-not-allowed disabled:bg-stone-400"
                type="submit"
                disabled={loading}
              >
                {loading ? "Signing in..." : "Sign in"}
              </button>
            </div>
          </form>
        </section>
      </Shell>
    );
  }

  if (!canAccess) {
    return (
      <Shell title="Owner Admin">
        <UnauthorizedPanel
          title="This account does not have owner access"
          description="Sign in with a user that has owner, manager, or super_admin role in user_roles."
        />
      </Shell>
    );
  }

  return (
    <Shell title="Owner Admin">
      <section className="grid gap-8 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="space-y-6">
          <section className="rounded-[2rem] border border-stone-200 bg-white p-8 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.3em] text-amber-700">
                  Dashboard
                </p>
                <h1 className="mt-3 text-3xl font-semibold tracking-tight text-stone-950">
                  {storePayload?.store.name || "Your store"}
                </h1>
                <p className="mt-3 max-w-2xl text-sm leading-7 text-stone-600">
                  {storePayload?.store.description ||
                    "Manage your store menu items and keep availability up to date."}
                </p>
              </div>
              <button
                className="rounded-2xl border border-stone-300 px-4 py-2 text-sm font-medium text-stone-700 transition hover:border-stone-950 hover:text-stone-950"
                onClick={() => void signOut({ callbackUrl: process.env.NEXT_PUBLIC_ADMIN_PATH })}
                type="button"
              >
                Sign out
              </button>
            </div>

            {loadError ? (
              <p className="mt-6 rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700">
                {loadError}
              </p>
            ) : null}

            {submitMessage ? (
              <p className="mt-6 rounded-2xl bg-stone-100 px-4 py-3 text-sm text-stone-700">
                {submitMessage}
              </p>
            ) : null}

            <div className="mt-8 grid gap-4">
              {loading && !storePayload ? (
                <p className="text-sm text-stone-500">Loading menu items...</p>
              ) : storePayload?.items.length ? (
                storePayload.items.map((item) => (
                  <article
                    key={item.id}
                    className="rounded-3xl border border-stone-200 bg-stone-50/70 p-5"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div>
                        <h2 className="text-lg font-semibold text-stone-950">{item.name}</h2>
                        <p className="mt-2 text-sm text-stone-600">
                          {item.description || "No description"}
                        </p>
                        <div className="mt-3 flex flex-wrap gap-2 text-xs text-stone-500">
                          <span className="rounded-full bg-white px-3 py-1">
                            {item.category || "Uncategorized"}
                          </span>
                          <span className="rounded-full bg-white px-3 py-1">
                            ${Number(item.price).toFixed(2)}
                          </span>
                          <span className="rounded-full bg-white px-3 py-1">
                            {item.is_available === false ? "Hidden" : "Visible"}
                          </span>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <button
                          className="rounded-2xl border border-stone-300 px-3 py-2 text-sm"
                          onClick={() => void toggleAvailability(item)}
                          type="button"
                        >
                          {item.is_available === false ? "Show" : "Hide"}
                        </button>
                        <button
                          className="rounded-2xl border border-red-300 px-3 py-2 text-sm text-red-700"
                          onClick={() => void deleteItem(item.id)}
                          type="button"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  </article>
                ))
              ) : (
                <p className="text-sm text-stone-500">No menu items yet.</p>
              )}
            </div>
          </section>
        </div>

        <aside className="rounded-[2rem] border border-stone-200 bg-white p-8 shadow-sm">
          <h2 className="text-xl font-semibold text-stone-950">Add menu item</h2>
          <form className="mt-6 grid gap-4" onSubmit={handleCreateItem}>
            <label className="grid gap-2">
              <span className="text-sm font-medium text-stone-700">Name</span>
              <input
                className="rounded-2xl border border-stone-300 px-4 py-3"
                value={formState.name}
                onChange={(event) => setFormState((current) => ({ ...current, name: event.target.value }))}
                required
              />
            </label>
            <label className="grid gap-2">
              <span className="text-sm font-medium text-stone-700">Description</span>
              <textarea
                className="min-h-28 rounded-2xl border border-stone-300 px-4 py-3"
                value={formState.description}
                onChange={(event) =>
                  setFormState((current) => ({ ...current, description: event.target.value }))
                }
              />
            </label>
            <label className="grid gap-2">
              <span className="text-sm font-medium text-stone-700">Category</span>
              <input
                className="rounded-2xl border border-stone-300 px-4 py-3"
                value={formState.category}
                onChange={(event) =>
                  setFormState((current) => ({ ...current, category: event.target.value }))
                }
              />
            </label>
            <label className="grid gap-2">
              <span className="text-sm font-medium text-stone-700">Price</span>
              <input
                className="rounded-2xl border border-stone-300 px-4 py-3"
                min="0"
                step="0.01"
                type="number"
                value={formState.price}
                onChange={(event) => setFormState((current) => ({ ...current, price: event.target.value }))}
                required
              />
            </label>
            <button
              className="rounded-2xl bg-stone-950 px-5 py-3 font-medium text-white"
              type="submit"
            >
              Create item
            </button>
          </form>
        </aside>
      </section>
    </Shell>
  );
}

function Shell({
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

function UnauthorizedPanel({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <section className="rounded-[2rem] border border-red-200 bg-red-50 p-8 text-red-900 shadow-sm">
      <h1 className="text-2xl font-semibold">{title}</h1>
      <p className="mt-3 max-w-2xl leading-7">{description}</p>
    </section>
  );
}
