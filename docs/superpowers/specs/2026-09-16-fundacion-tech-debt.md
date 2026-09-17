# Bella Makeup — Fase 1 (Fundación): deuda técnica registrada

Fecha: 2026-09-17

Este documento registra los hallazgos **Minor** de la revisión final de rama de
la Fase 1 que se decidió **no** corregir de inmediato (quedan fuera del fix
final), junto con el razonamiento. Los hallazgos **Important** de esa misma
revisión sí se corrigieron antes de cerrar la fase — ver
`docs/superpowers/plans/2026-09-16-fundacion.md` y el commit de cierre para el
detalle.

Cada ítem debe revisarse/atacarse cuando la fase correspondiente lo toque, no
antes — no representan bugs de seguridad ni de corrección funcional.

## Backend

- **`requireBranchScope` middleware no está cableado en ninguna ruta de
  producción todavía** (solo se prueba en su propio test). No es un hueco de
  seguridad hoy porque las únicas rutas parametrizadas por sucursal son
  admin-only (`branches.manage`). Será relevante en cuanto Fase 2/3
  (inventario, ventas) agreguen rutas verdaderamente scoped por sucursal —
  recordar usarlo ahí.
- **`userService.assignBranches` llama a `prisma.$transaction` directamente**
  en vez de pasar por `userRepository`, rompiendo la regla de capas
  (`services` deberían llamar solo a `repositories`). La transacción en sí es
  correcta; es una violación de estilo, no de comportamiento.
- **`Modal` no tiene accesibilidad de diálogo real**: falta `role="dialog"`,
  `aria-modal`, cierre con Escape, focus trap y restauración de foco al
  cerrar. Afecta a `UserFormModal` y `BranchFormModal`. Vale la pena
  resolverlo una vez, en el componente compartido, cuando se retome trabajo
  de UI.
- **`GET /api/branches` devuelve todas las sucursales a cualquier usuario con
  `branches.view`**, sin filtrar por asignación. Es una decisión defendible
  para Fase 1 (el admin necesita ver todo), pero conviene decidirlo
  explícitamente cuando haya roles con acceso limitado a sucursales
  específicas operando activamente.
- **`logAudit` se llama sin bloque de manejo de fallo dedicado** después de
  cada escritura — si el insert de auditoría fallara, hoy eso propagaría como
  un 500 general aunque la escritura principal ya haya tenido éxito. Decidir
  la convención (¿debe una falla de auditoría hacer fallar la operación
  completa, o solo registrarse y continuar?) antes de que el patrón se copie
  en las próximas 8 fases.
- **Posible vector de escalación latente**: `users.create`/`users.edit`
  permiten asignar cualquier `roleId`, incluido `admin`, sin una verificación
  adicional de "¿tiene el usuario que hace la petición permiso para otorgar
  ese rol?". Ningún rol sembrado se ve afectado hoy (solo `admin` tiene
  `users.create`/`users.edit`), pero vale la pena una revisión antes de abrir
  la gestión de usuarios a roles menos privilegiados.
- **`tests/branches.test.ts` no limpia las filas que crea** (a diferencia de
  `users.test.ts`/`permissions.test.ts`, que sí lo hacen tras el hallazgo de
  Tarea 6). Aplicar el mismo patrón de limpieza ahí.
- Versión de `@types/express` puede no coincidir exactamente con `express@^5`
  instalado — revisar y alinear cuando se toque `package.json` del backend de
  nuevo.

## Frontend

- **Stack entregado difiere del especificado en el plan** (documentando la
  desviación, no es un bug): plan/spec pedían React 18 + React Router 6; lo
  instalado por `create-vite` en la fecha de la Fase 1 fue React 19.2 +
  React Router 7.18 + TypeScript 6 + Vite 8. Todo funciona y compila limpio;
  es una nota de registro, no una acción pendiente.
- **`apiClient` no tiene manejo global de "sesión expirada"**: si el refresh
  falla, el error se muestra como un error de página individual en vez de
  redirigir limpiamente a `/login` con un mensaje claro. Vale la pena resolver
  junto con la guarda de rutas por permiso (`ProtectedRoute`) cuando se
  retome esa área.
- **`.qa-screenshots/` y `.qa-screenshots-fix/`** son carpetas de salida de
  verificación visual (Playwright) — quedaron ignoradas por git; no requieren
  acción, son artefactos de QA, no parte del producto.

## Encontrado en la revisión final (re-review del fix wave)

- **Filtro "Hasta" en `/auditoria` excluye el día seleccionado**: el input de
  fecha manda `"YYYY-MM-DD"`, que `new Date()` interpreta como medianoche UTC,
  y se aplica como `lte` — si "Desde" y "Hasta" son el mismo día, la
  consulta devuelve cero filas. Arreglo sugerido: en el backend, tratar
  `to` como el final del día (`23:59:59.999`) en vez del inicio.
- **La ruta 404 catch-all queda fuera de `ProtectedRoute`**: una URL mal
  escrita estando no autenticado muestra la página 404 en vez de redirigir a
  `/login`. Bajo impacto, pero vale la pena anidarla correctamente cuando se
  retome el router.
- **Cambiar la contraseña revoca la sesión propia del usuario que la cambia**,
  sin re-emitir tokens ni redirigir a login — el usuario queda con una sesión
  "viva" en el navegador pero inválida en el backend hasta el próximo
  refresh fallido (~15 min). Falta parear la revocación con un re-login
  forzado inmediato o una re-emisión de tokens para la sesión actual.
- **La tabla `refresh_tokens` crece sin límite**: cada rotación inserta una
  fila nueva y ninguna rutina limpia las expiradas/revocadas. No es un bug
  de corrección, pero conviene una tarea de limpieza (cron o query on-demand)
  antes de que el volumen de uso lo vuelva relevante.
- **`/configuracion` tiene el mismo hueco que el hallazgo Importante #6
  (antes de corregirlo)**: la ruta no está protegida por permiso (a
  propósito, la vista es abierta), pero el botón "Guardar cambios" tampoco
  tiene un `PermissionGate` — un usuario sin `settings.manage` ve el
  formulario completo y solo al intentar guardar recibe un 403. Arreglo
  barato: envolver el botón de guardar en `PermissionGate code="settings.manage"`.
- **`tests/auditService.test.ts` sigue teniendo una condición de carrera
  pre-existente** bajo ejecución paralela de vitest (mismo patrón que se
  identificó y quedó abierto en la Tarea 4): `deleteMany()` sin filtro +
  aserciones de conteo exacto, corriendo en paralelo con otros archivos que
  también generan filas de auditoría. Cada test pasa de forma aislada o con
  `--no-file-parallelism`. Aplicar el mismo patrón de aislamiento ya usado en
  `users.test.ts`/`permissions.test.ts`.

## Notas generales

- La pila de hallazgos "Minor" de las revisiones por tarea (colores
  hardcodeados sin token equivalente, tipados `any` en algunos inputs de
  servicio ya validados por Zod una capa arriba, etc.) se consideró segura de
  dejar diferida — ninguno afecta corrección, seguridad, ni la experiencia
  visible del producto. Si se retoma una pasada de limpieza de diseño, es un
  buen momento para: (a) agregar tokens `--color-neutral-*`/`--color-danger-*`
  y reemplazar los hex sueltos que los necesitan, (b) revisar los tipados
  `any` mencionados.
