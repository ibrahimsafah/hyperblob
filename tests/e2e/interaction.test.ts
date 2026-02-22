import { test, expect } from '@playwright/test';

test.describe('Interaction', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    // Wait for data to load
    await page.waitForFunction(
      () => {
        const app = (window as any).__app;
        return app && app.getNodeCount() > 0;
      },
      { timeout: 15000 }
    );
    await page.waitForTimeout(1000);
  });

  test('mouse wheel zoom changes zoom level', async ({ page }) => {
    const zoomBefore = await page.evaluate(() => {
      const app = (window as any).__app;
      return app.getCamera().zoom;
    });

    // Perform wheel zoom on the canvas
    const canvas = page.locator('#gpu-canvas');
    const box = await canvas.boundingBox();
    expect(box).not.toBeNull();

    await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
    await page.mouse.wheel(0, -100); // scroll up = zoom in
    await page.waitForTimeout(500);

    const zoomAfter = await page.evaluate(() => {
      const app = (window as any).__app;
      return app.getCamera().zoom;
    });

    expect(zoomAfter).not.toBe(zoomBefore);
  });

  test('drag pan moves camera center', async ({ page }) => {
    const centerBefore = await page.evaluate(() => {
      const app = (window as any).__app;
      const camera = app.getCamera();
      return { x: camera.center[0], y: camera.center[1] };
    });

    const canvas = page.locator('#gpu-canvas');
    const box = await canvas.boundingBox();
    expect(box).not.toBeNull();

    const startX = box!.x + box!.width / 2;
    const startY = box!.y + box!.height / 2;

    // Perform drag
    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.mouse.move(startX + 100, startY + 50, { steps: 10 });
    await page.mouse.up();
    await page.waitForTimeout(500);

    const centerAfter = await page.evaluate(() => {
      const app = (window as any).__app;
      const camera = app.getCamera();
      return { x: camera.center[0], y: camera.center[1] };
    });

    // Camera center should have moved
    const dx = Math.abs(centerAfter.x - centerBefore.x);
    const dy = Math.abs(centerAfter.y - centerBefore.y);
    expect(dx + dy).toBeGreaterThan(0);
  });

  test('zoom preserves relative position under cursor', async ({ page }) => {
    const canvas = page.locator('#gpu-canvas');
    const box = await canvas.boundingBox();
    expect(box).not.toBeNull();

    const sx = box!.x + box!.width / 3;
    const sy = box!.y + box!.height / 3;

    // Get world position under cursor before zoom
    const worldBefore = await page.evaluate(
      ({ sx, sy, bx, by }) => {
        const app = (window as any).__app;
        const camera = app.getCamera();
        const canvasX = (sx - bx) * window.devicePixelRatio;
        const canvasY = (sy - by) * window.devicePixelRatio;
        return camera.screenToWorld(canvasX, canvasY);
      },
      { sx, sy, bx: box!.x, by: box!.y }
    );

    await page.mouse.move(sx, sy);
    await page.mouse.wheel(0, -200);
    await page.waitForTimeout(500);

    // Get world position under cursor after zoom
    const worldAfter = await page.evaluate(
      ({ sx, sy, bx, by }) => {
        const app = (window as any).__app;
        const camera = app.getCamera();
        const canvasX = (sx - bx) * window.devicePixelRatio;
        const canvasY = (sy - by) * window.devicePixelRatio;
        return camera.screenToWorld(canvasX, canvasY);
      },
      { sx, sy, bx: box!.x, by: box!.y }
    );

    // World point under cursor should be approximately the same
    expect(worldAfter[0]).toBeCloseTo(worldBefore[0], 0);
    expect(worldAfter[1]).toBeCloseTo(worldBefore[1], 0);
  });

  test('double click does not crash', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => {
      errors.push(error.message);
    });

    const canvas = page.locator('#gpu-canvas');
    const box = await canvas.boundingBox();
    expect(box).not.toBeNull();

    await page.mouse.dblclick(box!.x + box!.width / 2, box!.y + box!.height / 2);
    await page.waitForTimeout(500);

    const relevantErrors = errors.filter(
      (e) => !e.includes('ResizeObserver') && !e.includes('favicon')
    );
    expect(relevantErrors).toHaveLength(0);
  });

  test('right click does not cause errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => {
      errors.push(error.message);
    });

    const canvas = page.locator('#gpu-canvas');
    const box = await canvas.boundingBox();
    expect(box).not.toBeNull();

    await page.mouse.click(box!.x + box!.width / 2, box!.y + box!.height / 2, {
      button: 'right',
    });
    await page.waitForTimeout(500);

    const relevantErrors = errors.filter(
      (e) => !e.includes('ResizeObserver') && !e.includes('favicon')
    );
    expect(relevantErrors).toHaveLength(0);
  });
});
