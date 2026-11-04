import type { Page } from '@playwright/test';
import { test, expect, openApp, newTab, todayRows, MOD } from './fixtures';

/** Start "playing" the test video in the page that's showing. */
async function playVideo(page: Page) {
  await page.frameLocator('.surface-slot[data-visible] iframe').locator('#vid').evaluate((v: HTMLVideoElement) => {
    v.dataset.playing = '1';
    v.dispatchEvent(new Event('play'));
  });
}

const pipped = (page: Page, title: string) =>
  page.locator(`.surface-slot iframe`).evaluateAll(
    (frames, t) => frames.some((f: any) => f.contentDocument?.title === t && f.contentDocument?.body.dataset.pip === '1'),
    title,
  );

test.describe('video pop-out (picture-in-picture)', () => {
  test('switching tabs pops a playing video out; coming back brings it back', async ({ page }) => {
    await openApp(page);
    await newTab(page, 'video.example');
    await playVideo(page);
    await expect(todayRows(page).first().locator('[data-testid^="sound-"]')).toBeVisible();
    await newTab(page, 'other.example');
    await expect.poll(() => pipped(page, 'video.example')).toBe(true);
    await expect(page.locator('[data-title="video.example"] [data-testid^="sound-"] svg')).toHaveClass(/picture-in-picture/);
    await page.locator('[data-title="video.example"]').click();
    await expect.poll(() => pipped(page, 'video.example')).toBe(false);
  });

  test('tabs without a playing video are left alone', async ({ page }) => {
    await openApp(page);
    await newTab(page, 'quiet.example');
    await newTab(page, 'other.example');
    expect(await pipped(page, 'quiet.example')).toBe(false);
  });

  test('switching to another app pops it out; returning brings it back', async ({ page }) => {
    await openApp(page);
    await newTab(page, 'video.example');
    await playVideo(page);
    await page.evaluate(() => window.__kiteTest!.windowFocus(false));
    await expect.poll(() => pipped(page, 'video.example')).toBe(true);
    await page.evaluate(() => window.__kiteTest!.windowFocus(true));
    await expect.poll(() => pipped(page, 'video.example')).toBe(false);
  });

  test('the switches in Settings turn it off', async ({ page }) => {
    await openApp(page);
    await page.keyboard.press(`${MOD}+Comma`);
    await page.getByTestId('settings-tabs').click();
    await page.getByTestId('set-autopip-app').click();
    await page.keyboard.press('Escape');
    await newTab(page, 'video.example');
    await playVideo(page);
    await page.evaluate(() => window.__kiteTest!.windowFocus(false));
    await page.waitForTimeout(300);
    expect(await pipped(page, 'video.example')).toBe(false); // app switch: off
    await page.evaluate(() => window.__kiteTest!.windowFocus(true));
    await newTab(page, 'other.example');
    await expect.poll(() => pipped(page, 'video.example')).toBe(true); // tab switch: still on
    await page.locator('[data-title="video.example"]').click();
    await page.keyboard.press(`${MOD}+Comma`);
    await page.getByTestId('settings-tabs').click();
    await page.getByTestId('set-autopip').click();
    await page.keyboard.press('Escape');
    await newTab(page, 'third.example');
    await page.waitForTimeout(300);
    expect(await pipped(page, 'video.example')).toBe(false);
  });

  test('⌘⇧P pops out and brings back the current video by hand', async ({ page }) => {
    await openApp(page);
    await newTab(page, 'video.example');
    await page.keyboard.press(`${MOD}+Shift+p`);
    await expect(page.getByTestId('toast').filter({ hasText: 'No playing video' })).toHaveCount(1);
    await playVideo(page);
    await page.keyboard.press(`${MOD}+Shift+p`);
    await expect.poll(() => pipped(page, 'video.example')).toBe(true);
    await page.keyboard.press(`${MOD}+Shift+p`);
    await expect.poll(() => pipped(page, 'video.example')).toBe(false);
  });

  test('click the speaker to mute and unmute the tab', async ({ page }) => {
    await openApp(page);
    await newTab(page, 'video.example');
    await playVideo(page);
    const speaker = todayRows(page).first().locator('[data-testid^="sound-"]');
    await speaker.click();
    await expect(speaker).toHaveAttribute('data-muted', 'true');
    await expect(page.frameLocator('.surface-slot[data-visible] iframe').locator('body')).toHaveAttribute('data-muted', '1');
    await speaker.click();
    await expect(page.frameLocator('.surface-slot[data-visible] iframe').locator('body')).toHaveAttribute('data-muted', '0');
  });

  test('in split view, a playing pane that stays on screen does not pop out', async ({ page }) => {
    await openApp(page);
    await newTab(page, 'video.example');
    await playVideo(page);
    await page.keyboard.press(`${MOD}+Shift+Equal`);
    await page.getByTestId('cb-input').fill('notes.example');
    await page.getByTestId('cb-input').press('Enter');
    await page.waitForTimeout(300);
    expect(await pipped(page, 'video.example')).toBe(false);
  });
});
