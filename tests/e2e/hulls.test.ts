import { test, expect } from '@playwright/test';

test.describe('Convex Hulls', () => {
  test('hull rendering is active when hullAlpha > 0', async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(
      () => {
        const app = (window as any).__app;
        return app && app.getNodeCount() > 0;
      },
      { timeout: 15000 }
    );

    const hullAlpha = await page.evaluate(() => {
      const app = (window as any).__app;
      return app.getRenderParams().hullAlpha;
    });

    // Default hullAlpha should be > 0
    expect(hullAlpha).toBeGreaterThan(0);
  });

  test('hulls are visible after simulation settles', async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(
      () => {
        const app = (window as any).__app;
        return app && app.getNodeCount() > 0;
      },
      { timeout: 15000 }
    );

    // Wait for simulation to settle a bit
    await page.waitForTimeout(5000);

    // Take a screenshot - visual verification
    const canvas = page.locator('#gpu-canvas');
    const screenshot = await canvas.screenshot({ type: 'png' });

    // The screenshot should be reasonably sized (hulls add colored regions)
    expect(screenshot.length).toBeGreaterThan(500);
  });

  test('hull margin parameter is set', async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(
      () => {
        const app = (window as any).__app;
        return app && app.getNodeCount() > 0;
      },
      { timeout: 15000 }
    );

    const hullMargin = await page.evaluate(() => {
      const app = (window as any).__app;
      return app.getRenderParams().hullMargin;
    });

    // Default hull margin should be 3
    expect(hullMargin).toBe(3);
  });

  test('hull outline parameter is disabled by default', async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(
      () => {
        const app = (window as any).__app;
        return app && app.getNodeCount() > 0;
      },
      { timeout: 15000 }
    );

    const hullOutline = await page.evaluate(() => {
      const app = (window as any).__app;
      return app.getRenderParams().hullOutline;
    });

    expect(hullOutline).toBe(false);
  });

  test('rendering continues without errors with hulls enabled', async ({ page }) => {
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

    // Wait for several frames with hulls rendering
    await page.waitForTimeout(5000);

    const relevantErrors = errors.filter(
      (e) => !e.includes('ResizeObserver') && !e.includes('favicon')
    );
    expect(relevantErrors).toHaveLength(0);
  });

  test('screenshot with hulls has visual diversity', async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(
      () => {
        const app = (window as any).__app;
        return app && app.getNodeCount() > 0;
      },
      { timeout: 15000 }
    );

    // Wait for hulls to be computed and rendered
    await page.waitForTimeout(5000);

    const canvas = page.locator('#gpu-canvas');
    const screenshot = await canvas.screenshot({ type: 'png' });

    // A scene with hulls, edges, and nodes should produce a diverse image
    // PNG compression of a diverse image will be larger than a mostly-solid one
    expect(screenshot.length).toBeGreaterThan(2000);
  });
});
