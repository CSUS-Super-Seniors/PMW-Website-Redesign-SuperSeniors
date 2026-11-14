import { Buffer } from 'node:buffer';
import { expect, test } from '@playwright/test';

for (const viewport of [
  { width: 1280, height: 900 },
  { width: 390, height: 844 },
]) {
  test(`unfinished estimate leave guard at ${viewport.width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize(viewport);
    await page.route(
      (url) => url.pathname.startsWith('/api/'),
      async (route) => {
        const path = new URL(route.request().url()).pathname;
        if (path === '/api/estimates/validate-step-1') {
          await route.fulfill({ json: { valid: true } });
        } else if (path === '/api/estimates/service-area') {
          await route.fulfill({ json: { inServiceArea: true } });
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
    const requestLink = () =>
      page.getByRole('contentinfo').getByRole('link', { name: 'Request an estimate', exact: true });
    const contactLink = () =>
      page.getByRole('contentinfo').getByRole('link', { name: 'Contact', exact: true });
    const dialog = () => page.getByRole('dialog', { name: 'Discard request?' });

    await page.goto('/');
    await requestLink().click();
    // An empty form can be left without a prompt.
    await contactLink().click();
    await expect(page.getByRole('heading', { name: 'Get in touch', exact: true })).toBeVisible();
    await expect(dialog()).toHaveCount(0);
    await requestLink().click();
    await page.getByLabel('First name', { exact: true }).fill('Ana');

    // Header navigation uses the shared modal on desktop and through the phone menu.
    if (viewport.width < 1280) await page.getByRole('button', { name: 'Open menu' }).click();
    await page
      .getByRole('navigation', { name: 'Main', exact: true })
      .getByRole('link', { name: 'Services', exact: true })
      .click();
    await expect(dialog()).toBeVisible();
    await expect(page).toHaveURL(/\/estimate$/);
    await dialog().getByRole('button', { name: 'Discard', exact: true }).focus();
    await page.keyboard.press('Tab');
    await expect(dialog().getByRole('button', { name: 'Close dialog' })).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    await expect(dialog().getByRole('button', { name: 'Discard', exact: true })).toBeFocused();
    await page.screenshot({ path: testInfo.outputPath(`discard-request-${viewport.width}.png`) });
    await page.keyboard.press('Escape');
    await expect(dialog()).toHaveCount(0);
    await expect(page.getByLabel('First name', { exact: true })).toHaveValue('Ana');

    for (const [label, value] of [
      ['Last name', 'Smith'],
      ['Email address', 'ana@example.com'],
      ['Phone number', '9165550123'],
      ['Service address', '123 Main St'],
      ['City', 'Carmichael'],
      ['Item', 'Chair'],
      ['Describe the problem', 'Loose leg'],
    ])
      await page.getByLabel(label, { exact: true }).fill(value);
    await page.getByLabel('What happened?').selectOption('other');
    await page.getByLabel('How did you hear about us?', { exact: true }).selectOption('referral');
    await page.getByRole('button', { name: 'Continue to photos' }).click();
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
    await expect(dialog()).toHaveCount(0);
    await expect(page.getByLabel('Email address', { exact: true })).toHaveValue('ana@example.com');
    await expect(page.getByLabel('How did you hear about us?')).toHaveValue('referral');
    await page.getByRole('button', { name: 'Continue to photos' }).click();
    await expect(page.getByRole('img', { name: 'Preview of chair.png' })).toBeVisible();

    await contactLink().click();
    await expect(dialog()).toBeVisible();
    await dialog().getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(page.getByRole('img', { name: 'Preview of chair.png' })).toBeVisible();
    // Review stays protected until the request is successfully submitted.
    await page.getByRole('button', { name: 'Next', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Review your request' })).toBeVisible();
    await expect(page.getByRole('list', { name: 'Request photos' }).getByRole('img')).toHaveCount(
      1,
    );
    await contactLink().click();
    await expect(dialog()).toBeVisible();
    await dialog().getByRole('button', { name: 'Cancel', exact: true }).click();
    await page.getByRole('button', { name: 'Back to photos' }).click();
    await expect(page.getByRole('img', { name: 'Preview of chair.png' })).toBeVisible();

    // Browser Back must keep its original destination through Cancel and Discard.
    await page.goBack();
    await expect(dialog()).toBeVisible();
    await dialog().getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(page.getByRole('img', { name: 'Preview of chair.png' })).toBeVisible();
    await page.goBack();
    await expect(dialog()).toBeVisible();
    await dialog().getByRole('button', { name: 'Discard', exact: true }).click();
    await expect(page).toHaveURL(/\/contact$/);
    await requestLink().click();
    await expect(page.getByLabel('First name', { exact: true })).toHaveValue('');
    await expect(page.getByLabel('City', { exact: true })).toHaveValue('');
    await expect(page.getByLabel('How did you hear about us?')).toHaveValue('');
    await expect(page.getByRole('img', { name: 'Preview of chair.png' })).toHaveCount(0);

    // Reload uses the browser's native warning rather than the custom modal.
    await page.getByLabel('First name', { exact: true }).click();
    await page.getByLabel('First name', { exact: true }).fill('Ana');
    // Wait for the app's effect to attach its unload protection.
    await expect
      .poll(
        () =>
          page.evaluate(() => {
            const event = new Event('beforeunload', { cancelable: true });
            window.dispatchEvent(event);
            return event.defaultPrevented;
          }),
        { message: 'The dirty estimate should register its unload protection before reloading' },
      )
      .toBe(true);
    const cancelReloadDialog = page.waitForEvent('dialog');
    // Trigger reload without waiting for a navigation that Cancel prevents.
    const canceledReload = page.evaluate(() => window.location.reload());
    const nativeCancel = await cancelReloadDialog;
    expect(nativeCancel.type()).toBe('beforeunload');
    await nativeCancel.dismiss();
    await canceledReload;
    await expect(page.getByLabel('First name', { exact: true })).toHaveValue('Ana');
    const confirmReloadDialog = page.waitForEvent('dialog');
    const confirmedReload = page.reload();
    const nativeConfirm = await confirmReloadDialog;
    expect(nativeConfirm.type()).toBe('beforeunload');
    await nativeConfirm.accept();
    await confirmedReload;
    await expect(page.getByLabel('First name', { exact: true })).toHaveValue('');
  });
}
