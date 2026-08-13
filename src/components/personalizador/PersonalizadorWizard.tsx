"use client";

import { useCallback, useEffect, useReducer, useState } from "react";
import FadeIn from "@/components/FadeIn";
import { getBusinessProfile } from "@/supabase/db";
// Import puntual a schemas.ts (no al barrel @/lib/personalizador) — el
// barrel también reexporta code.ts, que importa node:crypto a nivel de
// módulo; eso rompe el bundle de cliente si se arrastra desde aquí.
import { HONEYPOT_FIELD_NAME } from "@/lib/personalizador/schemas";
import {
  wizardReducer,
  stepProgress,
  buildRequirementsFromAyudame,
  INITIAL_WIZARD_STATE,
} from "@/lib/personalizadorUi";
import type { CustomerRequirements } from "@/lib/personalizadorUi";
import {
  buscarOpcionesPersonalizadas,
  crearCotizacionPersonalizada,
} from "@/app/personalizador/actions";
import type { SearchOptionDTO, CreateQuoteInput } from "@/lib/personalizadorServer";
import LandingScreen from "./LandingScreen";
import UseCaseStep from "./UseCaseStep";
import BudgetStep from "./BudgetStep";
import PreferenceStep from "./PreferenceStep";
import ManualFormStep from "./ManualFormStep";
import ResultsScreen from "./ResultsScreen";
import ConfigurationScreen from "./ConfigurationScreen";
import QuoteFormScreen from "./QuoteFormScreen";
import QuoteCreatedScreen from "./QuoteCreatedScreen";

// Mismo fallback que WhatsAppButton.tsx mientras el perfil de negocio no ha cargado.
const DEFAULT_WHATSAPP_PHONE = "573202210698";

function friendlyCreateErrorMessage(error: string): string {
  switch (error) {
    case "VALIDATION_ERROR":
      return "Revisa los datos ingresados e intenta de nuevo.";
    case "CODE_GENERATION_FAILED":
      return "No pudimos generar tu cotización. Intenta de nuevo en un momento.";
    default:
      return "Ocurrió un error inesperado. Intenta de nuevo.";
  }
}

