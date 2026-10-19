import { Localized } from '@fluent/react';
import { useOnboarding } from '@/hooks/onboarding';
import { Button } from '@/components/commons/Button';
import { Typography } from '@/components/commons/Typography';
import classNames from 'classnames';
import { USBIcon } from '@/components/commons/icon/UsbIcon';
import { WarningBox } from '@/components/commons/TipBox';
import { MoreSetsConfirm } from './quiz/MoreSetsConfirm';

export function DongleSectionContent() {
  const { state } = useOnboarding();

  return (
    <div className="flex flex-col gap-6 min-w-0 w-full p-8 rounded-[20px] bg-[var(--material-tertiary)] border border-[var(--material-border-subtle)] shadow-sm overflow-hidden">
      <div className="flex gap-4 items-center">
        <div className="bg-accent-background-20/15 border border-accent-background-20/30 rounded-2xl p-3 text-accent-background-30">
          <USBIcon size={28} />
        </div>
        <div>
          <Typography
            variant="main-title"
            id="onboarding-wifi_creds-dongle-title"
          />
        </div>
      </div>
      <div className={classNames('flex flex-col gap-4 flex-grow')}>
        <Typography
          whitespace="whitespace-pre-wrap"
          id="onboarding-wifi_creds-dongle-description"
        />
        <Localized id="onboarding-wifi_creds-dongle-wip">
          <WarningBox whitespace>WARNING</WarningBox>
        </Localized>
      </div>
      <div className="flex pt-2 justify-end">
        {state.alonePage && (
          <Button
            variant="primary"
            to={'/'}
            id="onboarding-wifi_creds-dongle-continue"
          />
        )}
        {!state.alonePage && <MoreSetsConfirm />}
      </div>
    </div>
  );
}

export function DonglePage() {
  const { applyProgress } = useOnboarding();

  applyProgress(0.5);

  return (
    <div className="flex flex-col w-full h-full xs:justify-center items-center">
      <DongleSectionContent />
    </div>
  );
}
