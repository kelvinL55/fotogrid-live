import { describe, it, expect } from 'vitest';
import { setupMultiImageDrag } from '@/lib/utils/dragDrop';
import { ProjectItem } from '@/lib/types';

describe('Multi-drag & drop payload preparation', () => {
  const mockItem1: ProjectItem = {
    id: 'item-1',
    project_id: 'proj-1',
    position: 1,
    status: 'active',
    public_url: 'https://example.com/img1.jpg',
    storage_path: 'proj-1/img1.jpg',
    original_filename: 'img1.jpg',
    mime_type: 'image/jpeg',
    file_size: 1024,
    width: 800,
    height: 600,
    created_at: new Date().toISOString(),
    uploaded_at: new Date().toISOString(),
  };

  const mockItem2: ProjectItem = {
    id: 'item-2',
    project_id: 'proj-1',
    position: 2,
    status: 'active',
    public_url: 'https://example.com/img2.jpg',
    storage_path: 'proj-1/img2.jpg',
    original_filename: 'img2.jpg',
    mime_type: 'image/jpeg',
    file_size: 2048,
    width: 800,
    height: 600,
    created_at: new Date().toISOString(),
    uploaded_at: new Date().toISOString(),
  };

  const mockItem3Empty: ProjectItem = {
    id: 'item-3',
    project_id: 'proj-1',
    position: 3,
    status: 'empty',
    public_url: null,
    storage_path: null,
    original_filename: null,
    mime_type: null,
    file_size: null,
    width: null,
    height: null,
    created_at: new Date().toISOString(),
    uploaded_at: null,
  };

  it('Debe transferir una sola imagen cuando no hay selección múltiple activa', () => {
    const dataStore: Record<string, string> = {};
    const mockEvent = {
      dataTransfer: {
        setData: (k: string, v: string) => {
          dataStore[k] = v;
        },
        items: {
          add: () => {},
        },
        effectAllowed: '',
      },
    } as unknown as React.DragEvent;

    const result = setupMultiImageDrag({
      event: mockEvent,
      targetItem: mockItem1,
      selectedItems: [],
      projectName: 'TestProject',
    });

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('item-1');
    expect(dataStore['text/plain']).toBe('https://example.com/img1.jpg');
    expect(dataStore['text/uri-list']).toBe('https://example.com/img1.jpg');
  });

  it('Debe transferir todas las imágenes seleccionadas activas cuando se arrastra desde un elemento seleccionado', () => {
    const dataStore: Record<string, string> = {};
    const mockEvent = {
      dataTransfer: {
        setData: (k: string, v: string) => {
          dataStore[k] = v;
        },
        items: {
          add: () => {},
        },
        effectAllowed: '',
      },
    } as unknown as React.DragEvent;

    const result = setupMultiImageDrag({
      event: mockEvent,
      targetItem: mockItem1,
      selectedItems: [mockItem1, mockItem2, mockItem3Empty],
      projectName: 'TestProject',
    });

    expect(result).toHaveLength(2);
    expect(result.map((i) => i.id)).toEqual(['item-1', 'item-2']);
    expect(dataStore['text/plain']).toBe('https://example.com/img1.jpg\nhttps://example.com/img2.jpg');
    expect(dataStore['text/uri-list']).toBe('https://example.com/img1.jpg\r\nhttps://example.com/img2.jpg');
  });
});
