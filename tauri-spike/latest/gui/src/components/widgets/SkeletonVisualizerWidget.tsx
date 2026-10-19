import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';

import { useMemo, useEffect, useState, useRef, useLayoutEffect } from 'react';
import {
  BoneKind,
  createChildren,
  BasedSkeletonHelper,
} from '@/utils/skeletonHelper';
import {
  Bone,
  Box3,
  GridHelper,
  Group,
  PerspectiveCamera,
  Quaternion,
  Scene,
  Sphere,
  Spherical,
  Vector2,
  Vector3,
  WebGLRenderer,
} from 'three';
import {
  BodyPart,
  BoneT,
  ResetResponseT,
  ResetStatus,
  RpcMessage,
} from 'solarxr-protocol';
import { QuaternionFromQuatT, isIdentity } from '@/maths/quaternion';
import classNames from 'classnames';
import { useLocalization } from '@fluent/react';
import { ErrorBoundary } from 'react-error-boundary';
import { Typography } from '@/components/commons/Typography';
import { useAtomValue } from 'jotai';
import { bonesAtom } from '@/store/app-store';
import { useConfig } from '@/hooks/config';
import { useWebsocketAPI } from '@/hooks/websocket-api';
import { Tween } from '@tweenjs/tween.js';
import { EyeIcon } from '@/components/commons/icon/EyeIcon';

const GROUND_COLOR = '#2F5F86';
const GROUND_CENTER_COLOR = '#477CA2';
const MAX_RENDER_PIXEL_RATIO = 1.25;

// Just need to know the length of the total body, so don't need right legs
const Y_PARTS = [
  BodyPart.NECK,
  BodyPart.UPPER_CHEST,
  BodyPart.CHEST,
  BodyPart.WAIST,
  BodyPart.HIP,
  BodyPart.LEFT_UPPER_LEG,
  BodyPart.LEFT_LOWER_LEG,
];

export type SkeletonPreviewView = {
  left: number;
  bottom: number;
  width: number;
  height: number;
  camera: PerspectiveCamera;
  controls: OrbitControls;
  hidden: boolean;
  tween: Tween<Vector3>;
  onHeightChange: (view: SkeletonPreviewView, newHeight: number) => void;
};

