import { expect, test } from '@playwright/test';

test('public home page loads in Chromium', async ({ page }) => {
  const response = await page.goto('/');

  expect(response?.ok()).toBe(true);
  await expect(
    page.getByRole('heading', { name: 'Peterson Mobile Woodworking', exact: true }),
  ).toBeVisible();
});
