import { businessContact, type EstimateStep1Data } from '@pmw/validation';
import type { SavedEstimate } from './estimateSubmission.js';
import { safeCustomerText } from './lib/customerEmailText.js';

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** N1 receipt. SSPMW-173 will supply the shared N9 branded layout once available. */
export function buildEstimateReceiptEmail(
  saved: Pick<SavedEstimate, 'inquiry_number'>,
  details: Pick<EstimateStep1Data, 'first_name' | 'item'>,
): { subject: string; text: string; html: string } {
  const firstName = safeCustomerText(details.first_name, 100, 'there');
  const item = safeCustomerText(details.item, 200, 'Furniture repair request');
  const confirmation = 'We received your estimate request.';
  const nextSteps = 'We will review your request and contact you about the next steps.';
  return {
    subject: 'Estimate request received',
    text: [
      `Hi ${firstName},`,
      '',
      confirmation,
      '',
      `Inquiry: ${saved.inquiry_number}`,
      `Item: ${item}`,
      '',
      nextSteps,
      `If you have questions, please call us at ${businessContact.phoneDisplay}.`,
      '',
      'Thank you,',
      businessContact.name,
      'Carmichael, CA',
    ].join('\n'),
    html: `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Estimate request received</title>
  </head>
  <body style="margin:0;padding:0;background-color:#f6f2ea;color:#2a1b11;font-family:Arial,Helvetica,sans-serif;font-size:18px;line-height:28px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width:100%;background-color:#f6f2ea;">
      <tr><td align="center" style="padding:16px 8px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;background-color:#ffffff;">
          <tr><td style="padding:24px 20px;font-size:18px;line-height:28px;overflow-wrap:anywhere;word-break:break-word;">
            <p style="margin:0 0 20px;">${escapeHtml(businessContact.name)}</p>
            <h1 style="margin:0 0 24px;font-size:26px;line-height:34px;">Estimate request received</h1>
            <p style="margin:0 0 20px;">Hi ${escapeHtml(firstName)},</p>
            <p style="margin:0 0 20px;">${confirmation}</p>
            <p style="margin:0 0 20px;"><strong>Inquiry:</strong> ${escapeHtml(saved.inquiry_number)}<br><strong>Item:</strong> ${escapeHtml(item)}</p>
            <p style="margin:0 0 20px;">${nextSteps}</p>
            <p style="margin:0;">If you have questions, please call us:</p>
            <p style="margin:0 0 20px;"><a href="${businessContact.phoneHref}" style="display:inline-block;padding:12px 0;color:#7a4a21;text-decoration:underline;">${businessContact.phoneDisplay}</a></p>
            <p style="margin:0;">Thank you,<br>${escapeHtml(businessContact.name)}<br>Carmichael, CA</p>
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`,
  };
}
