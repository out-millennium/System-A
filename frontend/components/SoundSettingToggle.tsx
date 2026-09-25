"use client";

import { useEffect, useState, type ReactNode } from "react";
import {
  soundEnabled,
  applySound,
  playHover,
  notifySoundEnabled,
  setNotifySoundEnabled,
  playNotify,
  notifyVolume,
  setNotifyVolume,
  notifyDnd,
  setNotifyDnd,
} from "@/lib/sound";
import { useT } from "@/lib/i18n";

/* A small pill switch, declared at module scope (not inside render) so it keeps
   a stable identity and never resets state. */
function Switch({ checked }: { checked: boolean }) {
  return (
    <span
      className="relative inline-flex h-6 w-11 items-center rounded-full transition-colors"
      style={{
        background: checked ? "var(--sa-ok, #4ea36b)" : "var(--sa-line-strong)",
      }}
    >
      <span
        className="inline-block h-4 w-4 rounded-full bg-white transition-transform"
        style={{ transform: checked ? "translateX(22px)" : "translateX(4px)" }}
      />
    </span>
  );
}

function ToggleRow({
  checked,
  onClick,
  label,
  dim,
}: {
  checked: boolean;
  onClick: () => void;
  label: ReactNode;
  dim?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={onClick}
      className={`sa-pressable flex items-center gap-3 ${dim ? "opacity-60" : ""}`}
    >
      <Switch checked={checked} />
      <span className="text-sm text-[var(--sa-text-secondary)]">{label}</span>
    </button>
  );
}

/* Dashboard setting: interface sound.
   • Master toggle — hover ticks here; ambient hum on the landing. Shared with
     the landing top-bar toggle.
   • Notification jingle — the cheerful chime on entering the dashboard when
     there are new notifications. It is GATED by the master toggle (master off =
     silence) but can be turned off on its own; turning the master off turns
     everything off, and turning it back on restores the jingle preference. */
export default function SoundSettingToggle() {
  const t = useT();
  const [on, setOn] = useState(false);
  const [notify, setNotify] = useState(true);
  const [volume, setVolume] = useState(0.6);
  const [dnd, setDnd] = useState("");

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOn(soundEnabled());
    setNotify(notifySoundEnabled());
    setVolume(notifyVolume());
    setDnd(notifyDnd());
  }, []);

  async function toggleMaster() {
    const next = !on;
    setOn(next);
    await applySound(next);
    if (next) playHover(); // immediate audible confirmation
  }

  async function toggleNotify() {
    const next = !notify;
    setNotify(next);
    setNotifySoundEnabled(next);
    // Preview the jingle when enabling (only audible if master sound is on too).
    if (next) await playNotify();
  }

  return (
    <section className="sa-card mt-4 p-6 md:p-7">
      <p className="sa-eyebrow mb-2">{t("settings.soundTitle")}</p>
      <p className="mb-5 text-xs text-[var(--sa-text-tertiary)]">
        {t("settings.soundLead")}
      </p>

      {/* Master interface sound */}
      <ToggleRow
        checked={on}
        onClick={toggleMaster}
        label={on ? t("settings.soundOn") : t("settings.soundOff")}
      />

      {/* Notification jingle — gated by the master toggle. */}
      <div className="mt-6 border-t border-[var(--sa-line-faint)] pt-5">
        <p className="mb-1 text-sm text-[var(--sa-text)]">
          {t("settings.notifSoundTitle")}
        </p>
        <p className="mb-4 text-xs text-[var(--sa-text-tertiary)]">
          {t("settings.notifSoundLead")}
        </p>
        <ToggleRow
          checked={notify}
          onClick={toggleNotify}
          dim={!on}
          label={notify ? t("settings.notifSoundOn") : t("settings.notifSoundOff")}
        />
        {!on && (
          <p className="mt-2 text-[0.6875rem] text-[var(--sa-text-quaternary)]">
            {t("settings.notifSoundMuted")}
          </p>
        )}

        {/* Volume */}
        <div className="mt-4">
          <label className="mb-1 block text-xs text-[var(--sa-text-tertiary)]">
            {t("settings.notifVolume")}: {Math.round(volume * 100)}%
          </label>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={volume}
            onChange={(e) => {
              const v = parseFloat(e.target.value);
              setVolume(v);
              setNotifyVolume(v);
            }}
            onMouseUp={() => void playNotify()}
            className="sa-range w-48 max-w-full"
          />
        </div>

        {/* Do Not Disturb window */}
        <div className="mt-4">
          <label className="mb-1 block text-xs text-[var(--sa-text-tertiary)]">
            {t("settings.notifDnd")}
          </label>
          <input
            type="text"
            inputMode="text"
            placeholder="22:00-07:00"
            value={dnd}
            onChange={(e) => {
              const v = e.target.value.trim();
              setDnd(v);
              setNotifyDnd(v);
            }}
            className="sa-input sa-mono w-40 !py-1.5 text-xs"
          />
          <p className="mt-1 text-[0.6875rem] text-[var(--sa-text-quaternary)]">
            {t("settings.notifDndHint")}
          </p>
        </div>
      </div>
    </section>
  );
}
