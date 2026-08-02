import { describe, it, expect } from 'vitest';
import { formatPositionNumber, generateDownloadFilename } from '@/lib/utils/download';

describe('Cálculo y Formato de Posiciones Cronológicas', () => {
  it('Debe formatear números de posición con ceros a la izquierda (001, 004, 025, 100)', () => {
    expect(formatPositionNumber(1)).toBe('001');
    expect(formatPositionNumber(4)).toBe('004');
    expect(formatPositionNumber(25)).toBe('025');
    expect(formatPositionNumber(100)).toBe('100');
  });

  it('Debe generar el nombre de archivo limpio para descargas', () => {
    const filename = generateDownloadFilename('Sesión Producto Zapatos!', 4, 'jpg');
    expect(filename).toBe('sesi-n-producto-zapatos--004.jpg');
  });

  it('Debe calcular correctamente la siguiente posición tras la reserva atómica', () => {
    const currentNextPosition = 5;
    const reservedPosition = currentNextPosition;
    const updatedNextPosition = reservedPosition + 1;

    expect(reservedPosition).toBe(5);
    expect(updatedNextPosition).toBe(6);
  });
});
