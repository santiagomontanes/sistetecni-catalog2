import { attendanceAuth, attendanceEnabled, attendanceFailure } from "@/lib/attendance/server";
import { validateJpeg } from "@/lib/attendance/validation";
import { getAdminClient } from "@/supabase/admin";
import { z } from "zod";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const { client } = await attendanceAuth(request);
    await attendanceEnabled(client);
    const length = Number(request.headers.get("content-length") || 0);
    if (length > 600000) throw new Error("attendance_invalid_photo");
    // Límite antes de parsear multipart, incluso si la petición usa chunked encoding.
    const reader = request.body?.getReader();
    if (!reader) throw new Error("attendance_invalid_photo");
    const chunks: Uint8Array[] = []; let total = 0;
    for (;;) { const part = await reader.read(); if (part.done) break; total += part.value.length; if (total > 600000) { await reader.cancel(); throw new Error("attendance_invalid_photo"); } chunks.push(part.value); }
    const form = await new Response(new Blob(chunks as BlobPart[]), { headers: { "Content-Type": request.headers.get("content-type") || "" } }).formData();
    const file = form.get("photo");
    const key = z.string().uuid().parse(form.get("requestKey"));
    if (!(file instanceof File)) throw new Error("attendance_invalid_photo");
    const bytes = new Uint8Array(await file.arrayBuffer()); validateJpeg(bytes, file.type);
    const { data: evidence, error } = await client.rpc("attendance_command", { p_action: "evidence.reserve", p_data: { bytes: bytes.length }, p_request_key: key });
    if (error) throw new Error(error.message);
    const admin = getAdminClient();
    const { data: reserved, error: readError } = await client.from("attendance_evidence").select("status,expires_at").eq("id", evidence.id).single();
    if (readError || !reserved || reserved.status === "deleted" || Date.parse(reserved.expires_at) <= Date.now()) throw new Error("attendance_evidence_required");
    if (reserved.status === "ready") return Response.json({ id: evidence.id });
    const uploaded = await admin.storage.from("attendance-private").upload(evidence.path, bytes, { contentType: "image/jpeg", cacheControl: "0", upsert: false });
    if (uploaded.error) {
      // Un reintento tras caída puede encontrar el objeto persistido, sin sobrescribirlo.
      const existing = await admin.storage.from("attendance-private").download(evidence.path);
      if (existing.error || !existing.data || existing.data.size !== bytes.length) throw new Error("attendance_photo_upload_failed");
    }
    const marked = await admin.from("attendance_evidence").update({ status: "ready" }).eq("id", evidence.id).eq("status", "pending").select("id");
    if (marked.error) throw new Error("attendance_photo_upload_failed");
    return Response.json({ id: evidence.id }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return attendanceFailure(error); }
}

export async function GET(request: Request) {
  try {
    const { client } = await attendanceAuth(request);
    const id = z.string().uuid().parse(new URL(request.url).searchParams.get("id"));
    const { data, error } = await client.from("attendance_evidence").select("storage_path,status,expires_at").eq("id", id).single();
    if (error || !data || data.status !== "ready" || Date.parse(data.expires_at) <= Date.now()) return Response.json({ error: "Evidencia no disponible o sin permiso." }, { status: 404 });
    const signed = await getAdminClient().storage.from("attendance-private").createSignedUrl(data.storage_path, 60);
    if (signed.error) throw new Error("attendance_photo_read_failed");
    return Response.json({ url: signed.data.signedUrl, expiresIn: 60 }, { headers: { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } });
  } catch (error) { return attendanceFailure(error); }
}
