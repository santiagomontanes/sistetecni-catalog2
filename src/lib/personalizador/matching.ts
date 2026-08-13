/**
 * Motor de matching — núcleo de B3.
 *
 * Evalúa cada candidato en dos fases independientes:
 *   1. Características FIJAS del equipo base (cpu_generation, gpu, touch,
 *      pantalla) — nunca upgradeables. Si alguna falla, el producto es
 *      INCOMPATIBLE sin excepción, sin importar RAM/almacenamiento.
 *   2. RAM y almacenamiento — si no cumplen ya, se busca la opción de
 *      upgrade compatible más barata que sí cumpla (ver
 *      upgradeSelection.ts). Si ninguna compatible confirmada alcanza el
 *      mínimo, también es INCOMPATIBLE.
 *
 * "Incompatible" nunca aparece en el array de resultados que devuelve
 * matchProducts() — queda excluido por completo (Invariante F).
 *
 * Regla explícita sobre valores desconocidos: si el cliente pidió un
 * mínimo/requisito específico (no "cualquiera") y el dato del producto es
 * null (no confirmado), se trata como que NO lo cumple — nunca se asume a
 * favor de un dato ausente.
 */
import type { Product } from "../../types/product";
import { selectCheapestSatisfyingUpgrade } from "./upgradeSelection";
import { calculateBudgetToleranceLimit, sumMoney } from "./money";
import type {
  CustomerRequirements,
  ProductCandidate,
  MatchResult,
  MatchOutcome,
  MatchReasonCode,
  SelectedUpgrade,
  UpgradeClassification,
} from "./types";

interface FixedCheckResult {
  ok: boolean;
  reasons: MatchReasonCode[];
}

function checkFixedCharacteristics(
  product: Product,
  requirements: CustomerRequirements
): FixedCheckResult {
  const reasons: MatchReasonCode[] = [];
  let ok = true;

  // CPU
  if (requirements.cpuGenerationMin !== undefined) {
    if (product.cpuGeneration == null) {
      reasons.push("CPU_GENERATION_UNKNOWN");
      ok = false;
    } else if (product.cpuGeneration < requirements.cpuGenerationMin) {
      reasons.push("CPU_GENERATION_TOO_LOW");
      ok = false;
    } else {
      reasons.push("CPU_GENERATION_OK");
    }
  }

  // GPU
  if (requirements.gpu !== "cualquiera") {
    if (product.gpuType == null) {
      reasons.push("GPU_UNKNOWN");
      ok = false;
    } else if (product.gpuType !== requirements.gpu) {
      reasons.push("GPU_MISMATCH");
      ok = false;
    } else {
      reasons.push("GPU_OK");
    }
  }

  // Touch
  if (requirements.touch !== "cualquiera") {
    const wantsTouch = requirements.touch === "si";
    if (product.touchScreen == null) {
      reasons.push("TOUCH_UNKNOWN");
      ok = false;
    } else if (product.touchScreen !== wantsTouch) {
      reasons.push("TOUCH_MISMATCH");
      ok = false;
    } else {
      reasons.push("TOUCH_OK");
    }
  }

  // Pantalla
  if (requirements.screenSize) {
    const { minInches, maxInches } = requirements.screenSize;
    if (product.screenSizeInches == null) {
      reasons.push("SCREEN_SIZE_UNKNOWN");
      ok = false;
    } else {
      const size = product.screenSizeInches;
      const withinMin = minInches === undefined || size >= minInches;
      const withinMax = maxInches === undefined || size <= maxInches;
      if (withinMin && withinMax) {
        reasons.push("SCREEN_SIZE_OK");
      } else {
        reasons.push("SCREEN_SIZE_OUT_OF_RANGE");
        ok = false;
      }
    }
  }

  return { ok, reasons };
}

interface DimensionEvaluation {
  ok: boolean;
  reason: MatchReasonCode;
  selected: SelectedUpgrade | null;
}

function evaluateRam(candidate: ProductCandidate, ramMinGb: number): DimensionEvaluation {
  const currentRam = candidate.product.ram ?? 0;
  if (currentRam >= ramMinGb) {
    return { ok: true, reason: "RAM_ALREADY_SUFFICIENT", selected: null };
  }

  const ramOptions = candidate.compatibleUpgrades.filter((c) => c.option.category === "ram");
  const winner = selectCheapestSatisfyingUpgrade(ramOptions, ramMinGb);
  if (!winner) {
    return { ok: false, reason: "RAM_UPGRADE_UNAVAILABLE", selected: null };
  }
  return {
    ok: true,
    reason: "RAM_UPGRADE_AVAILABLE",
    selected: {
      compatibilityId: winner.compatibilityId,
      upgradeOptionId: winner.option.id,
      category: "ram",
      label: winner.option.label,
      value: winner.option.value,
      extraCost: winner.option.extraCost,
    },
  };
}

