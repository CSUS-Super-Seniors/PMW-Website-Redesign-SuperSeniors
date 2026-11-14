import { expect, test } from '@playwright/test';

for (const width of [1280, 390]) {
  test(`review confirmation stays unsent at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    const requests: string[] = [];
    await page.route(
      (url) => url.pathname.startsWith('/api/'),
      async (route) => {
        const path = new URL(route.request().url()).pathname;
        requests.push(path);
        if (path === '/api/estimates/validate-step-1')
          await route.fulfill({ json: { valid: true } });
        else if (path === '/api/estimates/service-area')
          await route.fulfill({ json: { inServiceArea: true } });
        else await route.fulfill({ status: 501 });
      },
    );
    await page.goto('/estimate');
    for (const [label, value] of [
      ['First name', 'Ana'],
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
    await page.getByLabel('How did you hear about us?').selectOption('referral');
    await page.getByRole('button', { name: 'Continue to photos' }).click();
    await page.getByRole('button', { name: 'Next', exact: true }).click();
    const heading = page.getByRole('heading', { name: 'Review your request' });
    await expect(heading).toBeFocused();
    await expect
      .poll(async () => {
        const headingBox = await heading.boundingBox();
        const headerBox = await page.getByRole('banner').boundingBox();
        return !!headingBox && !!headerBox && headingBox.y >= headerBox.y + headerBox.height;
      })
      .toBe(true);
    await heading.press('Tab');
    await expect(page.getByRole('button', { name: 'Edit contact details' })).toBeFocused();
    const review = page.getByRole('region', { name: 'Review your request', exact: true });
    const submit = review.getByRole('button', { name: 'Submit request', exact: true });
    const dialog = page.getByRole('dialog', { name: 'Submit estimate request?' });
    await submit.click();
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('status')).toContainText('has not been submitted');
    await expect(
      dialog.getByRole('button', { name: 'Submit request', exact: true }),
    ).toBeDisabled();
    await page.screenshot({ path: testInfo.outputPath(`estimate-confirm-${width}.png`) });
    await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await expect(submit).toBeFocused();
    await expect(review.getByText('Referral', { exact: true })).toBeVisible();
    await expect(review.getByText('ana@example.com', { exact: true })).toBeVisible();
    await expect(review.getByText('No photos selected.', { exact: true })).toBeVisible();
    await submit.click();
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await submit.press('Enter');
    await dialog.getByRole('button', { name: 'Close dialog' }).click();
    await expect(dialog).toHaveCount(0);
    // Opening confirmation has not submitted the request or disabled leave protection.
    await page
      .getByRole('banner')
      .getByRole('link', { name: 'Peterson Mobile Woodworking home', exact: true })
      .click();
    await page
      .getByRole('dialog', { name: 'Discard request?' })
      .getByRole('button', { name: 'Cancel', exact: true })
      .click();
    await expect(review.getByText('Referral', { exact: true })).toBeVisible();
    await expect(review.getByRole('button', { name: 'Edit lead source' })).toBeEnabled();
    expect(requests).toEqual(['/api/estimates/validate-step-1', '/api/estimates/service-area']);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  });
}
