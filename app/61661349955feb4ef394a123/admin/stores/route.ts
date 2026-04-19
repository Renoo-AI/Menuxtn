import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { getSupabaseAdmin, isSupabaseAdminConfigured } from "@/lib/supabaseAdmin";

function forbidden() {
  return NextResponse.json({ error: "Super-admin access required." }, { status: 403 });
}

async function ensureSuperAdmin() {
  const session = await getServerSession(authOptions);

  if (session?.user?.role !== "super_admin") {
    return { error: forbidden() };
  }

  return { session };
}

export async function GET() {
  const authState = await ensureSuperAdmin();

  if (authState.error) {
    return authState.error;
  }

  if (!isSupabaseAdminConfigured()) {
    return NextResponse.json(
      { error: "Supabase admin environment variables are not configured." },
      { status: 500 },
    );
  }

  const supabase = getSupabaseAdmin();
  const result = await supabase
    .from("stores")
    .select("id, name, slug, description, owner_id")
    .order("created_at", { ascending: false });

  if (result.error) {
    return NextResponse.json({ error: result.error.message }, { status: 500 });
  }

  return NextResponse.json({ stores: result.data ?? [] });
}

export async function POST(request: NextRequest) {
  const authState = await ensureSuperAdmin();

  if (authState.error) {
    return authState.error;
  }

  if (!isSupabaseAdminConfigured()) {
    return NextResponse.json(
      { error: "Supabase admin environment variables are not configured." },
      { status: 500 },
    );
  }

  const body = (await request.json().catch(() => null)) as
    | {
        name?: string;
        slug?: string;
        description?: string;
        owner_id?: string | null;
      }
    | null;

  if (!body?.name || !body.slug) {
    return NextResponse.json({ error: "name and slug are required." }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  const result = await supabase
    .from("stores")
    .insert({
      name: body.name,
      slug: body.slug,
      description: body.description ?? "",
      owner_id: body.owner_id || null,
      is_active: true,
    })
    .select("id, name, slug, description, owner_id")
    .single();

  if (result.error) {
    return NextResponse.json({ error: result.error.message }, { status: 500 });
  }

  return NextResponse.json({ store: result.data }, { status: 201 });
}
