// Высота приборов и диаметр радара совпадают в CSS-пикселях независимо от DPR.
export const SPACE_OVERLAY_WIDTH = 105;
export const SPACE_OVERLAY_HEIGHT = 136;
export const SPACE_OVERLAY_MARGIN = 5;
export const SPACE_RADAR_SIDE = 'right' as const;
export const SPACE_RADAR_DIAMETER = SPACE_OVERLAY_HEIGHT;
export const SPACE_RADAR_RANGE_M = 5000;

// До трёх значащих цифр; округлённая тысяча переходит в следующую единицу.
export function formatHudMass(mass: number): string {
  const units = ['кг', 'т', 'кт', 'Мт'];
  let value = mass, index = 0;
  while (Math.abs(value) >= 1000 && index < units.length - 1) { value /= 1000; index++; }
  value = Number(value.toPrecision(3));
  if (Math.abs(value) >= 1000 && index < units.length - 1) { value /= 1000; index++; }
  return `${value} ${units[index]}`;
}
