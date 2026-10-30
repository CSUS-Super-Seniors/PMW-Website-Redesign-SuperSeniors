import { describe, expect, it } from 'vitest';
import { services } from './services';

// The Services page uses each id as a section anchor and an element id, so a
// typo in the content list would break links and page structure without an error.
describe('services content (SSPMW-247)', () => {
  it('lists at least one service', () => {
    expect(services.length).toBeGreaterThan(0);
  });

  it('gives every service a unique, URL-safe id', () => {
    const ids = services.map((service) => service.id);
    for (const id of ids) {
      expect(id).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
    }
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('does not create an element id the page already uses or creates twice', () => {
    // The page gives each service `<id>` and `<id>-title`. `main` is the skip-link
    // target in PublicLayout and `estimate-cta-title` labels the closing panel.
    const pageIds = [
      'main',
      'estimate-cta-title',
      ...services.flatMap((service) => [service.id, `${service.id}-title`]),
    ];
    expect(new Set(pageIds).size).toBe(pageIds.length);
  });

  it('fills in every text field', () => {
    for (const service of services) {
      expect(service.name.trim()).not.toBe('');
      expect(service.description.trim()).not.toBe('');
      expect(service.photoDescription.trim()).not.toBe('');
    }
  });

  it('lists each common job once per service', () => {
    for (const service of services) {
      expect(new Set(service.commonJobs).size).toBe(service.commonJobs.length);
      for (const job of service.commonJobs) {
        expect(job.trim()).not.toBe('');
      }
    }
  });
});