function evaluateStorage(candidate: ProductCandidate, storageMinGb: number): DimensionEvaluation {
  const currentStorage = candidate.product.storageGb ?? 0;
  if (currentStorage >= storageMinGb) {
    return { ok: true, reason: "STORAGE_ALREADY_SUFFICIENT", selected: null };
  }

  const storageOptions = candidate.compatibleUpgrades.filter(
    (c) => c.option.category === "storage"
  );
  const winner = selectCheapestSatisfyingUpgrade(storageOptions, storageMinGb);
  if (!winner) {
    return { ok: false, reason: "STORAGE_UPGRADE_UNAVAILABLE", selected: null };
  }
  return {
    ok: true,
    reason: "STORAGE_UPGRADE_AVAILABLE",
    selected: {
      compatibilityId: winner.compatibilityId,
      upgradeOptionId: winner.option.id,
      category: "storage",
      label: winner.option.label,
      value: winner.option.value,
      extraCost: winner.option.extraCost,
    },
  };
}

function classify(ramSelected: boolean, storageSelected: boolean): UpgradeClassification {
  if (ramSelected && storageSelected) return "RAM_AND_STORAGE_UPGRADE_MATCH";
  if (ramSelected) return "RAM_UPGRADE_MATCH";
  if (storageSelected) return "STORAGE_UPGRADE_MATCH";
  return "DIRECT_MATCH";
}

/**
 * Evalúa un único candidato. Devuelve null si es INCOMPATIBLE (por
 * característica fija o por RAM/almacenamiento sin compatibilidad
 * confirmada) — nunca un MatchResult "a medias".
 */
export function evaluateCandidate(
  candidate: ProductCandidate,
  requirements: CustomerRequirements
): MatchResult | null {
  const fixed = checkFixedCharacteristics(candidate.product, requirements);
  const ram = evaluateRam(candidate, requirements.ramMinGb);
  const storage = evaluateStorage(candidate, requirements.storageMinGb);

  const reasons: MatchReasonCode[] = [...fixed.reasons, ram.reason, storage.reason];

  if (!fixed.ok || !ram.ok || !storage.ok) {
    return null; // INCOMPATIBLE — nunca se convierte en recomendación (Invariante F)
  }

  const selectedUpgrades: SelectedUpgrade[] = [ram.selected, storage.selected].filter(
    (u): u is SelectedUpgrade => u !== null
  );

  const basePrice = candidate.product.price;
  const finalPrice = sumMoney([basePrice, ...selectedUpgrades.map((u) => u.extraCost)]);

  const toleranceLimit = calculateBudgetToleranceLimit(requirements.budgetMax);
  let budgetStatus: MatchResult["budgetStatus"];
  if (finalPrice <= requirements.budgetMax) {
    budgetStatus = "WITHIN_BUDGET";
    reasons.push("WITHIN_BUDGET");
  } else if (finalPrice <= toleranceLimit) {
    budgetStatus = "WITHIN_TOLERANCE";
    reasons.push("WITHIN_BUDGET_TOLERANCE");
  } else {
    budgetStatus = "OVER_BUDGET";
    reasons.push("OVER_BUDGET");
  }

  const stockStatus: MatchResult["stockStatus"] =
    candidate.product.stock > 0 ? "AVAILABLE" : "OUT_OF_STOCK";
  reasons.push(stockStatus === "AVAILABLE" ? "IN_STOCK" : "OUT_OF_STOCK");

  return {
    product: candidate.product,
    classification: classify(ram.selected !== null, storage.selected !== null),
    basePrice,
    selectedUpgrades,
    finalConfiguration: {
      ramGb: ram.selected?.value ?? candidate.product.ram ?? 0,
      storageGb: storage.selected?.value ?? candidate.product.storageGb ?? 0,
    },
    finalPrice,
    budgetStatus,
    stockStatus,
    reasons,
  };
}

/**
 * Punto de entrada del motor. Filtra INCOMPATIBLE (Invariante F), separa
 * disponibles de agotados (D7 — nunca mezclados) y determina si hace
 * falta cotización especial. NO ordena — eso es responsabilidad de
 * ranking.ts, para mantener cada función con una sola responsabilidad.
 */
export function matchProducts(
  requirements: CustomerRequirements,
  candidates: ProductCandidate[]
): MatchOutcome {
  const evaluated = candidates
    .map((c) => evaluateCandidate(c, requirements))
    .filter((r): r is MatchResult => r !== null);

  const available = evaluated.filter((r) => r.stockStatus === "AVAILABLE");
  const referenceOnly = evaluated.filter((r) => r.stockStatus === "OUT_OF_STOCK");

  return {
    available,
    referenceOnly,
    specialQuoteRequired: available.length === 0 && referenceOnly.length === 0,
  };
}