function initializePreview(
  canvas: HTMLCanvasElement,
  skeleton: (BoneKind | Bone)[]
) {
  let lastRenderTimeRef = 0;
  let frameInterval = 0;

  const views: SkeletonPreviewView[] = [];

  const resolution = new Vector2(canvas.clientWidth, canvas.clientHeight);
  const scene = new Scene();
  let renderer: WebGLRenderer | null = new WebGLRenderer({
    canvas,
    alpha: true,
    antialias: false,
    powerPreference: 'low-power',
    stencil: false,
    depth: true,
  });
  renderer.setPixelRatio(
    Math.min(
      typeof window !== 'undefined' ? window.devicePixelRatio : 1,
      MAX_RENDER_PIXEL_RATIO
    )
  );
  renderer.setSize(canvas.clientWidth, canvas.clientHeight);

  let dirtyFrames = 20;
  let animationFrameId: number | null = null;

  const scheduleAnimationFrame = () => {
    if (animationFrameId === null) {
      animationFrameId = requestAnimationFrame(animate);
    }
  };

  const markDirty = (frames = 3) => {
    dirtyFrames = Math.max(dirtyFrames, frames);
    scheduleAnimationFrame();
  };

  const grid = new GridHelper(10, 20, GROUND_CENTER_COLOR, GROUND_COLOR);
  grid.position.set(0, 0, 0);
  if (!Array.isArray(grid.material)) {
    grid.material.transparent = true;
    grid.material.opacity = 0.5;
  }
  scene.add(grid);

  const skeletonGroup = new Group();
  let skeletonHelper = new BasedSkeletonHelper(skeleton[0]);
  skeletonHelper.resolution.copy(resolution);
  skeletonGroup.add(skeletonHelper);

  scene.add(skeletonGroup);
  scene.add(skeleton[0]);

  let heightOffset = 0;
  let skeletonOffset = 0;
  const updateSkeletonHeading = (bones: Map<BodyPart, BoneT>) => {
    const hmd = bones.get(BodyPart.HEAD);
    const chest =
      bones.get(BodyPart.UPPER_CHEST) ??
      bones.get(BodyPart.CHEST) ??
      bones.get(BodyPart.HIP);
    // Keep the preview's model-space heading in sync with reset/calibration
    // updates. Without this, the bones use the new heading while the group
    // keeps the heading captured when the skeleton was first created.
    const sourceRotation =
      hmd?.rotationG && !isIdentity(hmd.rotationG)
        ? hmd.rotationG
        : chest?.rotationG;
    if (!sourceRotation) return;

    const quat = QuaternionFromQuatT(sourceRotation).normalize().invert();

    // Project the inverse rotation onto the world Y axis, matching the
    // original face-forward transform while avoiding pitch/roll in the group.
    const VEC_Y = new Vector3(0, 1, 0);
    const vec = VEC_Y.multiplyScalar(
      new Vector3(quat.x, quat.y, quat.z).dot(VEC_Y) / VEC_Y.lengthSq()
    );
    const yawReset = new Quaternion(vec.x, vec.y, vec.z, quat.w).normalize();

    skeletonGroup.rotation.setFromQuaternion(yawReset);
  };

  const rebuildSkeleton = (
    newSkeleton: (BoneKind | Bone)[],
    bones: Map<BodyPart, BoneT>
  ) => {
    markDirty(10);
    skeletonGroup.remove(skeletonHelper);
    skeletonHelper.dispose();
    scene.remove(skeleton[0]);

    skeleton = newSkeleton;

    skeletonHelper = new BasedSkeletonHelper(newSkeleton[0]);
    skeletonHelper.resolution.copy(resolution);
    skeletonGroup.add(skeletonHelper);
    scene.add(newSkeleton[0]);
    updateSkeletonHeading(bones);
  };

  const computeUserHeight = (bones: Map<BodyPart, BoneT>) => {
    const hmd = bones.get(BodyPart.HEAD);
    if (hmd?.headPositionG?.y && hmd.headPositionG.y > 0) {
      return hmd.headPositionG.y / 0.936;
    }
    const yLength = Y_PARTS.map((x) => bones.get(x));
    if (yLength.some((x) => x === undefined)) return 0;
    return (
      (yLength as BoneT[]).reduce((prev, cur) => prev + cur.boneLength, 0) /
      0.936
    );
  };

  const computeSkeletonOffset = (bones: Map<BodyPart, BoneT>) => {
    const hmd = bones.get(BodyPart.HEAD);
    // If I know the head position, don't use an offset
    if (hmd?.headPositionG?.y !== undefined && hmd.headPositionG?.y > 0) {
      return 0;
    }
    const yLength = Y_PARTS.map((x) => bones.get(x));
    if (yLength.some((x) => x === undefined)) return 0;
    return (yLength as BoneT[]).reduce((prev, cur) => prev + cur.boneLength, 0);
  };

  let autoOrbit = false;

  const setAutoOrbit = (enable?: boolean) => {
    autoOrbit = typeof enable === 'boolean' ? enable : !autoOrbit;
    views.forEach((v) => {
      v.controls.autoRotate = autoOrbit;
      // 1.0 gives a calm, smooth ~60-second 360-degree rotation
      v.controls.autoRotateSpeed = 1.0;
    });
    markDirty(10);
    return autoOrbit;
  };

  const isAutoOrbiting = () => autoOrbit;

  // Auto-frame: keep the whole skeleton in view while dancing, crouching or lying down.
  // The orbit target eases to the body's centre (the camera moves with it, so the user's
  // viewing angle stays) and the zoom eases so the body fits with a margin. While it's on,
  // it owns the zoom; the overlay's Auto-frame button turns it off.
  let autoFrame = true;
  const frameBox = new Box3();
  const frameSphere = new Sphere();
  const framePoint = new Vector3();
  const frameShift = new Vector3();
  // Close-up, with only a thin margin around the bounding sphere.
  const FRAME_MARGIN = 1.1;
  const FRAME_PADDING = 0.08; // metres, so a swinging hand never touches the edge
  const MIN_FRAME_RADIUS = 0.5;
  const FRAME_LIFT = 0.22;
  // Spring times in seconds. The zoom opens fast so nothing is cut off and closes slowly, so
  // swinging limbs don't make it breathe in and out. The position glides slower still.
  const FRAME_MOVE_TIME = 0.7;
  const FRAME_OPEN_TIME = 0.35;
  const FRAME_CLOSE_TIME = 1.6;

  // Smoothed framing state: the camera follows these, never the raw (noisy) bounds.
  const frameCenter = new Vector3();
  const frameVelocity = new Vector3();
  let frameRadius = 1;
  let frameRadiusVelocity = 0;
  let frameReady = false;
  // Eye level: the camera sits level with the aim point, looking straight at the body, not
  // down on it like a drone. The turn left or right stays whatever the user chose.
  const FRAME_EYE_LEVEL_PHI = Math.PI / 2 - 0.04;
  const FRAME_PITCH_TIME = 0.8;
  const frameSpherical = new Spherical();
  const frameOffset = new Vector3();
  let framePitchVelocity = 0;

  // Critically damped spring: velocity stays continuous, so there is no stutter when the
  // target jumps. Returns the new value and updates `vel.v`.
  const smoothDamp = (
    current: number,
    target: number,
    vel: { v: number },
    smoothTime: number,
    dt: number
  ) => {
    const omega = 2 / Math.max(0.0001, smoothTime);
    const x = omega * dt;
    const decay = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);
    const change = current - target;
    const temp = (vel.v + omega * change) * dt;
    vel.v = (vel.v - omega * temp) * decay;
    let out = target + (change + temp) * decay;
    if (target - current > 0 === out > target) {
      out = target;
      vel.v = 0;
    }
    return out;
  };
  const springVel = { v: 0 };

  const frameView = (v: SkeletonPreviewView, aspect: number, rawDt: number) => {
    frameBox.makeEmpty();
    skeletonGroup.updateMatrixWorld();
    skeleton.forEach((bone) => {
      bone.getWorldPosition(framePoint);
      // The helper draws bones through the group's heading, so measure them the same way.
      frameBox.expandByPoint(
        framePoint.applyMatrix4(skeletonGroup.matrixWorld)
      );
    });
    if (frameBox.isEmpty()) return;
    const dt = Math.min(Math.max(rawDt, 0.001), 0.05);
    frameBox.getBoundingSphere(frameSphere);
    const wantRadius =
      Math.max(frameSphere.radius, MIN_FRAME_RADIUS) * FRAME_MARGIN +
      FRAME_PADDING;
    // Aim a little below the centre, so the body sits above the control strip at the bottom.
    frameSphere.center.y -= wantRadius * FRAME_LIFT;

    const halfFov = (v.camera.fov * Math.PI) / 360;
    const fit = Math.tan(halfFov) * Math.min(1, aspect);
    if (!frameReady) {
      // Start from where the camera already is, so turning Auto-frame on glides in.
      frameCenter.copy(v.controls.target);
      frameVelocity.set(0, 0, 0);
      frameRadius =
        (v.camera.position.distanceTo(v.controls.target) * fit) /
        Math.max(v.camera.zoom, 0.01);
      frameRadiusVelocity = 0;
      framePitchVelocity = 0;
      frameReady = true;
    }

    springVel.v = frameVelocity.x;
    frameCenter.x = smoothDamp(
      frameCenter.x,
      frameSphere.center.x,
      springVel,
      FRAME_MOVE_TIME,
      dt
    );
    frameVelocity.x = springVel.v;
    springVel.v = frameVelocity.y;
    frameCenter.y = smoothDamp(
      frameCenter.y,
      frameSphere.center.y,
      springVel,
      FRAME_MOVE_TIME,
      dt
    );
    frameVelocity.y = springVel.v;
    springVel.v = frameVelocity.z;
    frameCenter.z = smoothDamp(
      frameCenter.z,
      frameSphere.center.z,
      springVel,
      FRAME_MOVE_TIME,
      dt
    );
    frameVelocity.z = springVel.v;

    springVel.v = frameRadiusVelocity;
    frameRadius = smoothDamp(
      frameRadius,
      wantRadius,
      springVel,
      wantRadius > frameRadius ? FRAME_OPEN_TIME : FRAME_CLOSE_TIME,
      dt
    );
    frameRadiusVelocity = springVel.v;

    // Move the orbit target to the smoothed centre; the camera keeps its angle and distance.
    frameShift.subVectors(frameCenter, v.controls.target);
    v.controls.target.add(frameShift);
    v.camera.position.add(frameShift);

    // Ease the camera down to eye level, keeping its distance and its heading.
    frameOffset.subVectors(v.camera.position, v.controls.target);
    frameSpherical.setFromVector3(frameOffset);
    springVel.v = framePitchVelocity;
    const phi = smoothDamp(
      frameSpherical.phi,
      FRAME_EYE_LEVEL_PHI,
      springVel,
      FRAME_PITCH_TIME,
      dt
    );
    framePitchVelocity = springVel.v;
    const pitchMoving = Math.abs(phi - frameSpherical.phi) > 1e-5;
    frameSpherical.phi = phi;
    frameOffset.setFromSpherical(frameSpherical);
    v.camera.position.copy(v.controls.target).add(frameOffset);

    const distance = frameSpherical.radius;
    v.camera.zoom = (distance * fit) / frameRadius;

    // Keep drawing until the camera settles.
    if (
      pitchMoving ||
      frameVelocity.lengthSq() > 1e-6 ||
      Math.abs(frameRadiusVelocity) > 1e-3 ||
      Math.abs(wantRadius - frameRadius) > 1e-3 ||
      frameCenter.distanceToSquared(frameSphere.center) > 1e-6
    ) {
      markDirty(2);
    }
  };

  const setAutoFrame = (enable?: boolean) => {
    autoFrame = typeof enable === 'boolean' ? enable : !autoFrame;
    frameReady = false;
    markDirty(10);
    return autoFrame;
  };

  const render = (deltaSeconds?: number) => {
    views.forEach((v) => {
      if (v.hidden || !renderer) return;
      // Pass delta in seconds if available so OrbitControls updates smoothly and predictably
      if (typeof deltaSeconds === 'number' && deltaSeconds > 0) {
        v.controls.update(deltaSeconds);
      } else {
        v.controls.update();
      }

      const left = Math.floor(resolution.x * v.left);
      const bottom = Math.floor(resolution.y * v.bottom);
      const width = Math.floor(resolution.x * v.width);
      const height = Math.floor(resolution.y * v.height);
      if (width <= 0 || height <= 0) return;

      if (autoFrame) {
        frameView(
          v,
          width / height,
          typeof deltaSeconds === 'number' && deltaSeconds > 0
            ? deltaSeconds
            : 0.016
        );
      }

      renderer.setViewport(left, bottom, width, height);
      renderer.setScissor(left, bottom, width, height);
      renderer.setScissorTest(true);

      v.tween.update();

      v.camera.aspect = width / height;
      v.camera.updateProjectionMatrix();

      renderer.render(scene, v.camera);
    });
  };

  let previousFrameTime = 0;

  const syncCanvasSize = () => {
    if (!renderer) return;
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    if (
      width <= 0 ||
      height <= 0 ||
      (width === resolution.x && height === resolution.y)
    ) {
      return;
    }
    resolution.set(width, height);
    skeletonHelper.resolution.copy(resolution);
    renderer.setSize(width, height);
    markDirty(8);
  };

  function animate() {
    animationFrameId = null;

    // ResizeObserver can miss the final frame of the drawer width transition.
    // Sync here so reopening a zero-width preview always restores rendering.
    syncCanvasSize();

    if (autoOrbit) {
      markDirty(2);
    }

    const isHidden = typeof document !== 'undefined' && document.hidden;
    const isFocused =
      typeof document !== 'undefined' &&
      document.hasFocus &&
      document.hasFocus();

    // Throttle by attention: unfocused (e.g. while gaming) is the common
    // background case, so keep the preview light on the GPU there.
    const adaptiveBaseInterval = isHidden
      ? 1000
      : !isFocused
        ? 100
        : autoOrbit
          ? 33.3
          : 16.6;
    const effectiveInterval = Math.max(
      adaptiveBaseInterval,
      autoOrbit ? 0 : frameInterval
    );

    const now = performance.now();
    const elapsed = now - lastRenderTimeRef;
    if (elapsed < effectiveInterval) {
      scheduleAnimationFrame();
      return;
    }
    if (dirtyFrames <= 0) {
      previousFrameTime = now;
      return;
    }
    dirtyFrames--;

    const deltaSeconds =
      previousFrameTime > 0
        ? Math.min((now - previousFrameTime) / 1000, 0.1)
        : 0.016;
    previousFrameTime = now;

    render(deltaSeconds);
    lastRenderTimeRef = now - (elapsed % effectiveInterval);
    if (dirtyFrames > 0 || autoOrbit) scheduleAnimationFrame();
  }

  scheduleAnimationFrame();

  // Make sure orbit controls works only on the current view
  const handlePointerMove = (event: PointerEvent) => {
    const x = event.offsetX / resolution.x;
    const y = 1 - event.offsetY / resolution.y;
    views.forEach((v) => {
      if (
        x >= v.left &&
        x <= v.left + v.width &&
        y >= v.bottom &&
        y <= v.bottom + v.height
      ) {
        v.controls.enabled = true;
      } else {
        v.controls.enabled = false;
      }
    });
  };
  canvas.addEventListener('pointermove', handlePointerMove);

  return {
    resize: (width: number, height: number) => {
      if (width <= 0 || height <= 0) return;
      resolution.set(width, height);
      skeletonHelper.resolution.copy(resolution);
      if (!renderer) return;
      renderer.setSize(width, height);
      markDirty(5);
    },
    setFrameInterval: (interval: number) => {
      frameInterval = interval;
      markDirty(5);
    },
    rebuildSkeleton,
    // Re-centering on every update would cancel the user's own turning, so
    // the heading is only re-synced on rebuild and after a reset.
    syncHeading: updateSkeletonHeading,
    updatesBones: (bones: Map<BodyPart, BoneT>) => {
      markDirty(3);
      skeleton.forEach(
        (bone) => bone instanceof BoneKind && bone.updateData(bones)
      );
      const newHeight = computeUserHeight(bones);
      if (newHeight !== heightOffset) {
        heightOffset = newHeight;
        views.forEach((v) => {
          v.onHeightChange(v, heightOffset);
        });
      }

      const newSkeletinOffset = computeSkeletonOffset(bones);
      if (newSkeletinOffset != skeletonOffset) {
        skeletonOffset = newSkeletinOffset;
        skeletonGroup.position.set(0, skeletonOffset, 0);
      }
    },
    destroy: () => {
      if (animationFrameId !== null) {
        cancelAnimationFrame(animationFrameId);
        animationFrameId = null;
      }
      canvas.removeEventListener('pointermove', handlePointerMove);
      views.forEach((view) => view.controls.dispose());
      views.length = 0;
      skeletonHelper.dispose();
      grid.geometry.dispose();
      (grid.material as any)?.dispose?.();
      if (!renderer) return;
      renderer.dispose();
      renderer = null;
    },
    addView: ({
      left,
      bottom,
      width,
      height,
      position,
      hidden = false,
      onHeightChange,
    }: {
      left: number;
      bottom: number;
      width: number;
      height: number;
      position: Vector3;
      hidden?: boolean;
      onHeightChange: (view: SkeletonPreviewView, newHeight: number) => void;
    }) => {
      if (!renderer) return;

      const camera = new PerspectiveCamera(
        20,
        resolution.width / resolution.height,
        0.1,
        1000
      );

      const controls = new OrbitControls(camera, renderer.domElement);
      controls.maxDistance = 20;
      controls.dampingFactor = 0.2;
      controls.enableDamping = true;
      controls.addEventListener('change', () => markDirty(4));

      const tween = new Tween(position)
        .onUpdate(() => {
          camera.position.copy(position);
          markDirty(3);
        })
        .onStart(() => {
          frameInterval = 0;
          markDirty(10);
        })
        .onComplete(() => (frameInterval = 1000 / LOW_FRAMERATE));

      camera.position.copy(position);

      const view: SkeletonPreviewView = {
        camera,
        left,
        bottom,
        width,
        height,
        controls,
        tween,
        hidden,
        onHeightChange,
      };

      views.push(view);

      return view;
    },
    toggleAutoOrbit: (enable?: boolean) => setAutoOrbit(enable),
    toggleAutoFrame: (enable?: boolean) => setAutoFrame(enable),
    isAutoOrbiting,
    getViews: () => views,
  };
}

