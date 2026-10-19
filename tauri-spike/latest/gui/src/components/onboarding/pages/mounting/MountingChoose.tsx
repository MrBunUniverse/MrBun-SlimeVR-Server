import { useOnboarding } from '@/hooks/onboarding';
import { useLocalization } from '@fluent/react';
import { useState } from 'react';
import { SkipSetupWarningModal } from '@/components/onboarding/SkipSetupWarningModal';
import classNames from 'classnames';
import { Typography } from '@/components/commons/Typography';
import { Button } from '@/components/commons/Button';
import * as Sentry from '@sentry/react';

export function MountingChoose() {
  const { l10n } = useLocalization();
  const { applyProgress, skipSetup, state } = useOnboarding();
  const [showWarning, setShowWarning] = useState(false);

  applyProgress(0.55);

  return (
    <>
      <div className="flex flex-col gap-5 h-full items-center w-full xs:justify-center relative overflow-y-auto px-4 pb-4">
        <div className="flex flex-col gap-8 justify-center">
          <div className="xs:w-10/12 xs:max-w-[666px]">
            <Typography variant="main-title">
              {l10n.getString('onboarding-choose_mounting')}
            </Typography>
            <Typography variant="standard" whitespace="whitespace-pre-line">
              {l10n.getString('onboarding-choose_mounting-description')}
            </Typography>
          </div>
          <div
            className={classNames(
              'grid xs:grid-cols-2 w-full xs:flex-row mobile:flex-col gap-6 [&>div]:grow'
            )}
          >
            <div
              className={classNames(
                'rounded-[20px] p-6 flex flex-col relative border border-[var(--material-border-subtle)] bg-[var(--material-tertiary)] shadow-sm hover:border-[var(--material-border-focus)] transition-all'
              )}
            >
              <div className="bg-accent-background-20/15 border border-accent-background-20/30 text-accent-background-30 self-start px-3 py-1 rounded-full text-xs font-mono font-medium tracking-wide uppercase mb-3">
                <Typography variant="vr-accessible">
                  {l10n.getString(
                    'onboarding-choose_mounting-auto_mounting-label-v2'
                  )}
                </Typography>
              </div>
              <div className="flex flex-col gap-4 flex-grow">
                <div className="flex flex-grow flex-col gap-2 max-w-sm">
                  <div>
                    <Typography variant="main-title" bold>
                      {l10n.getString(
                        'onboarding-choose_mounting-auto_mounting'
                      )}
                    </Typography>
                  </div>
                  <div>
                    <Typography>
                      {l10n.getString(
                        'onboarding-choose_mounting-auto_mounting-description'
                      )}
                    </Typography>
                  </div>
                </div>
                <Button
                  variant="primary"
                  to={'/onboarding/mounting/auto'}
                  className="self-start mt-auto"
                  onClick={() => {
                    Sentry.metrics.count('mounting_choose', 1, {
                      attributes: { choose: 'auto' },
                    });
                  }}
                  state={{ alonePage: state.alonePage }}
                >
                  {l10n.getString('onboarding-manual_mounting-auto_mounting')}
                </Button>
              </div>
            </div>
            <div
              className={classNames(
                'rounded-[20px] p-6 flex flex-col relative border border-[var(--material-border-subtle)] bg-[var(--material-tertiary)] shadow-sm hover:border-[var(--material-border-focus)] transition-all'
              )}
            >
              <div className="flex flex-col gap-4 flex-grow">
                <div className="flex flex-grow flex-col gap-2 max-w-sm">
                  <div>
                    <Typography variant="main-title" bold>
                      {l10n.getString(
                        'onboarding-choose_mounting-manual_mounting'
                      )}
                    </Typography>
                  </div>
                  <div>
                    <Typography>
                      {l10n.getString(
                        'onboarding-choose_mounting-manual_mounting-description'
                      )}
                    </Typography>
                  </div>
                </div>

                <Button
                  variant="secondary"
                  to="/onboarding/mounting/manual"
                  className="self-start mt-auto"
                  state={{ alonePage: state.alonePage }}
                  onClick={() => {
                    Sentry.metrics.count('mounting_choose', 1, {
                      attributes: { choose: 'manual' },
                    });
                  }}
                >
                  {l10n.getString(
                    'onboarding-automatic_mounting-manual_mounting'
                  )}
                </Button>
              </div>
            </div>
          </div>
          {!state.alonePage && (
            <Button
              variant="secondary"
              className="self-start"
              to="/onboarding/trackers-assign"
            >
              {l10n.getString('onboarding-previous_step')}
            </Button>
          )}
        </div>
      </div>
      <SkipSetupWarningModal
        accept={skipSetup}
        onClose={() => setShowWarning(false)}
        isOpen={showWarning}
      />
    </>
  );
}
