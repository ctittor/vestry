import 'dotenv/config';
import { test, expect } from '@playwright/test';

test('AWS-free test banner stays visible through login on mobile and desktop', async ({page}) => {
  test.skip(process.env.TEST_DEPLOYMENT !== 'true', 'Requires the explicit test deployment build.');
  await page.setViewportSize({width:375,height:812});
  await page.goto('/');
  await expect(page.locator('.test-deployment-banner')).toContainText('Synthetic data only');
  await page.getByLabel('Email address').fill('forane@vestry.example');
  await page.getByLabel('Password',{exact:true}).fill(process.env.SEED_PASSWORD!);
  await page.getByRole('button',{name:'Sign in to workspace'}).click();
  await expect(page.locator('.account')).toBeVisible();
  await expect(page.locator('.test-deployment-banner')).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.setViewportSize({width:1440,height:1000});
  await expect(page.locator('.test-deployment-banner')).toContainText('In-app change alerts remain active');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
