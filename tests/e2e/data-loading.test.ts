import { test, expect } from '@playwright/test';

test.describe('Data Loading', () => {
  test('default GoT dataset loads on page open', async ({ page }) => {
    await page.goto('/');
    // Wait for the stats overlay to show data info
    await page.waitForSelector('#stats', { timeout: 15000 });
    // Wait for data to load and stats to update
    await page.waitForFunction(
      () => {
        const stats = document.getElementById('stats');
        return stats && stats.textContent && stats.textContent.includes('nodes');
      },
      { timeout: 15000 }
    );
  });

  test('stats overlay shows 101 nodes', async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(
      () => {
        const stats = document.getElementById('stats');
        return stats && stats.textContent && stats.textContent.includes('nodes');
      },
      { timeout: 15000 }
    );

    const statsText = await page.locator('#stats').textContent();
    expect(statsText).toContain('101');
    expect(statsText).toContain('nodes');
  });

  test('stats overlay shows 394 hyperedges', async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(
      () => {
        const stats = document.getElementById('stats');
        return stats && stats.textContent && stats.textContent.includes('hyperedges');
      },
      { timeout: 15000 }
    );

    const statsText = await page.locator('#stats').textContent();
    expect(statsText).toContain('394');
    expect(statsText).toContain('hyperedges');
  });

  test('stats overlay shows FPS information', async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(
      () => {
        const stats = document.getElementById('stats');
        return stats && stats.textContent && stats.textContent.includes('fps');
      },
      { timeout: 15000 }
    );

    const statsText = await page.locator('#stats').textContent();
    expect(statsText).toContain('fps');
  });

  test('app object is accessible on window', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(3000);
    const hasApp = await page.evaluate(() => !!(window as any).__app);
    expect(hasApp).toBe(true);
  });

  test('graph data is available after loading', async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(
      () => {
        const app = (window as any).__app;
        return app && app.getGraphData && app.getGraphData();
      },
      { timeout: 15000 }
    );

    const nodeCount = await page.evaluate(() => {
      const app = (window as any).__app;
      return app.getNodeCount();
    });
    expect(nodeCount).toBe(101);
  });
});
