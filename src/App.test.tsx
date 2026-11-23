import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from './App';

const KEY = 'receipt-shelf:store';

describe('Receipt Shelf', () => {
  it('lists demo receipts with totals and flags the duplicate', async () => {
    window.location.hash = '/receipts';
    const user = userEvent.setup();
    render(<App />);
    expect(screen.getByTestId('totals')).toHaveTextContent('18 receipts');
    expect(screen.getByText(/1 possible duplicate found/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Show duplicates only' }));
    expect(screen.getByTestId('totals')).toHaveTextContent('2 receipts');
  });

  it('filters by tag and claim status', async () => {
    window.location.hash = '/receipts';
    const user = userEvent.setup();
    render(<App />);
    await user.selectOptions(screen.getByLabelText('Tag'), '#work');
    await user.selectOptions(screen.getByLabelText('Claim status'), 'to-claim');
    expect(screen.getByTestId('totals')).toHaveTextContent('2 receipts · $275.50');
  });

  it('validates, warns about a duplicate, then saves', async () => {
    window.location.hash = '/add';
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: 'Save receipt' }));
    expect(screen.getByText('Enter the shop or company.')).toBeInTheDocument();
    await user.type(screen.getByLabelText('Merchant'), 'Bean There Café');
    await user.clear(screen.getByLabelText('Date'));
    const d = new Date();
    d.setDate(d.getDate() - 3);
    await user.type(screen.getByLabelText('Date'), d.toISOString().slice(0, 10));
    await user.type(screen.getByLabelText('Total (USD)'), '4.60');
    await user.click(screen.getByRole('button', { name: 'Save receipt' }));
    expect(screen.getByText(/looks like a duplicate/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Save receipt' }));
    expect(await screen.findByTestId('totals')).toHaveTextContent('19 receipts');
  });

  it('moves claims through the pipeline', async () => {
    window.location.hash = '/claims';
    const user = userEvent.setup();
    render(<App />);
    expect(screen.getByTestId('claim-stats')).toHaveTextContent('$275.50');
    await user.click(screen.getByRole('button', { name: 'Mark claimed' }));
    expect(screen.getByText('2 receipts moved to “Claimed”.')).toBeInTheDocument();
    const col = screen.getByRole('heading', { name: 'Claimed, awaiting payment' }).closest('section')!;
    expect(within(col).getAllByRole('listitem')).toHaveLength(3);
  });

  it('shows empty states and reports', () => {
    localStorage.setItem(KEY, JSON.stringify({ receipts: [] }));
    window.location.hash = '/reports';
    const { unmount } = render(<App />);
    expect(screen.getByText('No receipts yet')).toBeInTheDocument();
    unmount();
    localStorage.removeItem(KEY);
    render(<App />);
    expect(screen.getByRole('heading', { name: 'Spending per month' })).toBeInTheDocument();
    expect(screen.getByRole('table', { name: /Spending by category/ })).toBeInTheDocument();
  });
});
