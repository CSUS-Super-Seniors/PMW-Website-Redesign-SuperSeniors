/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import { business } from '../config/site';
import ServiceAreaPage from './ServiceAreaPage';

// Read the shipped asset, not a mocked image import or its alt text.
const svg = readFileSync(join(process.cwd(), 'public/images/service-area-map.svg'), 'utf8');
const streetAddress =
  /\b\d{1,6}\s+(?:[\w.'-]+\s+){1,5}(?:st(?:reet)?|ave(?:nue)?|rd|road|blvd|boulevard|way|dr(?:ive)?|ln|lane|ct|court|pkwy|parkway)\b/i;

describe('Service Area location privacy', () => {
  it('renders city-only location information without a street address or map directions', async () => {
    render(
      <MemoryRouter>
        <ServiceAreaPage loadCities={async () => [{ name: 'Carmichael' }]} />
      </MemoryRouter>,
    );
    await screen.findByRole('list');
    const main = screen.getByRole('main');
    expect(main.textContent).toContain(business.location.split(',')[0]);
    expect(main.textContent).not.toMatch(streetAddress);
    expect(main.querySelector('address, iframe')).toBeNull();
    for (const link of main.querySelectorAll('a')) {
      expect(link.href).not.toMatch(/maps\.|\/maps\b|\/dir\b/i);
    }
  });

  it('ships only Carmichael as SVG text and no street-address content', () => {
    const asset = new DOMParser().parseFromString(svg, 'image/svg+xml');
    expect(asset.querySelector('parsererror')).toBeNull();
    const labels = [...asset.querySelectorAll('text')];
    expect(labels.map((label) => label.textContent?.trim())).toEqual(['Carmichael']);
    expect(labels[0].getAttribute('display')).not.toBe('none');
    expect(labels[0].getAttribute('visibility')).not.toBe('hidden');
    expect(asset.querySelector('foreignObject, image, script, a')).toBeNull();
    expect(asset.documentElement.textContent).not.toMatch(streetAddress);
    expect(svg).not.toMatch(streetAddress);
  });
});
