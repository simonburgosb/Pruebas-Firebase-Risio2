// Se comparte la clave y el tamaño; la geometría se sirve con la aplicación.
export const BOARD_MODELS = {
  'kidney-full': { label: 'Riñón completo', anatomy: 'kidney', variant: 'completo' },
  'kidney-cut': { label: 'Riñón en corte', anatomy: 'kidney', variant: 'corte' },
  'nephron-15': { label: 'Nefrona 15 %', anatomy: 'nephron' },
  'nephron-85': { label: 'Nefrona 85 %', anatomy: 'nephron85' },
  glomerulus: { label: 'Glomérulo en detalle', anatomy: 'glomerulus' }
};

export const MIN_MODEL_SIZE = 75;
export const MAX_MODEL_SIZE = 200;
export const MODEL_SIZE_STEP = 25;

export function boardModelSize(value) {
  if (value === true) return 100;
  return Number.isInteger(value) && value >= MIN_MODEL_SIZE && value <= MAX_MODEL_SIZE
    && value % MODEL_SIZE_STEP === 0 ? value : 0;
}
