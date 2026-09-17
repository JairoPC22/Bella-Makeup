import { useState } from "react";
import { RefreshCw } from "lucide-react";
import { getAvatarOptions, changeAvatar } from "../../services/profileService";
import type { User } from "../../types/api";

export function AvatarPicker({ user: _user, onChanged }: { user: User; onChanged: (u: User) => void }) {
  const [options, setOptions] = useState<Array<{ seed: string; url: string }>>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState<string | null>(null);

  async function loadOptions() {
    setLoading(true);
    try {
      setOptions(await getAvatarOptions(6));
    } finally {
      setLoading(false);
    }
  }

  async function pick(seed: string) {
    setSaving(seed);
    try {
      const updated = await changeAvatar(seed);
      onChanged(updated);
      setOptions([]);
    } finally {
      setSaving(null);
    }
  }

  return (
    <div className="avatar-picker">
      <button type="button" onClick={loadOptions} disabled={loading} className="avatar-picker__generate">
        <RefreshCw size={16} className={loading ? "spin" : undefined} /> Generar opciones de avatar
      </button>
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
