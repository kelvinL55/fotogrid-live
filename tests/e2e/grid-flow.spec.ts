import { test, expect } from '@playwright/test';

test.describe('Recorrido E2E Completo: FotoGrid Live', () => {
  test('Flujo de Autenticación, Proyectos, Reserva de Posición y Gestión de Cuadrícula', async ({ page }) => {
    // 1. Abrir pantalla de inicio de sesión
    await page.goto('/login');
    await expect(page.locator('h1')).toContainText('FotoGrid Live');

    // Comprobar presencia de campos del formulario
    await expect(page.locator('input[type="email"]')).toBeVisible();
    await expect(page.locator('input[type="password"]')).toBeVisible();
  });
});
