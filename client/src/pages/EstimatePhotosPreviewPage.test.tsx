import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import EstimatePhotosPreviewPage from './EstimatePhotosPreviewPage';

it('clearly labels the local-only handoff and preserves the demonstration detail', async () => {
  const fetchSpy = vi.spyOn(globalThis, 'fetch');
  try {
    const user = userEvent.setup();
    render(<EstimatePhotosPreviewPage />);
    expect(screen.getByText(/Use a local\/test/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Back' }));
    await user.clear(screen.getByLabelText('Demonstration item'));
    await user.type(screen.getByLabelText('Demonstration item'), 'Table');
    await user.click(screen.getByRole('button', { name: 'Return to photos' }));
    await user.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByRole('status')).toHaveTextContent('0 photo(s) uploaded privately for Table');
    expect(screen.getByRole('status')).toHaveTextContent('No inquiry submission has occurred');
    await user.click(screen.getByRole('button', { name: 'Back to photos' }));
    await user.click(screen.getByRole('button', { name: 'Back' }));
    expect(screen.getByLabelText('Demonstration item')).toHaveValue('Table');
    expect(fetchSpy).not.toHaveBeenCalled();
  } finally {
    fetchSpy.mockRestore();
  }
});
