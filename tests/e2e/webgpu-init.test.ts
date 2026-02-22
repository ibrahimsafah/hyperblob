import { test, expect } from '@playwright/test';

test.describe('WebGPU Initialization', () => {
  test('WebGPU API is available', async ({ page }) => {
    await page.goto('/');
    const hasWebGPU = await page.evaluate(() => !!navigator.gpu);
    expect(hasWebGPU).toBe(true);
  });

  test('canvas element exists', async ({ page }) => {
    await page.goto('/');
    const canvasCount = await page.locator('#gpu-canvas').count();
    expect(canvasCount).toBe(1);
  });

  test('canvas has non-zero dimensions', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#gpu-canvas');
    const dimensions = await page.evaluate(() => {
      const canvas = document.getElementById('gpu-canvas') as HTMLCanvasElement;
      return { width: canvas.width, height: canvas.height };
    });
    expect(dimensions.width).toBeGreaterThan(0);
    expect(dimensions.height).toBeGreaterThan(0);
  });

  test('no error overlay is visible after initialization', async ({ page }) => {
    await page.goto('/');
    // Wait a moment for initialization to complete
    await page.waitForTimeout(2000);
    await expect(page.locator('#error-overlay')).not.toHaveClass(/visible/);
  });

  test('WebGPU adapter can be requested', async ({ page }) => {
    await page.goto('/');
    const hasAdapter = await page.evaluate(async () => {
      if (!navigator.gpu) return false;
      const adapter = await navigator.gpu.requestAdapter();
      return !!adapter;
    });
    expect(hasAdapter).toBe(true);
  });

  test('WebGPU device can be requested', async ({ page }) => {
    await page.goto('/');
    const hasDevice = await page.evaluate(async () => {
      if (!navigator.gpu) return false;
      const adapter = await navigator.gpu.requestAdapter();
      if (!adapter) return false;
      const device = await adapter.requestDevice();
      return !!device;
    });
    expect(hasDevice).toBe(true);
  });
});
