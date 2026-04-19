export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col justify-center px-6 py-20">
      <div className="grid gap-10 lg:grid-cols-[1.2fr_0.8fr]">
        <section className="space-y-6">
          <p className="text-sm font-semibold uppercase tracking-[0.3em] text-amber-700">
            Menux Control Surface
          </p>
          <h1 className="max-w-3xl text-5xl font-semibold tracking-tight text-stone-900 sm:text-6xl">
            Multi-store menus, protected admin paths, and one deployment surface.
          </h1>
          <p className="max-w-2xl text-lg leading-8 text-stone-600">
            This deployment contains the Menux public menu experience, owner dashboard,
            super-admin tools, and randomized private entry paths backed by Supabase and
            NextAuth.
          </p>
        </section>

        <aside className="rounded-3xl border border-stone-200 bg-white/80 p-8 shadow-sm">
          <h2 className="text-lg font-semibold text-stone-900">Environment checklist</h2>
          <ul className="mt-4 space-y-3 text-sm text-stone-600">
            <li>Set Supabase URL, anon key, and service role key.</li>
            <li>Set NextAuth secret and production URL.</li>
            <li>Set Upstash Redis variables to enable shared rate limiting.</li>
            <li>Redeploy after updating Vercel environment variables.</li>
          </ul>
        </aside>
      </div>
    </main>
  );
}
