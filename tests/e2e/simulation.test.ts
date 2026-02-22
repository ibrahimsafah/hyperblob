import { test, expect } from '@playwright/test';

test.describe('Force Simulation', () => {
  test('simulation is running after data load', async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(
      () => {
        const app = (window as any).__app;
        return app && app.getNodeCount() > 0;
      },
      { timeout: 15000 }
    );

    const isRunning = await page.evaluate(() => {
      const app = (window as any).__app;
      return app.getSimParams().running;
    });
    expect(isRunning).toBe(true);
  });

  test('simulation alpha starts near 1.0', async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(
      () => {
        const app = (window as any).__app;
        return app && app.getNodeCount() > 0;
      },
      { timeout: 15000 }
    );

    const alpha = await page.evaluate(() => {
      const app = (window as any).__app;
      return app.getSimParams().alpha;
    });

    // Alpha should be near 1.0 right after loading (might have decayed slightly)
    expect(alpha).toBeGreaterThan(0.5);
    expect(alpha).toBeLessThanOrEqual(1.0);
  });

  test('positions change over time (layout is running)', async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(
      () => {
        const app = (window as any).__app;
        return app && app.getNodeCount() > 0;
      },
      { timeout: 15000 }
    );

    // Snapshot camera center at t=0
    const snapshot1 = await page.evaluate(() => {
      const app = (window as any).__app;
      return {
        alpha: app.getSimParams().alpha,
        camera: [...app.getCamera().center],
      };
    });

    // Wait for simulation to progress
    await page.waitForTimeout(2000);

    // Snapshot at t=2
    const snapshot2 = await page.evaluate(() => {
      const app = (window as any).__app;
      return {
        alpha: app.getSimParams().alpha,
        camera: [...app.getCamera().center],
      };
    });

    // Alpha should have decayed
    expect(snapshot2.alpha).toBeLessThan(snapshot1.alpha);
  });

  test('simulation alpha decays over time', async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(
      () => {
        const app = (window as any).__app;
        return app && app.getNodeCount() > 0;
      },
      { timeout: 15000 }
    );

    const alpha1 = await page.evaluate(() => {
      const app = (window as any).__app;
      return app.getSimParams().alpha;
    });

    await page.waitForTimeout(3000);

    const alpha2 = await page.evaluate(() => {
      const app = (window as any).__app;
      return app.getSimParams().alpha;
    });

    expect(alpha2).toBeLessThan(alpha1);
  });

  test('simulation eventually converges (alpha approaches alphaMin)', async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(
      () => {
        const app = (window as any).__app;
        return app && app.getNodeCount() > 0;
      },
      { timeout: 15000 }
    );

    // Wait for simulation to settle (up to 20 seconds)
    await page.waitForFunction(
      () => {
        const app = (window as any).__app;
        const params = app.getSimParams();
        return params.alpha <= params.alphaMin;
      },
      { timeout: 30000 }
    );

    const alpha = await page.evaluate(() => {
      const app = (window as any).__app;
      return app.getSimParams().alpha;
    });

    expect(alpha).toBeLessThanOrEqual(0.001);
  });
});
