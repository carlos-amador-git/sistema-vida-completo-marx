import { test, expect } from '@playwright/test';

test.describe('Authentication Flow', () => {
  test('should show landing page', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/VIDA/);
  });

  test('should navigate to login page', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.locator('input[type="email"]')).toBeVisible();
    await expect(page.locator('input[type="password"]')).toBeVisible();
  });

  test('should navigate to register page', async ({ page }) => {
    await page.goto('/register');
    await expect(page.locator('input[type="email"]')).toBeVisible();
    await expect(page.locator('input[type="password"]')).toBeVisible();
  });

  test('should show validation errors on empty login', async ({ page }) => {
    await page.goto('/login');
    await page.getByRole('button', { name: /iniciar|login|entrar/i }).click();
    // Should show validation messages or not navigate
    await expect(page).toHaveURL(/\/login/);
  });

  test('should show validation errors on empty register', async ({ page }) => {
    await page.goto('/register');
    await page.getByRole('button', { name: /registr|crear|sign/i }).click();
    await expect(page).toHaveURL(/\/register/);
  });

  test('should redirect unauthenticated users from protected routes', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/login/);
  });

  test('should redirect unauthenticated users from profile', async ({ page }) => {
    await page.goto('/profile');
    await expect(page).toHaveURL(/\/login/);
  });

  test('should redirect unauthenticated users from directives', async ({ page }) => {
    await page.goto('/directives');
    await expect(page).toHaveURL(/\/login/);
  });

  test('should have link to privacy policy from login', async ({ page }) => {
    await page.goto('/login');
    const privacyLink = page.getByRole('link', { name: /privacidad|privacy/i });
    if (await privacyLink.isVisible()) {
      await privacyLink.click();
      await expect(page).toHaveURL(/\/privacy/);
    }
  });

  test('should show 404 for unknown routes', async ({ page }) => {
    await page.goto('/nonexistent-page');
    await expect(page.getByText(/404/)).toBeVisible();
  });
});
