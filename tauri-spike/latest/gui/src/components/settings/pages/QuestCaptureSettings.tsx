import { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/commons/Button';
import { Typography } from '@/components/commons/Typography';
import {
  SettingsPageLayout,
  SettingsPagePaneLayout,
} from '@/components/settings/SettingsPageLayout';
import { useQuestCaptureSettings } from '@/hooks/quest-capture';

const fieldClass =
  'w-full min-h-10 rounded-[9px] border border-background-50/60 dark:border-background-10/10 bg-background-60/60 dark:bg-background-10/[0.04] px-3 text-ui-xs text-background-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-background-40 dark:focus-visible:ring-accent-background-20 disabled:opacity-50';

function CaptureIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
    >
      <rect x="3" y="4" width="18" height="13" rx="2" />
      <path d="M8 21h8M12 17v4" />
      <circle cx="12" cy="10.5" r="2.5" />
    </svg>
  );
}

function Field({
  label,
  help,
  children,
}: {
  label: string;
  help?: string;
  children: ReactNode;
}) {
  return (
    <label className="flex min-w-0 flex-col gap-1.5">
      <span className="text-ui-xs font-medium text-background-10">{label}</span>
      {children}
      {help && (
        <span className="text-ui-2xs leading-relaxed text-background-30">
          {help}
        </span>
      )}
    </label>
  );
}

function Toggle({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex min-h-11 cursor-pointer items-center justify-between gap-4 rounded-[10px] border border-background-50/50 dark:border-background-10/[0.07] bg-background-60/35 dark:bg-background-10/[0.025] px-3 py-2">
      <span className="min-w-0">
        <span className="block text-ui-xs font-medium text-background-10">
          {label}
        </span>
        <span className="block text-ui-2xs leading-relaxed text-background-30">
          {description}
        </span>
      </span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="h-5 w-9 shrink-0 cursor-pointer accent-accent-background-20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-background-40 dark:focus-visible:ring-accent-background-20"
      />
    </label>
  );
}

