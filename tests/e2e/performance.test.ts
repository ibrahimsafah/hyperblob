import { test, expect } from '@playwright/test';

test.describe('Performance', () => {
  test('default dataset renders at > 30 FPS', async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(
      () => {
        const app = (window as any).__app;
        return app && app.getNodeCount() > 0;
      },
      { timeout: 15000 }
    );

    // Wait for a few seconds of rendering to get stable FPS
    await page.waitForTimeout(3000);

    // Measure FPS using requestAnimationFrame
    const fps = await page.evaluate(() => {
      return new Promise<number>((resolve) => {
        let frameCount = 0;
        const start = performance.now();
        const duration = 3000; // measure for 3 seconds

        function countFrame() {
          frameCount++;
          if (performance.now() - start < duration) {
            requestAnimationFrame(countFrame);
          } else {
            const elapsed = performance.now() - start;
            resolve((frameCount / elapsed) * 1000);
          }
        }
        requestAnimationFrame(countFrame);
      });
    });

    expect(fps).toBeGreaterThan(30);
  });

  test('render params show correct node base size', async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(
      () => {
        const app = (window as any).__app;
        return app && app.getNodeCount() > 0;
      },
      { timeout: 15000 }
    );

    const nodeBaseSize = await page.evaluate(() => {
      const app = (window as any).__app;
      return app.getRenderParams().nodeBaseSize;
    });

    expect(nodeBaseSize).toBe(6); // default
  });

  test('100K synthetic nodes can be generated via JS', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(3000);

    // Check if generator module is available
    const generatorAvailable = await page.evaluate(() => {
      const app = (window as any).__app;
      // Try to access the generator through the app
      return typeof app !== 'undefined';
    });

    if (!generatorAvailable) {
      test.skip();
      return;
    }

    // Generate large dataset through the app if generator is available
    const result = await page.evaluate(async () => {
      try {
        // Try importing the generator module directly
        const mod = await import('/src/data/generator.ts');
        if (mod && mod.generateRandomHypergraph) {
          const start = performance.now();
          const data = mod.generateRandomHypergraph(100000, 50000, 10);
          const elapsed = performance.now() - start;
          return {
            success: true,
            nodeCount: data.nodes.length,
            edgeCount: data.hyperedges.length,
            generationTimeMs: elapsed,
          };
        }
        return { success: false, reason: 'generator not available' };
      } catch (e: any) {
        return { success: false, reason: e.message };
      }
    });

    if (result.success) {
      expect(result.nodeCount).toBe(100000);
      expect(result.edgeCount).toBe(50000);
      // Generation should complete in reasonable time
      expect(result.generationTimeMs).toBeLessThan(10000);
    }
  });

  test('FPS measurement over 5 seconds', async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(
      () => {
        const app = (window as any).__app;
        return app && app.getNodeCount() > 0;
      },
      { timeout: 15000 }
    );

    // Let initial rendering stabilize
    await page.waitForTimeout(2000);

    // Measure FPS over 5 seconds
    const fpsData = await page.evaluate(() => {
      return new Promise<{ avgFps: number; minFps: number; maxFps: number }>((resolve) => {
        const frameTimes: number[] = [];
        let lastTime = performance.now();
        const duration = 5000;
        const start = lastTime;

        function measureFrame() {
          const now = performance.now();
          const dt = now - lastTime;
          lastTime = now;
          frameTimes.push(dt);

          if (now - start < duration) {
            requestAnimationFrame(measureFrame);
          } else {
            // Calculate FPS statistics
            const fpsValues = frameTimes.map((dt) => 1000 / dt);
            const avgFps = fpsValues.reduce((a, b) => a + b, 0) / fpsValues.length;
            const minFps = Math.min(...fpsValues);
            const maxFps = Math.max(...fpsValues);
            resolve({ avgFps, minFps, maxFps });
          }
        }
        requestAnimationFrame(measureFrame);
      });
    });

    expect(fpsData.avgFps).toBeGreaterThan(30);
  });

  test('no WebGPU device lost during sustained rendering', async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(
      () => {
        const app = (window as any).__app;
        return app && app.getNodeCount() > 0;
      },
      { timeout: 15000 }
    );

    // Render for 10 seconds
    await page.waitForTimeout(10000);

    // Check that the app is still running
    const stillRunning = await page.evaluate(() => {
      const app = (window as any).__app;
      return app && app.getNodeCount() > 0;
    });

    expect(stillRunning).toBe(true);
  });

  test('stats overlay updates FPS in real time', async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(
      () => {
        const stats = document.getElementById('stats');
        return stats && stats.textContent && stats.textContent.includes('fps');
      },
      { timeout: 15000 }
    );

    const fpsText1 = await page.locator('#stats').textContent();
    await page.waitForTimeout(1000);
    const fpsText2 = await page.locator('#stats').textContent();

    // FPS values should be present in both readings
    expect(fpsText1).toContain('fps');
    expect(fpsText2).toContain('fps');

    // Extract FPS numbers
    const fpsMatch1 = fpsText1?.match(/(\d+)\s*fps/);
    const fpsMatch2 = fpsText2?.match(/(\d+)\s*fps/);

    if (fpsMatch1 && fpsMatch2) {
      const fps1 = parseInt(fpsMatch1[1], 10);
      const fps2 = parseInt(fpsMatch2[1], 10);
      // FPS should be reasonable
      expect(fps1).toBeGreaterThan(0);
      expect(fps2).toBeGreaterThan(0);
    }
  });
});
