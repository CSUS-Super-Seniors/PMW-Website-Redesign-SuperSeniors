/**
 * Developer reference page for the design tokens (SSPMW-89).
 * Only routed in development: open http://localhost:5173/design-tokens
 * Compare it against Figma page "01 Design System / Dimitry".
 */

const colorGroups = [
  {
    name: 'Brand',
    colors: [
      { name: 'dark-brown', swatch: 'bg-dark-brown' },
      { name: 'amber', swatch: 'bg-amber' },
      { name: 'amber-dark', swatch: 'bg-amber-dark' },
      { name: 'walnut', swatch: 'bg-walnut' },
    ],
  },
  {
    name: 'Neutral',
    colors: [
      { name: 'neutral-800', swatch: 'bg-neutral-800' },
      { name: 'neutral-600', swatch: 'bg-neutral-600' },
      { name: 'neutral-400', swatch: 'bg-neutral-400' },
      { name: 'neutral-300', swatch: 'bg-neutral-300' },
      { name: 'neutral-100 (cream)', swatch: 'bg-neutral-100' },
      { name: 'neutral-50', swatch: 'bg-neutral-50' },
      { name: 'white', swatch: 'bg-white' },
    ],
  },
  {
    name: 'Feedback',
    colors: [
      { name: 'error', swatch: 'bg-error' },
      { name: 'error-dark', swatch: 'bg-error-dark' },
      { name: 'error-light', swatch: 'bg-error-light' },
      { name: 'success', swatch: 'bg-success' },
      { name: 'success-light', swatch: 'bg-success-light' },
      { name: 'warning', swatch: 'bg-warning' },
      { name: 'warning-light', swatch: 'bg-warning-light' },
      { name: 'info', swatch: 'bg-info' },
      { name: 'info-light', swatch: 'bg-info-light' },
    ],
  },
  {
    name: 'Logo (logo artwork only)',
    colors: [
      { name: 'logo-walnut', swatch: 'bg-logo-walnut' },
      { name: 'logo-amber', swatch: 'bg-logo-amber' },
      { name: 'logo-cream', swatch: 'bg-logo-cream' },
    ],
  },
];

const textStyles = [
  { name: 'type-display', className: 'type-display', sample: 'Peterson Mobile Woodworking' },
  { name: 'type-h1', className: 'type-h1', sample: 'Furniture repair that comes to you' },
  { name: 'type-h2', className: 'type-h2', sample: 'Our services' },
  { name: 'type-h3', className: 'type-h3', sample: 'Touch-ups and repair' },
  { name: 'type-h4', className: 'type-h4', sample: 'What happens next' },
  {
    name: 'type-body-lg',
    className: 'type-body-lg',
    sample: 'Tell us what happened and add photos if you can. We will call you back.',
  },
  { name: 'type-body', className: 'type-body', sample: 'We repair, refinish and restore.' },
  { name: 'type-body-sm', className: 'type-body-sm', sample: 'Photos are optional.' },
  { name: 'type-caption', className: 'type-caption', sample: 'JPG or PNG, up to 10 MB per photo' },
  { name: 'type-label', className: 'type-label', sample: 'Email address' },
  { name: 'type-button', className: 'type-button', sample: 'Request an estimate' },
  { name: 'type-nav', className: 'type-nav', sample: 'Services' },
  { name: 'type-overline', className: 'type-overline', sample: 'Step 2 of 4' },
  { name: 'type-wordmark', className: 'type-wordmark', sample: 'Mobile Woodworking' },
];

const spacingSteps = [
  { label: '1 (4px)', className: 'w-1' },
  { label: '2 (8px)', className: 'w-2' },
  { label: '3 (12px)', className: 'w-3' },
  { label: '4 (16px)', className: 'w-4' },
  { label: '6 (24px)', className: 'w-6' },
  { label: '8 (32px)', className: 'w-8' },
  { label: '10 (40px)', className: 'w-10' },
  { label: '14 (56px)', className: 'w-14' },
  { label: '20 (80px)', className: 'w-20' },
];

export default function DesignTokensPage() {
  return (
    <main className="mx-auto max-w-content px-4 py-10 xl:px-8">
      <p className="type-overline text-neutral-600">Developer reference</p>
      <h1 className="type-h1 mt-2">Design tokens</h1>
      <p className="type-body-lg mt-3 max-w-2xl text-neutral-600">
        Every color, text style and spacing step available to components. Values come from the Figma
        design system page.
      </p>

      <section className="mt-12" aria-labelledby="colors-heading">
        <h2 id="colors-heading" className="type-h2">
          Colors
        </h2>
        {colorGroups.map((group) => (
          <div key={group.name} className="mt-6">
            <h3 className="type-h4">{group.name}</h3>
            <ul className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-7">
              {group.colors.map((color) => (
                <li key={color.name}>
                  <div className={`h-16 rounded-lg border border-neutral-300 ${color.swatch}`} />
                  <p className="type-body-sm mt-2">{color.name}</p>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </section>

      <section className="mt-12" aria-labelledby="type-heading">
        <h2 id="type-heading" className="type-h2">
          Text styles
        </h2>
        <ul className="mt-6 divide-y divide-neutral-300">
          {textStyles.map((style) => (
            <li key={style.name} className="flex flex-col gap-2 py-4 lg:flex-row lg:gap-8">
              <code className="type-body-sm w-40 shrink-0 text-neutral-600">{style.name}</code>
              <span className={style.className}>{style.sample}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-12" aria-labelledby="spacing-heading">
        <h2 id="spacing-heading" className="type-h2">
          Spacing (4px base)
        </h2>
        <ul className="mt-6 space-y-3">
          {spacingSteps.map((step) => (
            <li key={step.label} className="flex items-center gap-4">
              <code className="type-body-sm w-24 text-neutral-600">{step.label}</code>
              <span className={`h-4 rounded-sm bg-amber ${step.className}`} />
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-12" aria-labelledby="buttons-heading">
        <h2 id="buttons-heading" className="type-h2">
          Colors in use
        </h2>
        <div className="mt-6 flex flex-wrap gap-4">
          <span className="type-button rounded-sm bg-dark-brown px-5 py-3 text-white">Primary</span>
          <span className="type-button rounded-sm bg-amber px-5 py-3 text-dark-brown">
            Request an estimate
          </span>
          <span className="type-button rounded-sm border-[1.5px] border-dark-brown bg-white px-5 py-3">
            Secondary
          </span>
          <span className="type-button rounded-sm bg-error px-5 py-3 text-white">Delete</span>
        </div>
        <div className="mt-6 rounded-lg bg-dark-brown p-6 shadow-card">
          <p className="type-overline text-amber">Footer</p>
          <p className="type-body-sm mt-2 text-neutral-300">
            Family-run furniture repair and restoration in Carmichael, CA since 2011.
          </p>
        </div>
      </section>
    </main>
  );
}
