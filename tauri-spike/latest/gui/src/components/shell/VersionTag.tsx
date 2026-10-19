import { GH_REPO } from '@/App';
import { useConfig } from '@/hooks/config';
import { openUrl } from '@/hooks/crossplatform';

export function VersionTag() {
  const { config } = useConfig();
  // Build hashes are developer information; keep them out of the normal UI.
  if (!config?.debug) return null;
  return (
    <div
      style={{ WebkitAppRegion: 'no-drag' } as any}
      className="apple-interactive flex items-center justify-center text-ui-2xs tnum font-medium text-background-30 hover:text-background-10 rounded-[6px] px-2 py-0.5 select-text cursor-pointer"
      onClick={() => {
        const url = `https://github.com/${GH_REPO}/releases`;
        openUrl(url);
      }}
    >
      {(__VERSION_TAG__ || __COMMIT_HASH__) + (__GIT_CLEAN__ ? '' : '-dirty')}
    </div>
  );
}
