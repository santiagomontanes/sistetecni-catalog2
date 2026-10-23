import { attendanceAuth, attendanceFailure } from "@/lib/attendance/server";
import { validateCommand } from "@/lib/attendance/validation";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { client, userId, profile } = await attendanceAuth(request);
    const query = new URL(request.url).searchParams;
    const page = Math.max(0, Math.min(10000, Number(query.get("page")) || 0));
    const employee = query.get("employee") || userId;
    const results = await Promise.all([
      client.from("attendance_settings").select("enabled,retention_days").single(),
      client.from("attendance_shifts").select("*").eq("employee_id", userId).is("ended_at", null).maybeSingle(),
      client.from("attendance_shifts").select("*").eq("employee_id", employee).order("started_at", { ascending: false }).range(page * 25, page * 25 + 24),
      client.from("attendance_rates").select("id,employee_id,effective_from,modality,amount_cop::text,paid_lunch,created_at,reason").eq("employee_id", employee).order("effective_from", { ascending: false }).limit(50),
      client.from("attendance_settlements").select("id,employee_id,period_from,period_to,status,seconds_worked,base_cop::text,adjustment_cop::text,approved_cop::text,created_at").eq("employee_id", employee).order("created_at", { ascending: false }).range(page * 25, page * 25 + 24),
      client.rpc("attendance_directory"),
      client.from("attendance_events").select("*").eq("employee_id", employee).order("occurred_at", { ascending: false }).range(page * 25, page * 25 + 24),
    ]);
    for (const result of results) if (result.error) throw new Error(result.error.message);
    const settlements = results[4].data as Array<{ id: string }>;
    const [payments, balances] = await Promise.all([
      client.rpc("attendance_payment_status", { p_settlements: settlements.map(s => s.id) }).select("id,settlement_id,amount_cop::text,kind,reference,created_at,expense_id,expense_status"),
      client.rpc("attendance_balances", { p_settlements: settlements.map(s => s.id) }).select("settlement_id,paid_cop::text,payment_count"),
    ]);
    if (payments.error) throw new Error(payments.error.message);
    if (balances.error) throw new Error(balances.error.message);
    return Response.json({ settings: results[0].data, openShift: results[1].data, shifts: results[2].data, rates: results[3].data, settlements, employees: results[5].data, events: results[6].data, payments: payments.data, balances: balances.data, profile, page }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return attendanceFailure(error); }
}

export async function POST(request: Request) {
  try {
    const { client } = await attendanceAuth(request);
    const parsed = validateCommand(await request.json());
    const { data, error } = await client.rpc("attendance_command", { p_action: parsed.action, p_data: parsed.data, p_request_key: parsed.requestKey });
    if (error) throw new Error(error.message);
    return Response.json({ data }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return attendanceFailure(error); }
}
