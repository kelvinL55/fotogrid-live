# FotoGrid Live 📸⚡

Aplicación web PWA en tiempo real construida con **Next.js (App Router)**, **TypeScript estricto**, **Tailwind CSS** y **Supabase** (Auth, Postgres, Storage, Realtime).

Permite capturar fotografías de productos desde un dispositivo móvil y mostrarlas instantáneamente en una cuadrícula numerada cronológicamente en el computador, manteniendo el orden atómico de captura sin importar variaciones en la velocidad de la red.

---

## 🚀 Características Principales

- 📱 **Modo Móvil / Cámara**: Optimizado para uso con una sola mano, selector de cámara trasera, galería, compresión cliente y cola de subidas en IndexedDB para zonas con baja señal.
- 💻 **Modo Escritorio / Visor**: Sincronización en tiempo real vía Supabase Realtime (`postgres_changes`), densidad de columnas personalizable (6, 10, 15, 20 o Auto).
- 🔗 **Vinculación por Código QR**: Generador de código QR y enlaces cortos `/join/[code]` para conectar el teléfono en un solo toque.
- 🔒 **Privacidad y RLS**: Autenticación persistente, políticas de Row Level Security en todas las tablas y bucket de almacenamiento privado con URLs firmadas/autenticadas.
- 🎯 **Reserva Atómica de Posición**: Función SQL transaccional (`reserve_next_project_position`) con bloqueo de filas para garantizar que la posición `#001`, `#002`, `#003` se reserve en el momento exacto de la captura.
- ⚡ **Transferencia a ChatGPT / Apps Web**:
  - **Copiar imagen**: Convierte a PNG Blob y escribe en el portapapeles (`navigator.clipboard.write`).
  - **Descargar**: Nombre numerado (`nombre-proyecto-004.jpg`) o descarga múltiple en ZIP (`JSZip`).
  - **Arrastrar y soltar**: Compatibilidad `DataTransfer` en escritorio.
- 🧩 **Gestión Flexible de Casillas**:
  - Opción A: Eliminar dejando el espacio vacío (`#004` vacío, `#005` conserva posición).
  - Opción B: Reemplazar una casilla existente (`#004` ocupada por nueva foto con versión incrementada).
  - Opción C: Compactar la cuadrícula secuencialmente mediante la RPC SQL `compact_project_positions`.

---

## 🛠️ Requisitos e Instalación Local

### Prerrequisitos
- Node.js 18.x o superior
- Cuenta en [Supabase](https://supabase.com) (Plan gratuito)

### 1. Clonar e Instalar Dependencias
```bash
npm install
```

### 2. Variables de Entorno (`.env.local`)
Copia `.env.example` a `.env.local` y configura tus credenciales de Supabase:
```env
NEXT_PUBLIC_SUPABASE_URL=https://tu-proyecto.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=tu-anon-key
SUPABASE_SERVICE_ROLE_KEY=tu-service-role-key # Opcional solo para ejecuciones cron del servidor
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

### 3. Configuración de Base de Datos y Storage en Supabase
Ejecuta el contenido del archivo de migración en la consola SQL de Supabase (SQL Editor):
`supabase/migrations/20260802000000_initial_schema.sql`

Esta migración creará automáticamente:
- Las tablas `projects` y `project_items` con sus restricciones únicas e índices.
- Las políticas de seguridad RLS (`Row Level Security`).
- Las funciones RPC SQL transaccionales `reserve_next_project_position` y `compact_project_positions`.
- El bucket de Storage privado `project-photos`.
- La activación de la publicación `supabase_realtime` sobre `project_items`.

---

## 💻 Comandos de Desarrollo y Producción

- **Iniciar servidor de desarrollo**:
  ```bash
  npm run dev
  ```
- **Verificación de tipos TypeScript**:
  ```bash
  npm run typecheck
  ```
- **Ejecutar Lint**:
  ```bash
  npm run lint
  ```
- **Ejecutar Pruebas Unitarias (Vitest)**:
  ```bash
  npm run test
  ```
- **Ejecutar Pruebas E2E (Playwright)**:
  ```bash
  npm run test:e2e
  ```
- **Compilar para Producción**:
  ```bash
  npm run build
  ```

---

## 📱 Guía de Uso Móvil y Copia a ChatGPT

### Cómo vincular tu teléfono con el computador:
1. Abre un proyecto en tu computador y haz clic en **"Abrir en el Teléfono"**.
2. Escanea el código QR proyectado en la pantalla con la cámara de tu teléfono.
3. Si aún no te has autenticado en el móvil, inicia sesión y serás redirigido automáticamente a la cámara de ese proyecto.
4. Presiona **"TOMAR FOTOGRAFÍA"**. Cada foto subida aparecerá casi instantáneamente en la cuadrícula del computador.

### Cómo copiar imágenes a ChatGPT:
1. Pasa el cursor o pulsa el menú de opciones (`...`) en cualquier fotografía de la cuadrícula.
2. Haz clic en **"Copiar imagen"**.
3. Ve a tu conversación en ChatGPT u otra app web y presiona `Ctrl+V` (o `Cmd+V` en Mac) para pegar la imagen directamente.

---

## ⚠️ Limitaciones Conocidas del Navegador

- **Escritura en Portapapeles (`navigator.clipboard.write`)**: Chrome y navegadores Chromium requieren que la aplicación funcione bajo HTTPS o en `localhost`. En Safari o entornos móviles donde el sistema operativo restringe la copia de PNGs en segundo plano, se muestra un mensaje informativo sugiriendo la descarga directa.
- **Atributo `capture="environment"`**: El comportamiento del selector de cámara puede variar según el sistema operativo. Se incluye un selector de galería estándar como alternativa.

---

## 📄 Decisiones Técnicas

- **No almacenar Base64 en Postgres**: Todas las fotos se almacenan como archivos binarios comprimidos en Supabase Storage y se referencian mediante rutas estructuradas `ownerId/projectId/itemId/v1.ext`.
- **Reserva atómica vía RPC**: Para evitar disputas de orden en subidas simultáneas, la posición `#N` se reserva mediante una transacción Postgres con `FOR UPDATE` en el backend antes de la subida.
