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
    expect(attempts).toBe(2);
    expect(
      apiRequests.every((url) => new URL(url).pathname.startsWith('/api/estimates/photos/')),
    ).toBe(true);
  });
}
