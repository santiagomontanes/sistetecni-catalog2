export type AppEnv = "staging" | "production";

export interface EnvironmentInfo {
  appEnv: AppEnv | null;
  raw: string | undefined;
  supabaseUrl: string | undefined;
  supabaseProjectRef: string | null;
  productionProjectRef: string | undefined;
  coherent: boolean;
  warnings: string[];
}

export function extractProjectRef(supabaseUrl: string | undefined): string | null;

export function getEnvironment(
  env?: Record<string, string | undefined>
): EnvironmentInfo;
