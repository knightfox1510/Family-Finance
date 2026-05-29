import { test, expect } from '@playwright/test';

test.describe('ChillarFlow Core Matrix End-to-End Test Regression Suite', () => {

  test('Should seamlessly execute onboarding, logging, and partner settlement workflows', async ({ page }) => {
    // 1. Navigate to the app
    await page.goto('http://localhost:3000');
    
    // Safety Net: Wait until the network is completely quiet so Next.js is fully loaded
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000); // Gives Next.js 2 extra seconds to hydrate
    
    // ── SETUP WIZARD FUNCTIONALITY ────────────────────────────────────────
    // Wait for the "Joint Household" text to physically appear on screen
    await page.waitForSelector('text=Joint Household', { timeout: 15000 });
    
    // Choose Joint Household Mode
    await page.click('text=Joint Household');
    await page.click('text=Continue →');
    
    // Fill custom partner identities
    await page.fill('placeholder=First partner\'s name', 'Gaurav');
    await page.fill('placeholder=Second partner\'s name', 'Karishma');
    await page.click('text=Continue →');
    
    // Choose Logging Channels & Complete Onboarding
    await page.click('text=WhatsApp');
    await page.fill('placeholder=e.g. 919876543210', '919876543210');
    await page.click('text=Continue →');
    await page.click('text=Let\'s go →');
    await page.click('text=Open ChillarFlow →');

    // Confirm that the application correctly updates the application shell
    await expect(page.locator('text=Gaurav & Karishma')).toBeVisible();

    // ── 2. ADDING TRANSACTIONS (EXPENSES & INCOME) ──────────────────────────
    // Click Add Expense Trigger
    if (await page.locator('text=+').count() > 0) {
      await page.click('text=+');
    } else {
      await page.click('text=Add');
    }

    // Log a Joint Bill
    await page.fill('input[placeholder="0"]', '3000');
    await page.click('text=Joint'); // Paid from Joint pool
    await page.click('text=Groceries'); // Select category
    await page.fill('input[placeholder="What was this for?"]', 'Weekly DMart Run');
    await page.click('text=Log expense · ₹3000');

    // Open Add Form again to log an Income item
    await page.waitForTimeout(1000); 
    await page.click('text=Add');
    await page.click('text=Income'); // Flip to Income toggle
    await page.fill('input[placeholder="0"]', '95000');
    await page.click('text=Salary'); // Category choice
    await page.fill('input[placeholder="What was this for?"]', 'Monthly Inflow');
    await page.click('text=Log income · ₹95000');
    await page.waitForTimeout(1000);

    // ── 3. SETTINGS & BUDGET BOUNDARY TESTS ──────────────────────────────────
    // Open Settings panel
    await page.click('text=More');
    await page.click('text=Settings');

    // Expand the collapsible category budget element
    await page.click('text=Category Budgets');
    // Set a strict budget limit for Groceries to test thresholds
    await page.fill('input[placeholder="No limit"] >> nth=0', '2000'); 
    await page.click('text=Save All Settings');
    await expect(page.locator('text=Settings Saved!')).toBeVisible();

    // ── 4. PARTNER LEDGER CALCULATIONS & SETTLEMENTS ────────────────────────
    // Go to the Settle Dashboard layout
    await page.click('text=More');
    await page.click('text=Settle');

    // Ensure the partner KPI balance strip is alive
    await expect(page.locator('text=Net direction')).toBeVisible();
    
    // ── 5. ANALYTICS & INSIGHTS ENGINE VALIDATION ────────────────────────────
    // Open Stats/Dashboard
    await page.click('text=More');
    await page.click('text=Stats');

    // Confirm core dashboard analytics metrics render properly
    await expect(page.locator('text=Household Retained')).toBeVisible();
    await expect(page.locator('text=Income')).toBeVisible();
    await expect(page.locator('text=Lifestyle')).toBeVisible();
    await expect(page.locator('text=Invested')).toBeVisible();
  });
});
