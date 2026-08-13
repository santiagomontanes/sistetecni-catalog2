import { test } from "node:test";
import assert from "node:assert/strict";
import { requireAdmin, AdminAuthError } from "./auth";
import type { AuthClientLike } from "./auth";

function makeFakeAuthClient(options: {
  user: { id: string } | null;
  userError?: { message: string } | null;
  isAdmin: boolean | null;
  profileError?: { message: string } | null;
}): AuthClientLike {
  return {
    auth: {
      async getUser() {
        return { data: { user: options.user }, error: options.userError ?? null };
      },
    },
    from() {
      return {
        select() {
          return {
            eq() {
              return {
                async maybeSingle<T>() {
                  return {
                    data: (options.profileError ? null : { is_admin: options.isAdmin }) as T | null,
                    error: options.profileError ?? null,
                  };
                },
              };
            },
          };
        },
      };
    },
  };
}

// "admin requerido" (punto 17)
test("requireAdmin: sin accessToken -> AdminAuthError, nunca llega a construir un cliente", async () => {
  let factoryCalled = false;
  await assert.rejects(
    () =>
      requireAdmin(undefined, () => {
        factoryCalled = true;
        throw new Error("no debería llamarse");
      }),
    (err: unknown) => err instanceof AdminAuthError
  );
  assert.equal(factoryCalled, false);
});

test("requireAdmin: accessToken vacío/en blanco -> AdminAuthError", async () => {
  await assert.rejects(() => requireAdmin("   "), (err: unknown) => err instanceof AdminAuthError);
});

test("requireAdmin: token inválido/expirado (Supabase Auth lo rechaza) -> AdminAuthError", async () => {
  const factory = () => makeFakeAuthClient({ user: null, userError: { message: "invalid jwt" }, isAdmin: null });
  await assert.rejects(() => requireAdmin("cualquier-token", factory), (err: unknown) => err instanceof AdminAuthError);
});

test("requireAdmin: usuario real pero is_admin=false -> AdminAuthError, nunca se autoriza", async () => {
  const factory = () => makeFakeAuthClient({ user: { id: "u1" }, isAdmin: false });
  await assert.rejects(() => requireAdmin("token-valido", factory), (err: unknown) => err instanceof AdminAuthError);
});

test("requireAdmin: usuario real pero sin fila en profiles (null) -> AdminAuthError", async () => {
  const factory = () => makeFakeAuthClient({ user: { id: "u1" }, isAdmin: null });
  await assert.rejects(() => requireAdmin("token-valido", factory), (err: unknown) => err instanceof AdminAuthError);
});

test("requireAdmin: error de Supabase al leer profiles -> AdminAuthError (nunca se autoriza por defecto ante un error)", async () => {
  const factory = () => makeFakeAuthClient({ user: { id: "u1" }, isAdmin: true, profileError: { message: "timeout" } });
  await assert.rejects(() => requireAdmin("token-valido", factory), (err: unknown) => err instanceof AdminAuthError);
});

test("requireAdmin: usuario real con is_admin=true -> devuelve userId y un cliente utilizable", async () => {
  const factory = () => makeFakeAuthClient({ user: { id: "u1" }, isAdmin: true });
  const result = await requireAdmin("token-valido", factory);
  assert.equal(result.userId, "u1");
  assert.ok(result.client);
});
