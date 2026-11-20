import { expect, test } from '@playwright/test';

const testimonials = [
  {
    id: '1',
    name: 'Margaret Lewis',
    city: 'Carmichael',
    service: 'Dining table restoration',
    rating: 5,
    body: 'Peterson Mobile Woodworking restored my grandmother’s dining table so beautifully that it looks better than it did when I inherited it. The finish is perfect, the communication was clear, and the team delivered exactly when they promised.',
    submitted_at: '2026-11-19T00:00:00Z',
  },
  {
    id: '2',
    name: 'Robert Chen',
    city: 'Placerville',
    service: 'Commercial restoration',
    rating: 4,
    body: 'We needed a fast turnaround for a water-damaged credenza before a client walkthrough. The team at Peterson Mobile Woodworking worked around our schedule, matched the original stain perfectly, and delivered a piece that looks brand new.',
    submitted_at: '2026-11-18T00:00:00Z',
  },
  {
    id: '3',
    name: 'Dorothy Alvarez',
    city: 'Fair Oaks',
    service: 'Family heirloom refinishing',
    rating: null,
    body: 'I was nervous about refinishing a family heirloom, but the team explained every step and kept me updated with photos. The final result is stunning, and the piece feels sturdy and beautiful again.',
    submitted_at: '2026-11-17T00:00:00Z',
  },
];

for (const width of [1440, 390]) {
  test(`testimonial submission and layout at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 1000 });
    const submissions: Record<string, unknown>[] = [];
    await page.route('**/api/public/testimonials', async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({ json: { testimonials } });
      } else {
        submissions.push(route.request().postDataJSON());
        await route.fulfill(
          submissions.length === 1
            ? { status: 503, json: { error: 'Unavailable' } }
            : { status: 201, json: { success: true } },
        );
      }
    });
    await page.goto('/testimonials');
    await expect(page.getByText('Margaret Lewis', { exact: true })).toBeVisible();
    await expect(page.getByRole('img', { name: '5 out of 5 stars' })).toBeVisible();
    await expect(page.getByRole('img', { name: '4 out of 5 stars' })).toBeVisible();
    await expect(page.locator('main [role="img"]')).toHaveCount(2);
    await expect(page.getByLabel('City (optional)')).not.toHaveAttribute('required');
    await expect(page.getByLabel('Service (optional)')).not.toHaveAttribute('required');
    await page.evaluate(() => document.fonts.ready);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
    await page.screenshot({ path: testInfo.outputPath('testimonials.png'), fullPage: true });

    await page.getByRole('button', { name: 'Submit testimonial', exact: true }).click();
    await expect(page.getByText('Enter your name.', { exact: true })).toBeVisible();
    expect(submissions).toHaveLength(0);

    await page.getByLabel('Full name').fill('Alex');
    await page.getByLabel('Email address').fill('alex@example.com');
    if (width === 1440) {
      await page.getByLabel('City (optional)').fill(' Carmichael ');
      await page.getByLabel('Service (optional)').fill(' Refinishing ');
    }
    await page.getByLabel('You may publish my testimonial.').check();
    await page.getByLabel('Your testimonial').fill('x'.repeat(501));
    await expect(page.getByLabel('Your testimonial')).toHaveValue('x'.repeat(501));
    await expect(
      page.getByText('Testimonial must be 500 characters or fewer.', { exact: true }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Submit testimonial', exact: true }).click();
    expect(submissions).toHaveLength(0);
    await page.getByLabel('Your testimonial').fill('Great work.');
    await page.getByRole('button', { name: 'Submit testimonial', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText('could not be submitted');
    await expect(page.getByLabel('Your testimonial')).toHaveValue('Great work.');
    await page.getByRole('button', { name: 'Submit testimonial', exact: true }).click();
    await expect(
      page.getByText('Thank you. Your testimonial was sent.', { exact: true }),
    ).toBeVisible();
    expect(submissions[1]).toMatchObject({
      city: width === 1440 ? 'Carmichael' : '',
      service: width === 1440 ? 'Refinishing' : '',
      body: 'Great work.',
      can_publish: true,
    });
    await expect(page.getByLabel('Full name')).toHaveValue('');
    await expect(page.getByLabel('City (optional)')).toHaveValue('');
    await expect(page.getByLabel('Service (optional)')).toHaveValue('');
    await expect(page.getByLabel('Your testimonial')).toHaveValue('');
    await expect(page.getByLabel('You may publish my testimonial.')).not.toBeChecked();
    await expect(page.locator('main blockquote')).toHaveCount(3);
    const banner = page.getByText('Thank you. Your testimonial was sent.', { exact: true });
    expect((await banner.boundingBox())!.y).toBeGreaterThanOrEqual(80);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({
      path: testInfo.outputPath('testimonials-success.png'),
      fullPage: true,
    });
    await page.getByRole('button', { name: 'Dismiss message' }).click();
    await expect(
      page.getByText('Thank you. Your testimonial was sent.', { exact: true }),
    ).toHaveCount(0);
  });
}
