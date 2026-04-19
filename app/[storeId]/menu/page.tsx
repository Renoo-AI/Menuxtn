import { notFound } from "next/navigation";
import { getSupabaseBrowserClient, isSupabasePublicConfigured } from "@/lib/supabaseClient";

type MenuPageProps = {
  params: Promise<{
    storeId: string;
  }>;
};

type StoreRecord = {
  id: string;
  slug: string | null;
  name: string;
  description: string | null;
  cover_image_url: string | null;
};

type MenuItemRecord = {
  id: string;
  name: string;
  description: string | null;
  category: string | null;
  price: number | string;
  is_available: boolean | null;
};

function formatPrice(value: number | string) {
  const amount = typeof value === "string" ? Number(value) : value;

  if (Number.isNaN(amount)) {
    return value;
  }

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(amount);
}

export default async function StoreMenuPage({ params }: MenuPageProps) {
  const { storeId } = await params;

  if (!isSupabasePublicConfigured()) {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-4xl items-center justify-center px-6 py-20">
        <div className="rounded-3xl border border-amber-200 bg-amber-50 p-8 text-amber-900 shadow-sm">
          <h1 className="text-2xl font-semibold">Supabase is not configured</h1>
          <p className="mt-3 max-w-xl leading-7">
            Set <code>NEXT_PUBLIC_SUPABASE_URL</code> and{" "}
            <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code> to load public menus.
          </p>
        </div>
      </main>
    );
  }

  const supabase = getSupabaseBrowserClient();
  const storeQuery = await supabase
    .from("stores")
    .select("id, slug, name, description, cover_image_url")
    .or(`id.eq.${storeId},slug.eq.${storeId}`)
    .maybeSingle<StoreRecord>();

  if (storeQuery.error || !storeQuery.data) {
    notFound();
  }

  const menuQuery = await supabase
    .from("menu_items")
    .select("id, name, description, category, price, is_available")
    .eq("store_id", storeQuery.data.id)
    .order("category", { ascending: true })
    .order("name", { ascending: true })
    .returns<MenuItemRecord[]>();

  const menuItems = (menuQuery.data ?? []).filter((item) => item.is_available !== false);
  const groupedItems = menuItems.reduce<Record<string, MenuItemRecord[]>>((groups, item) => {
    const key = item.category?.trim() || "Uncategorized";
    groups[key] ??= [];
    groups[key].push(item);
    return groups;
  }, {});

  return (
    <main className="min-h-screen px-6 py-14">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-10">
        <section className="rounded-[2rem] border border-stone-200 bg-white/90 p-8 shadow-sm">
          <p className="text-sm font-semibold uppercase tracking-[0.3em] text-amber-700">
            Public Menu
          </p>
          <h1 className="mt-4 text-4xl font-semibold tracking-tight text-stone-950">
            {storeQuery.data.name}
          </h1>
          <p className="mt-3 max-w-3xl text-base leading-7 text-stone-600">
            {storeQuery.data.description || "Explore the live menu items available for this store."}
          </p>
        </section>

        {Object.keys(groupedItems).length === 0 ? (
          <section className="rounded-[2rem] border border-dashed border-stone-300 bg-white/70 p-8 text-stone-600 shadow-sm">
            No menu items are published for this store yet.
          </section>
        ) : (
          Object.entries(groupedItems).map(([category, items]) => (
            <section
              key={category}
              className="rounded-[2rem] border border-stone-200 bg-white/90 p-8 shadow-sm"
            >
              <div className="flex items-end justify-between gap-4 border-b border-stone-200 pb-4">
                <h2 className="text-2xl font-semibold text-stone-950">{category}</h2>
                <p className="text-sm text-stone-500">{items.length} items</p>
              </div>
              <div className="mt-6 grid gap-4 md:grid-cols-2">
                {items.map((item) => (
                  <article
                    key={item.id}
                    className="rounded-3xl border border-stone-200 bg-stone-50/80 p-5"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <h3 className="text-lg font-semibold text-stone-950">{item.name}</h3>
                        <p className="mt-2 text-sm leading-6 text-stone-600">
                          {item.description || "No description provided."}
                        </p>
                      </div>
                      <span className="rounded-full bg-stone-900 px-3 py-1 text-sm font-medium text-white">
                        {formatPrice(item.price)}
                      </span>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          ))
        )}
      </div>
    </main>
  );
}
