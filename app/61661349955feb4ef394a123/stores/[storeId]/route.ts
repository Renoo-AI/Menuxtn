import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions, canAccessStore, isAdminRole } from "@/lib/authOptions";
import { getSupabaseAdmin, isSupabaseAdminConfigured } from "@/lib/supabaseAdmin";

type RouteContext = {
  params: Promise<{
    storeId: string;
  }>;
};

function unauthorized(message = "Unauthorized") {
  return NextResponse.json({ error: message }, { status: 401 });
}

function badRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}

async function getAuthorizedSession(storeId: string) {
  const session = await getServerSession(authOptions);
  const user = session?.user;

  if (!user || !isAdminRole(user.role)) {
    return { error: unauthorized() };
  }

  if (!canAccessStore(user, storeId)) {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }

  return { user };
}

export async function GET(_: NextRequest, context: RouteContext) {
  if (!isSupabaseAdminConfigured()) {
    return NextResponse.json(
      { error: "Supabase admin environment variables are not configured." },
      { status: 500 },
    );
  }

  const { storeId } = await context.params;
  const authState = await getAuthorizedSession(storeId);

  if (authState.error) {
    return authState.error;
  }

  const supabase = getSupabaseAdmin();
  const [storeResult, itemsResult] = await Promise.all([
    supabase
      .from("stores")
      .select("id, name, slug, description")
      .eq("id", storeId)
      .maybeSingle(),
    supabase
      .from("menu_items")
      .select("id, name, description, category, price, is_available")
      .eq("store_id", storeId)
      .order("created_at", { ascending: false }),
  ]);

  if (storeResult.error || !storeResult.data) {
    return NextResponse.json({ error: "Store not found." }, { status: 404 });
  }

  if (itemsResult.error) {
    return NextResponse.json({ error: itemsResult.error.message }, { status: 500 });
  }

  return NextResponse.json({
    store: storeResult.data,
    items: itemsResult.data ?? [],
  });
}

export async function POST(request: NextRequest, context: RouteContext) {
  if (!isSupabaseAdminConfigured()) {
    return NextResponse.json(
      { error: "Supabase admin environment variables are not configured." },
      { status: 500 },
    );
  }

  const { storeId } = await context.params;
  const authState = await getAuthorizedSession(storeId);

  if (authState.error) {
    return authState.error;
  }

  const body = (await request.json().catch(() => null)) as
    | {
        name?: string;
        description?: string;
        category?: string;
        price?: number;
        is_available?: boolean;
      }
    | null;

  if (!body?.name || typeof body.price !== "number") {
    return badRequest("Item name and numeric price are required.");
  }

  const supabase = getSupabaseAdmin();
  const result = await supabase
    .from("menu_items")
    .insert({
      store_id: storeId,
      name: body.name,
      description: body.description ?? "",
      category: body.category ?? "",
      price: body.price,
      is_available: body.is_available ?? true,
    })
    .select("id, name, description, category, price, is_available")
    .single();

  if (result.error) {
    return NextResponse.json({ error: result.error.message }, { status: 500 });
  }

  return NextResponse.json({ item: result.data }, { status: 201 });
}

export async function PUT(request: NextRequest, context: RouteContext) {
  if (!isSupabaseAdminConfigured()) {
    return NextResponse.json(
      { error: "Supabase admin environment variables are not configured." },
      { status: 500 },
    );
  }

  const { storeId } = await context.params;
  const authState = await getAuthorizedSession(storeId);

  if (authState.error) {
    return authState.error;
  }

  const body = (await request.json().catch(() => null)) as
    | {
        id?: string;
        name?: string;
        description?: string;
        category?: string;
        price?: number;
        is_available?: boolean;
      }
    | null;

  if (!body?.id) {
    return badRequest("Menu item id is required.");
  }

  const supabase = getSupabaseAdmin();
  const result = await supabase
    .from("menu_items")
    .update({
      name: body.name,
      description: body.description,
      category: body.category,
      price: body.price,
      is_available: body.is_available,
    })
    .eq("id", body.id)
    .eq("store_id", storeId)
    .select("id, name, description, category, price, is_available")
    .single();

  if (result.error) {
    return NextResponse.json({ error: result.error.message }, { status: 500 });
  }

  return NextResponse.json({ item: result.data });
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  if (!isSupabaseAdminConfigured()) {
    return NextResponse.json(
      { error: "Supabase admin environment variables are not configured." },
      { status: 500 },
    );
  }

  const { storeId } = await context.params;
  const authState = await getAuthorizedSession(storeId);

  if (authState.error) {
    return authState.error;
  }

  const itemId = request.nextUrl.searchParams.get("itemId");

  if (!itemId) {
    return badRequest("itemId query parameter is required.");
  }

  const supabase = getSupabaseAdmin();
  const result = await supabase.from("menu_items").delete().eq("id", itemId).eq("store_id", storeId);

  if (result.error) {
    return NextResponse.json({ error: result.error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
