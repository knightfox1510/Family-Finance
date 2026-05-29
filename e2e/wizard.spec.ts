import { test, expect } from '@playwright/test';

test.describe('ChillarFlow Core Matrix End-to-End Test Regression Suite', () => {

  test('Should seamlessly execute onboarding, logging, and partner settlement workflows', async ({ page }) => {
    // 1. Navigate to the app
    await page.goto('http://localhost:3000');
    
    // Safety Net: Wait until network traffic settles down completely
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000); 

    // 👇 DIAGNOSTIC: Prints the exact text of the page to your GitHub Logs if it gets stuck
    const visibleText = await page.innerText('body');
    console.log('--- CONTENT DETECTED BY PLAYWRIGHT ON PORT 3000 ---');
    console.log(visibleText);
    console.log('--------------------------------------------------');

    // ── SETUP WIZARD FUNCTIONALITY ────────────────────────────────────────
    
    // Check if the dashboard is already visible (past onboarding)
    const baseDashboard = page.getByText(/Household Retained/i);
    
    if (await baseDashboard.count() > 0) {
      console.log('Already past onboarding wizard! Continuing with matrix regression checks...');
    } else {
      // If onboarding is active, wait for the household mode selection
      const jointButton = page.getByText(/Joint Household/i);
      await expect(jointButton).toBeVisible({ timeout: 15000 });
      
      // Choose Joint Household Mode
      await jointButton.click();
      await page.getByText(/Continue/i).click();
      
      // Fill custom partner identities
      await page.getByPlaceholder(/First partner/i).fill('Gaurav');
      await page.getByPlaceholder(/Second partner/i).fill('Karishma');
      await page.getByText(/Continue/i).click();
      
      // Choose Logging Channels & Complete Onboarding
      await page.getByText(/WhatsApp/i).click();
      await page.getByPlaceholder(/919876543210/).fill('919876543210');
      await page.getByText(/Continue/i).click();
      await page.getByText(/Let's go/i).click();
      await page.getByText(/Open ChillarFlow/i).click();
    }

    // Confirm that the application correctly updates the header space
    await expect(page.getByText(/Gaurav & Karishma/i)).toBeVisible();

    // ── 2. ADDING TRANSACTIONS (EXPENSES & INCOME) ──────────────────────────
    // Click Add Expense Trigger
    if (await page.getByText('+').count() > 0) {
      await page.getByText('+').click();
    } else {
      await page.getByText(/Add/i).click();
    }

    // Log a Joint Bill
    await page.getByPlaceholder('0').fill('3000');
    await page.getByText(/Joint/i).click(); 
    await page.getByText(/Groceries/i).click(); 
    await page.getByPlaceholder(/What was this for/i).fill('Weekly DMart Run');
    await page.getByText(/Log expense/i).click();

    // Open Add Form again to log an Income item
    await page.waitForTimeout(1500); 
    await page.getByText(/Add/i).click();
    await page.getByText(/Income/i).click(); 
    await page.getByPlaceholder('0').fill('95000');
    await page.getByText(/Salary/i).click(); 
    await page.getByPlaceholder(/What was this for/i).fill('Monthly Inflow');
    await page.getByText(/Log income/i).click();
    await page.waitForTimeout(1500);

    // ── 3. SETTINGS & BUDGET BOUNDARY TESTS ──────────────────────────────────
    await page.getByText(/More/i).click();
    await page.getByText(/Settings/i).click();

    // Expand category budgets
    await page.getByText(/Category Budgets/i).click();
    await page.getByPlaceholder(/No limit/i).first().fill('2000'); 
    await page.getByText(/Save All Settings/i).click();
    await expect(page.getByText(/Settings Saved/i)).toBeVisible();

    // ── 4. PARTNER LEDGER CALCULATIONS & SETTLEMENTS ────────────────────────
    await page.getByText(/More/i).click();
    await page.getByText(/Settle/i).click();
    await expect(page.getByText(/Net direction/i)).toBeVisible();
    
    // ── 5. ANALYTICS & INSIGHTS ENGINE VALIDATION ────────────────────────────
    await page.getByText(/More/i).click();
    await page.getByText(/Stats/i).click();

    await expect(page.getByText(/Household Retained/i)).toBeVisible();
    await expect(page.getByText(/Income/i)).toBeVisible();
    await expect(page.getByText(/Lifestyle/i)).toBeVisible();
    await expect(page.getByText(/Invested/i)).toBeVisible();
  });
});
