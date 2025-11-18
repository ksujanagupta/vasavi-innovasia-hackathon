import { useEffect, useImperativeHandle, useRef, forwardRef } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

export type BoneDelta = [boneName: string, action: 'rotation' | 'position', axis: 'x' | 'y' | 'z', limit: number, sign: '+' | '-'];

export type AnimationItem = BoneDelta[] | ['add-text', string];

export type AvatarCanvasHandle = {
  enqueue: (items: AnimationItem[]) => void;
  clear: () => void;
  setSpeed: (s: number) => void;
  setPauseMs: (ms: number) => void;
  loadModel: (url: string) => void;
  kick: () => void;
  getCompatRef: () => any;
};

type Props = {
  initialModelUrl: string;
  defaultPose: (ref: any) => void;
  className?: string;
  onAddText?: (text: string) => void;
  onSegmentEnd?: () => void;
  onSegmentProgress?: (progress01: number) => void;
};

const AvatarCanvas = forwardRef<AvatarCanvasHandle, Props>(({ initialModelUrl, defaultPose, className, onAddText, onSegmentEnd, onSegmentProgress }, ref) => {
  const stateRef = useRef<any>({});
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const state = stateRef.current;
    state.animations = [] as AnimationItem[];
    state.characters = [] as any[];
    state.flag = false;
    state.pending = false;
    state.speed = 0.18;
    state.pause = 800;

    state.scene = new THREE.Scene();
    state.scene.background = new THREE.Color(0xdddddd);

    const hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 1.0);
    state.scene.add(hemi);
    const dir = new THREE.DirectionalLight(0xffffff, 1.2);
    dir.position.set(2, 4, 3);
    state.scene.add(dir);
    const amb = new THREE.AmbientLight(0xffffff, 0.5);
    state.scene.add(amb);

    state.renderer = new THREE.WebGLRenderer({ antialias: true });
    const dpr = Math.min(1.5, window.devicePixelRatio || 1);
    state.renderer.setPixelRatio(dpr);
    state.renderer.outputColorSpace = THREE.SRGBColorSpace as any;
    state.renderer.toneMapping = THREE.ACESFilmicToneMapping as any;
    state.renderer.toneMappingExposure = 1.1;

    state.camera = new THREE.PerspectiveCamera(
      30,
      1,
      0.1,
      1000,
    );

    if (containerRef.current) {
      containerRef.current.innerHTML = '';
      containerRef.current.style.width = '100%';
      containerRef.current.style.height = '100%';
      containerRef.current.style.display = 'flex';
      containerRef.current.style.alignItems = 'center';
      containerRef.current.style.justifyContent = 'center';
      containerRef.current.appendChild(state.renderer.domElement);
      (state.renderer.domElement as HTMLCanvasElement).style.width = '100%';
      (state.renderer.domElement as HTMLCanvasElement).style.height = '100%';
      (state.renderer.domElement as HTMLCanvasElement).style.display = 'block';
    }

    state.camera.position.z = 2.0;
    state.camera.position.y = 1.5;
    state.camera.lookAt(new THREE.Vector3(0, 1.4, 0));

    const sizeToContainer = () => {
      if (!containerRef.current) return;
      const { clientWidth, clientHeight } = containerRef.current;
      state.camera.aspect = clientWidth / Math.max(1, clientHeight);
      state.camera.updateProjectionMatrix();
      state.renderer.setSize(clientWidth, clientHeight, false);
    };
    sizeToContainer();

    // Define animate function before using it in defaultPose
    state.currentSegmentTotal = 0;
    state.animate = () => {
      if (state.animations.length === 0) {
        state.pending = false;
        state.renderer.render(state.scene, state.camera);
        return;
      }
      requestAnimationFrame(state.animate);
      if ((state.animations[0] as any).length) {
        if (!state.flag) {
          if ((state.animations[0] as any)[0] === 'add-text') {
            const text = (state.animations[0] as any)[1];
            try { onAddText && onAddText(text); } catch {}
            state.animations.shift();
          } else {
            if (!state.currentSegmentTotal) {
              state.currentSegmentTotal = (state.animations[0] as BoneDelta[]).length;
            }
            for (let i = 0; i < (state.animations[0] as BoneDelta[]).length;) {
              const [boneName, action, axis, limit, sign] = (state.animations[0] as BoneDelta[])[i];
              const object = state.avatar?.getObjectByName(boneName);
              if (!object) {
                (state.animations[0] as BoneDelta[]).splice(i, 1);
                continue;
              }
              if (sign === '+' && object[action][axis] < limit) {
                object[action][axis] += state.speed;
                object[action][axis] = Math.min(object[action][axis], limit);
                i++;
              } else if (sign === '-' && object[action][axis] > limit) {
                object[action][axis] -= state.speed;
                object[action][axis] = Math.max(object[action][axis], limit);
                i++;
              } else {
                (state.animations[0] as BoneDelta[]).splice(i, 1);
              }
            }
            try {
              const remaining = (state.animations[0] as BoneDelta[]).length;
              const total = state.currentSegmentTotal || 1;
              const progress = Math.min(1, Math.max(0, (total - remaining) / total));
              onSegmentProgress && onSegmentProgress(progress);
            } catch {}
          }
        }
      } else {
        state.flag = true;
        setTimeout(() => {
          state.flag = false;
          state.animations.shift();
          try { onSegmentEnd && onSegmentEnd(); } catch {}
        }, state.pause);
      }
      state.renderer.render(state.scene, state.camera);
    };

    const loader = new GLTFLoader();
    loader.load(
      initialModelUrl,
      (gltf) => {
        gltf.scene.traverse((child: any) => {
          if (child.type === 'SkinnedMesh') {
            child.frustumCulled = false;
          }
        });
        state.avatar = gltf.scene;
        state.avatar.position.set(0, 0, 0);
        state.avatar.scale.setScalar(0.85);
        state.scene.add(state.avatar);
        defaultPose(state);
      },
      () => {},
      (err) => {
        // eslint-disable-next-line no-console
        console.error('Model load error', err);
      },
    );

    const onResize = () => {
      sizeToContainer();
    };
    window.addEventListener('resize', onResize);

    state.currentSegmentTotal = 0;
    state.animate = () => {
      if (state.animations.length === 0) {
        state.pending = false;
        state.renderer.render(state.scene, state.camera);
        return;
      }
      requestAnimationFrame(state.animate);
      if ((state.animations[0] as any).length) {
        if (!state.flag) {
          if ((state.animations[0] as any)[0] === 'add-text') {
            const text = (state.animations[0] as any)[1];
            try { onAddText && onAddText(text); } catch {}
            state.animations.shift();
          } else {
            if (!state.currentSegmentTotal) {
              state.currentSegmentTotal = (state.animations[0] as BoneDelta[]).length;
            }
            for (let i = 0; i < (state.animations[0] as BoneDelta[]).length;) {
              const [boneName, action, axis, limit, sign] = (state.animations[0] as BoneDelta[])[i];
              const object = state.avatar?.getObjectByName(boneName);
              if (!object) {
                (state.animations[0] as BoneDelta[]).splice(i, 1);
                continue;
              }
              if (sign === '+' && object[action][axis] < limit) {
                object[action][axis] += state.speed;
                object[action][axis] = Math.min(object[action][axis], limit);
                i++;
              } else if (sign === '-' && object[action][axis] > limit) {
                object[action][axis] -= state.speed;
                object[action][axis] = Math.max(object[action][axis], limit);
                i++;
              } else {
                (state.animations[0] as BoneDelta[]).splice(i, 1);
              }
            }
            try {
              const remaining = (state.animations[0] as BoneDelta[]).length;
              const total = state.currentSegmentTotal || 1;
              const progress = Math.min(1, Math.max(0, (total - remaining) / total));
              onSegmentProgress && onSegmentProgress(progress);
            } catch {}
          }
        }
      } else {
        state.flag = true;
        setTimeout(() => {
          state.flag = false;
          // After finishing a segment, if the next item is an 'add-text', handle it immediately
          if (state.animations.length && (state.animations[0] as any)[0] === 'add-text') {
            const text = (state.animations[0] as any)[1];
            try { onAddText && onAddText(text); } catch {}
            state.animations.shift();
          }
        }, state.pause);
        state.animations.shift();
        try { onSegmentEnd && onSegmentEnd(); } catch {}
        state.currentSegmentTotal = 0;
      }
      state.renderer.render(state.scene, state.camera);
    };

    return () => {
      window.removeEventListener('resize', onResize);
      if (state.renderer) {
        state.renderer.dispose();
      }
    };
  }, [initialModelUrl, defaultPose]);

  useImperativeHandle(ref, () => ({
    enqueue: (items: AnimationItem[]) => {
      const state = stateRef.current;
      state.animations.push(...items);
      if (!state.pending) {
        state.pending = true;
        state.animate();
      }
    },
    clear: () => {
      stateRef.current.animations = [];
    },
    setSpeed: (s: number) => {
      stateRef.current.speed = s;
    },
    setPauseMs: (ms: number) => {
      stateRef.current.pause = ms;
    },
    loadModel: (url: string) => {
      const state = stateRef.current;
      const loader = new GLTFLoader();
      loader.load(url, (gltf) => {
        if (state.avatar) {
          state.scene.remove(state.avatar);
        }
        gltf.scene.traverse((child: any) => {
          if (child.type === 'SkinnedMesh') {
            child.frustumCulled = false;
          }
        });
        state.avatar = gltf.scene;
        state.scene.add(state.avatar);
      });
    },
    kick: () => {
      const state = stateRef.current;
      if (!state.pending) {
        state.pending = true;
        state.animate();
      }
    },
    getCompatRef: () => stateRef.current,
  }));

  return (
    <div className={className}>
      <div id="signkit-canvas" ref={containerRef} />
    </div>
  );
});

export default AvatarCanvas;


