import type { NewCustomerData } from '@pmw/validation';
import {
  findMatchingCustomer,
  insertCustomer,
  type CustomerClient,
  type CustomerMatchField,
} from './matchOrCreateCustomer.js';

// Add customer (K3, SSPMW-371). The owner types a customer in by hand. The duplicate
// check is the shared email/phone match from K9, so a customer added here is the same
// one Accept would find later, and the other way round.

export interface CreatedCustomer {
  id: string;
  firstName: string;
  lastName: string;
}

export type CreateCustomerResult =
  | { outcome: 'created'; customer: CreatedCustomer }
  | { outcome: 'duplicate'; matchedBy: CustomerMatchField };

export interface CreateCustomerBackend {
  /** `customer` must already have passed newCustomerSchema. */
  createCustomer(customer: NewCustomerData): Promise<CreateCustomerResult>;
}

export function createCustomerBackend(client: CustomerClient): CreateCustomerBackend {
  return {
    async createCustomer(customer) {
      const match = await findMatchingCustomer(client, customer);
      if (match) return { outcome: 'duplicate', matchedBy: match.matchedBy };

      const id = await insertCustomer(client, {
        firstName: customer.first_name,
        lastName: customer.last_name,
        email: customer.email,
        phone: customer.phone,
        address: customer.address,
        city: customer.city,
        preferredContact: customer.preferred_contact,
        textOk: customer.text_ok,
        leadSource: customer.lead_source,
        nextFollowUpDate: customer.next_follow_up_date,
      });
      return {
        outcome: 'created',
        customer: { id, firstName: customer.first_name, lastName: customer.last_name },
      };
    },
  };
}
