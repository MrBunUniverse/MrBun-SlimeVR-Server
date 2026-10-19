import { ReactNode, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useOnboarding } from '@/hooks/onboarding';
import { MainLayout } from '@/components/MainLayout';
import { TopBar } from '@/components/TopBar';
import { useBreakpoint } from '@/hooks/breakpoint';
import { RippleDots } from '@/components/commons/RippleDots';
import { SkipSetupButton } from './SkipSetupButton';
import { SkipSetupWarningModal } from './SkipSetupWarningModal';
import './OnboardingLayout.scss';

export function OnboardingLayout({ children }: { children: ReactNode }) {
  const { isMobile } = useBreakpoint('mobile');
  const { state, skipSetup } = useOnboarding();
  const [showWarning, setShowWarning] = useState(false);
  const { pathname } = useLocation();

  // The water ripple sits behind every setup step, and stays mounted while the steps change. In Bun only.
  return !state.alonePage ? (
    <div className="onboarding-layout relative isolate h-full">
      <RippleDots solid />
      <div style={{ gridArea: 't' }}>
        {/* Setup shows only its own progress: no server/Broadcast/Dongle pills, and no bar on the welcome tab. */}
        <TopBar
          progress={pathname === '/onboarding/home' ? undefined : state.progress}
          hideStatus
        />
      </div>
      <div style={{ gridArea: 'c' }} className="mt-2 relative">
        {/* No skip on the welcome tab, so no ESC key there either. */}
        {pathname !== '/onboarding/home' && (
          <div className="absolute top-12 mobile:top-0 right-2 z-50">
            <SkipSetupButton
              visible={true}
              modalVisible={showWarning}
              onClick={() => setShowWarning(true)}
            />
          </div>
        )}
        <div className="h-full w-full overflow-y-auto">{children}</div>
        <SkipSetupWarningModal
          accept={skipSetup}
          onClose={() => setShowWarning(false)}
          isOpen={showWarning}
        />
      </div>
    </div>
  ) : (
    <div className="relative isolate h-full">
      <RippleDots solid />
      <MainLayout isMobile={isMobile}>{children}</MainLayout>
    </div>
  );
}
