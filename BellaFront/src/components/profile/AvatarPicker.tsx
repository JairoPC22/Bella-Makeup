import { useState } from "react";
import { RefreshCw } from "lucide-react";
import { getAvatarOptions, changeAvatar } from "../../services/profileService";
import { ApiError } from "../../services/apiClient";
import type { User } from "../../types/api";

export function AvatarPicker({ user: _user, onChanged }: { user: User; onChanged: (u: User) => void }) {
  const [options, setOptions] = useState<Array<{ seed: string; url: string }>>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function loadOptions() {
    setLoading(true);
    setError(null);
    try {
      setOptions(await getAvatarOptions(6));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudieron generar opciones de avatar.");
    } finally {
      setLoading(false);
    }
  }

  async function pick(seed: string) {
    setSaving(seed);
    setError(null);
    try {
      const updated = await changeAvatar(seed);
      onChanged(updated);
      setOptions([]);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo aplicar el avatar.");
    } finally {
      setSaving(null);
    }
  }

  return (
    <div className="avatar-picker">
      <button type="button" onClick={loadOptions} disabled={loading} className="avatar-picker__generate">
        <RefreshCw size={16} className={loading ? "spin" : undefined} /> Generar opciones de avatar
      </button>
      {error && <p className="avatar-picker__error">{error}</p>}
      {options.length > 0 && (
        <div className="avatar-picker__grid">
          {options.map((opt) => (
            <button
              type="button"
              key={opt.seed}
              className="avatar-picker__option"
              disabled={saving === opt.seed}
              onClick={() => pick(opt.seed)}
            >
              <img src={opt.url} alt="Opción de avatar" width={64} height={64} />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