const BASE_FRAMERATE = 60;
const LOW_FRAMERATE = 30;

export type PreviewContext = ReturnType<typeof initializePreview>;

function SkeletonVisualizer({
  onInit,
  disabled = false,
}: {
  onInit: (context: PreviewContext) => void;
  disabled?: boolean;
}) {
  const { config } = useConfig();

  const previewContext = useRef<PreviewContext | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const resizeObserver = useRef(new ResizeObserver(([e]) => onResize(e)));
  const _bones = useAtomValue(bonesAtom);

  const bones = useMemo(() => {
    return new Map(_bones.map((b) => [b.bodyPart, b]));
  }, [_bones]);

  useEffect(() => {
    if (bones.size === 0) return;
    const context = previewContext.current;
    if (!context || disabled) return;
    context.rebuildSkeleton(createChildren(bones, BoneKind.root), bones);
  }, [bones.size, disabled]);

  // A reset changes the reference heading; pick it up from the bones that
  // arrive once the reset has finished.
  const headingStale = useRef(false);
  const { useRPCPacket } = useWebsocketAPI();
  useRPCPacket(RpcMessage.ResetResponse, ({ status }: ResetResponseT) => {
    if (status === ResetStatus.FINISHED) headingStale.current = true;
  });

  useEffect(() => {
    const context = previewContext.current;
    if (!context || disabled) return;
    if (headingStale.current) {
      headingStale.current = false;
      context.syncHeading(bones);
    }
    context.updatesBones(bones);
  }, [bones, disabled]);

  const onResize = (e: ResizeObserverEntry) => {
    const context = previewContext.current;
    if (!context || !containerRef.current || !canvasRef.current) return;
    context.resize(e.contentRect.width, e.contentRect.height);
  };

  const onEnter = () => {
    if (config?.devSettings.fastDataFeed) return;
    const context = previewContext.current;
    if (!context) return;
    context.setFrameInterval(1000 / BASE_FRAMERATE);
  };

  const onLeave = () => {
    if (config?.devSettings.fastDataFeed) return;
    const context = previewContext.current;
    if (!context) return;
    context.setFrameInterval(1000 / LOW_FRAMERATE);
  };

  useLayoutEffect(() => {
    if (disabled) return;
    if (!canvasRef.current || !containerRef.current)
      throw 'invalid state - no canvas or container';
    resizeObserver.current.observe(containerRef.current);

    previewContext.current = initializePreview(
      canvasRef.current,
      createChildren(bones, BoneKind.root)
    );
    if (!config?.devSettings.fastDataFeed)
      previewContext.current.setFrameInterval(1000 / LOW_FRAMERATE);

    const rect = containerRef.current.getBoundingClientRect();
    previewContext.current.resize(rect.width, rect.height);

    containerRef.current.addEventListener('mouseenter', onEnter);
    containerRef.current.addEventListener('mouseleave', onLeave);

    onInit(previewContext.current);

    return () => {
      if (!previewContext.current || !containerRef.current) return;
      resizeObserver.current.unobserve(containerRef.current);
      previewContext.current.destroy();
      previewContext.current = null;

      containerRef.current.removeEventListener('mouseenter', onEnter);
      containerRef.current.removeEventListener('mouseleave', onLeave);
    };
  }, [disabled]);

  return (
    <div ref={containerRef} className={classNames('w-full h-full')}>
      <canvas ref={canvasRef} className="w-full h-full" />
    </div>
  );
}

