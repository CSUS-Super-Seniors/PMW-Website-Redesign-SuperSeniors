import type { PublicTestimonial } from '@pmw/validation';

/** Local preview data only; production builds do not import this module. */
export const testimonialFixtures: PublicTestimonial[] = [
  {
    id: 'preview-margaret',
    name: 'Margaret Lewis',
    city: 'Carmichael',
    service: 'Dining table restoration',
    rating: 5,
    body: 'Peterson Mobile Woodworking restored my grandmother’s dining table so beautifully that it looks better than it did when I inherited it. The finish is perfect, the communication was clear, and the team delivered exactly when they promised.',
    submitted_at: '2026-11-19T00:00:00Z',
  },
  {
    id: 'preview-robert',
    name: 'Robert Chen',
    city: 'Placerville',
    service: 'Commercial restoration',
    rating: 4,
    body: 'We needed a fast turnaround for a water-damaged credenza before a client walkthrough. The team at Peterson Mobile Woodworking worked around our schedule, matched the original stain perfectly, and delivered a piece that looks brand new.',
    submitted_at: '2026-11-18T00:00:00Z',
  },
  {
    id: 'preview-dorothy',
    name: 'Dorothy Alvarez',
    city: 'Fair Oaks',
    service: 'Family heirloom refinishing',
    rating: null,
    body: 'I was nervous about refinishing a family heirloom, but the team explained every step and kept me updated with photos. The final result is stunning, and the piece feels sturdy and beautiful again.',
    submitted_at: '2026-11-17T00:00:00Z',
  },
];
