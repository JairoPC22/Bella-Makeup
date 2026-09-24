import { z } from "zod";

// El `.uuid()` estricto de Zod rechaza los ids de seed determinísticos
// ("00000000-...-000000000001") usados por las sucursales y usuarios
// sembrados: son strings con forma de UUID válida pero fallan el chequeo
// de versión/variante RFC. Este regex valida solo la forma, no la versión.
export const uuidShape = z
  .string()
  .regex(/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/, "Invalid UUID");
