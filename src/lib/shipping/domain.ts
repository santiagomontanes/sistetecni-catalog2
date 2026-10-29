/** COP enteros: el ERP registra bigint, no centavos. Las rutas nunca redondean. */
export function moneyCop(value: string): bigint {
  if (!/^(0|[1-9][0-9]{0,11})$/.test(value)) throw new Error("Usa pesos COP enteros, sin separadores ni decimales.");
  return BigInt(value);
}

export interface CollectionCandidate {
  id: string;
  guide: string | null;
  carrier: string;
  balance_cop: string;
  version: number;
}

export interface MatchSearch {
  matches: { shipments: CollectionCandidate[]; sumCop: string }[];
  limited: boolean;
  visited: number;
  candidatesConsidered: number;
}

/** Acotado en filas, nodos y resultados; sólo igualdad exacta, jamás autoaplica. */
export function findCollectionMatches(
  candidates: CollectionCandidate[], targetCop: string,
  limits: { maxCandidates?: number; maxNodes?: number; maxResults?: number } = {},
): MatchSearch {
  const target = moneyCop(targetCop);
  if (target <= BigInt(0)) throw new Error("El importe debe ser mayor que cero.");
  const maxCandidates = Math.max(1, Math.min(limits.maxCandidates ?? 30, 50));
  const maxNodes = Math.max(1, Math.min(limits.maxNodes ?? 100_000, 250_000));
  const maxResults = Math.max(1, Math.min(limits.maxResults ?? 25, 100));
  const eligible = candidates.filter((c) => moneyCop(c.balance_cop) > BigInt(0) && moneyCop(c.balance_cop) <= target);
  const rows = eligible.slice(0, maxCandidates).sort((a, b) => {
    const x = moneyCop(a.balance_cop); const y = moneyCop(b.balance_cop);
    return x === y ? a.id.localeCompare(b.id) : x > y ? -1 : 1;
  });
  const amounts = rows.map((r) => moneyCop(r.balance_cop));
  const suffix = new Array<bigint>(rows.length + 1).fill(BigInt(0));
  for (let i = rows.length - 1; i >= 0; i--) suffix[i] = suffix[i + 1] + amounts[i];
  const result: MatchSearch = { matches: [], limited: eligible.length > maxCandidates, visited: 0, candidatesConsidered: rows.length };
  function visit(index: number, remaining: bigint, selected: CollectionCandidate[]) {
    if (result.visited >= maxNodes || result.matches.length >= maxResults) { result.limited = true; return; }
    result.visited++;
    if (remaining === BigInt(0)) { result.matches.push({ shipments: [...selected], sumCop: target.toString() }); return; }
    if (index >= rows.length || remaining > suffix[index]) return;
    if (amounts[index] <= remaining) { selected.push(rows[index]); visit(index + 1, remaining - amounts[index], selected); selected.pop(); }
    visit(index + 1, remaining, selected);
  }
  visit(0, target, []);
  return result;
}

/** Colombia mantiene UTC-05. Se excluyen sábados/domingo, no festivos. */
export function addBogotaBusinessDays(at: string, days = 3): string {
  const parsed = new Date(at);
  if (!Number.isFinite(parsed.getTime()) || !Number.isInteger(days) || days < 0 || days > 30) throw new Error("Fecha o plazo inválido.");
  const local = new Date(parsed.getTime() - 5 * 60 * 60 * 1000);
  for (let count = 0; count < days;) {
    local.setUTCDate(local.getUTCDate() + 1);
    if (local.getUTCDay() !== 0 && local.getUTCDay() !== 6) count++;
  }
  return new Date(local.getTime() + 5 * 60 * 60 * 1000).toISOString();
}

export const SHIPMENT_STATUS_LABELS: Record<string, string> = {
  pending_guide: "Pendiente de guía", ready: "Guía registrada", dispatched: "Despachado",
  incident: "Novedad", delivered: "Entregado", return_pending: "Devolución en proceso", returned: "Devuelto (reingresó)", cancelled: "Cancelado",
};
export const COLLECTION_STATUS_LABELS: Record<string, string> = {
  not_due: "No exigible", pending: "Pendiente", partial: "Parcial", reconciled: "Conciliado",
};
