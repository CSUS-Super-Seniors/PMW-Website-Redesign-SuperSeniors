/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// Read from disk: Vitest replaces CSS imports with empty modules.
// Tests run from the client folder (npm test -w client).
const themeCss = readFileSync(join(process.cwd(), 'src/styles/theme.css'), 'utf8');

/** Color styles from Figma "01 Design System / Dimitry" (exported Oct 13, 2026). */
const figmaColors: Record<string, string> = {
  'dark-brown': '#2a1b11',
  amber: '#d49a3a',
  'amber-dark': '#b8802a',
  walnut: '#7a4a21',
  'neutral-800': '#3d2413',
  'neutral-600': '#6b5a4c',
  'neutral-400': '#a3978a',
  'neutral-300': '#ddd3c2',
  'neutral-100': '#f3e9d8',
  'neutral-50': '#f6f2ea',
  white: '#ffffff',
  error: '#b3261e',
  'error-dark': '#8c1d18',
  'error-light': '#fbeae8',
  success: '#2e7d4f',
  'success-light': '#e7f4ec',
  warning: '#9a6700',
  'warning-light': '#fff4d6',
  info: '#1f5fa8',
  'info-light': '#e6f0fa',
  'logo-walnut': '#3d2413',
  'logo-amber': '#d49a3a',
  'logo-cream': '#f3e9d8',
};

function readColorTokens(css: string): Record<string, string> {
  const tokens: Record<string, string> = {};
  for (const match of css.matchAll(/--color-([a-z0-9-]+):\s*(#[0-9a-f]{6})/gi)) {
    tokens[match[1]] = match[2].toLowerCase();
  }
  return tokens;
}

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const tokens = readColorTokens(themeCss);

describe('design tokens', () => {
  it('match every Figma color style exactly', () => {
    for (const [name, hex] of Object.entries(figmaColors)) {
      expect(tokens[name], `--color-${name}`).toBe(hex);
    }
  });

  it('do not define colors that are not in Figma', () => {
    expect(Object.keys(tokens).sort()).toEqual(Object.keys(figmaColors).sort());
  });

  it('turn off the default Tailwind palette', () => {
    expect(themeCss).toMatch(/--color-\*:\s*initial;/);
  });

  // Text and background pairs used in the Figma screens. AA needs 4.5:1 for normal text.
  const textPairs: Array<[string, string]> = [
    ['dark-brown', 'white'],
    ['dark-brown', 'neutral-50'],
    ['dark-brown', 'neutral-100'],
    ['neutral-800', 'white'],
    ['neutral-800', 'neutral-50'],
    ['neutral-800', 'neutral-100'],
    ['neutral-600', 'white'],
    ['neutral-600', 'neutral-50'],
    ['neutral-600', 'neutral-100'],
    ['walnut', 'white'],
    ['walnut', 'neutral-50'],
    ['white', 'dark-brown'],
    ['dark-brown', 'amber'],
    ['white', 'error'],
    ['neutral-300', 'dark-brown'],
    ['amber', 'dark-brown'],
    ['neutral-400', 'dark-brown'],
    ['error', 'error-light'],
    ['info', 'info-light'],
  ];

  it.each(textPairs)('%s text on %s meets WCAG AA (4.5:1)', (text, background) => {
    expect(contrast(tokens[text], tokens[background])).toBeGreaterThanOrEqual(4.5);
  });
});
