"use server";

import type { SupabaseClient } from "@supabase/supabase-js";
import { requireAdmin } from "@/lib/personalizadorAdmin/auth";
import { mapUnexpectedError } from "@/lib/personalizadorAdmin/errorMapping";
import type { AdminResult } from "@/lib/personalizadorAdmin/types";
import { createCustomersRepository } from "@/lib/repositories/customers.repository";
import {
  createCustomerAdminSchema,
  customerSearchSchema,
  issuesFromZod,
} from "@/lib/erpAdmin/validation";
import type { AdminCustomerDTO } from "@/lib/erpAdmin/types";
import type { Customer } from "@/types/erp";

function toDTO(customer: Customer): AdminCustomerDTO {
  return {
    id: customer.id,
    fullName: customer.fullName,
    documentType: customer.documentType,
    documentNumber: customer.documentNumber,
    phone: customer.phone,
    email: customer.email,
    address: customer.address,
    city: customer.city,
    notes: customer.notes,
    createdAt: customer.createdAt?.toISOString() ?? null,
  };
}

function logUnexpectedError(action: string, err: unknown): void {
  const name = err instanceof Error ? err.name : "UnknownError";
  const message = err instanceof Error ? err.message : String(err);
  console.error(`[admin/clientes/actions] "${action}" falló: ${name}: ${message}`);
}

async function withAdmin<T>(
  action: string,
  accessToken: unknown,
  fn: (client: SupabaseClient) => Promise<AdminResult<T>>
): Promise<AdminResult<T>> {
  try {
    const { client } = await requireAdmin(accessToken);
    return await fn(client);
  } catch (err) {
    const mapped = mapUnexpectedError(err);
    if (mapped.error === "INTERNAL_ERROR") logUnexpectedError(action, err);
    return mapped;
  }
}

export async function listCustomers(payload: {
  accessToken: unknown;
  query?: unknown;
}): Promise<AdminResult<{ items: AdminCustomerDTO[] }>> {
  return withAdmin("listCustomers", payload.accessToken, async (client) => {
    const parsed = customerSearchSchema.safeParse({ query: payload.query ?? "" });
    if (!parsed.success) {
      return { ok: false, error: "VALIDATION_ERROR", issues: issuesFromZod(parsed.error) };
    }

    const items = await createCustomersRepository(client).search(parsed.data.query, 100);
    return { ok: true, data: { items: items.map(toDTO) } };
  });
}

export async function createCustomer(payload: {
  accessToken: unknown;
  [key: string]: unknown;
}): Promise<AdminResult<AdminCustomerDTO>> {
  const { accessToken, ...input } = payload;
  return withAdmin("createCustomer", accessToken, async (client) => {
    const parsed = createCustomerAdminSchema.safeParse(input);
    if (!parsed.success) {
      return { ok: false, error: "VALIDATION_ERROR", issues: issuesFromZod(parsed.error) };
    }

    const repo = createCustomersRepository(client);
    if (parsed.data.documentNumber) {
      const existing = await repo.findByDocument(parsed.data.documentNumber);
      if (existing) {
        return {
          ok: false,
          error: "VALIDATION_ERROR",
          issues: ["Ya existe un cliente con ese número de documento."],
        };
      }
    }

    const created = await repo.createAudited(parsed.data);
    return { ok: true, data: toDTO(created) };
  });
}
