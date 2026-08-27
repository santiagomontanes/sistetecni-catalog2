import type { SupabaseClient } from "@supabase/supabase-js";
import type { CreateCustomerInput, Customer } from "../../types/erp";
import { RepositoryError } from "./errors";

export interface CustomersRepository {
  create(input: CreateCustomerInput): Promise<Customer>;
  findById(id: string): Promise<Customer | null>;
  findByDocument(documentNumber: string): Promise<Customer | null>;
  search(query: string, limit?: number): Promise<Customer[]>;
}

const CUSTOMER_COLUMNS =
  "id,full_name,document_type,document_number,phone,email,address,city,notes,active,created_by,created_at,updated_at";

interface CustomerRow {
  id: string;
  full_name: string;
  document_type: string | null;
  document_number: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  city: string | null;
  notes: string | null;
  active: boolean;
  created_by: string | null;
  created_at: string | null;
  updated_at: string | null;
}

function cleanOptional(value: string | null | undefined): string | null {
  if (value == null) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function mapRow(row: CustomerRow): Customer {
  return {
    id: row.id,
    fullName: row.full_name,
    documentType: row.document_type,
    documentNumber: row.document_number,
    phone: row.phone,
    email: row.email,
    address: row.address,
    city: row.city,
    notes: row.notes,
    active: row.active,
    createdBy: row.created_by,
    createdAt: row.created_at ? new Date(row.created_at) : null,
    updatedAt: row.updated_at ? new Date(row.updated_at) : null,
  };
}

export function createCustomersRepository(client: SupabaseClient): CustomersRepository {
  return {
    async create(input) {
      const fullName = input.fullName.trim();
      if (!fullName) throw new RepositoryError("CustomersRepository.create: nombre vacío");

      const payload = {
        full_name: fullName,
        document_type: cleanOptional(input.documentType),
        document_number: cleanOptional(input.documentNumber),
        phone: cleanOptional(input.phone),
        email: cleanOptional(input.email),
        address: cleanOptional(input.address),
        city: cleanOptional(input.city),
        notes: cleanOptional(input.notes),
        created_by: input.createdBy ?? null,
      };

      const { data, error } = await client
        .from("customers")
        .insert(payload)
        .select(CUSTOMER_COLUMNS)
        .single<CustomerRow>();

      if (error || !data) {
        throw new RepositoryError("CustomersRepository.create falló", error);
      }
      return mapRow(data);
    },

    async findById(id) {
      const { data, error } = await client
        .from("customers")
        .select(CUSTOMER_COLUMNS)
        .eq("id", id)
        .maybeSingle<CustomerRow>();

      if (error) throw new RepositoryError(`CustomersRepository.findById(${id}) falló`, error);
      return data ? mapRow(data) : null;
    },

    async findByDocument(documentNumber) {
      const normalized = documentNumber.trim();
      if (!normalized) return null;

      const { data, error } = await client
        .from("customers")
        .select(CUSTOMER_COLUMNS)
        .ilike("document_number", normalized)
        .maybeSingle<CustomerRow>();

      if (error) {
        throw new RepositoryError(
          `CustomersRepository.findByDocument(${normalized}) falló`,
          error
        );
      }
      return data ? mapRow(data) : null;
    },

    async search(query, limit = 20) {
      const escaped = query.replace(/[%,()]/g, "").trim();
      let request = client
        .from("customers")
        .select(CUSTOMER_COLUMNS)
        .eq("active", true)
        .order("created_at", { ascending: false })
        .limit(limit);

      if (escaped) {
        request = request.or(
          `full_name.ilike.%${escaped}%,document_number.ilike.%${escaped}%,phone.ilike.%${escaped}%,email.ilike.%${escaped}%`
        );
      }

      const { data, error } = await request.returns<CustomerRow[]>();
      if (error) throw new RepositoryError("CustomersRepository.search falló", error);
      return (data ?? []).map(mapRow);
    },
  };
}
