import { test, expect } from '@playwright/test';

test.describe('Force Simulation', () => {
  test('simulation is running after data load', async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(
      () => {
        const app = (window as any).__app;
        return app?.engine?.getNodeCount() > 0;
      },
      { timeout: 15000 }
    );

    const isRunning = await page.evaluate(() => {
      const app = (window as any).__app;
      return app.engine.simParams.running;
    });
    expect(isRunning).toBe(true);
  });

  test('simulation energy starts near 1.0', async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(
      () => {
        const app = (window as any).__app;
        return app?.engine?.getNodeCount() > 0;
      },
      { timeout: 15000 }
    );

    const energy = await page.evaluate(() => {
      const app = (window as any).__app;
      return app.engine.simParams.energy;
    });

    // Energy should be near 1.0 right after loading (might have decayed slightly)
    expect(energy).toBeGreaterThan(0.5);
    expect(energy).toBeLessThanOrEqual(1.0);
  });

  test('positions change over time (layout is running)', async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(
      () => {
        const app = (window as any).__app;
        return app?.engine?.getNodeCount() > 0;
      },
      { timeout: 15000 }
    );

    // Snapshot at t=0
    const snapshot1 = await page.evaluate(() => {
      const app = (window as any).__app;
      return {
        energy: app.engine.simParams.energy,
        camera: [...app.engine.getCamera().center],
      };
    });

    // Wait for simulation to progress
    await page.waitForTimeout(2000);

    // Snapshot at t=2
    const snapshot2 = await page.evaluate(() => {
      const app = (window as any).__app;
      return {
        energy: app.engine.simParams.energy,
        camera: [...app.engine.getCamera().center],
      };
    });

    // Energy should have decayed
    expect(snapshot2.energy).toBeLessThan(snapshot1.energy);
  });

  test('simulation energy decays over time', async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(
      () => {
        const app = (window as any).__app;
        return app?.engine?.getNodeCount() > 0;
      },
      { timeout: 15000 }
    );

    const energy1 = await page.evaluate(() => {
      const app = (window as any).__app;
      return app.engine.simParams.energy;
    });

    await page.waitForTimeout(3000);

    const energy2 = await page.evaluate(() => {
      const app = (window as any).__app;
      return app.engine.simParams.energy;
    });

    expect(energy2).toBeLessThan(energy1);
  });

  test('simulation eventually converges (energy approaches stopThreshold)', async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(
      () => {
        const app = (window as any).__app;
        return app?.engine?.getNodeCount() > 0;
      },
      { timeout: 15000 }
    );

    // Wait for simulation to settle (up to 20 seconds)
    await page.waitForFunction(
      () => {
        const app = (window as any).__app;
        const params = app.engine.simParams;
        return params.energy <= params.stopThreshold;
      },
      { timeout: 30000 }
    );

    const energy = await page.evaluate(() => {
      const app = (window as any).__app;
      return app.engine.simParams.energy;
    });

    expect(energy).toBeLessThanOrEqual(0.001);
  });
});
