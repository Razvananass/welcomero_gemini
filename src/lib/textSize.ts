// Text size: a reading aid for people who read in a second or third language. Saved in this browser only.
// Everything in the app is sized in rem, so changing the page's root font size scales all text and spacing together.
// index.html applies the saved choice before the page draws, so the layout does not jump.

export type TextSize = 'normal' | 'large' | 'xlarge';

export const TEXT_SIZES: TextSize[] = ['normal', 'large', 'xlarge'];

/** Root font size, as a percentage of the browser default (16 px). */
export const TEXT_SIZE_PERCENT: Record<TextSize, number> = { normal: 100, large: 115, xlarge: 130 };

export function isTextSize(value: unknown): value is TextSize {
  return typeof value === 'string' && (TEXT_SIZES as string[]).includes(value);
}

export function applyTextSize(size: TextSize): void {
  document.documentElement.style.fontSize = size === 'normal' ? '' : `${TEXT_SIZE_PERCENT[size]}%`;
}