export function SkeletonVisualizerWidget({
  onInit = (context) => {
    context.addView({
      left: 0,
      bottom: 0,
      width: 1,
      height: 1,
      position: new Vector3(3, 2.5, -3),
      onHeightChange(v, newHeight) {
        v.controls.target.set(0, newHeight / 2, 0);
        const scale = Math.max(1, newHeight) / 1.5;
        v.camera.zoom = 1 / scale;
      },
    });
  },
  disabled = false,
  toggleDisabled,
}: {
  onInit?: (context: PreviewContext) => void;
  disabled?: boolean;
  toggleDisabled?: () => void;
}) {
  const { l10n } = useLocalization();
  const [error, setError] = useState(false);

  return (
    <div className={classNames('w-full h-full relative')}>
      <div
        className={classNames('w-full h-full transition-all', {
          blur: disabled,
        })}
      >
        <ErrorBoundary onError={() => setError(true)} fallback={<></>}>
          <SkeletonVisualizer onInit={onInit} disabled={disabled} />
        </ErrorBoundary>
      </div>
      <div
        className={classNames(
          'absolute h-full w-full top-0 flex items-center justify-center transition-opacity duration-300',
          { 'opacity-0 pointer-events-none': !disabled || error }
        )}
      >
        <div
          className={classNames(
            'bg-background-90 rounded-lg p-2 px-3 flex gap-2 items-center',
            {
              'hover:bg-background-60 cursor-pointer': !!toggleDisabled,
              'cursor-not-allowed': !toggleDisabled,
            }
          )}
          onClick={() => toggleDisabled?.()}
        >
          <EyeIcon closed width={20} />
          <Typography id="preview-disabled_render" />
        </div>
      </div>
      <div
        className={classNames(
          'absolute h-full w-full top-0 flex items-center justify-center transition-opacity duration-300',
          { 'opacity-0 pointer-events-none': !error }
        )}
      >
        <div className="bg-background-90 rounded-lg p-2 px-3 flex gap-2 items-center">
          <Typography color="primary" textAlign="text-center">
            {l10n.getString('tips-failed_webgl')}
          </Typography>
        </div>
      </div>
    </div>
  );
}