export function QuestCaptureSettingsPage() {
  const navigate = useNavigate();
  const { settings, isLoaded, update, applyProfile, reset } =
    useQuestCaptureSettings();

  if (!isLoaded) {
    return (
      <SettingsPageLayout>
        <div className="quest-capture-surface rounded-[14px] border border-background-50/50 p-5 text-ui-xs text-background-30">
          Loading Quest capture settings...
        </div>
      </SettingsPageLayout>
    );
  }

  return (
    <SettingsPageLayout>
      <div className="flex w-full flex-col gap-2">
        <SettingsPagePaneLayout icon={<CaptureIcon />} id="quest-capture">
          <>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <Typography variant="main-title">Quest capture</Typography>
                <p className="mt-1 max-w-2xl text-ui-2xs leading-relaxed text-background-30">
                  Configure the dedicated single-eye mirror window used by OBS.
                  Quest menus and boundary overlays may still appear because the
                  headset composites them into the captured frame.
                </p>
              </div>
              <Button variant="secondary" onClick={() => navigate('/remote')}>
                Open capture studio
              </Button>
            </div>

            <div className="mt-5 settings-grid [--settings-grid-cols:3] [--settings-grid-min:10rem] gap-2">
              {(['low-latency', 'balanced', 'quality'] as const).map(
                (profile) => (
                  <button
                    key={profile}
                    type="button"
                    onClick={() => applyProfile(profile)}
                    className={`min-h-11 rounded-[10px] border px-3 py-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-background-40 dark:focus-visible:ring-accent-background-20 ${
                      settings.profile === profile
                        ? 'border-accent-background-40 bg-accent-background-40/10 text-accent-background-40 dark:border-accent-background-20/60 dark:bg-accent-background-20/10 dark:text-accent-background-10'
                        : 'border-background-50/60 dark:border-background-10/10 bg-background-60/40 text-background-20 hover:border-background-40'
                    }`}
                  >
                    <span className="block text-ui-xs font-semibold">
                      {profile === 'low-latency'
                        ? 'Low latency'
                        : profile[0].toUpperCase() + profile.slice(1)}
                    </span>
                    <span className="mt-0.5 block text-ui-2xs leading-snug text-background-30">
                      {profile === 'low-latency'
                        ? 'Fast response on clean Wi-Fi'
                        : profile === 'balanced'
                          ? 'Small buffer for variable Wi-Fi'
                          : 'More detail with higher load'}
                    </span>
                  </button>
                )
              )}
            </div>
          </>
        </SettingsPagePaneLayout>

        <SettingsPagePaneLayout icon={<CaptureIcon />} id="quest-framing">
          <>
            <Typography variant="main-title">Framing</Typography>
            <div className="settings-grid gap-4 pt-4">
              <Field
                label="Eye"
                help="Left is the recommended clean spectator view."
              >
                <select
                  value={settings.eye}
                  onChange={(e) =>
                    update({ eye: e.target.value as typeof settings.eye })
                  }
                  className={fieldClass}
                >
                  <option value="left">Left eye</option>
                  <option value="right">Right eye</option>
                  <option value="both">Both eyes</option>
                  <option value="manual">Manual crop</option>
                </select>
              </Field>
              <Field
                label="Aspect ratio"
                help="Center crop preserves proportions; the image is never stretched."
              >
                <select
                  value={settings.aspect}
                  onChange={(e) =>
                    update({ aspect: e.target.value as typeof settings.aspect })
                  }
                  className={fieldClass}
                >
                  <option value="16:9">16:9 stream</option>
                  <option value="16:10">16:10</option>
                  <option value="4:3">4:3</option>
                  <option value="1:1">Square</option>
                  <option value="source">Source frame</option>
                </select>
              </Field>
              <Field label="Rotation">
                <select
                  value={settings.rotation}
                  onChange={(e) =>
                    update({
                      rotation: Number(
                        e.target.value
                      ) as typeof settings.rotation,
                    })
                  }
                  className={fieldClass}
                >
                  {[0, 90, 180, 270].map((value) => (
                    <option key={value} value={value}>
                      {value} degrees
                    </option>
                  ))}
                </select>
              </Field>
              <Toggle
                label="Mirror horizontally"
                description="Flip the captured frame before OBS receives it."
                checked={settings.flipHorizontal}
                onChange={(checked) => update({ flipHorizontal: checked })}
              />
            </div>

            {settings.eye === 'manual' && (
              <div className="quest-capture-callout mt-4 rounded-[12px] border border-accent-background-20/25 bg-accent-background-20/[0.055] p-3">
                <p className="mb-3 text-ui-2xs leading-relaxed text-background-20">
                  Manual crop values are percentages of the full Quest frame.
                </p>
                <div className="settings-grid [--settings-grid-cols:4] [--settings-grid-min:6rem] gap-3">
                  {(['x', 'y', 'width', 'height'] as const).map((key) => (
                    <Field
                      key={key}
                      label={
                        key === 'x' || key === 'y'
                          ? key.toUpperCase()
                          : key[0].toUpperCase() + key.slice(1)
                      }
                    >
                      <input
                        type="number"
                        min={key === 'width' || key === 'height' ? 1 : 0}
                        max="100"
                        value={settings.manualCrop?.[key] ?? 0}
                        onChange={(e) =>
                          update({
                            manualCrop: {
                              ...settings.manualCrop!,
                              [key]: Number(e.target.value),
                            },
                          })
                        }
                        className={fieldClass}
                      />
                    </Field>
                  ))}
                </div>
              </div>
            )}
          </>
        </SettingsPagePaneLayout>

        <SettingsPagePaneLayout icon={<CaptureIcon />} id="quest-video">
          <>
            <Typography variant="main-title">
              Video quality and latency
            </Typography>
            <div className="settings-grid gap-4 pt-4">
              <Field
                label="Codec"
                help="H.264 starts faster and is the compatibility default."
              >
                <select
                  value={settings.codec}
                  onChange={(e) =>
                    update({ codec: e.target.value as typeof settings.codec })
                  }
                  className={fieldClass}
                >
                  <option value="h264">H.264</option>
                  <option value="h265">H.265</option>
                </select>
              </Field>
              <Field label="Resolution limit">
                <select
                  value={settings.maxSize}
                  onChange={(e) => update({ maxSize: Number(e.target.value) })}
                  className={fieldClass}
                >
                  {[720, 1080, 1440, 1920, 2560, 4096].map((value) => (
                    <option key={value} value={value}>
                      {value === 4096 ? 'Native limit' : `${value}px`}
                    </option>
                  ))}
                </select>
              </Field>
              <Field
                label={`Video bitrate: ${settings.bitrateMbps} Mbps`}
                help="Lower this first when Wi-Fi is unstable."
              >
                <input
                  type="range"
                  min="2"
                  max="30"
                  step="1"
                  value={settings.bitrateMbps}
                  onChange={(e) =>
                    update({ bitrateMbps: Number(e.target.value) })
                  }
                  className="min-h-10 w-full accent-accent-background-20"
                />
              </Field>
              <Field label="Frame-rate limit">
                <select
                  value={settings.maxFps}
                  onChange={(e) => update({ maxFps: Number(e.target.value) })}
                  className={fieldClass}
                >
                  {[30, 45, 60, 72, 90].map((value) => (
                    <option key={value} value={value}>
                      {value} FPS
                    </option>
                  ))}
                </select>
              </Field>
              <Field
                label={`Jitter buffer: ${settings.bufferMs} ms`}
                help="Zero is fastest. Add a buffer only if frames stutter."
              >
                <input
                  type="range"
                  min="0"
                  max="120"
                  step="10"
                  value={settings.bufferMs}
                  onChange={(e) => update({ bufferMs: Number(e.target.value) })}
                  className="min-h-10 w-full accent-accent-background-20"
                />
              </Field>
            </div>
          </>
        </SettingsPagePaneLayout>

        <SettingsPagePaneLayout
          icon={<CaptureIcon />}
          id="quest-audio-settings"
          defaultCollapsed
        >
          <>
            <Typography variant="main-title">Studio audio</Typography>
            <p className="pt-2 text-ui-2xs leading-relaxed text-background-30">
              These channels start with the mirror when you use Start studio
              session. OBS or Loopback controls the final live levels.
            </p>
            <div className="settings-grid gap-3 pt-4">
              <Toggle
                label="Quest game audio"
                description="Capture the complete headset output as a named macOS source."
                checked={settings.gameAudioEnabled}
                onChange={(checked) => update({ gameAudioEnabled: checked })}
              />
              <Toggle
                label="Quest microphone"
                description="Capture the headset microphone as a separate named source."
                checked={settings.microphoneEnabled}
                onChange={(checked) => update({ microphoneEnabled: checked })}
              />
              <Field label="Game audio codec">
                <select
                  value={settings.gameAudioCodec}
                  onChange={(e) =>
                    update({
                      gameAudioCodec: e.target
                        .value as typeof settings.gameAudioCodec,
                    })
                  }
                  className={fieldClass}
                >
                  <option value="opus">Opus</option>
                  <option value="aac">AAC</option>
                  <option value="raw">Raw PCM</option>
                </select>
              </Field>
              <Field label="Microphone codec">
                <select
                  value={settings.microphoneCodec}
                  onChange={(e) =>
                    update({
                      microphoneCodec: e.target
                        .value as typeof settings.microphoneCodec,
                    })
                  }
                  className={fieldClass}
                >
                  <option value="opus">Opus</option>
                  <option value="aac">AAC</option>
                  <option value="raw">Raw PCM</option>
                </select>
              </Field>
              <Field label={`Game buffer: ${settings.gameAudioBufferMs} ms`}>
                <input
                  type="range"
                  min="40"
                  max="160"
                  step="20"
                  value={settings.gameAudioBufferMs}
                  onChange={(e) =>
                    update({ gameAudioBufferMs: Number(e.target.value) })
                  }
                  className="min-h-10 w-full accent-accent-background-20"
                />
              </Field>
              <Field
                label={`Microphone buffer: ${settings.microphoneBufferMs} ms`}
              >
                <input
                  type="range"
                  min="40"
                  max="160"
                  step="20"
                  value={settings.microphoneBufferMs}
                  onChange={(e) =>
                    update({ microphoneBufferMs: Number(e.target.value) })
                  }
                  className="min-h-10 w-full accent-accent-background-20"
                />
              </Field>
            </div>
          </>
        </SettingsPagePaneLayout>

        <SettingsPagePaneLayout
          icon={<CaptureIcon />}
          id="quest-window"
          defaultCollapsed
        >
          <>
            <Typography variant="main-title">Mirror window</Typography>
            <div className="settings-grid gap-3 pt-4">
              <Toggle
                label="Borderless output"
                description="Keep the OBS capture free of title-bar chrome."
                checked={settings.borderless}
                onChange={(checked) => update({ borderless: checked })}
              />
              <Toggle
                label="Always on top"
                description="Keep the mirror visible above other desktop windows."
                checked={settings.alwaysOnTop}
                onChange={(checked) => update({ alwaysOnTop: checked })}
              />
              <Toggle
                label="Adaptive Wi-Fi quality"
                description="After repeated high ADB round-trip times, lower bitrate, then resolution, then FPS. Changes restart only the mirror."
                checked={settings.adaptiveQuality}
                onChange={(checked) => update({ adaptiveQuality: checked })}
              />
              <Toggle
                label="Reconnect interrupted mirror"
                description="Retry only the owned mirror after an unexpected process exit."
                checked={settings.autoReconnect}
                onChange={(checked) => update({ autoReconnect: checked })}
              />
              <Field label="Renderer">
                <select
                  value={settings.renderer}
                  onChange={(e) =>
                    update({
                      renderer: e.target.value as typeof settings.renderer,
                    })
                  }
                  className={fieldClass}
                >
                  <option value="auto">Automatic</option>
                  <option value="metal">Metal</option>
                  <option value="opengl">OpenGL</option>
                  <option value="software">Software</option>
                </select>
              </Field>
              <Field label="Reconnect attempts">
                <select
                  value={settings.maxReconnectAttempts}
                  onChange={(e) =>
                    update({ maxReconnectAttempts: Number(e.target.value) })
                  }
                  className={fieldClass}
                  disabled={!settings.autoReconnect}
                >
                  {[1, 2, 3, 4, 5].map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </select>
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Window width">
                  <input
                    type="number"
                    min="480"
                    max="3840"
                    value={settings.windowWidth}
                    onChange={(e) =>
                      update({ windowWidth: Number(e.target.value) })
                    }
                    className={fieldClass}
                  />
                </Field>
                <Field label="Window height">
                  <input
                    type="number"
                    min="270"
                    max="2160"
                    value={settings.windowHeight}
                    onChange={(e) =>
                      update({ windowHeight: Number(e.target.value) })
                    }
                    className={fieldClass}
                  />
                </Field>
              </div>
            </div>
            <div className="mt-4 flex justify-end">
              <Button variant="secondary" onClick={reset}>
                Restore capture defaults
              </Button>
            </div>
          </>
        </SettingsPagePaneLayout>
      </div>
    </SettingsPageLayout>
  );
}
