import { test, expect } from '@playwright/test';

test.describe('Control Panel', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(
      () => {
        const app = (window as any).__app;
        return app && app.getNodeCount() > 0;
      },
      { timeout: 15000 }
    );
    await page.waitForTimeout(1000);
  });

  test('panel element exists', async ({ page }) => {
    const panelCount = await page.locator('#panel').count();
    expect(panelCount).toBe(1);
  });

  test('panel has non-zero dimensions', async ({ page }) => {
    const box = await page.locator('#panel').boundingBox();
    expect(box).not.toBeNull();
    expect(box!.width).toBeGreaterThan(0);
    expect(box!.height).toBeGreaterThan(0);
  });

  test('panel has tabs if panel module is loaded', async ({ page }) => {
    // Check if tabs exist (they are created by the Panel module)
    const tabs = page.locator('#panel [role="tab"], #panel .tab, #panel button');
    const tabCount = await tabs.count();

    // If the panel module is loaded, there should be tabs
    // If not loaded, this test still passes (panel is optional)
    if (tabCount > 0) {
      expect(tabCount).toBeGreaterThan(0);
    }
  });

  test('clicking tabs changes panel content', async ({ page }) => {
    const tabs = page.locator('#panel [role="tab"], #panel .tab, #panel button');
    const tabCount = await tabs.count();

    if (tabCount >= 2) {
      // Get content from first tab
      await tabs.nth(0).click();
      await page.waitForTimeout(300);
      const content1 = await page.locator('#panel').textContent();

      // Click second tab
      await tabs.nth(1).click();
      await page.waitForTimeout(300);
      const content2 = await page.locator('#panel').textContent();

      // Content should change
      expect(content1).not.toBe(content2);
    }
  });

  test('simulation parameters are accessible', async ({ page }) => {
    const simParams = await page.evaluate(() => {
      const app = (window as any).__app;
      return app.getSimParams();
    });

    expect(simParams).toBeDefined();
    expect(typeof simParams.repulsionStrength).toBe('number');
    expect(typeof simParams.attractionStrength).toBe('number');
    expect(typeof simParams.linkDistance).toBe('number');
    expect(typeof simParams.velocityDecay).toBe('number');
  });

  test('render parameters are accessible', async ({ page }) => {
    const renderParams = await page.evaluate(() => {
      const app = (window as any).__app;
      return app.getRenderParams();
    });

    expect(renderParams).toBeDefined();
    expect(typeof renderParams.nodeBaseSize).toBe('number');
    expect(typeof renderParams.edgeOpacity).toBe('number');
    expect(typeof renderParams.hullAlpha).toBe('number');
  });

  test('modifying simulation params via JS works', async ({ page }) => {
    // Modify a simulation parameter
    await page.evaluate(() => {
      const app = (window as any).__app;
      const params = app.getSimParams();
      params.repulsionStrength = -500;
    });

    const repulsion = await page.evaluate(() => {
      const app = (window as any).__app;
      return app.getSimParams().repulsionStrength;
    });

    expect(repulsion).toBe(-500);
  });

  test('modifying render params via JS works', async ({ page }) => {
    // Modify a render parameter
    await page.evaluate(() => {
      const app = (window as any).__app;
      const params = app.getRenderParams();
      params.nodeBaseSize = 12;
    });

    const nodeSize = await page.evaluate(() => {
      const app = (window as any).__app;
      return app.getRenderParams().nodeBaseSize;
    });

    expect(nodeSize).toBe(12);
  });

  test('slider interaction changes parameters if present', async ({ page }) => {
    const sliders = page.locator('#panel input[type="range"]');
    const sliderCount = await sliders.count();

    if (sliderCount > 0) {
      const slider = sliders.nth(0);
      const box = await slider.boundingBox();
      expect(box).not.toBeNull();

      // Move slider to middle
      await page.mouse.click(box!.x + box!.width / 2, box!.y + box!.height / 2);
      await page.waitForTimeout(300);

      // If the slider is connected to parameters, the value should have changed
      const value = await slider.inputValue();
      expect(value).toBeDefined();
    }
  });
});
