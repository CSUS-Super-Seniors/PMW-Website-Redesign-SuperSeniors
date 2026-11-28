import type { NewCustomerData, NewCustomerFieldErrors } from '@pmw/validation';

export interface CreatedCustomer {
  id: string;
  firstName: string;
  lastName: string;
}

export type CreateCustomerResult =
  | { status: 'ok'; customer: CreatedCustomer }
  | { status: 'invalid'; fieldErrors: NewCustomerFieldErrors; formErrors: string[] }
  | { status: 'duplicate'; field: 'email' | 'phone'; message: string }
  | { status: 'unauthenticated' }
  | { status: 'no-access' }
  | { status: 'error' };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isCreatedCustomer(value: unknown): value is CreatedCustomer {
  if (!isRecord(value)) return false;
  const { id, firstName, lastName } = value;
  return typeof id === 'string' && typeof firstName === 'string' && typeof lastName === 'string';
}

function readFieldErrors(value: unknown): NewCustomerFieldErrors {
  if (!isRecord(value)) return {};
  return Object.fromEntries(
    Object.entries(value).filter(
      (entry): entry is [string, string] => typeof entry[1] === 'string',
    ),
  );
}

async function readBody(response: Response): Promise<Record<string, unknown>> {
  try {
    const body: unknown = await response.json();
    return isRecord(body) ? body : {};
  } catch {
    return {};
  }
}

/** Saves a customer the owner adds by hand (SSPMW-363). Never throws. */
export async function createCustomer(
  accessToken: string,
  customer: NewCustomerData,
): Promise<CreateCustomerResult> {
  try {
    const response = await fetch('/api/customers', {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(customer),
    });
    if (response.status === 401) return { status: 'unauthenticated' };
    if (response.status === 403) return { status: 'no-access' };

    const body = await readBody(response);
    if (response.status === 400) {
      return {
        status: 'invalid',
        fieldErrors: readFieldErrors(body.fieldErrors),
        formErrors: Array.isArray(body.formErrors)
          ? body.formErrors.filter((item): item is string => typeof item === 'string')
          : [],
      };
    }
    if (response.status === 409 && (body.field === 'email' || body.field === 'phone')) {
      return {
        status: 'duplicate',
        field: body.field,
        message: typeof body.error === 'string' ? body.error : 'This customer already exists.',
      };
    }
    if (response.status === 201 && isCreatedCustomer(body.customer)) {
      return { status: 'ok', customer: body.customer };
    }
    return { status: 'error' };
  } catch {
    return { status: 'error' };
  }
}
