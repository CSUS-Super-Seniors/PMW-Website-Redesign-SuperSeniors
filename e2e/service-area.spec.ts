import { expect, test } from '@playwright/test';

const cities = [
  'Carmichael',
  'Fair Oaks',
  'Citrus Heights',
  'Orangevale',
  'Sacramento',
  'Rancho Cordova',
];

for (const viewport of [
  { width: 1440, height: 1000 },
  { width: 390, height: 844 },
  { width: 320, height: 800 },
]) {
  test(`service area layout at ${viewport.width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize(viewport);
    const mapRequests: string[] = [];
    page.on('request', (req) => {
      if (/maps\.google|mapbox|tile\.openstreetmap/.test(req.url())) mapRequests.push(req.url());
    });
    await page.route('**/api/service-cities', (route) =>
      route.fulfill({ json: { cities: cities.map((name) => ({ name })) } }),
    );
    await page.goto('/service-area');
    await expect(page.getByRole('heading', { name: 'Where we work' })).toBeVisible();
    const list = page.getByRole('list', { name: 'Cities we serve' });
    await expect(list.getByRole('listitem')).toHaveText(cities);
    const map = page.getByRole('img', { name: /Regional map marking Carmichael/ });
    await expect(map).toBeVisible();
    expect(await map.evaluate((node) => (node as HTMLImageElement).naturalWidth)).toBeGreaterThan(
      0,
    );
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    const listBox = await list.boundingBox();
    const mapBox = await map.boundingBox();
    if (viewport.width < 1280) expect(mapBox!.y).toBeGreaterThan(listBox!.y + listBox!.height);
    else expect(mapBox!.x).toBeGreaterThan(listBox!.x);
    const main = page.getByRole('main');
    await expect(main.getByRole('link', { name: 'Request an estimate' })).toHaveAttribute(
      'href',
      '/estimate',
    );
    const call = main.getByRole('link', { name: 'Call (916) 643-5686' });
    await expect(call).toHaveAttribute('href', 'tel:+19166435686');
    await call.focus();
    await expect(call).toBeFocused();
    expect(mapRequests).toEqual([]);
    await page.evaluate(() => {
      (document.activeElement as HTMLElement)?.blur();
      window.scrollTo(0, 0);
    });
    await page.screenshot({
      path: testInfo.outputPath(`service-area-${viewport.width}.png`),
      fullPage: true,
    });
  });
}

test('service cities failure can be retried without displaying sample chips', async ({ page }) => {
  let recovered = false;
  await page.route('**/api/service-cities', (route) => {
    return route.fulfill(
      !recovered
        ? { status: 503, json: { error: 'Unavailable' } }
        : { json: { cities: [{ name: 'Carmichael' }] } },
    );
  });
  await page.goto('/service-area');
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(page.getByRole('list', { name: 'Cities we serve' })).toHaveCount(0);
  // StrictMode may issue and cancel the first mount request. Recovery follows
  // the user action, not an assumed number of development-mode requests.
  recovered = true;
  await page.getByRole('button', { name: 'Try again' }).focus();
  await page.keyboard.press('Enter');
  await expect(
    page.getByRole('list', { name: 'Cities we serve' }).getByRole('listitem'),
  ).toHaveText(['Carmichael']);
  await expect(page.getByRole('list', { name: 'Cities we serve' })).toBeFocused();
});

test('keyboard retry focuses repeated errors and empty results', async ({ page }) => {
  let empty = false;
  await page.route('**/api/service-cities', (route) =>
    route.fulfill(
      empty ? { json: { cities: [] } } : { status: 503, json: { error: 'Unavailable' } },
    ),
  );
  await page.goto('/service-area');
  const retry = page.getByRole('button', { name: 'Try again' });
  await retry.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByLabel('City list error')).toBeFocused();
  empty = true;
  await retry.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('status')).toContainText('Our city list is being updated');
  await expect(page.getByRole('status')).toBeFocused();
});
