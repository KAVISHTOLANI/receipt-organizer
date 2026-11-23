import { expect, test } from '@playwright/test';
import { checkMobile, snap } from './helpers';

test('add a receipt with a photo, claim expenses, view reports', async ({ page }) => {
  await page.goto('./');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Every receipt');
  await expect(page.locator('.hero .stub').first()).toBeVisible();
  await page.waitForTimeout(1000);
  await snap(page, 'landing');
  await checkMobile(page, 'landing-mobile');

  await page.getByRole('link', { name: 'Open your receipts' }).click();
  await expect(page.getByTestId('totals')).toContainText('18 receipts');
  await snap(page, 'receipts');
  await checkMobile(page);

  await page.getByRole('link', { name: 'Add receipt' }).click();
  await page.getByLabel('Merchant').fill('Print Shop Demo');
  await page.getByLabel('Total (USD)').fill('42.80');
  await page.getByLabel('Tax included').fill('7.13');
  await page.getByLabel('Category').selectOption('Office');
  await page.getByLabel('Tags').fill('work, printing');
  await page.getByLabel('Expense claim').selectOption('to-claim');
  // a small generated PNG stands in for a photo
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAHklEQVR4nGP4z8DwHwqRmQwMDEwMDAyMjIyMjAwMAKbPBPzKt8grAAAAAElFTkSuQmCC', 'base64');
  await page.locator('input[type=file]').setInputFiles({ name: 'receipt.png', mimeType: 'image/png', buffer: png });
  await expect(page.getByRole('img', { name: /Photo of the receipt from Print Shop Demo/ })).toBeVisible();
  await snap(page, 'add');
  await page.getByRole('button', { name: 'Save receipt' }).click();
  await expect(page.getByTestId('totals')).toContainText('19 receipts');
  await page.reload();
  await expect(page.getByRole('link', { name: 'Print Shop Demo' })).toBeVisible();

  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Expense claims' }).click();
  await expect(page.getByTestId('claim-stats')).toContainText('$318.30');
  await page.getByRole('button', { name: 'Mark claimed' }).click();
  await expect(page.getByText('3 receipts moved to “Claimed”.')).toBeVisible();
  await snap(page, 'claims');

  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Reports' }).click();
  await expect(page.getByRole('heading', { name: 'Spending per month' })).toBeVisible();
  await page.waitForTimeout(800);
  await snap(page, 'reports');
  await checkMobile(page, 'reports-mobile');
});