export default function PersonalizadorWizard() {
  const [state, dispatch] = useReducer(wizardReducer, INITIAL_WIZARD_STATE);
  const [whatsappPhone, setWhatsappPhone] = useState(DEFAULT_WHATSAPP_PHONE);

  useEffect(() => {
    let active = true;
    getBusinessProfile()
      .then((profile) => {
        if (active && profile?.phoneWhatsApp) setWhatsappPhone(profile.phoneWhatsApp);
      })
      .catch(() => {
        // El fallback ya está en pantalla — no hace falta mostrar un error por esto.
      });
    return () => {
      active = false;
    };
  }, []);

  const runSearch = useCallback(async (requirements: CustomerRequirements) => {
    try {
      // El honeypot solo se expone en QuoteFormScreen (punto 11) — en la
      // búsqueda siempre viaja vacío, pero se incluye igual por consistencia
      // con la forma que espera el schema de B3.
      const result = await buscarOpcionesPersonalizadas({ ...requirements, [HONEYPOT_FIELD_NAME]: "" });
      if (result.ok) {
        dispatch({ type: "SEARCH_SUCCESS", result: result.data });
      } else {
        dispatch({ type: "SEARCH_ERROR", message: "No pudimos procesar tu búsqueda. Intenta de nuevo." });
      }
    } catch {
      dispatch({ type: "SEARCH_ERROR", message: "No se pudo conectar. Intenta de nuevo." });
    }
  }, []);

  useEffect(() => {
    if (state.screen === "results" && state.searchStatus === "loading" && state.requirements) {
      void runSearch(state.requirements);
    }
  }, [state.screen, state.searchStatus, state.requirements, runSearch]);

  const handleCreateQuote = useCallback(async () => {
    if (!state.requirements) return;
    if (!state.wantsSpecialQuote && !state.selectedCandidate) return;

    dispatch({ type: "CREATE_START" });
    try {
      const payload: CreateQuoteInput = {
        requirements: { ...state.requirements, [HONEYPOT_FIELD_NAME]: state.honeypot },
        selectedProductId: state.wantsSpecialQuote ? null : state.selectedCandidate?.productId ?? null,
        wantsSpecialQuote: state.wantsSpecialQuote,
        customerCity: state.customerCity.trim() || null,
      };
      const result = await crearCotizacionPersonalizada(payload);
      if (result.ok) {
        dispatch({ type: "CREATE_SUCCESS", quote: result.data });
      } else {
        dispatch({ type: "CREATE_ERROR", error: result.error, message: friendlyCreateErrorMessage(result.error) });
      }
    } catch {
      dispatch({ type: "CREATE_ERROR", error: "INTERNAL_ERROR", message: "Ocurrió un error inesperado. Intenta de nuevo." });
    }
  }, [state.requirements, state.wantsSpecialQuote, state.selectedCandidate, state.customerCity, state.honeypot]);

  const progress = stepProgress(state);

  return (
    <FadeIn key={state.screen}>
      {state.screen === "landing" && (
        <LandingScreen onSelectMode={(mode) => dispatch({ type: "SELECT_MODE", mode })} />
      )}

      {state.screen === "useCase" && (
        <UseCaseStep
          progress={progress}
          onBack={() => dispatch({ type: "GO_BACK" })}
          onAnswer={(useCase) => dispatch({ type: "ANSWER_USE_CASE", useCase })}
        />
      )}

      {state.screen === "budget" && (
        <BudgetStep
          progress={progress}
          initialValue={state.budgetMax}
          onBack={() => dispatch({ type: "GO_BACK" })}
          onAnswer={(budgetMax) => dispatch({ type: "ANSWER_BUDGET", budgetMax })}
        />
      )}

      {state.screen === "preference" && state.useCase && state.budgetMax !== null && (
        <PreferenceStep
          progress={progress}
          onBack={() => dispatch({ type: "GO_BACK" })}
          onAnswer={(preference) => {
            const requirements = buildRequirementsFromAyudame(state.useCase!, state.budgetMax!, preference);
            dispatch({ type: "ANSWER_PREFERENCE", preference, requirements });
          }}
        />
      )}

      {state.screen === "manualForm" && (
        <ManualFormStep
          progress={progress}
          onBack={() => dispatch({ type: "GO_BACK" })}
          onSubmit={(requirements) => dispatch({ type: "SUBMIT_MANUAL_FORM", requirements })}
        />
      )}

      {state.screen === "results" && (
        <ResultsScreen
          progress={progress}
          onBack={() => dispatch({ type: "GO_BACK" })}
          status={state.searchStatus}
          errorMessage={state.searchErrorMessage}
          result={state.searchResult}
          staleSelectionMessage={state.staleSelectionMessage}
          requirements={state.requirements}
          onSelectCandidate={(candidate: SearchOptionDTO) => dispatch({ type: "SELECT_CANDIDATE", candidate })}
          onRequestSpecialQuote={() => dispatch({ type: "REQUEST_SPECIAL_QUOTE" })}
          onRetry={() => dispatch({ type: "SEARCH_START" })}
        />
      )}

      {state.screen === "configuration" && state.selectedCandidate && (
        <ConfigurationScreen
          progress={progress}
          onBack={() => dispatch({ type: "GO_BACK" })}
          candidate={state.selectedCandidate}
          onRequestQuote={() => dispatch({ type: "GO_TO_QUOTE_FORM" })}
        />
      )}

      {state.screen === "quoteForm" && (
        <QuoteFormScreen
          progress={progress}
          onBack={() => dispatch({ type: "GO_BACK" })}
          isSpecialQuote={state.wantsSpecialQuote}
          city={state.customerCity}
          onCityChange={(city) => dispatch({ type: "SET_CITY", city })}
          honeypot={state.honeypot}
          onHoneypotChange={(value) => dispatch({ type: "SET_HONEYPOT", value })}
          status={state.createStatus}
          errorMessage={state.createErrorMessage}
          onSubmit={() => void handleCreateQuote()}
        />
      )}

      {state.screen === "quoteCreated" && state.quoteResult && (
        <QuoteCreatedScreen
          quote={state.quoteResult}
          whatsappPhone={whatsappPhone}
          onRestart={() => dispatch({ type: "RESTART" })}
        />
      )}
    </FadeIn>
  );
}
