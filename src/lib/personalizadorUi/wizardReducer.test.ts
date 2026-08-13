import { test } from "node:test";
import assert from "node:assert/strict";
import { wizardReducer, canGoBack, stepProgress } from "./wizardReducer";
import { INITIAL_WIZARD_STATE } from "./wizardTypes";
import type { WizardState } from "./wizardTypes";
import type { SearchOptionDTO, SearchOptionsResponse, PublicQuoteDTO } from "../personalizadorServer";

const CANDIDATE: SearchOptionDTO = {
  productId: "10000000-0000-0000-0000-000000000001",
  title: "[SEED] Dell Latitude 5490",
  brand: "Dell",
  model: "Latitude 5490",
  cpu: "Intel Core i5-8350U",
  screen: '14" FHD',
  images: [],
  classification: "DIRECT_MATCH",
  basePrice: 750000,
  finalPrice: 750000,
  budgetStatus: "WITHIN_BUDGET",
  stockStatus: "AVAILABLE",
  selectedUpgrades: [],
  baseRamGb: 16,
  baseStorage: "512 GB SSD",
  gpuType: "integrada",
  touchScreen: false,
  finalConfiguration: { ramGb: 16, storageGb: 512 },
  reasons: ["WITHIN_BUDGET", "IN_STOCK"],
};

const SEARCH_RESULT: SearchOptionsResponse = {
  available: [CANDIDATE],
  referenceOnly: [],
  specialQuoteRequired: false,
};

const QUOTE: PublicQuoteDTO = {
  code: "COT-ABCDEFGHJ",
  status: "nueva",
  isSpecialRequest: false,
  requestedConfig: {},
  product: { title: CANDIDATE.title, brand: CANDIDATE.brand, model: CANDIDATE.model, cpu: CANDIDATE.cpu, ram: 16, storage: "512 GB SSD", screen: CANDIDATE.screen, condition: "Usado", image: null },
  selectedUpgrades: [],
  basePrice: 750000,
  finalPrice: 750000,
  createdAt: "2026-08-13T00:00:00.000Z",
  expiresAt: "2026-08-20T00:00:00.000Z",
};

function requirements() {
  return { budgetMax: 800000, ramMinGb: 16, storageMinGb: 500, gpu: "cualquiera" as const, touch: "cualquiera" as const };
}

// ─── navegación de pasos: flujo "Ayúdame a elegir" ──────────────────────

test("navegación: landing -> SELECT_MODE(ayudame) -> useCase", () => {
  const s = wizardReducer(INITIAL_WIZARD_STATE, { type: "SELECT_MODE", mode: "ayudame" });
  assert.equal(s.screen, "useCase");
  assert.equal(s.mode, "ayudame");
});

test("navegación: useCase -> budget -> preference -> results (loading), acumulando cada respuesta", () => {
  let s: WizardState = wizardReducer(INITIAL_WIZARD_STATE, { type: "SELECT_MODE", mode: "ayudame" });
  s = wizardReducer(s, { type: "ANSWER_USE_CASE", useCase: "programacion" });
  assert.equal(s.screen, "budget");
  assert.equal(s.useCase, "programacion");

  s = wizardReducer(s, { type: "ANSWER_BUDGET", budgetMax: 900000 });
  assert.equal(s.screen, "preference");
  assert.equal(s.budgetMax, 900000);

  s = wizardReducer(s, { type: "ANSWER_PREFERENCE", preference: "rendimiento", requirements: requirements() });
  assert.equal(s.screen, "results");
  assert.equal(s.searchStatus, "loading");
  assert.deepEqual(s.requirements, requirements());
});

// ─── navegación: flujo "Personalizar" ────────────────────────────────────

test("navegación: landing -> SELECT_MODE(personalizar) -> manualForm -> SUBMIT_MANUAL_FORM -> results (loading)", () => {
  let s: WizardState = wizardReducer(INITIAL_WIZARD_STATE, { type: "SELECT_MODE", mode: "personalizar" });
  assert.equal(s.screen, "manualForm");

  s = wizardReducer(s, { type: "SUBMIT_MANUAL_FORM", requirements: requirements() });
  assert.equal(s.screen, "results");
  assert.equal(s.searchStatus, "loading");
});

// ─── resultados: disponibles / con upgrades / agotado / sobre presupuesto ─

test("SEARCH_SUCCESS: guarda el resultado tal cual lo devolvió B4, sin transformarlo", () => {
  let s: WizardState = wizardReducer(INITIAL_WIZARD_STATE, { type: "SELECT_MODE", mode: "personalizar" });
  s = wizardReducer(s, { type: "SUBMIT_MANUAL_FORM", requirements: requirements() });
  s = wizardReducer(s, { type: "SEARCH_SUCCESS", result: SEARCH_RESULT });
  assert.equal(s.searchStatus, "success");
  assert.deepEqual(s.searchResult, SEARCH_RESULT);
});

