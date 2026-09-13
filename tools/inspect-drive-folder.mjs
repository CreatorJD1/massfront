import { launchPwBrowser, closePwBrowser } from './pw-browser.mjs';

const DRIVE_URL = 'https://drive.google.com/drive/folders/1ZQLZLbUGHyEnKN8DURM_uZC6XjS4tiI1?usp=drive_link';

try {
  const browser = await launchPwBrowser();
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  console.log('Navigating to Google Drive link...');
  await page.goto(DRIVE_URL, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(5000);

  // Take screenshot of what Google Drive displays
  await page.screenshot({ path: 'tools/drive_folder_screenshot.png' });
  console.log('Saved screenshot: tools/drive_folder_screenshot.png');

  // Extract all text, item titles, file names
  const info = await page.evaluate(() => {
    const titles = Array.from(document.querySelectorAll('[data-target="item"], [role="row"], [role="gridcell"], div[aria-label]'))
      .map(el => el.getAttribute('aria-label') || el.innerText)
      .filter(Boolean);
    const bodyText = document.body.innerText;
    return { titles, bodySnippet: bodyText.slice(0, 3000) };
  });

  console.log('Extracted titles / items:', JSON.stringify(info.titles, null, 2));
  console.log('Extracted body text snippet:\n', info.bodyText);

} catch (err) {
  console.error('Error inspecting drive folder:', err);
} finally {
  await closePwBrowser();
}
