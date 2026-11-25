import { Link } from 'react-router';
import { ADD_CUSTOMER_PATH } from '../components/customers/customerRoutes';

const addButtonStyles =
  'type-button inline-flex min-h-11 items-center justify-center rounded-sm bg-dark-brown px-5 py-2 text-white transition-colors hover:bg-neutral-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber';

/**
 * Stands in for the customer list until K1 (SSPMW-338) lands, so owners can reach Add
 * customer (SSPMW-363) from the Customers menu. K1's list page replaces this route.
 */
export default function CustomersComingSoonPage() {
  return (
    <main className="w-full px-4 py-6 md:px-8">
      <h1 className="type-h2 text-dark-brown">Customers</h1>
      <p className="type-body mt-1 text-neutral-600">
        The customer list is coming soon. You can already add a customer who called, texted or came
        from Yelp, Google or a referral.
      </p>
      <Link to={ADD_CUSTOMER_PATH} className={`${addButtonStyles} mt-6`}>
        Add customer
      </Link>
    </main>
  );
}
