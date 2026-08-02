import { describe, it, expect } from 'vitest';

interface MockItem {
  id: string;
  position: number;
  status: 'active' | 'empty' | 'uploading';
}

function simulateCompaction(items: MockItem[]): { compactedItems: MockItem[]; nextPosition: number } {
  // 1. Filtrar casillas vacías ('empty')
  const activeOnly = items.filter((i) => i.status !== 'empty');

  // 2. Ordenar por posición anterior ascendente
  activeOnly.sort((a, b) => a.position - b.position);

  // 3. Re-asignar posiciones 1..N
  const compactedItems = activeOnly.map((item, idx) => ({
    ...item,
    position: idx + 1,
  }));

  return {
    compactedItems,
    nextPosition: compactedItems.length + 1,
  };
}

describe('Lógica de Compactación de Posiciones en la Cuadrícula', () => {
  it('Debe eliminar casillas vacías y reordenar secuencialmente (1, 2, 3, vacío, 5 -> 1, 2, 3, 4)', () => {
    const initialItems: MockItem[] = [
      { id: '1', position: 1, status: 'active' },
      { id: '2', position: 2, status: 'active' },
      { id: '3', position: 3, status: 'active' },
      { id: '4', position: 4, status: 'empty' },
      { id: '5', position: 5, status: 'active' },
    ];

    const result = simulateCompaction(initialItems);

    expect(result.compactedItems.length).toBe(4);
    expect(result.compactedItems.map((i) => i.position)).toEqual([1, 2, 3, 4]);
    expect(result.compactedItems.find((i) => i.id === '5')?.position).toBe(4);
    expect(result.nextPosition).toBe(5);
  });

  it('Debe conservar el número de posición al dejar una casilla vacía sin compactar', () => {
    const items: MockItem[] = [
      { id: '1', position: 1, status: 'active' },
      { id: '2', position: 2, status: 'active' },
      { id: '3', position: 3, status: 'active' },
      { id: '4', position: 4, status: 'empty' }, // Casilla 4 vacía
      { id: '5', position: 5, status: 'active' },
    ];

    // Sin compactar: 5 sigue siendo 5
    const pos5Item = items.find((i) => i.id === '5');
    expect(pos5Item?.position).toBe(5);
  });
});
