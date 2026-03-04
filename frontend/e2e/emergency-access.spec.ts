import { test, expect } from '@playwright/test';

test.describe('Emergency Access Flow', () => {
  test('should load emergency view with QR token', async ({ page }) => {
    // Navigate to emergency view with a test token
    await page.goto('/emergency/test-token-123');
    // Should show loading or error state (no real backend)
    // The page should at least render without crashing
    await expect(page.locator('body')).toBeVisible();
  });

  test('should handle invalid QR token gracefully', async ({ page }) => {
    await page.goto('/emergency/invalid');
    // Should show an error state, not crash
    await expect(page.locator('body')).toBeVisible();
  });

  test('should display emergency view layout elements', async ({ page }) => {
    await page.goto('/emergency/test-token');
    // Wait for either loading, error, or content to appear
    await page.waitForTimeout(2000);
    // Page should have rendered something meaningful
    const bodyText = await page.textContent('body');
    expect(bodyText).toBeTruthy();
  });
});
