# ClubFit — Sistema de Asistencia para Gimnasio

Sistema de control de acceso y membresías para gimnasio. Incluye reconocimiento facial, registro manual por RUT y gestión de usuarios.

## Características

- 📷 **Reconocimiento Facial** — Identifica socios automáticamente con la cámara web
- ✍️ **Registro Manual** — Ingreso por RUT cuando la cámara no está disponible  
- 👥 **Gestión de Usuarios** — Agregar, editar, desactivar socios
- 📋 **Historial de Asistencias** — Registro de todos los ingresos
- 🇨🇱 **RUT Chileno** — Validación y formateo automático
- 📅 **Planes Flexibles** — 1 mes, trimestral, semestral, anual

## Rutas

| Ruta | Descripción |
|------|-------------|
| `/admin` | Panel de administración — agregar usuarios, ver historial |
| `/pantalla` | Pantalla de acceso — para colocar en la entrada del gimnasio |

## Stack

- **Next.js 15** (App Router)
- **Tailwind CSS**
- **Neon Postgres** (base de datos serverless)
- **face-api.js** (reconocimiento facial, carga desde CDN)
- **Vercel** (despliegue)

## Configuración

### 1. Clonar y preparar

```bash
git clone https://github.com/tu-usuario/clubfit.git
cd clubfit
npm install
```

### 2. Variables de entorno

Crea un archivo `.env.local` con:

```
DATABASE_URL=postgresql://usuario:password@host/clubfit?sslmode=require
```

Obtén tu URL de conexión desde [neon.tech](https://neon.tech) (gratuito).

### 3. Inicializar base de datos

Las tablas se crean automáticamente al hacer el primer request a la API.

### 4. Desarrollo local

```bash
npm run dev
```

Abre http://localhost:3000

### 5. Desplegar en Vercel

```bash
npm install -g vercel
vercel
```

O conecta el repositorio directamente desde [vercel.com](https://vercel.com).

## Uso

### Panel Admin (`/admin`)

1. **Agregar usuario**: Nombre, RUT, plan, foto (cámara o archivo)
2. **La foto registra automáticamente** el descriptor facial para reconocimiento posterior
3. Ver historial de todos los accesos

### Pantalla de Acceso (`/pantalla`)

1. **Modo Facial**: Activa la cámara — el sistema escanea automáticamente cada 3 segundos
2. **Modo Manual**: Ingresa el RUT del socio y presiona Enter

## Reconocimiento Facial

El sistema usa `face-api.js` con modelos cargados desde CDN:
- Detecta el rostro en tiempo real
- Extrae 128 puntos característicos (descriptor)
- Compara con todos los usuarios registrados
- Umbral de similitud: 0.5 (ajustable en `/api/asistencia/facial/route.ts`)

> **Nota**: Para que funcione el reconocimiento, el usuario debe registrarse con la opción "Cámara" en el admin, que extrae el descriptor facial. Si se sube una foto desde archivo, el reconocimiento no estará disponible para ese usuario (pero el resto de funciones sí).

## Estructura del Proyecto

```
clubfit/
├── app/
│   ├── admin/page.tsx          # Panel de administración
│   ├── pantalla/page.tsx       # Pantalla de acceso
│   ├── api/
│   │   ├── usuarios/route.ts   # CRUD usuarios
│   │   ├── usuarios/[id]/      # Usuario por ID
│   │   └── asistencia/
│   │       ├── route.ts        # Registrar asistencia
│   │       └── facial/route.ts # Reconocimiento facial
│   └── globals.css
├── components/
│   └── admin/
│       ├── FormUsuario.tsx     # Formulario de registro
│       └── CamaraCaptura.tsx  # Captura de foto con cámara
└── lib/
    ├── db.ts                   # Cliente Neon Postgres
    ├── schema.ts               # Esquema de tablas
    └── utils.ts                # RUT, fechas, utilidades
```
