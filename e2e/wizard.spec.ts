import { test, expect } from '@playwright/test';

test('Should dynamically alter navigation layers when choosing solo mode', async ({ page }) => {
  // Go to the temporary website GitHub builds for us
  await page.goto('http://localhost:3000');
  
  // Click on "Solo Manager"
  await page.click('text=Solo Manager');
  await page.click('text=Continue →');
  
  // Type your name
  await page.fill('placeholder=Your name', 'Devin');
  await page.click('text=Continue →');
  
  // Finish the onboarding wizard
  await page.click('text=Let\'s go →');
  await page.click('text=Open ChillarFlow →');

  // Verify that joint features are cleanly hidden
  const settlementsTab = page.locator('text=Settlements');
  const contributionsTab = page.locator('text=Contributions');
  
  await expect(settlementsTab).not.toBeVisible();
  await expect(contributionsTab).not.toBeVisible();
});
