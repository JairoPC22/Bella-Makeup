# Bella Makeup — Fase 1: Fundación (diseño)

Fecha: 2026-09-16

## Contexto

Bella Makeup necesita un sistema comercial completo (admin, POS, inventario
multi-sucursal, transferencias, compras, ventas, devoluciones, auditoría,
reportes, ecommerce). Dado el tamaño, el proyecto se construye en fases sobre
una única base de datos y backend conectados (no módulos aislados). Esta spec
cubre la **Fase 1: Fundación**, de la que dependen todas las fases siguientes.

Estado inicial del proyecto: `BellaFront/` y `BellaBack/` existían como
esqueletos de carpetas vacías, sin código, sin `package.json` en el frontend,
sin `schema.prisma`, y sin repositorio git. `BellaBack/package.json` ya
declaraba dependencias (Express 5, Prisma, bcryptjs, jsonwebtoken, multer,
sharp, nodemailer, qrcode, zod) pero sin TypeScript.

## Alcance de la Fase 1

- Setup de ambos proyectos (TypeScript en los dos, Vite+React+Router en el
  frontend, Prisma+PostgreSQL en el backend, Docker Compose para Postgres en
  desarrollo).
- Autenticación (login/logout, JWT de acceso + refresh token en cookie
  httpOnly con rotación).
- Usuarios, roles, permisos, asignación de sucursales.
- Sucursales (alta/edición/activación).
- Configuración de empresa (fila única: Bella Makeup).
- Perfil de usuario (edición de datos personales, contraseña, avatar).
- Avatar configurable con DiceBear (estilo `adventurer`), guardando
  `{style, seed}` en el usuario, no la imagen.
- Auditoría: infraestructura (`audit_logs` + servicio central de logging) y
  vista `/auditoria` con filtros; en esta fase solo habrá eventos de
  sesión/perfil/usuarios/roles/sucursales — los demás módulos escribirán en
  esta misma tabla cuando se implementen en fases futuras.
- Identidad visual base (paleta, tipografía, layout, iconos, estados de UI)
  aplicada al shell de administración (navegación, login, perfil, usuarios,
  roles, sucursales, auditoría).

Fuera de alcance de la Fase 1 (fases futuras): catálogo/productos/variantes/
imágenes, inventario y kardex, POS/ventas/clientes/tickets, transferencias,
compras/proveedores, conteos físicos/ajustes, descuentos/promociones,
reportes/ritmo de ventas, ecommerce/pedidos.

## Arquitectura

- Repositorio git único en la raíz (`Downloads/BellaFront`) versionando
  `BellaFront/` y `BellaBack/` juntos.
- **BellaBack**: Node.js + Express 5 + TypeScript + Prisma ORM + PostgreSQL
  (contenedor Docker Compose en desarrollo, ya que la máquina tiene Docker
  pero no Postgres instalado). Capas: `routes → controllers → services →
  repositories → Prisma models`. Middleware de autenticación, autorización
  por permisos y alcance de sucursal. Validación de entrada con Zod.
  `helmet`, `cors` restringido al origin del frontend, `express-rate-limit`
  en endpoints sensibles (login).
- **BellaFront**: React 18 + Vite + TypeScript + React Router. Estructura:
  `pages/` por módulo, `components/` reutilizables, `services/` con un
  cliente API centralizado (ningún componente llama `fetch`/`axios`
  directo), `hooks/`, `context/` (sesión de usuario/permisos), `types/`
  compartidos con los contratos de la API.
- Comunicación REST JSON. JWT de acceso de vida corta (~15 min) + refresh
  token en cookie httpOnly con rotación y revocación en logout.

## Modelo de datos (Fase 1)

- `company_settings` — fila única: nombre comercial, dirección, teléfono,
  redes sociales, logo, moneda.
- `branches` — nombre, dirección, teléfono, horario, responsable, estado.
- `roles`, `permissions`, `role_permissions` — semilla con los 7 roles
  (Administrador, Gerente de sucursal, Vendedor/Cajero, Almacenista,
  Compras, Administrador de tienda online, Consulta/Reportes) y el catálogo
  de permisos individuales definido por el usuario (incluye permisos de
  módulos futuros aunque no tengan UI todavía, para no tener que migrar el
  catálogo de permisos en cada fase).
