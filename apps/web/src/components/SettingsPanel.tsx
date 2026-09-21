import type { Settings } from "../lib/api";

type Props = {
  open: boolean;
  settings: Settings;
  onClose: () => void;
  onChange: (s: Settings) => void;
  onOpenApiKey?: () => void;
};

export function SettingsPanel({
  open,
  settings,
  onClose,
  onChange,
  onOpenApiKey,
}: Props) {
  if (!open) return null;
  return (
    <aside className="settings-panel">
      <header>
        <h2>Settings</h2>
        <button type="button" className="linkish" onClick={onClose}>
          Close
        </button>
      </header>
      <p className="muted">
        Bridge &amp; Vision API health live in the main exam UI (left column).
      </p>
      <p>
        <button
          type="button"
          className="secondary"
          onClick={() => {
            onClose();
            onOpenApiKey?.();
          }}
        >
          Change API key…
        </button>
      </p>
      <label>
        Bridge URL
        <input
          value={settings.bridgeUrl}
          onChange={(e) => onChange({ ...settings, bridgeUrl: e.target.value })}
        />
      </label>
      <label>
        Vision model
        <input
          value={settings.model}
          onChange={(e) => onChange({ ...settings, model: e.target.value })}
          placeholder="gemini-3.6-flash"
        />
      </label>
      <label>
        Module hint
        <select
          value={settings.moduleHint}
          onChange={(e) =>
            onChange({
              ...settings,
              moduleHint: e.target.value as Settings["moduleHint"],
            })
          }
        >
          <option value="auto">Auto-detect</option>
          <option value="listening">Listening</option>
          <option value="reading">Reading</option>
        </select>
      </label>
    </aside>
  );
}
