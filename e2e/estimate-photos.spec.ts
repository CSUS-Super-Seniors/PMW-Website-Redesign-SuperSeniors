import { Buffer } from 'node:buffer';
import { expect, test } from '@playwright/test';

for (const viewport of [
  { width: 1280, height: 900 },
  { width: 390, height: 844 },
]) {
  test(`local photo preview at ${viewport.width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize(viewport);
    const apiRequests: string[] = [];
    page.on('request', (request) => {
      if (new URL(request.url()).pathname.startsWith('/api/')) apiRequests.push(request.url());
    });
    let attempts = 0;
    await page.route('**/api/estimates/photos/session', (route) =>
      route.fulfill({ json: { token: 'test-session', expiresAt: 4102444800 } }),
    );
    await page.route('**/api/estimates/photos/*', async (route) => {
      if (route.request().url().endsWith('/session')) {
        await route.fallback();
        return;
      }
      attempts++;
      if (attempts === 1) {
        await route.fulfill({ status: 503, json: { error: 'Photo upload failed. Please retry.' } });
        return;
      }
      const id = route.request().url().split('/').at(-1);
      expect(route.request().postDataBuffer()!.length).toBeLessThanOrEqual(1024 * 1024);
      await route.fulfill({
        status: 201,
        json: {
          id,
          storagePath: `estimate-uploads/test/${id}.png`,
          receipt: 'signed-test-receipt',
        },
      });
    });
    await page.goto('/dev/estimate-photos');
    await expect(
      page.getByRole('heading', { name: 'Photo step development preview' }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Next', exact: true }).click();
    await expect(page.getByRole('status')).toContainText('0 photo(s) uploaded privately');
    await page.getByRole('button', { name: 'Back to photos' }).click();

    // A real browser-generated PNG exercises the codec, not a mocked helper.
    const base64 = await page.evaluate(() => {
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 1024;
      const context = canvas.getContext('2d')!;
      const image = context.createImageData(1024, 1024);
      let seed = 42;
      for (let i = 0; i < image.data.length; i += 4) {
        seed = (Math.imul(seed, 1664525) + 1013904223) | 0;
        image.data[i] = seed & 255;
        image.data[i + 1] = (seed >>> 8) & 255;
        image.data[i + 2] = (seed >>> 16) & 255;
        image.data[i + 3] = 255;
      }
      context.putImageData(image, 0, 0);
      return canvas.toDataURL('image/png').split(',')[1];
    });
    const buffer = Buffer.from(base64, 'base64');
    expect(buffer.length).toBeGreaterThan(1024 * 1024);
    await page
      .getByLabel('Choose photos')
      .setInputFiles({ name: 'chair.png', mimeType: 'image/png', buffer });
    await expect(page.getByText(/Ready on this device/)).toBeVisible({ timeout: 30000 });
    const ready = await page.getByText(/Ready on this device/).textContent();
    expect(Number(ready?.match(/(\d+) KB/)?.[1])).toBeLessThanOrEqual(1024);
    expect(
      await page.getByRole('img').evaluate((image) => (image as HTMLImageElement).naturalWidth),
    ).toBeGreaterThan(0);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    await page.screenshot({
      path: testInfo.outputPath(`photos-${viewport.width}.png`),
      fullPage: true,
    });
    await page.getByRole('button', { name: 'Back', exact: true }).click();
    await page.getByLabel('Demonstration item').fill('Table');
    await page.getByRole('button', { name: 'Return to photos' }).click();
    await expect(page.getByRole('img')).toBeVisible();
    await page.getByRole('button', { name: 'Next', exact: true }).click();
    await expect(
      page.getByText('Photo upload failed. Please retry.', { exact: true }),
    ).toBeVisible();
    await expect(page.getByRole('img')).toBeVisible();
    await page.screenshot({
      path: testInfo.outputPath(`upload-error-${viewport.width}.png`),
      fullPage: true,
    });
    await page.getByRole('button', { name: 'Next', exact: true }).click();
    await expect(page.getByRole('status')).toContainText('1 photo(s) uploaded privately for Table');
    await page.getByRole('button', { name: 'Back to photos' }).click();
    await expect(page.getByText(/Uploaded privately/)).toBeVisible();
    await page.screenshot({
      path: testInfo.outputPath(`upload-success-${viewport.width}.png`),
      fullPage: true,
    });
    await page.getByRole('button', { name: 'Remove chair.png' }).click();
    await expect(page.getByRole('img')).toHaveCount(0);
    await page.getByLabel('Choose photos').setInputFiles({
      name: 'fake.jpg',
      mimeType: 'image/jpeg',
      buffer: Buffer.from('not an image'),
    });
    await expect(page.getByRole('alert')).toContainText('Choose a JPG or PNG');
    await expect(page.getByRole('button', { name: 'Next', exact: true })).toBeDisabled();
    await page.getByLabel('Choose photos').setInputFiles({
      name: 'oversized.png',
      mimeType: 'image/png',
      buffer: Buffer.alloc(10 * 1024 * 1024 + 1),
    });
    await expect(
      page.getByRole('alert').filter({ hasText: 'This photo is too large' }),
    ).toBeVisible();
    await expect(page.getByRole('alert').filter({ hasText: 'Choose a JPG or PNG' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Next', exact: true })).toBeDisabled();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    await page.screenshot({
      path: testInfo.outputPath(`validation-errors-${viewport.width}.png`),
      fullPage: true,
    });
    expect(attempts).toBe(2);
    expect(
      apiRequests.every((url) => new URL(url).pathname.startsWith('/api/estimates/photos/')),
    ).toBe(true);
  });

  test(`service-area approval and photo navigation at ${viewport.width}px`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize(viewport);
    let carmichaelChecks = 0;
    const requests: string[] = [];
    await page.route(
      (url) => url.pathname.startsWith('/api/'),
      async (route) => {
        const path = new URL(route.request().url()).pathname;
        requests.push(path);
        if (path === '/api/estimates/validate-step-1') {
          await route.fulfill({ json: { valid: true } });
        } else if (path === '/api/estimates/service-area') {
          const { city } = route.request().postDataJSON();
          if (city === 'Carmichael' && ++carmichaelChecks === 1) {
            await route.fulfill({ status: 503, json: { error: 'Temporarily unavailable' } });
          } else {
            await route.fulfill({ json: { inServiceArea: city === 'Carmichael' } });
          }
        } else if (path === '/api/estimates/photos/session') {
          await route.fulfill({
            status: 201,
            json: { token: 'test-session', expiresAt: 4102444800 },
          });
        } else if (
          path.startsWith('/api/estimates/photos/') &&
          route.request().method() === 'PUT'
        ) {
          const id = path.split('/').at(-1);
          await route.fulfill({
            status: 201,
            json: {
              id,
              storagePath: `estimate-uploads/test/${id}.png`,
              receipt: 'test-receipt',
            },
          });
        } else {
          await route.fulfill({ status: 404, json: { error: 'Unexpected API request' } });
        }
      },
    );
    await page.goto('/estimate');
    for (const [label, value] of [
      ['First name', 'Ana'],
      ['Last name', 'Smith'],
      ['Email address', 'ana@example.com'],
      ['Phone number', '9165550123'],
      ['Service address', '123 Main St'],
      ['City', 'Davis'],
      ['Item', 'Chair'],
      ['Describe the problem', 'Loose leg'],
    ])
      await page.getByLabel(label, { exact: true }).fill(value);
    await page.getByLabel('What happened?').selectOption('other');
    const honeypot = page.locator('[name="pmw_extra"]');
    await honeypot.evaluate((input) => {
      (input as HTMLInputElement).value = 'bot-filled-value';
    });
    const advance = () => page.getByRole('button', { name: 'Continue to photos' }).click();
    await advance();
    await expect(page.getByText('Outside our service area', { exact: true })).toBeVisible();
    await expect(page.getByRole('alert').getByRole('link')).toHaveAttribute(
      'href',
      'tel:+19166435686',
    );
    await expect(page.getByLabel('Choose photos')).toHaveCount(0);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({
      path: testInfo.outputPath(`estimate-area-error-${viewport.width}.png`),
      fullPage: true,
    });
    await page.getByLabel('City', { exact: true }).fill('Carmichael');
    await advance();
    await expect(page.getByText(/We could not check whether we serve your city/)).toBeVisible();
    await expect(page.getByLabel('Choose photos')).toHaveCount(0);
    await advance();
    await expect(page.getByLabel('Choose photos')).toBeVisible();
    const base64 = await page.evaluate(() => {
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 64;
      const context = canvas.getContext('2d')!;
      context.fillStyle = '#825b39';
      context.fillRect(0, 0, 64, 64);
      return canvas.toDataURL('image/png').split(',')[1];
    });
    await page.getByLabel('Choose photos').setInputFiles({
      name: 'chair.png',
      mimeType: 'image/png',
      buffer: Buffer.from(base64, 'base64'),
    });
    await expect(page.getByText(/Ready on this device/)).toBeVisible();
    await page.getByRole('button', { name: 'Back', exact: true }).click();
    await expect(page.getByLabel('City', { exact: true })).toHaveValue('Carmichael');
    await expect(page.getByLabel('Email address', { exact: true })).toHaveValue('ana@example.com');
    await expect(honeypot).toHaveValue('bot-filled-value');
    await page.getByLabel('Item', { exact: true }).fill('Table');
    await advance();
    await expect(page.getByRole('img', { name: 'Preview of chair.png' })).toBeVisible();
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({
      path: testInfo.outputPath(`estimate-photos-${viewport.width}.png`),
      fullPage: true,
    });
    await page.getByRole('button', { name: 'Next', exact: true }).click();
    await expect(page.getByRole('status')).toContainText('1 photo(s) uploaded privately');
    await expect(page.getByText(/Your estimate request has not been submitted/)).toBeVisible();
    expect(requests).not.toContain('/api/estimates');
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({
      path: testInfo.outputPath(`estimate-handoff-${viewport.width}.png`),
      fullPage: true,
    });
    await page.getByRole('button', { name: 'Back to photos' }).click();
    await page.getByRole('button', { name: 'Remove chair.png' }).click();
    await page.getByRole('button', { name: 'Next', exact: true }).click();
    await expect(page.getByRole('status')).toContainText('0 photo(s) uploaded privately');
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
  });
}
