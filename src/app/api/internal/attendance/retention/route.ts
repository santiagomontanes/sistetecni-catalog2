import { timingSafeEqual } from "node:crypto";
import { getAdminClient } from "@/supabase/admin";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const expected = process.env.ATTENDANCE_RETENTION_SECRET;
  const provided = request.headers.get("authorization")?.replace(/^Bearer /, "") || "";
  if (!expected || expected.length < 32 || Buffer.byteLength(expected) !== Buffer.byteLength(provided) || !timingSafeEqual(Buffer.from(expected), Buffer.from(provided))) return Response.json({ error: "No autorizado" }, { status: 403 });
  const admin = getAdminClient();
  const { data, error } = await admin.from("attendance_evidence").select("id,storage_path,deletion_attempts").neq("status", "deleted").lte("expires_at", new Date().toISOString()).order("expires_at").limit(100);
  if (error) return Response.json({ error: "No fue posible consultar las evidencias vencidas." }, { status: 503 });
  let deleted = 0; let failed = 0;
  for (const evidence of data) {
    const removed = await admin.storage.from("attendance-private").remove([evidence.storage_path]);
    const folder = evidence.storage_path.slice(0, evidence.storage_path.lastIndexOf("/"));
    const filename = evidence.storage_path.slice(evidence.storage_path.lastIndexOf("/") + 1);
    const remaining = removed.error ? null : await admin.storage.from("attendance-private").list(folder, { search: filename, limit: 10 });
    const verified = !removed.error && remaining && !remaining.error && !remaining.data.some(object => object.name === filename);
    const result = await admin.from("attendance_evidence").update({
      deletion_attempts: evidence.deletion_attempts + 1,
      ...(verified ? { status: "deleted", deleted_at: new Date().toISOString(), last_deletion_error: null } : { last_deletion_error: "storage_deletion_not_verified" }),
    }).eq("id", evidence.id).neq("status", "deleted");
    if (verified && !result.error) deleted++; else failed++;
  }
  return Response.json({ examined: data.length, deleted, failed, hasMore: data.length === 100 }, { status: failed ? 503 : 200, headers: { "Cache-Control": "no-store" } });
}
