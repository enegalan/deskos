/**
 * Built-in wallpapers and wallpaper tone helpers.
 * Presets live under ./presets/ — order in BUILTIN_WALLPAPERS = Settings order.
 */

import { wallpaper as none } from './presets/none';
import { wallpaper as gradientBlue } from './presets/gradient-blue';
import { wallpaper as gradientSunset } from './presets/gradient-sunset';
import { wallpaper as gradientOcean } from './presets/gradient-ocean';
import { wallpaper as gradientForest } from './presets/gradient-forest';
import { wallpaper as solidWhite } from './presets/solid-white';

/** Built-in wallpaper entry (id, label, CSS background value). */
export interface WallpaperPreset {
  id: string;
  name: string;
  /** CSS background value (gradient, solid color, or empty for default) */
  value: string;
}

/** Built-in wallpapers shown in Settings (order = display order) */
export const BUILTIN_WALLPAPERS: WallpaperPreset[] = [
  none,
  gradientBlue,
  gradientSunset,
  gradientOcean,
  gradientForest,
  solidWhite,
];

/** UI tone inferred from wallpaper luminance. */
export type WallpaperTone = 'light' | 'dark';

/** Luminance cutoff when classifying wallpaper as light vs dark. */
const LUMINANCE_THRESHOLD = 0.58;

/**
 * WCAG relative luminance of an sRGB color (0–1).
 *
 * @param r - Red 0–255
 * @param g - Green 0–255
 * @param b - Blue 0–255
 */
function relativeLuminance(r: number, g: number, b: number): number {
  const toLinear = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
}

/**
 * Parse a CSS hex color into RGB.
 *
 * @param hex - `#rgb`, `#rrggbb`, or `#rrggbbaa`
 * @returns `[r, g, b]` or `null` if invalid
 */
function parseHex(hex: string): [number, number, number] | null {
  let h = hex.replace('#', '');
  if (h.length === 3) {
    h = h
      .split('')
      .map((c) => c + c)
      .join('');
  }
  if (h.length === 8) {
    h = h.slice(0, 6);
  }
  if (h.length !== 6) {
    return null;
  }
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  if (isNaN(r) || isNaN(g) || isNaN(b)) {
    return null;
  }
  return [r, g, b];
}

/**
 * Map average luminance to light/dark wallpaper tone.
 *
 * @param avg - Mean relative luminance 0–1
 */
function toneFromLuminance(avg: number): WallpaperTone {
  return avg > LUMINANCE_THRESHOLD ? 'light' : 'dark';
}

/**
 * Infer tone from hex colors embedded in a CSS value.
 *
 * @param css - CSS color or gradient string
 * @returns Tone, or `null` if no parsable hex colors
 */
function toneFromCssColors(css: string): WallpaperTone | null {
  const matches = css.match(/#([0-9a-fA-F]{3,8})\b/g);
  if (!matches || matches.length === 0) {
    return null;
  }
  let sum = 0;
  let count = 0;
  for (const match of matches) {
    const rgb = parseHex(match);
    if (rgb) {
      sum += relativeLuminance(rgb[0], rgb[1], rgb[2]);
      count += 1;
    }
  }
  if (count === 0) {
    return null;
  }
  return toneFromLuminance(sum / count);
}

/**
 * Sample an image URL and infer light/dark tone.
 *
 * @param url - Image `data:`, `blob:`, or http(s) URL
 * @returns Wallpaper tone (defaults to `dark` on failure)
 */
function sampleImageTone(url: string): Promise<WallpaperTone> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const size = 32;
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) {
          resolve('dark');
          return;
        }
        ctx.drawImage(img, 0, 0, size, size);
        const { data } = ctx.getImageData(0, 0, size, size);
        let sum = 0;
        let count = 0;
        for (let i = 0; i < data.length; i += 4) {
          const a = data[i + 3];
          if (a < 16) continue;
          sum += relativeLuminance(data[i], data[i + 1], data[i + 2]);
          count += 1;
        }
        resolve(count === 0 ? 'dark' : toneFromLuminance(sum / count));
      } catch {
        resolve('dark');
      }
    };
    img.onerror = () => resolve('dark');
    img.src = url;
  });
}

/**
 * Whether wallpaper is light or dark for desktop icon contrast.
 * Default desktop CSS gradient is dark → light icons.
 */
export async function getWallpaperTone(wallpaperUrl: string): Promise<WallpaperTone> {
  if (!wallpaperUrl) {
    return 'dark';
  }

  // Solid hex color (#fff, #ffffff)
  if (/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(wallpaperUrl.trim())) {
    return toneFromCssColors(wallpaperUrl) ?? 'dark';
  }

  if (
    wallpaperUrl.startsWith('linear-gradient') ||
    wallpaperUrl.startsWith('radial-gradient')
  ) {
    return toneFromCssColors(wallpaperUrl) ?? 'dark';
  }

  if (
    wallpaperUrl.startsWith('data:') ||
    wallpaperUrl.startsWith('blob:') ||
    wallpaperUrl.startsWith('http://') ||
    wallpaperUrl.startsWith('https://')
  ) {
    return sampleImageTone(wallpaperUrl);
  }

  return 'dark';
}
