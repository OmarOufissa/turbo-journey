// Ordre catégoriel fixe (jamais cyclique) — cf. skill dataviz. Les valeurs pointent
// vers les tokens HSL définis dans global.css (mêmes teintes, adaptées clair/sombre).
export const CATEGORICAL = [
  "hsl(var(--chart-1))", // bleu
  "hsl(var(--chart-2))", // aqua
  "hsl(var(--chart-3))", // jaune
  "hsl(var(--chart-4))", // vert
  "hsl(var(--chart-5))", // violet
  "hsl(var(--chart-6))", // rouge
];

export const STATUS = {
  good: "hsl(var(--success))",
  warning: "hsl(var(--warning))",
  critical: "hsl(var(--destructive))",
};

export function categoricalColor(index: number) {
  return CATEGORICAL[index % CATEGORICAL.length];
}

export function coverageColor(taux: number) {
  if (taux < 50) return STATUS.critical;
  if (taux < 100) return STATUS.warning;
  return STATUS.good;
}