test("SELECT_CANDIDATE: results -> configuration, guarda el candidato elegido, apaga wantsSpecialQuote", () => {
  let s: WizardState = { ...INITIAL_WIZARD_STATE, screen: "results", mode: "personalizar" };
  s = wizardReducer(s, { type: "SELECT_CANDIDATE", candidate: CANDIDATE });
  assert.equal(s.screen, "configuration");
  assert.deepEqual(s.selectedCandidate, CANDIDATE);
  assert.equal(s.wantsSpecialQuote, false);
});

// ─── special quote (punto 13) ─────────────────────────────────────────────

test("REQUEST_SPECIAL_QUOTE: results -> quoteForm directamente, wantsSpecialQuote=true, sin candidato", () => {
  let s: WizardState = { ...INITIAL_WIZARD_STATE, screen: "results", mode: "ayudame" };
  s = wizardReducer(s, { type: "REQUEST_SPECIAL_QUOTE" });
  assert.equal(s.screen, "quoteForm");
  assert.equal(s.wantsSpecialQuote, true);
  assert.equal(s.selectedCandidate, null);
});

// ─── error de Server Action (búsqueda) ───────────────────────────────────

test("SEARCH_ERROR: se queda en 'results' con searchStatus='error' y mensaje, NUNCA descarta el estado previo", () => {
  let s: WizardState = { ...INITIAL_WIZARD_STATE, screen: "results", mode: "ayudame", requirements: requirements() };
  s = wizardReducer(s, { type: "SEARCH_ERROR", message: "No se pudo conectar. Intenta de nuevo." });
  assert.equal(s.screen, "results");
  assert.equal(s.searchStatus, "error");
  assert.equal(s.searchErrorMessage, "No se pudo conectar. Intenta de nuevo.");
  assert.deepEqual(s.requirements, requirements()); // no se pierde lo ya respondido
});

// ─── cotización creada ────────────────────────────────────────────────────

test("CREATE_SUCCESS: quoteForm -> quoteCreated, guarda el DTO recibido tal cual", () => {
  let s: WizardState = { ...INITIAL_WIZARD_STATE, screen: "quoteForm", mode: "personalizar", selectedCandidate: CANDIDATE };
  s = wizardReducer(s, { type: "CREATE_SUCCESS", quote: QUOTE });
  assert.equal(s.screen, "quoteCreated");
  assert.equal(s.createStatus, "success");
  assert.deepEqual(s.quoteResult, QUOTE);
});

// ─── selección invalidada por servidor (punto 11) ────────────────────────

test("CREATE_ERROR con PRODUCT_NOT_ELIGIBLE: NUNCA queda en quoteForm — vuelve a 'results', limpia la selección vieja y dispara una búsqueda nueva", () => {
  let s: WizardState = {
    ...INITIAL_WIZARD_STATE,
    screen: "quoteForm",
    mode: "personalizar",
    selectedCandidate: CANDIDATE,
    requirements: requirements(),
  };
  s = wizardReducer(s, { type: "CREATE_ERROR", error: "PRODUCT_NOT_ELIGIBLE", message: "ya no disponible" });
  assert.equal(s.screen, "results");
  assert.equal(s.selectedCandidate, null);
  assert.equal(s.searchStatus, "loading"); // se re-dispara la búsqueda automáticamente
  assert.ok(s.staleSelectionMessage && s.staleSelectionMessage.length > 0);
});

test("CREATE_ERROR con SPECIAL_QUOTE_NOT_APPLICABLE: mismo tratamiento — nunca crea con datos viejos", () => {
  let s: WizardState = { ...INITIAL_WIZARD_STATE, screen: "quoteForm", mode: "ayudame", wantsSpecialQuote: true, requirements: requirements() };
  s = wizardReducer(s, { type: "CREATE_ERROR", error: "SPECIAL_QUOTE_NOT_APPLICABLE", message: "ya hay opciones" });
  assert.equal(s.screen, "results");
  assert.equal(s.wantsSpecialQuote, false);
});

test("CREATE_ERROR con VALIDATION_ERROR: se queda en quoteForm (no es una selección invalidada, es un error de formulario)", () => {
  let s: WizardState = { ...INITIAL_WIZARD_STATE, screen: "quoteForm", mode: "personalizar" };
  s = wizardReducer(s, { type: "CREATE_ERROR", error: "VALIDATION_ERROR", message: "revisa el formulario" });
  assert.equal(s.screen, "quoteForm");
  assert.equal(s.createStatus, "error");
  assert.equal(s.createErrorCode, "VALIDATION_ERROR");
});

test("CREATE_ERROR con INTERNAL_ERROR (error inesperado de la Server Action): se queda en quoteForm con mensaje", () => {
  let s: WizardState = { ...INITIAL_WIZARD_STATE, screen: "quoteForm", mode: "personalizar" };
  s = wizardReducer(s, { type: "CREATE_ERROR", error: "INTERNAL_ERROR", message: "Algo salió mal, intenta de nuevo." });
  assert.equal(s.createStatus, "error");
  assert.equal(s.createErrorCode, "INTERNAL_ERROR");
});