- `users` — nombre, apellido, nombre mostrado, usuario, correo, teléfono,
  contraseña (hash bcrypt), avatar (`avatar_style`, `avatar_seed`), rol,
  estado, fecha de creación, último acceso.
- `user_branches` — relación N:M usuario↔sucursal, con bandera
  `all_branches` para acceso a todas.
- `audit_logs` — usuario_id, acción, módulo, entidad, entidad_id,
  sucursal_id, detalles (JSON), fecha/hora. Infraestructura reusada por
  todos los módulos futuros vía un servicio `auditService.log(...)`.
- `refresh_tokens` — para poder revocar sesiones individualmente en logout.

## Flujos clave

- **Login**: usuario/correo + contraseña → valida credenciales → emite
  access+refresh token → actualiza `last_login_at` → registra auditoría
  "Inicio de sesión". Rate-limited contra fuerza bruta.
- **Autorización**: middleware decodifica JWT, carga permisos efectivos del
  rol del usuario, y si la ruta opera sobre una sucursal, valida contra
  `user_branches` (o `all_branches`). Todo el enforcement vive en el
  backend; el frontend solo oculta/deshabilita UI como conveniencia.
- **Perfil** (`/perfil`): el usuario edita nombre/apellido/nombre
  mostrado/correo/teléfono/contraseña/avatar. Botón "Guardar cambios" con
  confirmación visual y evento de auditoría "Actualizó su perfil". El
  nombre mostrado es solo para UI; la auditoría siempre referencia al
  usuario por ID.
- **Avatar**: selector visual que genera N variaciones llamando a la API
  pública de DiceBear (`adventurer`) con seeds distintos; el usuario elige
  una, se guarda `{avatar_style, avatar_seed}`. La URL del avatar se
  construye en cualquier lugar del sistema que lo muestre (perfil, menú,
  auditoría, futuro POS) a partir de esos dos campos — no se descargan ni
  almacenan imágenes.
- **Gestión de usuarios/roles/sucursales**: CRUD con validaciones,
  asignación de rol y de sucursal(es) por usuario, activar/desactivar en
  vez de borrar (para no romper referencias históricas de auditoría).
- **`/auditoria`**: lista paginada de eventos con avatar, usuario, acción,
  módulo, registro afectado, sucursal, fecha/hora, detalles; filtros por
  usuario, módulo, sucursal y rango de fechas.

## Identidad visual

Paleta y tipografía exactas a la especificación del usuario (Outfit para
títulos/marca, Inter para interfaz, autoalojadas vía `@fontsource` para no
depender de una CDN externa en runtime). Layout con espacio en blanco
generoso y jerarquía tipográfica clara; tarjetas usadas solo donde aportan
valor real (no todo convertido en cards). Iconos con `lucide-react` (sin
emojis). Estados consistentes (loading / empty / error / success /
disabled) en todo componente que maneje datos. Sin botones que no hagan
nada ni páginas vacías de relleno.

## Testing / verificación

- Backend: `vitest` + `supertest` para los endpoints críticos de
  autenticación, roles/permisos y alcance de sucursal (incluye caso
  negativo: un usuario sin acceso a una sucursal no puede operar sobre
  ella aunque conozca el ID).
- Frontend: verificación manual guiada (login, logout, permisos por rol,
  edición de perfil, cambio de avatar, alta/edición de sucursales,
  asignación de sucursales a usuarios) más revisión de consola/network.
- Se ejecutan ambos proyectos localmente y se corrigen errores antes de
  dar la fase por terminada.

## Fuera de alcance / decisiones diferidas

- Envío real de correo (para futuras fases de ticket digital) queda detrás
  de una interfaz de servicio de email; en Fase 1 no hay flujo que lo
  necesite todavía.
- Almacenamiento de imágenes en disco local (`BellaBack/uploads`) detrás de
  una interfaz reemplazable por almacenamiento en la nube más adelante; en
  Fase 1 no hay subida de imágenes todavía (llega con Catálogo).
- Impresoras térmicas, lectores de código de barras, pasarelas de pago,
  facturación y envíos: no se implementan integraciones reales, pero la
  arquitectura por capas (services/repositories) deja espacio para
  agregarlas sin reescribir controladores.
