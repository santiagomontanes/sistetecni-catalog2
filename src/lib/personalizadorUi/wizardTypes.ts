/**
 * Tipos del estado del wizard — separados de wizardReducer.ts para que los
 * componentes puedan importar solo los tipos sin arrastrar la lógica.
 */
import type { CustomerRequirements } from "../personalizador";
import type { SearchOptionDTO, SearchOptionsResponse, CreateQuoteResult, PublicQuoteDTO } from "../personalizadorServer";
import type { UseCaseKey, PreferenceKey } from "./presets";
import type { ManualFormValues } from "./manualForm";
import { DEFAULT_MANUAL_FORM } from "./manualForm";

export type WizardMode = "ayudame" | "personalizar";

export type WizardScreen =
  | "landing"
  | "useCase"
  | "budget"
  | "preference"
  | "manualForm"
  | "results"
  | "configuration"
  | "quoteForm"
  | "quoteCreated";

export type AsyncStatus = "idle" | "loading" | "success" | "error";

/** Error de creación NO recuperable con los mismos datos — el servidor invalidó la selección (punto 11). */
export type CreateErrorCode = Exclude<CreateQuoteResult, { ok: true }>["error"];

const STALE_SELECTION_ERRORS: readonly CreateErrorCode[] = [
  "PRODUCT_NOT_ELIGIBLE",
  "SPECIAL_QUOTE_NOT_APPLICABLE",
];

export function isStaleSelectionError(error: CreateErrorCode): boolean {
  return STALE_SELECTION_ERRORS.includes(error);
}

export interface WizardState {
  screen: WizardScreen;
  mode: WizardMode | null;

  useCase: UseCaseKey | null;
  preference: PreferenceKey | null;
  budgetMax: number | null;

  manualForm: ManualFormValues;

  requirements: CustomerRequirements | null;

  searchStatus: AsyncStatus;
  searchErrorMessage: string | null;
  searchResult: SearchOptionsResponse | null;
  staleSelectionMessage: string | null;

  selectedCandidate: SearchOptionDTO | null;
  wantsSpecialQuote: boolean;

  customerCity: string;
  honeypot: string;

  createStatus: AsyncStatus;
  createErrorCode: CreateErrorCode | null;
  createErrorMessage: string | null;
  quoteResult: PublicQuoteDTO | null;
}

export const INITIAL_WIZARD_STATE: WizardState = {
  screen: "landing",
  mode: null,

  useCase: null,
  preference: null,
  budgetMax: null,

  manualForm: DEFAULT_MANUAL_FORM,

  requirements: null,

  searchStatus: "idle",
  searchErrorMessage: null,
  searchResult: null,
  staleSelectionMessage: null,

  selectedCandidate: null,
  wantsSpecialQuote: false,

  customerCity: "",
  honeypot: "",

  createStatus: "idle",
  createErrorCode: null,
  createErrorMessage: null,
  quoteResult: null,
};

export type WizardAction =
  | { type: "SELECT_MODE"; mode: WizardMode }
  | { type: "ANSWER_USE_CASE"; useCase: UseCaseKey }
  | { type: "ANSWER_BUDGET"; budgetMax: number }
  | { type: "ANSWER_PREFERENCE"; preference: PreferenceKey; requirements: CustomerRequirements }
  | { type: "SUBMIT_MANUAL_FORM"; requirements: CustomerRequirements }
  | { type: "GO_BACK" }
  | { type: "SEARCH_START" }
  | { type: "SEARCH_SUCCESS"; result: SearchOptionsResponse }
  | { type: "SEARCH_ERROR"; message: string }
  | { type: "SELECT_CANDIDATE"; candidate: SearchOptionDTO }
  | { type: "REQUEST_SPECIAL_QUOTE" }
  | { type: "GO_TO_QUOTE_FORM" }
  | { type: "SET_CITY"; city: string }
  | { type: "SET_HONEYPOT"; value: string }
  | { type: "CREATE_START" }
  | { type: "CREATE_SUCCESS"; quote: PublicQuoteDTO }
  | { type: "CREATE_ERROR"; error: CreateErrorCode; message: string }
  | { type: "RESTART" };
