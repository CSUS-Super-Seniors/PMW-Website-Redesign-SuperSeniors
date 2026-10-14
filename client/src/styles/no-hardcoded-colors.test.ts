/// <reference types="node" />
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

// Read every component and page file straight from disk (not import.meta.glob,
// whose results Vitest can cache), so newly added files are always checked.
// Tests run from the client folder (npm test -w client).
const srcDir = join(process.cwd(), 'src');

function listSourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return listSourceFiles(path);
    return /\.(ts|tsx)$/.test(entry.name) && !/\.test\.(ts|tsx)$/.test(entry.name) ? [path] : [];
  });
}

const sources = listSourceFiles(srcDir).map(
  (path) => [relative(srcDir, path), readFileSync(path, 'utf8')] as const,
);

const hexColor = /#[0-9a-f]{3}(?:[0-9a-f]{3})?(?:[0-9a-f]{2})?\b/i;
const arbitraryColor = /\b(?:bg|text|border|fill|stroke|ring|outline|from|to|via)-\[(?:#|rgb|hsl)/;

describe('components use design tokens', () => {
  it('found source files to check', () => {
    expect(sources.length).toBeGreaterThan(0);
  });

  it.each(sources)('%s has no hard-coded colors', (_file, code) => {
    expect(code).not.toMatch(hexColor);
    expect(code).not.toMatch(arbitraryColor);
  });
});
