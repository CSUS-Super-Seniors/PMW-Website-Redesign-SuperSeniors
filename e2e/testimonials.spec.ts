import { expect, test, type Page, type TestInfo } from '@playwright/test';

async function capture(page: Page, testInfo: TestInfo, state: string, width: number) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    window.scrollTo(0, 0);
  });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
  const path = testInfo.outputPath(`${state}-${width}.png`);
  await page.screenshot({ path, fullPage: true, animations: 'disabled' });
  await testInfo.attach(`${state}-${width}`, { path, contentType: 'image/png' });
}

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
    let finishSubmission!: () => void;
    const sending = new Promise<void>((resolve) => {
      finishSubmission = resolve;
    });
    await page.route('**/api/public/testimonials', async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({ json: { testimonials } });
      } else {
        submissions.push(route.request().postDataJSON());
        if (submissions.length === 1) {
          await route.fulfill({
            status: 503,
            json: { error: 'Your testimonial could not be saved. Please try again.' },
          });
        } else if (submissions.length === 2) {
          await route.fulfill({
            status: 429,
            json: { error: 'Too many submissions. Please wait a minute and try again.' },
          });
        } else {
          await sending;
          await route.fulfill({ status: 201, json: { success: true } });
        }
      }
    });
    await page.goto('/testimonials');
    await expect(page.getByText('Margaret Lewis', { exact: true })).toBeVisible();
    await expect(page.getByRole('img', { name: '5 out of 5 stars' })).toBeVisible();
    await expect(page.getByRole('img', { name: '4 out of 5 stars' })).toBeVisible();
    await expect(page.getByRole('img', { name: 'Not rated', exact: true })).toBeVisible();
    await expect(
      page.getByRole('img', { name: 'Not rated', exact: true }).locator('svg[fill="none"]'),
    ).toHaveCount(5);
    await expect(page.locator('main [role="img"]')).toHaveCount(3);
    await expect(page.getByLabel('City', { exact: true })).toHaveAttribute('required');
    await expect(page.getByLabel('Service', { exact: true })).toHaveAttribute('required');
    const consent =
      width === 1440
        ? 'I give Peterson Mobile Woodworking permission to publish this testimonial on the website and in marketing materials.'
        : 'You may publish my testimonial.';
    await expect(page.getByRole('checkbox', { name: consent, exact: true })).toBeVisible();
    const photoContact =
      width === 1440
        ? 'I would like to be contacted about adding a photo to this testimonial.'
        : 'Contact me about adding a photo.';
    await expect(page.getByRole('checkbox', { name: photoContact, exact: true })).toBeVisible();
    await capture(page, testInfo, 'testimonials', width);

    await page.getByRole('button', { name: 'Submit testimonial', exact: true }).click();
    await expect(page.getByText('Full name is required.', { exact: true })).toBeVisible();
    await expect(page.getByText('Email address is required.', { exact: true })).toBeVisible();
    await expect(page.getByText('Your testimonial is required.', { exact: true })).toBeVisible();
    await expect(page.getByText('City is required.', { exact: true })).toBeVisible();
    await expect(page.getByText('Service is required.', { exact: true })).toBeVisible();
    expect(submissions).toHaveLength(0);
    await capture(page, testInfo, 'required-errors', width);

    await page.getByLabel('Full name').fill('Alex');
    await page.getByLabel('Email address').fill('alex@example.com');
    await page.getByLabel('City', { exact: true }).fill(' Carmichael ');
    await page.getByLabel('Service', { exact: true }).fill(' Refinishing ');
    await page.getByRole('checkbox', { name: consent, exact: true }).check();
    await page.getByLabel('Your testimonial').fill('x'.repeat(501));
    await expect(page.getByLabel('Your testimonial')).toHaveValue('x'.repeat(501));
    await expect(
      page.getByText('Testimonial must be 500 characters or fewer.', { exact: true }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Submit testimonial', exact: true }).click();
    expect(submissions).toHaveLength(0);
    await capture(page, testInfo, 'length-error', width);
    await page.getByLabel('Your testimonial').fill('Great work.');
    await page.getByRole('button', { name: 'Submit testimonial', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText('could not be saved');
    await expect(page.getByLabel('Your testimonial')).toHaveValue('Great work.');
    await capture(page, testInfo, 'submission-error', width);
    await page.getByRole('button', { name: 'Submit testimonial', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText(
      'Too many submissions. Please wait a minute and try again.',
    );
    await capture(page, testInfo, 'rate-limit', width);
    await page.getByRole('button', { name: 'Submit testimonial', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Sending…', exact: true })).toBeDisabled();
    await expect(page.getByLabel('Full name')).toBeDisabled();
    await capture(page, testInfo, 'sending', width);
    finishSubmission();
    await expect(
      page.getByText('Thank you. Your testimonial was sent.', { exact: true }),
    ).toBeVisible();
    expect(submissions).toHaveLength(3);
    expect(submissions[2]).toMatchObject({
      city: 'Carmichael',
      service: 'Refinishing',
      body: 'Great work.',
      can_publish: true,
    });
    await expect(page.getByLabel('Full name')).toHaveValue('');
    await expect(page.getByLabel('City', { exact: true })).toHaveValue('');
    await expect(page.getByLabel('Service', { exact: true })).toHaveValue('');
    await expect(page.getByLabel('Your testimonial')).toHaveValue('');
    await expect(page.getByRole('checkbox', { name: consent, exact: true })).not.toBeChecked();
    await expect(page.locator('main blockquote')).toHaveCount(3);
    const banner = page.getByText('Thank you. Your testimonial was sent.', { exact: true });
    expect((await banner.boundingBox())!.y).toBeGreaterThanOrEqual(80);
    await capture(page, testInfo, 'success', width);
    await page.getByRole('button', { name: 'Dismiss message' }).click();
    await expect(
      page.getByText('Thank you. Your testimonial was sent.', { exact: true }),
    ).toHaveCount(0);
  });

  test(`testimonial loading, error, empty, and retry states at ${width}px`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width, height: 1000 });
    let finishLoading!: () => void;
    const loading = new Promise<void>((resolve) => {
      finishLoading = resolve;
    });
    let requests = 0;
    let failList = true;
    await page.route('**/api/public/testimonials', async (route) => {
      requests++;
      if (failList) {
        await loading;
        await route.fulfill({
          status: 503,
          json: { error: 'Testimonials are temporarily unavailable.' },
        });
      } else {
        await route.fulfill({ json: { testimonials: [] } });
      }
    });
    try {
      await page.goto('/testimonials');
      await expect(
        page.getByRole('status').filter({ hasText: 'Loading testimonials' }),
      ).toBeVisible();
      await capture(page, testInfo, 'loading', width);
    } finally {
      finishLoading();
    }
    await expect(page.getByRole('alert')).toContainText('Testimonials could not be loaded.');
    await capture(page, testInfo, 'list-error', width);
    const requestsBeforeRetry = requests;
    failList = false;
    await page.getByRole('button', { name: 'Try again', exact: true }).click();
    await expect(
      page.getByText('No testimonials have been published yet. Please check back soon.', {
        exact: true,
      }),
    ).toBeVisible();
    await expect(page.getByRole('alert')).toHaveCount(0);
    await capture(page, testInfo, 'empty', width);
    expect(requests).toBeGreaterThan(requestsBeforeRetry);
  });
}
