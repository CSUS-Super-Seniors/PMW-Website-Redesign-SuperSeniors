import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import SessionExpiredPage from './SessionExpiredPage';

describe('SessionExpiredPage', () => {
  it('explains the session ended and links to staff login', () => {
    render(
      <MemoryRouter>
        <SessionExpiredPage />
      </MemoryRouter>,
    );

    expect(screen.getByRole('heading', { name: 'Your session has expired' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Go to staff login' })).toHaveAttribute(
      'href',
      '/staff/login',
    );
  });
});
