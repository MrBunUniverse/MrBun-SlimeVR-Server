import { useState } from 'react';
import { useTrackerPresets } from '@/hooks/presets';
import { NavLink } from 'react-router-dom';
import classNames from 'classnames';

export function PresetSelector() {
  const { presets, activePreset, activePresetId, setActivePresetId } =
    useTrackerPresets();

  const createPreset = (_name?: string) => {
    // Presets creation handler
  };

  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="relative select-none">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={classNames(
          'flex items-center gap-1.5 px-2 py-1 rounded-3xl text-ui-xs font-normal transition-colors select-none cursor-pointer active:scale-[0.97]',
          'text-background-20 hover:text-background-10'
        )}
      >
        <span className="text-ui-2xs text-accent-background-20">✦</span>
        <span className="text-ui-xs font-medium tracking-normal text-background-10">
          x{activePreset.targetCount} {activePreset.name}
        </span>
        <span className="text-ui-2xs text-background-30 -ml-0.5 leading-none">
          ⌄
        </span>
      </button>

      {isOpen && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setIsOpen(false)}
          />
          <div className="preset-popover absolute left-0 top-8 w-72 p-2 z-50 rounded-[14px] bg-background-60 border border-background-50 shadow-2xl flex flex-col gap-1 animate-fade-in">
            <div className="px-2.5 py-1.5 text-ui-2xs font-mono font-medium text-background-30 uppercase tracking-wider">
              Tracker Assignment Sets
            </div>

            {presets.map((preset) => {
              const isSelected = preset.mode === activePresetId;
              return (
                <div
                  key={preset.id}
                  onClick={() => {
                    setActivePresetId(preset.id);
                    setIsOpen(false);
                  }}
                  className={classNames(
                    'flex items-center justify-between px-3 py-2.5 rounded-xl cursor-pointer transition-all duration-150 text-ui-2xs',
                    isSelected
                      ? 'bg-accent-background-20/15 text-accent-background-30 font-medium'
                      : 'hover:bg-background-10/[0.06] text-background-10'
                  )}
                >
                  <div className="flex items-start gap-2.5">
                    <span className="font-serif text-ui-xs font-medium text-background-20 shrink-0 mt-0.5">
                      x{preset.targetCount}
                    </span>
                    <div className="flex flex-col">
                      <span
                        className={classNames(
                          'leading-tight',
                          isSelected
                            ? 'text-accent-background-30 font-medium'
                            : 'text-background-10 font-medium'
                        )}
                      >
                        {preset.name}
                      </span>
                      <span className="text-ui-2xs text-background-30 font-normal mt-0.5">
                        {preset.description}
                      </span>
                    </div>
                  </div>
                  {isSelected && (
                    <span className="text-accent-background-20 text-xs shrink-0 ml-2">
                      ✓
                    </span>
                  )}
                </div>
              );
            })}

            <div className="pt-1.5 mt-1 border-t border-background-50 flex justify-between px-2 py-1">
              <NavLink
                to="/onboarding/trackers-assign"
                onClick={() => {
                  setIsOpen(false);
                  createPreset();
                }}
                className="text-ui-2xs text-accent-background-20 hover:text-accent-background-10 font-medium tracking-tight"
              >
                Manage Tracker Presets →
              </NavLink>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
