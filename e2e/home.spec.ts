import { expect, test } from '@playwright/test';

for (const viewport of [
  { width: 1440, height: 1000 },
  { width: 390, height: 844 },
  { width: 320, height: 740 },
]) {
  test(`Home content and actions work at ${viewport.width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize(viewport);
    await page.route('**/api/public/service-cities', (route) =>
      route.fulfill({
        json: {
          cities: [
            'Carmichael',
            'Fair Oaks',
            'Citrus Heights',
            'Orangevale',
            'Sacramento',
            'Rancho Cordova',
          ],
        },
      }),
    );
    await page.route('**/api/public/gallery/recent', (route) =>
      route.fulfill({
        json: {
          items: [1, 2, 3].map((number) => ({
            id: `00000000-0000-4000-8000-${String(number).padStart(12, '0')}`,
            beforeUrl: `https://images.example.test/before-${number}.svg`,
            afterUrl: `https://images.example.test/after-${number}.svg`,
          })),
        },
      }),
    );
    await page.route('https://images.example.test/**', (route) =>
      route.fulfill({
        contentType: 'image/svg+xml',
        body: `<svg xmlns="http://www.w3.org/2000/svg" width="480" height="480"><rect width="480" height="480" fill="wheat"/><text x="240" y="240" text-anchor="middle" fill="saddlebrown" font-family="sans-serif" font-size="24">${route.request().url().includes('before') ? 'Before' : 'After'}</text></svg>`,
      }),
    );
    const response = await page.goto('/');
    expect(response?.ok()).toBe(true);
    await expect(
      page.getByRole('heading', { level: 1, name: 'Furniture repair that comes to you' }),
    ).toBeVisible();
    await expect(
      page.getByRole('list', { name: 'Recent before and after work' }).getByRole('img'),
    ).toHaveCount(6);
    await expect(page.getByText(/We come to your home in Carmichael/)).toBeVisible();
    await expect(
      page.getByRole('main').getByRole('link', { name: 'Call (916) 643-5686' }),
    ).toHaveAttribute('href', 'tel:+19166435686');
    await page.getByRole('link', { name: 'See where we work' }).scrollIntoViewIfNeeded();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({
      path: testInfo.outputPath(`home-${viewport.width}.png`),
      fullPage: true,
    });
    await page.getByRole('main').getByRole('link', { name: 'Request an estimate' }).click();
    await expect(page).toHaveURL('/estimate');
    await expect(page.getByLabel('Service address')).toBeVisible();
  });
}

test('Home handles an empty gallery and retries unavailable cities using the keyboard', async ({
  page,
}) => {
  await page.route('**/api/public/gallery/recent', (route) =>
    route.fulfill({ json: { items: [] } }),
  );
  let failing = true;
  await page.route('**/api/public/service-cities', (route) =>
    route.fulfill(
      failing
        ? { status: 503, json: { error: 'Unavailable' } }
        : { json: { cities: ['Carmichael'] } },
    ),
  );
  await page.goto('/');
  await expect(page.getByText('More before and after photos coming soon')).toBeVisible();
  const retry = page.getByRole('button', { name: 'Try cities again' });
  await retry.focus();
  failing = false;
  await page.keyboard.press('Enter');
  await expect(page.getByText(/We come to your home in Carmichael\./)).toBeVisible();
  await page.getByRole('link', { name: 'See all services' }).click();
  await expect(page).toHaveURL('/services');
});
