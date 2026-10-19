import { useLocalization } from '@fluent/react';
import { BaseModal } from '@/components/commons/BaseModal';
import ReactModal from 'react-modal';
import { useNavigate } from 'react-router-dom';

export function SkipSetupWarningModal({
  isOpen = true,
  onClose,
  accept,
  ...props
}: {
  /**
   * Is the parent/sibling component opened?
   */
  isOpen: boolean;
  /**
   * Function to trigger when the warning hasn't been accepted
   */
  onClose: () => void;
  /**
   * Function when you press `i understand`
   */
  accept: () => void;
} & ReactModal.Props) {
  const { l10n } = useLocalization();
  const navigate = useNavigate();

  return (
    <BaseModal
      isOpen={isOpen}
      shouldCloseOnOverlayClick
      shouldCloseOnEsc
      onRequestClose={onClose}
      className={props.className}
      overlayClassName={props.overlayClassName}
      appendClasses="!p-0 !max-w-[440px] !rounded-[16px] overflow-hidden setup-warning-surface"
    >
      <div className="setup-warning-modal flex w-full flex-col select-none bg-background-80 text-background-10">
        {/* Card Header Banner */}
        <div className="setup-warning-modal__banner relative h-24 sm:h-25 w-full bg-background-70 border-b border-background-10/[0.06] overflow-hidden flex flex-col justify-between p-3">
          <div className="relative z-10 flex items-center justify-end">
            <span className="text-ui-2xs font-mono font-medium text-background-30 tracking-wide">
              setup.notice
            </span>
          </div>

          {/* Centered Graphic Icon with Breathing & Glow Animation */}
          <div className="relative z-10 flex items-center justify-center flex-grow">
            <div className="animate-warning-breathe flex items-center justify-center">
              <svg
                className="w-8 h-8 stroke-accent-background-20"
                viewBox="0 0 24 24"
                fill="none"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
                <line x1="12" y1="9" x2="12" y2="13" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
            </div>
          </div>
        </div>

        {/* Card Body */}
        <div className="p-5 sm:p-6 flex flex-col gap-3 text-left">
          <div>
            <h3 className="font-serif text-ui-md sm:text-ui-md font-normal tracking-tight text-background-10">
              Initial Setup Required
            </h3>
            <p className="mt-2 text-ui-xs leading-relaxed text-background-30 font-sans">
              The initial calibration is required for good tracking and body
              kinematics. Skipping setup is only advised if your trackers are
              already paired and calibrated.
            </p>
          </div>

          {/* Clean Action Buttons */}
          <div className="mt-4 flex flex-col sm:flex-row items-center justify-end gap-2.5 pt-2 border-t border-background-10/[0.06]">
            <button
              type="button"
              onClick={() => {
                accept();
                navigate('/');
              }}
              className="app-button-secondary w-full sm:w-auto px-4 py-2 rounded-[8px] bg-background-10/[0.05] hover:bg-background-10/[0.09] border border-background-10/[0.08] font-medium text-ui-xs text-background-30 hover:text-background-10 transition-all active:scale-95 cursor-pointer"
            >
              {l10n.getString('onboarding-setup_warning-skip')}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="app-button-primary w-full sm:w-auto px-4 py-2 rounded-[8px] bg-accent-background-20 hover:bg-accent-background-40 text-white font-medium text-ui-xs shadow-sm transition-all active:scale-95 cursor-pointer"
            >
              {l10n.getString('onboarding-setup_warning-cancel')}
            </button>
          </div>
        </div>
      </div>
    </BaseModal>
  );
}