// ─── honeypot: solo pasa el valor, no decide nada en el cliente ──────────

test("SET_HONEYPOT: guarda el valor tal cual (la decisión de bloquear es 100% del servidor, B3/B4)", () => {
  const s = wizardReducer(INITIAL_WIZARD_STATE, { type: "SET_HONEYPOT", value: "http://bot.example" });
  assert.equal(s.honeypot, "http://bot.example");
});

test("SET_CITY: guarda la ciudad tal cual, sin validar aquí (la sanitización real ya la hace B4)", () => {
  const s = wizardReducer(INITIAL_WIZARD_STATE, { type: "SET_CITY", city: "Bogotá" });
  assert.equal(s.customerCity, "Bogotá");
});

// ─── GO_BACK ──────────────────────────────────────────────────────────────

test("GO_BACK: landing -> no hace nada (no hay pantalla anterior)", () => {
  const s = wizardReducer(INITIAL_WIZARD_STATE, { type: "GO_BACK" });
  assert.equal(s.screen, "landing");
});

test("GO_BACK: recorre useCase -> budget -> preference -> resultados y vuelve exactamente en el mismo orden inverso", () => {
  let s: WizardState = wizardReducer(INITIAL_WIZARD_STATE, { type: "SELECT_MODE", mode: "ayudame" });
  s = wizardReducer(s, { type: "ANSWER_USE_CASE", useCase: "estudio" });
  s = wizardReducer(s, { type: "ANSWER_BUDGET", budgetMax: 700000 });
  s = wizardReducer(s, { type: "ANSWER_PREFERENCE", preference: "sin_preferencia", requirements: requirements() });
  assert.equal(s.screen, "results");

  s = wizardReducer(s, { type: "GO_BACK" });
  assert.equal(s.screen, "preference");
  s = wizardReducer(s, { type: "GO_BACK" });
  assert.equal(s.screen, "budget");
  s = wizardReducer(s, { type: "GO_BACK" });
  assert.equal(s.screen, "useCase");
  s = wizardReducer(s, { type: "GO_BACK" });
  assert.equal(s.screen, "landing");
});

test("GO_BACK desde 'configuration' limpia selectedCandidate y vuelve a 'results'", () => {
  let s: WizardState = { ...INITIAL_WIZARD_STATE, screen: "configuration", mode: "personalizar", selectedCandidate: CANDIDATE };
  s = wizardReducer(s, { type: "GO_BACK" });
  assert.equal(s.screen, "results");
  assert.equal(s.selectedCandidate, null);
});

test("GO_BACK desde 'quoteForm' con selección normal -> 'configuration'; con cotización especial -> 'results'", () => {
  const normal: WizardState = { ...INITIAL_WIZARD_STATE, screen: "quoteForm", mode: "personalizar", wantsSpecialQuote: false };
  assert.equal(wizardReducer(normal, { type: "GO_BACK" }).screen, "configuration");

  const special: WizardState = { ...INITIAL_WIZARD_STATE, screen: "quoteForm", mode: "ayudame", wantsSpecialQuote: true };
  assert.equal(wizardReducer(special, { type: "GO_BACK" }).screen, "results");
});

test("GO_BACK desde 'quoteCreated' no hace nada (pantalla terminal)", () => {
  const s: WizardState = { ...INITIAL_WIZARD_STATE, screen: "quoteCreated", mode: "personalizar", quoteResult: QUOTE };
  assert.equal(wizardReducer(s, { type: "GO_BACK" }).screen, "quoteCreated");
});

test("canGoBack: false en landing y en quoteCreated, true en el resto", () => {
  assert.equal(canGoBack(INITIAL_WIZARD_STATE), false);
  assert.equal(canGoBack({ ...INITIAL_WIZARD_STATE, screen: "quoteCreated" }), false);
  assert.equal(canGoBack({ ...INITIAL_WIZARD_STATE, screen: "budget", mode: "ayudame" }), true);
});

// ─── progreso ─────────────────────────────────────────────────────────────

test("stepProgress: null en landing, avanza monótonamente en cada flujo", () => {
  assert.equal(stepProgress(INITIAL_WIZARD_STATE), null);

  const ayudame = stepProgress({ ...INITIAL_WIZARD_STATE, screen: "budget", mode: "ayudame" });
  assert.ok(ayudame);
  assert.equal(ayudame?.current, 2);

  const personalizar = stepProgress({ ...INITIAL_WIZARD_STATE, screen: "results", mode: "personalizar" });
  assert.ok(personalizar);
  assert.equal(personalizar?.current, 2);
});

// ─── RESTART ──────────────────────────────────────────────────────────────

test("RESTART: vuelve exactamente al estado inicial desde cualquier pantalla", () => {
  const deep: WizardState = { ...INITIAL_WIZARD_STATE, screen: "quoteCreated", mode: "ayudame", quoteResult: QUOTE };
  assert.deepEqual(wizardReducer(deep, { type: "RESTART" }), INITIAL_WIZARD_STATE);
});
