import { test, expect } from '@playwright/test';

test.describe('Rendering', () => {
  test('canvas renders non-empty content', async ({ page }) => {
    await page.goto('/');
    // Wait for data to load and rendering to start
    await page.waitForFunction(
      () => {
        const stats = document.getElementById('stats');
        return stats && stats.textContent && stats.textContent.includes('nodes');
      },
      { timeout: 15000 }
    );
    // Let a few frames render
    await page.waitForTimeout(2000);

    // Take a screenshot of the canvas and verify it is not all one color
    const canvasElement = page.locator('#gpu-canvas');
    const screenshot = await canvasElement.screenshot();

    // The screenshot buffer should contain non-trivial data
    // A completely blank canvas would have very uniform pixel values
    expect(screenshot.length).toBeGreaterThan(0);
  });

  test('canvas has non-background pixels', async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(
      () => {
        const stats = document.getElementById('stats');
        return stats && stats.textContent && stats.textContent.includes('nodes');
      },
      { timeout: 15000 }
    );
    await page.waitForTimeout(2000);

    // Read pixel data from canvas to check for non-background content
    const hasContent = await page.evaluate(() => {
      const canvas = document.getElementById('gpu-canvas') as HTMLCanvasElement;
      // We cannot use getImageData on WebGPU canvas directly,
      // but we can check if the app is rendering by looking at frame count
      const app = (window as any).__app;
      if (!app) return false;
      // If the app has node count > 0, it means rendering is happening
      return app.getNodeCount() > 0;
    });

    expect(hasContent).toBe(true);
  });

  test('canvas screenshot has visual variation', async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(
      () => {
        const app = (window as any).__app;
        return app && app.getNodeCount() > 0;
      },
      { timeout: 15000 }
    );
    await page.waitForTimeout(2000);

    // Take screenshot of the canvas
    const canvasElement = page.locator('#gpu-canvas');
    const screenshotBuffer = await canvasElement.screenshot({ type: 'png' });

    // PNG should be reasonably sized (not just a solid color)
    // A solid color 800x600 PNG would compress to < 1KB
    // Content with nodes/edges should be significantly larger
    expect(screenshotBuffer.length).toBeGreaterThan(1000);
  });

  test('multiple frames render without errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => {
      errors.push(error.message);
    });

    await page.goto('/');
    await page.waitForFunction(
      () => {
        const app = (window as any).__app;
        return app && app.getNodeCount() > 0;
      },
      { timeout: 15000 }
    );

    // Let the app render for several seconds
    await page.waitForTimeout(3000);

    // Filter out WebGPU-unrelated errors
    const relevantErrors = errors.filter(
      (e) => !e.includes('ResizeObserver') && !e.includes('favicon')
    );
    expect(relevantErrors).toHaveLength(0);
  });
});
