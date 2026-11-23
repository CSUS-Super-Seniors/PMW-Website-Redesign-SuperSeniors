import { Buffer } from 'node:buffer';
import { expect, test, type Page, type Route } from '@playwright/test';

const details = [
  ['Last name', 'Smith'],
  ['Email address', 'ana@example.com'],
  ['Phone number', '9165550123'],
  ['Service address', '123 Main St'],
  ['City', 'Carmichael'],
  ['Item', 'Chair'],
  ['Describe the problem', 'Loose leg'],
] as const;

async function fillDetails(page: Page, firstName = 'Ana') {
  for (const [label, value] of [['First name', firstName], ...details])
    await page.getByLabel(label, { exact: true }).fill(value);
  await page.getByLabel('What happened?').selectOption('other');
  await page.getByLabel('How did you hear about us?').selectOption('referral');
}

async function addTestPhoto(page: Page) {
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
}

function routeEstimateApis(page: Page, submit: (route: Route) => Promise<void>) {
  return page.route(
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
      } else if (path.startsWith('/api/estimates/photos/') && route.request().method() === 'PUT') {
        const id = path.split('/').at(-1);
        await route.fulfill({
          status: 201,
          json: {
            id,
            storagePath: `estimate-uploads/test/${id}.png`,
            receipt: 'test-receipt',
          },
        });
      } else if (path === '/api/estimates' && route.request().method() === 'POST') {
        await submit(route);
      } else {
        await route.fulfill({ status: 404, json: { error: 'Unexpected API request' } });
      }
    },
  );
}

