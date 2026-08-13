/**
 * Máquina de estados pura del wizard — la navegación entre pasos, la
 * acumulación de respuestas y las transiciones de error/éxito viven aquí,
 * sin ningún JSX. Los componentes solo hacen `dispatch(action)` y leen
 * `state`. Esto es lo que permite probar "navegación de pasos" y
 * "validaciones" (punto 20 del pedido) con `node --test`, sin renderizar
 * React ni agregar una librería de testing de componentes nueva.
 *
 * IMPORTANTE: este reducer NUNCA decide matching/precio/compatibilidad —
 * solo transiciona pantallas y guarda lo que las Server Actions (B4)
 * devuelven. Esas decisiones siguen siendo 100% de B3/B4.
 */
import { INITIAL_WIZARD_STATE, isStaleSelectionError } from "./wizardTypes";
import type { WizardAction, WizardScreen, WizardState } from "./wizardTypes";

function previousScreen(state: WizardState): WizardScreen | null {
  switch (state.screen) {
    case "landing":
      return null;
    case "useCase":
      return "landing";
    case "budget":
      return "useCase";
    case "preference":
      return "budget";
    case "manualForm":
      return "landing";
    case "results":
      return state.mode === "ayudame" ? "preference" : "manualForm";
    case "configuration":
      return "results";
    case "quoteForm":
      return state.wantsSpecialQuote ? "results" : "configuration";
    case "quoteCreated":
      return null; // pantalla terminal — no hay "atrás" tras crear la cotización
  }
}

export function wizardReducer(state: WizardState, action: WizardAction): WizardState {
  switch (action.type) {
    case "SELECT_MODE":
      return {
        ...INITIAL_WIZARD_STATE,
        mode: action.mode,
        screen: action.mode === "ayudame" ? "useCase" : "manualForm",
      };

    case "ANSWER_USE_CASE":
      return { ...state, useCase: action.useCase, screen: "budget" };

    case "ANSWER_BUDGET":
      return { ...state, budgetMax: action.budgetMax, screen: "preference" };

    case "ANSWER_PREFERENCE":
      return {
        ...state,
        preference: action.preference,
        requirements: action.requirements,
        screen: "results",
        searchStatus: "loading",
        searchResult: null,
        staleSelectionMessage: null,
      };

    case "SUBMIT_MANUAL_FORM":
      return {
        ...state,
        requirements: action.requirements,
        screen: "results",
        searchStatus: "loading",
        searchResult: null,
        staleSelectionMessage: null,
      };

    case "GO_BACK": {
      const target = previousScreen(state);
      if (!target) return state;

      const next: WizardState = { ...state, screen: target };
      if (state.screen === "results") {
        next.searchResult = null;
        next.searchStatus = "idle";
        next.staleSelectionMessage = null;
      }
      if (state.screen === "configuration") {
        next.selectedCandidate = null;
      }
      if (state.screen === "quoteForm") {
        next.createStatus = "idle";
        next.createErrorCode = null;
        next.createErrorMessage = null;
      }
      return next;
    }

    case "SEARCH_START":
      return { ...state, searchStatus: "loading", searchErrorMessage: null };

    case "SEARCH_SUCCESS":
      return { ...state, searchStatus: "success", searchResult: action.result, searchErrorMessage: null };

    case "SEARCH_ERROR":
      return { ...state, searchStatus: "error", searchErrorMessage: action.message };

    case "SELECT_CANDIDATE":
      return { ...state, selectedCandidate: action.candidate, wantsSpecialQuote: false, screen: "configuration" };

    case "REQUEST_SPECIAL_QUOTE":
      return { ...state, wantsSpecialQuote: true, selectedCandidate: null, screen: "quoteForm" };

    case "GO_TO_QUOTE_FORM":
      return { ...state, screen: "quoteForm" };

    case "SET_CITY":
      return { ...state, customerCity: action.city };

    case "SET_HONEYPOT":
      return { ...state, honeypot: action.value };

    case "CREATE_START":
      return { ...state, createStatus: "loading", createErrorCode: null, createErrorMessage: null };

    case "CREATE_SUCCESS":
      return { ...state, createStatus: "success", quoteResult: action.quote, screen: "quoteCreated" };

    case "CREATE_ERROR": {
      if (isStaleSelectionError(action.error)) {
        // Punto 11: el servidor invalidó la selección — nunca se crea la
        // cotización con datos viejos. Se vuelve a "results" con un
        // mensaje amigable; el componente de resultados dispara una
        // búsqueda nueva al detectar staleSelectionMessage.
        return {
          ...state,
          screen: "results",
          selectedCandidate: null,
          wantsSpecialQuote: false,
          createStatus: "idle",
          createErrorCode: null,
          createErrorMessage: null,
          staleSelectionMessage:
            "Esa opción ya no está disponible tal como la viste. Actualizamos los resultados por ti.",
          searchResult: null,
          searchStatus: "loading",
        };
      }
      return { ...state, createStatus: "error", createErrorCode: action.error, createErrorMessage: action.message };
    }

    case "RESTART":
      return INITIAL_WIZARD_STATE;
  }
}

export function canGoBack(state: WizardState): boolean {
  return previousScreen(state) !== null;
}

const STEP_LABELS_BY_SCREEN: Partial<Record<WizardScreen, string>> = {
  useCase: "¿Qué necesitas?",
  budget: "Presupuesto",
  preference: "Preferencias",
  manualForm: "Características",
  results: "Resultados",
  configuration: "Tu configuración",
  quoteForm: "Cotización",
  quoteCreated: "Listo",
};

export function stepLabel(screen: WizardScreen): string | null {
  return STEP_LABELS_BY_SCREEN[screen] ?? null;
}

/** Progreso 1-based dentro del flujo activo — para la barra de progreso (punto 5). */
export function stepProgress(state: WizardState): { current: number; total: number } | null {
  if (state.screen === "landing") return null;

  const flow: WizardScreen[] =
    state.mode === "ayudame"
      ? ["useCase", "budget", "preference", "results", "configuration", "quoteForm", "quoteCreated"]
      : ["manualForm", "results", "configuration", "quoteForm", "quoteCreated"];

  const index = flow.indexOf(state.screen);
  if (index === -1) return null;
  return { current: index + 1, total: flow.length };
}
