
import { test, expect } from '@playwright/test';

test('LandCheck Estates login page', async ({ page }) => {
  // Open the public Estates website
  await page.goto('https://landcheck.online/estates/');

  // Dismiss the cookie banner if present
  const reject = page.getByRole('button', {
    name: 'Reject optional',
  });

  if (await reject.isVisible()) {
    await reject.click();
  }

  // Find the Sign in link
  const signIn = page.getByRole('link', {
    name: /sign in/i,
  }).first();

  await expect(signIn).toBeVisible();

  // Open the login page
  await signIn.click();

  // Confirm that a login form is displayed
  await expect(
    page.locator('input[type="password"]')
  ).toBeVisible();

  // Verify the login page URL
  console.log('Login page:', page.url());

  // Capture a screenshot
  await page.screenshot({
    path: 'landcheck-login.png',
    fullPage: true,
  });
});
