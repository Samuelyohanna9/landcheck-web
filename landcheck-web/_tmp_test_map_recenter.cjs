const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const page = await context.newPage();
  page.on('pageerror', err => console.log('PAGE ERROR:', err.message));

  const OUT = 'C:/Users/User/AppData/Local/Temp/claude/c--Users-User-Desktop-project/dae487c0-27c1-4f36-b3e1-a63fa6900c1a/scratchpad';

  await page.goto('http://localhost:5173/survey-plan?mode=survey', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);

  const essentialBtn = page.locator('button:has-text("Essential only")');
  if (await essentialBtn.count() > 0) {
    await essentialBtn.first().click();
    await page.waitForTimeout(500);
  }

  const startBtn = page.locator('button:has-text("Start New Plan"), button:has-text("Survey Plan")').first();
  if (await startBtn.count() > 0) {
    await startBtn.click().catch(() => {});
    await page.waitForTimeout(1500);
  }

  const select = await page.$('#coord-system-select');
  if (!select) {
    console.log('coord-system-select not found');
    await browser.close();
    return;
  }

  // Select IMMEDIATELY (worst case: map likely still loading) to specifically stress the race
  await select.selectOption('ghana_utm_30n');
  await page.waitForTimeout(3000);

  await page.screenshot({ path: `${OUT}/fixed_immediate_select_ghana.png` });
  console.log('Screenshot taken after immediate select');

  await browser.close();
  console.log('DONE');
})();
