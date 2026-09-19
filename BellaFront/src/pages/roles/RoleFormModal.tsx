import { type FormEvent, useState } from "react";
import { Modal } from "../../components/common/Modal";
import { ApiError } from "../../services/apiClient";
import * as roleService from "../../services/roleService";
import type { Role } from "../../types/api";

interface RoleFormModalProps {
  open: boolean;
  onClose: () => void;
  onSaved: (role: Role) => void;
  grouped: [string, string[]][];
  moduleLabels: Record<string, string>;
  permissionLabels: Record<string, string>;
}

// Codes are derived from the name (not hand-typed) so a non-technical admin
// never has to think about the "solo minúsculas/números/guion bajo" backend
// rule — they type a normal name and this mirrors it into a valid code,
// which they can still override for special cases.
function slugify(name: string): string {
  // Drop combining diacritical marks (U+0300-U+036F) left behind by NFD
  // normalization character-by-character, rather than a regex literal
  // containing the marks themselves — keeps this file's source free of
  // invisible/hard-to-diff combining characters.
  const withoutAccents = Array.from(name.normalize("NFD"))
    .filter((ch) => {
      const code = ch.codePointAt(0) ?? 0;
      return code < 0x0300 || code > 0x036f;
    })
    .join("");
  return withoutAccents
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/^([0-9])/, "r_$1");
}

export function RoleFormModal({ open, onClose, onSaved, grouped, moduleLabels, permissionLabels }: RoleFormModalProps) {
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [codeTouched, setCodeTouched] = useState(false);
  const [description, setDescription] = useState("");
  const [permissions, setPermissions] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleNameChange(value: string) {
    setName(value);
    if (!codeTouched) setCode(slugify(value));
  }

  function togglePermission(pcode: string) {
    setPermissions((prev) => {
      const next = new Set(prev);
      if (next.has(pcode)) next.delete(pcode);
      else next.add(pcode);
      return next;
    });
  }

  function reset() {
    setName("");
    setCode("");
    setCodeTouched(false);
    setDescription("");
    setPermissions(new Set());
    setError(null);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const role = await roleService.createRole({
        code,
        name,
        description,
        permissions: Array.from(permissions),
      });
      onSaved(role);
      reset();
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo crear el rol.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={() => { reset(); onClose(); }}
      title="Nuevo rol"
    >
      <form onSubmit={handleSubmit} className="role-form">
        <label>Nombre
          <input value={name} onChange={(e) => handleNameChange(e.target.value)} required maxLength={100} placeholder="p. ej. Encargado de caja" />
        </label>
        <label>Código interno
          <input
            value={code}
            onChange={(e) => { setCode(e.target.value); setCodeTouched(true); }}
            required
            maxLength={50}
            pattern="[a-z][a-z0-9_]*"
            title="Minúsculas, números y guion bajo; debe iniciar con una letra"
          />
        </label>
        <p className="role-form__hint">El código se usa internamente y no se puede cambiar después. Minúsculas, números y guion bajo.</p>
        <label>Descripción
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} required maxLength={500} rows={2} placeholder="¿Qué puede hacer este rol?" />
        </label>

        <div className="role-form__permissions">
          <span className="role-form__permissions-label">Permisos iniciales</span>
          <div className="role-form__permissions-list">
            {grouped.map(([mod, codes]) => (
              <div key={mod} className="role-card__module">
                <p className="role-card__module-label">{moduleLabels[mod] ?? mod}</p>
                <div className="role-card__permissions">
                  {codes.map((pcode) => {
                    const on = permissions.has(pcode);
                    return (
                      <button
                        type="button"
                        key={pcode}
                        onClick={() => togglePermission(pcode)}
                        className={`role-card__permission role-card__permission--toggle${on ? " is-on" : " is-off"}`}
                        title={pcode}
                      >
                        {permissionLabels[pcode] ?? pcode}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>

        {error && <p className="role-form__error">{error}</p>}
        <button type="submit" disabled={saving}>{saving ? "Creando..." : "Crear rol"}</button>
      </form>
    </Modal>
  );
}
