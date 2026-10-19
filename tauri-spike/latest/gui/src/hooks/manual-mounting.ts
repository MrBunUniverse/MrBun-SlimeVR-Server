import { useCallback, useMemo } from 'react';
import { BodyPart } from 'solarxr-protocol';
import { QuaternionFromQuatT, similarQuaternions } from '@/maths/quaternion';
import { FlatDeviceTracker } from '@/store/app-store';

export function useManualMountingTrackers(assignedTrackers: FlatDeviceTracker[]) {
  const trackerPartGrouped = useMemo(
    () =>
      assignedTrackers.reduce<Record<number, FlatDeviceTracker[]>>(
        (groups, tracker) => {
          const part = tracker.tracker.info?.bodyPart || BodyPart.NONE;
          (groups[part] ||= []).push(tracker);
          return groups;
        },
        {}
      ),
    [assignedTrackers]
  );

  const getCurrRotation = useCallback(
    (role: BodyPart) => {
      if (role === BodyPart.NONE) return undefined;
      const orientations = (trackerPartGrouped[role] || [])
        .map((tracker) => tracker.tracker.info?.mountingOrientation)
        .filter((orientation): orientation is NonNullable<typeof orientation> =>
          Boolean(orientation)
        )
        .map(QuaternionFromQuatT);
      const [first, ...rest] = orientations;
      return first &&
        rest.every((orientation) => similarQuaternions(orientation, first))
        ? first
        : undefined;
    },
    [trackerPartGrouped]
  );

  return { trackerPartGrouped, getCurrRotation };
}
