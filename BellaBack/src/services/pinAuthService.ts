import { comparePassword, hashPassword } from "../utils/password";
import {
  findUserById,
  updateUser,
  findPinSupervisorCandidates,
  findUserBranchScope,
} from "../repositories/userRepository";
import { logAudit } from "./auditService";
import { AppError } from "../utils/AppError";

// ---------------------------------------------------------------------------
// Primitiva de autorización por PIN de supervisor.
//
// NO es el sistema de permisos de la app (requirePermission en
// middleware/permissions.ts) ni lo reemplaza. Responden preguntas distintas:
//
//   requirePermission(code)  -> "¿el usuario logueado puede hacer esto?"
//   verifySupervisorPin(...) -> "¿hay una SEGUNDA persona con autoridad
//                               presente ahora mismo, aprobando esto?"
//
// Es el equivalente al giro de llave del gerente en retail real: el cajero
// sigue logueado, el supervisor se acerca y teclea 4-6 dígitos en la
// pantalla del cajero, y la acción se atribuye a ambos. Por eso verify-pin
// corre sobre el token del CAJERO — el supervisor nunca inicia sesión.
//
// Este módulo expone a propósito solo dos funciones y no guarda nada por sí
// mismo. Otros módulos (devoluciones, mermas) llaman a verifySupervisorPin,
// reciben un supervisorId y lo registran en su PROPIA bitácora.
// ---------------------------------------------------------------------------

// 4-6 dígitos, nada más. Compartido con pin.validators.ts para que el
// chequeo en el límite de la API y el defensivo a nivel de servicio nunca
// se desalineen.
export const PIN_REGEX = /^\d{4,6}$/;

// Un solo mensaje para todo modo de falla de verify-pin. Deliberadamente
// vago: no debe revelar si el PIN estaba mal formado, si existe alguien con
// ese permiso en la sucursal, o si simplemente los dígitos no coincidieron.
// Distinguir esos casos permitiría a un cajero sondear el organigrama.
// Sigue siendo accionable: nombra las dos causas reales (PIN incorrecto, o
// esta persona no puede autorizar ESTA acción) para que el cajero sepa que
// debe buscar a otro supervisor.
export const PIN_GENERIC_ERROR = "PIN inválido o sin autorización para esta acción.";

export type VerifyPinResult =
  | { ok: true; supervisorId: string; supervisorName: string }
  | { ok: false };

// Solo autoservicio, replicando la forma de profileService.changePassword
// (verificar contraseña actual, hashear el nuevo secreto con el mismo
// utilitario bcrypt, persistir, auditar).
//
// Se exige reingresar la contraseña de login porque esto establece una
// SEGUNDA credencial: sin eso, cualquiera que llegara a una sesión de
// supervisor ya logueada y desatendida podría asignarse un PIN conocido y
// autoautorizarse futuras acciones sensibles.
//
// A propósito no existe un endpoint para que un admin fije el PIN de otro:
// un PIN que un tercero puede establecer deja de ser evidencia de que esa
// persona estuvo presente, se vuelve otra contraseña compartida más.
//
// No hay restricción de rol aquí: cualquier usuario autenticado puede fijar
// su propio PIN. Es inofensivo por construcción, ya que un PIN solo
// autoriza algo si el rol de su dueño tiene el permiso correspondiente.
export async function setOwnPin(userId: string, pin: string, currentPassword: string): Promise<void> {
  const user = await findUserById(userId);
  if (!user || !(await comparePassword(currentPassword, user.passwordHash))) {
    throw new AppError(400, "La contraseña actual no es correcta");
  }
  // Defensivo: pin.validators.ts ya valida esto en el límite de la API, pero
  // esta función está exportada y futuros llamadores podrían no pasar por ahí.
  if (!PIN_REGEX.test(pin)) {
    throw new AppError(400, "El PIN debe tener entre 4 y 6 dígitos numéricos.");
  }

  await updateUser(userId, { pinHash: await hashPassword(pin) });

  // Registra QUE se fijó un PIN, nunca el PIN ni su hash.
  await logAudit({
    userId,
    action: "users.set_pin",
    module: "users",
    entityType: "user",
    entityId: userId,
  });
}

// Devuelve un resultado discriminado en vez de lanzar en el camino de
// fallo, así el controlador puede emitir el cuerpo { ok: false, error } que
// exige la especificación en vez del { message } genérico de errorHandler.
export async function verifySupervisorPin(
  actorId: string,
  pin: string,
  requiredPermission: string
): Promise<VerifyPinResult> {
  const actor = await findUserBranchScope(actorId);
  if (!actor) throw new AppError(401, "Usuario no encontrado");

  // Toda falla sale por aquí para que las cuatro causas (PIN mal formado,
  // sin candidatos, candidatos pero ninguno coincide, dígitos incorrectos)
  // sean indistinguibles para quien llama: mismo status, mismo cuerpo, y una
  // entrada de auditoría que registra el intento SIN nombrar a quién se
  // consideró.
  const fail = async (): Promise<VerifyPinResult> => {
    await logAudit({
      userId: actorId,
      action: "auth.verify_pin_failed",
      module: "auth",
      details: { requiredPermission },
    });
    return { ok: false };
  };

  // Validado aquí y no en el validador a propósito: rechazar un PIN mal
  // formado con el 400 "Datos inválidos" de Zod filtraría que el PIN nunca
  // llegó a compararse, justo la distinción que PIN_GENERIC_ERROR oculta.
  if (!PIN_REGEX.test(pin)) return fail();

  const branchIds = actor.allBranches ? undefined : actor.userBranches.map((ub) => ub.branchId);
  const candidates = await findPinSupervisorCandidates(requiredPermission, branchIds);

  for (const candidate of candidates) {
    // candidate.pinHash no es null por el filtro `pinHash: { not: null }`
    // del repositorio; la aserción non-null solo satisface el tipo
    // `string | null` que genera Prisma.
    if (await comparePassword(pin, candidate.pinHash!)) {
      // El éxito se atribuye a AMBAS partes: userId es el cajero cuya sesión
      // ejecutó la acción, entityId/supervisorId es quien la aprobó. El
      // módulo que llama registra el mismo supervisorId en su propia
      // bitácora para poder cruzarlos.
      await logAudit({
        userId: actorId,
        action: "auth.verify_pin",
        module: "auth",
        entityType: "user",
        entityId: candidate.id,
        details: { requiredPermission, supervisorId: candidate.id },
      });
      return { ok: true, supervisorId: candidate.id, supervisorName: candidate.displayName };
    }
  }

  return fail();
}
