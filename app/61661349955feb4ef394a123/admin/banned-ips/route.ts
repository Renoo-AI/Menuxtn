import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import {
  banIpAddress,
  isIpBanned,
  listBannedIps,
  removeIpBan,
} from "@/lib/rateLimit";

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

  const bannedIps = await listBannedIps();
  return NextResponse.json({ bannedIps });
}

export async function POST(request: NextRequest) {
  const authState = await ensureSuperAdmin();

  if (authState.error) {
    return authState.error;
  }

  const body = (await request.json().catch(() => null)) as
    | {
        ip_address?: string;
        reason?: string;
        expires_at?: string | null;
      }
    | null;

  if (!body?.ip_address) {
    return NextResponse.json({ error: "ip_address is required." }, { status: 400 });
  }

  const bannedIp = await banIpAddress(body.ip_address, {
    reason: body.reason ?? "Banned by super admin.",
    expiresAt: body.expires_at || null,
  });

  return NextResponse.json({ bannedIp }, { status: 201 });
}

export async function DELETE(request: NextRequest) {
  const authState = await ensureSuperAdmin();

  if (authState.error) {
    return authState.error;
  }

  const body = (await request.json().catch(() => null)) as { ip_address?: string } | null;

  if (!body?.ip_address) {
    return NextResponse.json({ error: "ip_address is required." }, { status: 400 });
  }

  await removeIpBan(body.ip_address);
  const stillBanned = await isIpBanned(body.ip_address);

  return NextResponse.json({ success: !stillBanned });
}