for (const width of [1280, 390]) {
  test(`estimate submission can be cancelled, retried and completed at ${width}px`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    const submissions: Record<string, unknown>[] = [];
    let releaseFirstRequest!: () => void;
    let signalFirstRequest!: () => void;
    const firstRequestStarted = new Promise<void>((resolve) => {
      signalFirstRequest = resolve;
    });
    await routeEstimateApis(page, async (route) => {
      submissions.push(route.request().postDataJSON());
      if (submissions.length === 1) {
        signalFirstRequest();
        await new Promise<void>((resolve) => {
          releaseFirstRequest = resolve;
        });
        await route.fulfill({
          status: 503,
          json: { success: false, error: 'Temporary server error. Please retry.' },
        });
      } else {
        await route.fulfill({
          status: 201,
          json: { success: true, inquiry_number: 'EST-123' },
        });
      }
    });

    await page.goto('/estimate');
    await fillDetails(page);
    await page.locator('[name="pmw_extra"]').evaluate((input) => {
      (input as HTMLInputElement).value = 'bot-filled-value';
    });
    await page.getByRole('button', { name: 'Continue to photos' }).click();
    await page.getByRole('button', { name: 'Next', exact: true }).click();
    const heading = page.getByRole('heading', { name: 'Review your request' });
    await expect(heading).toBeFocused();
    const review = page.getByRole('region', { name: 'Review your request', exact: true });
    const submit = review.getByRole('button', { name: 'Submit request', exact: true });
    const dialog = page.getByRole('dialog', { name: 'Submit estimate request?' });

    await submit.click();
    await expect(dialog).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath(`estimate-confirm-${width}.png`) });
    await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await expect(submit).toBeFocused();
    await expect(review.getByText('Referral', { exact: true })).toBeVisible();
    expect(submissions).toHaveLength(0);

    await submit.click();
    await dialog.getByRole('button', { name: 'Submit request', exact: true }).click();
    await firstRequestStarted;
    await expect(dialog.getByRole('button', { name: 'Sending...' })).toBeDisabled();
    await page.keyboard.press('Escape');
    await dialog.getByRole('button', { name: 'Close dialog' }).click();
    await page.mouse.click(1, 1);
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Cancel', exact: true })).toBeDisabled();
    expect(submissions).toHaveLength(1);
    await page.screenshot({ path: testInfo.outputPath(`estimate-pending-${width}.png`) });

    releaseFirstRequest();
    await expect(dialog.getByText('Temporary server error. Please retry.')).toBeVisible();
    await expect(review.getByText('ana@example.com', { exact: true })).toBeVisible();
    const initialRequest = submissions[0];
    expect(initialRequest).toMatchObject({
      first_name: 'Ana',
      pmw_extra: 'bot-filled-value',
      photoSession: null,
      photos: [],
    });
    expect(initialRequest.submission_id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );

    await dialog.getByRole('button', { name: 'Submit request', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Thanks, Ana!' })).toBeVisible();
    expect(submissions).toHaveLength(2);
    expect(submissions[1]).toEqual(initialRequest);
    await expect(
      page.getByText('Your estimate request has been submitted successfully.'),
    ).toBeVisible();
    expect(
      await page.evaluate(() => {
        const event = new Event('beforeunload', { cancelable: true });
        window.dispatchEvent(event);
        return event.defaultPrevented;
      }),
    ).toBe(false);

    await page.getByRole('link', { name: 'Return home', exact: true }).click();
    await expect(page).toHaveURL('/');
    await expect(page.getByRole('heading', { name: 'Peterson Mobile Woodworking' })).toBeVisible();
  });

  test(`starting another estimate clears submitted details and photos at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    const submissions: Record<string, unknown>[] = [];
    await routeEstimateApis(page, async (route) => {
      submissions.push(route.request().postDataJSON());
      await route.fulfill({
        status: 201,
        json: { success: true, inquiry_number: `EST-${submissions.length}` },
      });
    });

    await page.goto('/estimate');
    await fillDetails(page);
    await page.locator('[name="pmw_extra"]').evaluate((input) => {
      (input as HTMLInputElement).value = 'bot-filled-value';
    });
    await page.getByRole('button', { name: 'Continue to photos' }).click();
    await addTestPhoto(page);
    await page.getByRole('button', { name: 'Next', exact: true }).click();
    await page.getByRole('button', { name: 'Submit request', exact: true }).click();
    await page
      .getByRole('dialog', { name: 'Submit estimate request?' })
      .getByRole('button', { name: 'Submit request', exact: true })
      .click();
    await page.getByRole('heading', { name: 'Thanks, Ana!' }).waitFor();

    await page.getByRole('button', { name: 'Start another request' }).click();
    for (const [label] of [['First name', ''], ...details])
      await expect(page.getByLabel(label, { exact: true })).toHaveValue('');
    await expect(page.getByLabel('What happened?')).toHaveValue('');
    await expect(page.getByLabel('How did you hear about us?')).toHaveValue('');
    await expect(page.getByLabel('Contact me by text message')).not.toBeChecked();
    await expect(page.locator('[name="pmw_extra"]')).toHaveValue('');

    await fillDetails(page, 'Maya');
    await page.getByRole('button', { name: 'Continue to photos' }).click();
    await expect(page.getByText('No photos selected. You can continue without any.')).toBeVisible();
    await expect(page.getByRole('img', { name: 'Preview of chair.png' })).toHaveCount(0);
    await page.getByRole('button', { name: 'Next', exact: true }).click();
    await page.getByRole('button', { name: 'Submit request', exact: true }).click();
    await page
      .getByRole('dialog', { name: 'Submit estimate request?' })
      .getByRole('button', { name: 'Submit request', exact: true })
      .click();
    await expect(page.getByRole('heading', { name: 'Thanks, Maya!' })).toBeVisible();
    expect(submissions).toHaveLength(2);
    expect(submissions[0]).toMatchObject({
      photoSession: { token: 'test-session' },
      photos: [{ storagePath: expect.stringMatching(/^estimate-uploads\//) }],
    });
    expect(submissions[1]).toMatchObject({
      first_name: 'Maya',
      photoSession: null,
      photos: [],
    });
    expect(submissions[1].submission_id).not.toBe(submissions[0].submission_id);
  });
}
