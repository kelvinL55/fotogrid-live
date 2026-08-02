/**
 * Configuración centralizada de FotoGrid Live
 * Permite renombrar la aplicación o ajustar parámetros desde un único lugar.
 */

export const APP_CONFIG = {
  name: 'FotoGrid Live',
  shortName: 'FotoGrid',
  description: 'Sincronización en tiempo real de cuadrículas fotográficas entre teléfono y computador.',
  version: '1.0.0',
  defaultDensity: 10,
  availableDensities: [6, 10, 15, 20],
  
  // Parámetros de compresión de imagen
  compression: {
    enabled: true,
    maxSizeMB: 1.5,
    maxWidthOrHeight: 2560,
    useWebWorker: true,
    fileType: 'image/jpeg' as const,
    initialQuality: 0.85,
  },

  // Storage
  storage: {
    bucketName: 'project-photos',
    signedUrlExpiresInSeconds: 3600, // 1 hora
  },

  // Expiración por defecto de proyectos
  expirationOptions: [
    { label: 'Sin caducidad', value: 'never' },
    { label: '1 día', value: '1d' },
    { label: '7 días', value: '7d' },
    { label: '30 días', value: '30d' },
  ],
};
