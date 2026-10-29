/**
 * Services page content (SSPMW-247, C2). Figma: "Services / Desktop" and "Services / Mobile".
 *
 * The Services page builds one section per entry in this list. Adding, removing,
 * renaming or reordering a service here changes those sections with no layout changes.
 * Q8 (the final service list) is still open with the client. When it is answered, also
 * update `footerServices` in `site.ts` and the page title and intro in `ServicesPage.tsx`.
 */

export type Service = {
  /** Stable id, used as the section anchor (for example /services#refinishing). */
  id: string;
  name: string;
  description: string;
  commonJobs: readonly string[];
  /** What the photo shows. Shown in the placeholder until real photos arrive (SSPMW-49). */
  photoDescription: string;
};

export const services: readonly Service[] = [
  {
    id: 'furniture-repair',
    name: 'Furniture repair',
    description:
      'Wobbly chairs, loose table legs, sticking drawers, and cracked frames. We fix the problem at the joint so the repair lasts.',
    commonJobs: [
      'Chairs and stools',
      'Tables and desks',
      'Dressers and cabinets',
      'Drawers and doors',
    ],
    photoDescription: 'chair repair in progress',
  },
  {
    id: 'refinishing',
    name: 'Refinishing',
    description:
      'Stripping, sanding, staining, and sealing. We match the color you have or help you choose a new one.',
    commonJobs: [
      'Water rings and scratches',
      'Faded or sun-damaged finishes',
      'A new stain or paint color',
    ],
    photoDescription: 'refinished dining table',
  },
  {
    id: 'restoration',
    name: 'Restoration',
    description:
      'Careful work on antiques and family pieces, keeping the original wood, hardware, and character wherever we can.',
    commonJobs: ['Antique chairs and tables', 'Cabinets and chests', 'Family heirlooms'],
    photoDescription: 'restored antique dresser',
  },
];
