import type { Page } from '@playwright/test';
import { test, expect, openApp, newTab, savedState, MOD } from './fixtures';

/** A real picture made in the page: a dark or a light gradient, 1600×1000. */
async function picture(page: Page, dark: boolean) {
  const b64 = await page.evaluate((dark) => {
    const c = document.createElement('canvas');
    c.width = 1600;
    c.height = 1000;
    const x = c.getContext('2d')!;
    const g = x.createLinearGradient(0, 0, 1600, 1000);
    g.addColorStop(0, dark ? '#0b1430' : '#fdf6e3');
    g.addColorStop(1, dark ? '#24123a' : '#e9f1ff');
    x.fillStyle = g;
    x.fillRect(0, 0, 1600, 1000);
    return c.toDataURL('image/png').split(',')[1];
  }, dark);
  return { name: dark ? 'night.png' : 'day.png', mimeType: 'image/png', buffer: Buffer.from(b64, 'base64') };
}

async function openBackground(page: Page) {
  await page.keyboard.press(`${MOD}+Comma`);
  await page.getByTestId('settings-spaces').click();
  await expect(page.getByTestId('bg-image-upload')).toBeVisible();
}

const theme = async (page: Page) => {
  const s = await savedState(page);
  return s.spaces.find((x: { id: string }) => x.id === s.activeSpaceId).theme;
};

test.describe('background picture', () => {
  test('upload a picture for the New Tab page; it previews, applies, and stays after a restart', async ({ page }) => {
    await openApp(page);
    await newTab(page, 'a.com');
    await openBackground(page);
    await page.getByTestId('bg-image-input').setInputFiles(await picture(page, true));
    await expect(page.getByTestId('bg-image-preview')).toBeVisible();
    // New Tab page only by default: the window frame keeps its gradient.
    await expect(page.getByTestId('bg-image-place').getByRole('radio', { name: 'New Tab page' })).toBeChecked();
    await expect(page.getByTestId('bg-image')).toHaveCount(0);
    await page.getByTestId('look-apply').click();
    await expect.poll(async () => (await theme(page)).image).toMatchObject({ place: 'newtab', dim: 0.15, blur: 0 });
    const t = await theme(page);
    expect(t.image.luma).toBeLessThan(0.3);

    await page.getByTestId('sheet-close').click();
    await page.getByTestId('btn-new-tab').click();
    await expect(page.getByTestId('start-bg')).toBeVisible();
    // A dark picture turns the text white so it stays readable.
    await expect(page.getByTestId('start-page')).toHaveAttribute('data-tone', 'dark');
    const greet = await page.locator('.start-greet').evaluate((el) => getComputedStyle(el).color);
    expect(greet).toMatch(/rgba?\(255, 255, 255/);

    await page.reload();
    await expect(page.getByTestId('sidebar')).toBeVisible();
    await expect(page.getByTestId('start-bg')).toBeVisible();
    expect(await page.getByTestId('start-bg').evaluate((el) => getComputedStyle(el, '::before').backgroundImage)).toMatch(/^url\("blob:/);
  });

  test('whole browser: the picture goes behind the sidebar; dim and blur apply; a light picture keeps dark text', async ({ page }) => {
    await openApp(page);
    await openBackground(page);
    await page.getByTestId('bg-image-input').setInputFiles(await picture(page, false));
    await page.getByTestId('bg-image-place').getByRole('radio', { name: 'Whole browser' }).click();
    // Behind the whole window, with more dimming to start (the sidebar needs it).
    await expect(page.getByTestId('bg-image')).toBeVisible();
    await expect(page.getByTestId('app')).toHaveAttribute('data-bg-image', 'true');
    await expect(page.getByTestId('bg-image-dim')).toHaveValue('0.45');
    await page.getByTestId('bg-image-dim').fill('0.6');
    await page.getByTestId('bg-image-blur').fill('12');
    await expect(page.getByTestId('bg-image')).toHaveAttribute('data-blurred', 'true');
    expect(await page.getByTestId('bg-image').evaluate((el) => getComputedStyle(el, '::before').filter)).toBe('blur(12px)');
    await page.getByTestId('look-apply').click();
    await expect.poll(async () => (await theme(page)).image).toMatchObject({ place: 'browser', dim: 0.6, blur: 12 });
    // The New Tab page shows it too.
    await page.getByTestId('sheet-close').click();
    await page.getByTestId('btn-new-tab').click();
    await expect(page.getByTestId('start-bg')).toBeVisible();
    await expect(page.getByTestId('start-page')).toHaveAttribute('data-tone', 'light');
  });

  test('remove the picture; a file that isn’t a picture is refused with a message', async ({ page }) => {
    await openApp(page);
    await openBackground(page);
    await page.getByTestId('bg-image-input').setInputFiles({ name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('hello') });
    await expect(page.getByTestId('toast').filter({ hasText: 'isn’t a picture' })).toBeVisible();
    await expect(page.getByTestId('bg-image-preview')).toHaveCount(0);

    await page.getByTestId('bg-image-input').setInputFiles(await picture(page, true));
    await page.getByTestId('bg-image-place').getByRole('radio', { name: 'Whole browser' }).click();
    await page.getByTestId('look-apply').click();
    await expect(page.getByTestId('bg-image')).toBeVisible();
    await page.getByTestId('bg-image-remove').click();
    await expect(page.getByTestId('bg-image')).toHaveCount(0);
    await expect(page.getByTestId('bg-image-upload')).toBeVisible();
    await page.getByTestId('look-apply').click();
    await expect.poll(async () => (await theme(page)).image).toBeUndefined();
  });

  test('a picture you previewed but didn’t keep is cleaned up after a restart', async ({ page }) => {
    await openApp(page);
    await openBackground(page);
    await page.getByTestId('bg-image-input').setInputFiles(await picture(page, true));
    await expect(page.getByTestId('bg-image-preview')).toBeVisible();
    const count = () =>
      page.evaluate(
        () =>
          new Promise<number>((resolve) => {
            const r = indexedDB.open('kite-images', 1);
            r.onsuccess = () => {
              const q = r.result.transaction('images').objectStore('images').count();
              q.onsuccess = () => resolve(q.result);
            };
          }),
      );
    expect(await count()).toBe(1);
    await page.getByTestId('sheet-close').click(); // leaves without Apply
    await page.reload();
    await expect(page.getByTestId('sidebar')).toBeVisible();
    await expect.poll(count, { timeout: 8000 }).toBe(0);
  });
});
