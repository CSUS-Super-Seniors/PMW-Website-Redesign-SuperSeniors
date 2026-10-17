import { Link } from 'react-router';
import Logo from '../components/brand/Logo';
import { Button, Checkbox, Input } from '../components/ui';
import { routes } from '../config/site';

export default function StaffLoginPage() {
  return (
    <main className="flex min-h-dvh flex-col items-center gap-6 bg-neutral-100 px-4 py-10 md:justify-center md:gap-8">
      <Logo className="h-11 w-auto" />
      <div className="flex w-full max-w-110 flex-col gap-5 rounded-lg border border-neutral-300 bg-white p-6 md:p-10">
        <h1 className="type-h2">Staff login</h1>
        <p className="type-body text-neutral-600">For Peterson Mobile Woodworking staff only.</p>
        <form className="flex flex-col gap-5">
          <Input
            label="Email address"
            type="email"
            name="email"
            placeholder="you@example.com"
            autoComplete="email"
          />
          <Input
            label="Password"
            type="password"
            name="password"
            placeholder="Enter your password"
            autoComplete="current-password"
          />
          <Checkbox label="Keep me logged in on this device" />
          <Button type="submit" className="w-full">
            Log in
          </Button>
        </form>
        <Link to={routes.staffForgotPassword} className="type-label text-walnut underline">
          Forgot your password?
        </Link>
      </div>
      <Link to={routes.home} className="type-label text-walnut underline">
        Back to the public site
      </Link>
    </main>
  );
}
