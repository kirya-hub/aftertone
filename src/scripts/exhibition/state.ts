export const presets = [
  { angle: 0, elevation: 0.18 },
  { angle: 48, elevation: 0.05 },
  { angle: -28, elevation: 0.95 },
] as const;
export const clampAngle = (value: number) =>
  Number.isFinite(value) ? Math.max(-65, Math.min(65, value)) : 0;
export const togglePath = (selected: number, next: number) =>
  next >= 0 && next < 3 ? (selected === next ? -1 : next) : selected;
