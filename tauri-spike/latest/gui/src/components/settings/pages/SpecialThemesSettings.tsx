import classNames from 'classnames';
import { useLocalization } from '@fluent/react';
import { Typography } from '@/components/commons/Typography';
import { CheckboxInternal } from '@/components/commons/Checkbox';
import { SquaresIcon } from '@/components/commons/icon/SquaresIcon';
import {
  SettingsPageLayout,
  SettingsPagePaneLayout,
} from '@/components/settings/SettingsPageLayout';
import { defaultConfig, useConfig } from '@/hooks/config';

// Each special theme is a `:root[data-theme='…']` block in index.scss.
// Bun, Fox and Dog come from PawPad's bunny, red fox and golden dog. They share one layout (isPawTheme).
export function SpecialThemesSettings() {
  const { l10n } = useLocalization();
  const { config, setConfig } = useConfig();
  const current = config?.theme;

  const cards = [
    {
      theme: 'bun',
      title: l10n.getString('settings-special-themes-bun-title'),
      description: l10n.getString('settings-special-themes-bun-description'),
    },
    {
      theme: 'fox',
      title: l10n.getString('settings-special-themes-fox-title'),
      description: l10n.getString('settings-special-themes-fox-description'),
    },
    {
      theme: 'dog',
      title: l10n.getString('settings-special-themes-dog-title'),
      description: l10n.getString('settings-special-themes-dog-description'),
    },
    {
      theme: defaultConfig.theme,
      title: l10n.getString('settings-special-themes-default-title'),
      description: l10n.getString(
        'settings-special-themes-default-description'
      ),
    },
  ];

  return (
    <SettingsPageLayout>
      <SettingsPagePaneLayout icon={<SquaresIcon />} id="special-themes">
        <Typography variant="main-title">
          {l10n.getString('settings-special-themes-title')}
        </Typography>
        <div className="flex flex-col gap-3 pt-4">
          {cards.map((card) => (
            <button
              key={card.theme}
              type="button"
              onClick={() => setConfig({ theme: card.theme })}
              className={classNames(
                'flex flex-col items-start gap-1 rounded-lg border p-4 text-left',
                current === card.theme
                  ? 'border-accent-background-30 bg-background-60'
                  : 'border-background-50 hover:bg-background-60'
              )}
            >
              <span className="text-ui-sm font-bold">{card.title}</span>
              <span className="text-ui-xs text-background-20">
                {card.description}
              </span>
            </button>
          ))}
        </div>
        <div className="pt-4">
          <CheckboxInternal
            variant="toggle"
            outlined
            name="pawEars"
            label={l10n.getString('settings-special-themes-ears-label')}
            checked={config?.pawEars !== false}
            onChange={(e) =>
              setConfig({ pawEars: (e.target as HTMLInputElement).checked })
            }
          />
          <Typography color="secondary">
            {l10n.getString('settings-special-themes-ears-description')}
          </Typography>
        </div>
      </SettingsPagePaneLayout>
    </SettingsPageLayout>
  );
}
