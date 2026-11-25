import type { NewCustomerData } from '@pmw/validation';
import {
  matchOrCreateCustomer,
  type CustomerClient,
  type CustomerMatchField,
} from './matchOrCreateCustomer.js';

// Add customer (K3, SSPMW-371). The owner types a customer in by hand. The duplicate
// check is the shared K9 find-or-create, so a customer added here is the same one
// Accept would find later, and the other way round. The check and the insert happen
// in one locked database call, so two saves of the same new person at the same moment
// (a double-click, a retry, two owners) leave one customer and the other gets a 409.

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
      const result = await matchOrCreateCustomer(client, {
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
      if (!result.created) return { outcome: 'duplicate', matchedBy: result.matchedBy };
      return {
        outcome: 'created',
        customer: { id: result.id, firstName: customer.first_name, lastName: customer.last_name },
      };
    },
  };
}
