export type Messages = { [key: string]: unknown };

export type ProblemKind = "missing" | "extra" | "placeholders" | "empty" | "type";

export interface Problem {
  locale: string;
  key: string;
  kind: ProblemKind;
  detail?: string;
}

export function flatten(value: unknown, prefix?: string, out?: Record<string, unknown>): Record<string, unknown>;
export function placeholders(message: unknown): string[];
export function compareLocales(locales: Record<string, Messages>, base: string): Problem[];
export function checkDirectory(dir: string, base: string): { locales: string[]; problems: Problem[] };
