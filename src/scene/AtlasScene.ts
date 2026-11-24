import {
  ACESFilmicToneMapping,
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Color,
  DoubleSide,
  Euler,
  FrontSide,
  Group,
  Mesh,
  PerspectiveCamera,
  PlaneGeometry,
  Points,
  Quaternion,
  Scene,
  ShaderMaterial,
  SphereGeometry,
  SRGBColorSpace,
  Vector2,
  Vector3,
  WebGLRenderer,
} from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import type { GeoReference, Layout, NewsEvent, SceneOptions, SceneState, ThemeId } from '../domain';
import { themes } from '../domain';
import { eventTitle, messages, placeLabel, themeLabel } from '../i18n';
import type { Locale } from '../i18n';
import { decodeLandPoints } from '../geoCodec';
import {
  buildDust,
  buildLand,
  buildOrbit,
  buildStars,
  clusterScaleForAspect,
  DEFAULT_TILT_X,
  DEFAULT_YAW_Y,
  disposeNode,
  eventSeed,
  GLOBAL_ORBIT_ANGLE,
  globalOrbitPoint,
  latLonToVector,
  THEME_CLUSTERS,
  THEME_EXTENT_X,
  THEME_EXTENT_Y,
  THEME_LABEL_Y,
  THEME_ORDER,
  themeAnchor,
} from './geometry';
import type { DustBuild, LandBuild, LandMaterialUniforms, OrbitBuild, StarBuild } from './geometry';
import {
  atmosphereFragmentShader,
  atmosphereVertexShader,
  backgroundFragmentShader,
  backgroundVertexShader,
  eventFragmentShader,
  eventVertexShader,
  finishFragmentShader,
  finishVertexShader,
  sphereFragmentShader,
  sphereVertexShader,
} from './shaders';
import { buildRegionOutline, disposeRegionOutline } from './regionOutline';
import type { RegionOutline } from './regionOutline';
import type { AnchorRegion } from '../regions';
import landPointData from '../../assets/land-points.json';

const LAND_POINTS = decodeLandPoints(landPointData);
const FOV = 34;
const TAN_HALF = Math.tan((FOV * Math.PI) / 360);
const GLOBE_RADIUS = 1;
const EVENT_RADIUS = 1.006;
const FOCUS_DISTANCE_SCALE = 0.86;
const INITIAL_AUTO_ROTATE_DELAY = 3200;
const DRAG_RADIANS_PER_PIXEL = 0.0042;
const FLING_FRESH_MS = 20;
const FLING_STALE_MS = 80;
const INERTIA_DECAY = 2.8;
const MORPH_RATE = 2.25;
const MOBILE_GLOBAL_ANGLES: Record<ThemeId, number> = { earth: 3.1, economy: 0.05, ai: 2.65, space: 0.5 };
const MOBILE_COMPOSITION: CameraComposition = { cx: 0.5, cy: 0.32, focusX: 0.5, focusY: 0.37 };
const NARROW_COMPOSITION: CameraComposition = { cx: 0.605, cy: 0.5, focusX: 0.59, focusY: 0.47 };
const DESKTOP_COMPOSITION: CameraComposition = { cx: 0.575, cy: 0.5, focusX: 0.555, focusY: 0.47 };

type MarkerRelation = GeoReference['relation'] | 'global';

interface MarkerAccumulator {
  key: string;
  label: string;
  relation: MarkerRelation;
  precision: GeoReference['precision'] | 'global';
  theme: ThemeId;
  eventIds: string[];
  latestTime: number;
  latestEvent: NewsEvent;
  lat: number;
  lon: number;
  global: boolean;
}

interface MarkerRecord {
  key: string;
  label: string;
  relation: MarkerRelation;
  theme: ThemeId;
  color: string;
  eventIds: string[];
  latestEvent: NewsEvent;
  isGlobal: boolean;
  seed: number;
  baseX: number;
  baseY: number;
  baseZ: number;
  themeX: number;
  themeY: number;
  themeZ: number;
  button: HTMLButtonElement;
  labelElement: HTMLSpanElement;
  countElement: HTMLSpanElement;
  labelWidth: number;
  labelDefault: boolean;
  hover: boolean;
  focused: boolean;
  visible: boolean;
  displayed: boolean;
  screenX: number;
  screenY: number;
}

interface ThemeLabelRecord {
  theme: ThemeId;
  element: HTMLDivElement;
  x: number;
  y: number;
  visible: boolean;
}

interface PointerRecord {
  id: number;
  x: number;
  y: number;
}

interface CameraComposition {
  cx: number;
  cy: number;
  focusX: number;
  focusY: number;
}

const tmpVector = new Vector3();
const tmpVectorB = new Vector3();
const tmpVectorC = new Vector3();
const tmpColor = new Color();

function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

function smoothstep(min: number, max: number, value: number): number {
  const t = clamp((value - min) / (max - min), 0, 1);
  return t * t * (3 - 2 * t);
}

function estimateLabelWidth(text: string): number {
  let units = 0;
  for (let i = 0; i < text.length; i++) {
    units += text.charCodeAt(i) > 255 ? 11.5 : 6.2;
  }
  return Math.min(150, Math.ceil(units));
}

export class AtlasScene {
  private readonly canvas: HTMLCanvasElement;
  private readonly overlay: HTMLDivElement;
  private readonly onPick: SceneOptions['onPick'];
  private readonly onReady: SceneOptions['onReady'];
  private readonly onError: SceneOptions['onError'];

  private readonly renderer!: WebGLRenderer;
  private readonly scene = new Scene();
  private readonly camera = new PerspectiveCamera(FOV, 1, 0.1, 100);
  private readonly globeGroup = new Group();
  private readonly earthCore = new Group();
  private readonly markerRoot = document.createElement('div');
  private readonly labelRoot = document.createElement('div');

  private readonly land!: LandBuild;
  private readonly dust!: DustBuild;
  private readonly stars!: StarBuild;
  private readonly orbit!: OrbitBuild;
  private readonly sphereMaterial!: ShaderMaterial;
  private readonly atmosphereMaterial!: ShaderMaterial;
  private readonly orbitMaterial!: OrbitBuild['material'];
  private readonly eventMaterial!: ShaderMaterial;
  private readonly backgroundMaterial!: ShaderMaterial;
  private readonly eventUniforms!: LandMaterialUniforms;
  private themeLabels: ThemeLabelRecord[] = [];
  private markers: MarkerRecord[] = [];
  private markerForEvent = new Map<string, MarkerRecord>();
  private eventPoints: Points | null = null;

  private anchorOutline: RegionOutline | null = null;
  private anchorId: string | null = null;
  private anchorOpacity = 0;

  private composer: EffectComposer | null = null;
  private bloomPass: UnrealBloomPass | null = null;
  private finishPass: ShaderPass | null = null;
  private outputPass: OutputPass | null = null;
  private postFailed = false;
  private resizeObserver: ResizeObserver | null = null;
  private rafHandle = 0;
  private disposed = false;
  private failed = false;
  private lastError = '';
  private contextLost = false;
  private contextErrorShown = false;
  private readyFired = false;

  private width = 1;
  private height = 1;
  private pixelRatio = 1;
  private mobile = false;
  private overlayOffsetX = 0;
  private overlayOffsetY = 0;
  private baseDistance = 4;
  private themeDistance = 4.4;
  private cameraDistance = 4;
  private cameraLookX = 0;
  private cameraLookY = 0;
  private desiredLookX = 0;
  private desiredLookY = 0;
  private zoom = 1;
  private zoomTarget = 1;
  private themeScale = 1;
  private orbitScale = 1;
  private progress = 0;
  private targetProgress = 0;
  private intro = 0;
  private elapsed = 0;
  private reducedMotion = false;
  private locale: Locale = 'zh-CN';
  private quality: SceneState['quality'] = 'full';
  private railOpen = true;
  private selectedId: string | null = null;
  private layoutTarget: Layout = 'globe';
  private lastEventsRef: readonly NewsEvent[] | null = null;
  private lastFrame = 0;
  private lastDraw = 0;
  private lastInteraction = 0;
  private lastDatasetPhase = -1;
  private lastDeclutter = 0;
  private hasSized = false;

  private readonly defaultQuat = new Quaternion();
  private readonly globeTargetQuat = new Quaternion();
  private readonly savedGlobeQuat = new Quaternion();
  private readonly dragQuat = new Quaternion();
  private readonly dragEuler = new Euler(0, 0, 0, 'YXZ');
  private readonly focusQuat = new Quaternion();
  private readonly focusEuler = new Euler(0, 0, 0, 'YXZ');
  private readonly focusScratch = new Vector3();
  private focusRecord: MarkerRecord | null = null;
  private detachedFraming: { lookX: number; lookY: number; distanceScale: number } | null = null;
  private pendingFocusId: string | null = null;
  private themeTiltX = 0;
  private themeTiltY = 0;
  private velocityX = 0;
  private velocityY = 0;
  private inertiaSince = 0;

  private readonly pointers: PointerRecord[] = [];
  private pointerLastTime = 0;
  private dragDistance = 0;
  private pinchStartDistance = 0;
  private pinchStartZoom = 1;
  private suppressClickUntil = 0;

  private readonly labelRects: number[] = [];
  private labelForced: MarkerRecord[] = [];

  private readonly onVisibilityChange = (): void => {
    if (this.disposed || this.failed) return;
    if (document.hidden) {
      this.stopLoop();
    } else {
      this.lastFrame = 0;
      this.wake();
    }
  };

  private readonly onWindowResize = (): void => {
    this.resize();
    this.wake();
  };

  private readonly onWheel = (event: WheelEvent): void => {
    if (this.disposed || this.failed || this.contextLost) return;
    event.preventDefault();
    const delta = event.deltaY;
    const factor = Math.exp(clamp(delta, -240, 240) * 0.00135);
    this.zoomTarget = clamp(this.zoomTarget * factor, 0.72, 1.56);
    this.lastInteraction = performance.now();
    this.velocityX = 0;
    this.velocityY = 0;
    this.wake();
  };

  private readonly onPointerDown = (event: PointerEvent): void => {
    if (this.disposed || this.failed || this.contextLost) return;
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    if (this.pointers.length >= 2) return;
    this.canvas.setPointerCapture(event.pointerId);
    this.pointers.push({ id: event.pointerId, x: event.clientX, y: event.clientY });
    this.pointerLastTime = event.timeStamp;
    this.lastInteraction = performance.now();
    if (this.pointers.length === 1) {
      this.dragDistance = 0;
      this.velocityX = 0;
      this.velocityY = 0;
    } else {
      const first = this.pointers[0];
      const second = this.pointers[1];
      this.pinchStartDistance = Math.hypot(second.x - first.x, second.y - first.y);
      this.pinchStartZoom = this.zoomTarget;
      this.dragDistance = 10;
    }
    this.wake();
  };

  private readonly onPointerMove = (event: PointerEvent): void => {
    if (this.disposed || this.failed || this.contextLost) return;
    const pointer = this.pointers.find(item => item.id === event.pointerId);
    if (!pointer) return;
    const dx = event.clientX - pointer.x;
    const dy = event.clientY - pointer.y;
    if (dx === 0 && dy === 0) return;
    pointer.x = event.clientX;
    pointer.y = event.clientY;
    this.lastInteraction = performance.now();
    const deltaSeconds = Math.max(8, event.timeStamp - this.pointerLastTime) / 1000;
    this.pointerLastTime = event.timeStamp;

    if (this.pointers.length >= 2) {
      const first = this.pointers[0];
      const second = this.pointers[1];
      const distance = Math.hypot(second.x - first.x, second.y - first.y);
      if (this.pinchStartDistance > 4 && distance > 4) {
        this.zoomTarget = clamp(this.pinchStartZoom * (this.pinchStartDistance / distance), 0.72, 1.56);
      }
      this.dragDistance = 12;
      this.velocityX = 0;
      this.velocityY = 0;
      this.wake();
      return;
    }

    this.dragDistance += Math.abs(dx) + Math.abs(dy);
    if (this.dragDistance > 6) this.suppressClickUntil = performance.now() + 220;

    if (this.layoutTarget === 'globe' && this.focusRecord) {
      if (this.dragDistance <= 6) return;
      const distance = this.cameraDistance;
      // Keep the view at the handoff pose instead of chasing a marker as it rotates.
      this.detachedFraming = {
        lookX: this.cameraLookX / distance,
        lookY: this.cameraLookY / distance,
        distanceScale: distance * FOCUS_DISTANCE_SCALE / this.desiredCameraDistance(),
      };
      this.focusRecord = null;
      this.pendingFocusId = null;
    }

    if (this.layoutTarget === 'themes') {
      this.themeTiltY = clamp(this.themeTiltY + dx * 0.0021, -0.26, 0.26);
      this.themeTiltX = clamp(this.themeTiltX + dy * 0.0015, -0.16, 0.16);
      this.globeTargetQuat.setFromEuler(this.dragEuler.set(this.themeTiltX, this.themeTiltY, 0, 'YXZ'));
      this.velocityX = 0;
      this.velocityY = 0;
    } else {
      const pitch = dy * DRAG_RADIANS_PER_PIXEL;
      const yaw = dx * DRAG_RADIANS_PER_PIXEL;
      this.dragEuler.set(pitch, yaw, 0, 'YXZ');
      this.dragQuat.setFromEuler(this.dragEuler);
      this.globeGroup.quaternion.premultiply(this.dragQuat);
      this.globeTargetQuat.copy(this.globeGroup.quaternion);
      const weight = Math.pow(0.55, deltaSeconds * 60);
      this.velocityY = this.velocityY * weight + clamp(yaw / deltaSeconds, -3.4, 3.4) * (1 - weight);
      this.velocityX = this.velocityX * weight + clamp(pitch / deltaSeconds, -3.4, 3.4) * (1 - weight);
    }
    this.wake();
  };

  private readonly endPointer = (event: PointerEvent): void => {
    const index = this.pointers.findIndex(item => item.id === event.pointerId);
    if (index < 0) return;
    const released = event.type === 'pointerup';
    if (released && this.pointers.length === 1) this.onPointerMove(event);
    this.pointers.splice(index, 1);
    if (this.canvas.hasPointerCapture(event.pointerId)) this.canvas.releasePointerCapture(event.pointerId);
    if (this.pointers.length === 1) {
      this.pinchStartDistance = 0;
      this.pointerLastTime = event.timeStamp;
      return;
    }
    const carry = released && !this.reducedMotion && this.dragDistance > 6 && this.selectedId === null
      && this.layoutTarget === 'globe' && this.progress < 0.05
      ? 1 - smoothstep(FLING_FRESH_MS, FLING_STALE_MS, event.timeStamp - this.pointerLastTime)
      : 0;
    this.velocityX *= carry;
    this.velocityY *= carry;
    this.inertiaSince = event.timeStamp;
    this.lastInteraction = performance.now();
    this.wake();
  };

  private readonly onContextLost = (event: Event): void => {
    event.preventDefault();
    if (this.disposed) return;
    this.contextLost = true;
    this.stopLoop();
    this.contextErrorShown = true;
    this.reportTransientError('三维上下文暂时中断，正在等待浏览器恢复。');
  };

  private readonly onContextRestored = (): void => {
    if (this.disposed) return;
    this.contextLost = false;
    this.disposePost();
    this.resize();
    this.contextRecoveryPending = true;
    this.wake();
  };

  private contextRecoveryPending = false;

  constructor(options: SceneOptions) {
    this.canvas = options.canvas;
    this.overlay = options.overlay;
    this.onPick = options.onPick;
    this.onReady = options.onReady;
    this.onError = options.onError;
    this.canvas.dataset.ready = 'false';
    this.canvas.dataset.layout = 'globe';
    this.canvas.dataset.quality = 'full';
    this.canvas.dataset.anchor = '';
    this.markerRoot.style.position = 'absolute';
    this.markerRoot.style.inset = '0';
    this.markerRoot.style.overflow = 'hidden';
    this.markerRoot.style.pointerEvents = 'none';
    this.markerRoot.style.zIndex = '2';
    this.labelRoot.style.position = 'absolute';
    this.labelRoot.style.inset = '0';
    this.labelRoot.style.overflow = 'hidden';
    this.labelRoot.style.pointerEvents = 'none';
    this.labelRoot.style.zIndex = '1';
    this.overlay.appendChild(this.labelRoot);
    this.overlay.appendChild(this.markerRoot);

    try {
      this.renderer = new WebGLRenderer({
        canvas: this.canvas,
        antialias: true,
        alpha: false,
        powerPreference: 'high-performance',
        stencil: false,
      });
      this.renderer.outputColorSpace = SRGBColorSpace;
      this.renderer.toneMapping = ACESFilmicToneMapping;
      this.renderer.toneMappingExposure = 1.08;
      this.renderer.debug.checkShaderErrors = true;
      this.renderer.debug.onShaderError = (gl, program, vertexShader, fragmentShader): void => {
        const vertexLog = gl.getShaderInfoLog(vertexShader) || '';
        const fragmentLog = gl.getShaderInfoLog(fragmentShader) || '';
        const programLog = gl.getProgramInfoLog(program) || '';
        const log = (fragmentLog || vertexLog || programLog).trim().replace(/\s+/g, ' ').slice(0, 180);
        this.reportError(log ? `着色器编译失败：${log}` : '着色器编译失败。');
      };
    } catch (error) {
      this.reportError(this.describeError(error, '无法初始化 WebGL 场景。'));
      return;
    }

    this.defaultQuat.setFromEuler(new Euler(DEFAULT_TILT_X, DEFAULT_YAW_Y, 0, 'YXZ'));
    this.globeGroup.quaternion.copy(this.defaultQuat);
    this.globeTargetQuat.copy(this.defaultQuat);
    this.savedGlobeQuat.copy(this.defaultQuat);
    this.scene.add(this.globeGroup);

    const backgroundMaterial = new ShaderMaterial({
      uniforms: {
        uDeep: { value: new Color('#03090b') },
        uGlow: { value: new Color('#0a1c1e') },
        uHorizon: { value: new Color('#183c3a') },
        uCenter: { value: new Vector2(0.55, 0.5) },
        uAspect: { value: 1.6 },
        uIntro: { value: 0 },
      },
      vertexShader: backgroundVertexShader,
      fragmentShader: backgroundFragmentShader,
      depthTest: false,
      depthWrite: false,
    });
    this.backgroundMaterial = backgroundMaterial;
    const background = new Mesh(new PlaneGeometry(2, 2), backgroundMaterial);
    background.frustumCulled = false;
    background.renderOrder = -100;
    this.scene.add(background);

    this.stars = buildStars(540);
    const starPoints = new Points(this.stars.geometry, this.stars.material);
    starPoints.frustumCulled = false;
    starPoints.renderOrder = -50;
    this.scene.add(starPoints);

    this.land = buildLand(LAND_POINTS);
    const landPoints = new Points(this.land.geometry, this.land.material);
    landPoints.frustumCulled = false;
    landPoints.renderOrder = 2;
    this.globeGroup.add(landPoints);

    this.dust = buildDust(1900);
    const dustPoints = new Points(this.dust.geometry, this.dust.material);
    dustPoints.frustumCulled = false;
    dustPoints.renderOrder = 1;
    this.globeGroup.add(dustPoints);

    this.sphereMaterial = new ShaderMaterial({
      uniforms: {
        uDeep: { value: new Color('#041012') },
        uMid: { value: new Color('#0a2020') },
        uRim: { value: new Color('#284a45') },
        uOpacity: { value: 1 },
      },
      vertexShader: sphereVertexShader,
      fragmentShader: sphereFragmentShader,
      transparent: true,
      depthWrite: false,
      side: FrontSide, // Do not blend unordered rear triangles over the globe fill.
    });
    const sphere = new Mesh(new SphereGeometry(GLOBE_RADIUS, 64, 48), this.sphereMaterial);
    sphere.renderOrder = 0;
    this.earthCore.add(sphere);

    this.atmosphereMaterial = new ShaderMaterial({
      uniforms: {
        uColor: { value: new Color('#5f9c91') },
        uOpacity: { value: 1 },
      },
      vertexShader: atmosphereVertexShader,
      fragmentShader: atmosphereFragmentShader,
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      side: DoubleSide,
    });
    const atmosphere = new Mesh(new SphereGeometry(1.018, 64, 48), this.atmosphereMaterial);
    atmosphere.renderOrder = 3;
    this.earthCore.add(atmosphere);
    this.globeGroup.add(this.earthCore);

    this.orbit = buildOrbit();
    this.orbitMaterial = this.orbit.material;
    this.orbit.line.renderOrder = 1;
    this.globeGroup.add(this.orbit.line);

    this.eventUniforms = {
      uProgress: { value: 0 },
      uThemeScale: { value: 1 },
      uPixelRatio: { value: 1 },
      uCameraDistance: { value: 4 },
      uIntro: { value: 0 },
      uPointScale: { value: 1 },
    };
    this.eventMaterial = new ShaderMaterial({
      uniforms: this.eventUniforms,
      vertexShader: eventVertexShader,
      fragmentShader: eventFragmentShader,
      transparent: true,
      depthWrite: false,
      depthTest: true,
      blending: AdditiveBlending,
    });

    this.buildThemeLabels();
    this.camera.position.set(0, 0, this.baseDistance);
    this.camera.lookAt(0, 0, 0);

    this.resizeObserver = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => this.resize());
    this.resizeObserver?.observe(this.canvas);
    window.addEventListener('resize', this.onWindowResize, { passive: true });
    document.addEventListener('visibilitychange', this.onVisibilityChange);
    this.canvas.addEventListener('webglcontextlost', this.onContextLost, false);
    this.canvas.addEventListener('webglcontextrestored', this.onContextRestored, false);
    this.canvas.addEventListener('wheel', this.onWheel, { passive: false });
    this.canvas.addEventListener('pointerdown', this.onPointerDown);
    this.canvas.addEventListener('pointermove', this.onPointerMove);
    this.canvas.addEventListener('pointerup', this.endPointer);
    this.canvas.addEventListener('pointercancel', this.endPointer);
    this.resize();
    this.wake();
  }

  update(state: SceneState): void {
    if (this.disposed || this.failed) return;
    this.reducedMotion = state.reducedMotion;
    const qualityChanged = state.quality !== this.quality;
    this.quality = state.quality;
    if (qualityChanged) this.applyQuality();
    const railChanged = state.railOpen !== this.railOpen;
    this.railOpen = state.railOpen;
    if (railChanged) this.lastDeclutter = -Infinity;

    const layoutChanged = state.layout !== this.layoutTarget;
    if (layoutChanged) {
      this.detachedFraming = null;
      this.velocityX = 0;
      this.velocityY = 0;
      const previousLayout = this.layoutTarget;
      this.layoutTarget = state.layout;
      this.canvas.dataset.layout = state.layout;
      if (state.layout === 'themes') {
        if (previousLayout === 'globe') this.savedGlobeQuat.copy(this.globeGroup.quaternion);
        this.themeTiltX = 0;
        this.themeTiltY = 0;
        this.globeTargetQuat.identity();
      } else if (!state.selectedId || !this.resolveFocus(state.selectedId)) {
        this.globeTargetQuat.copy(this.savedGlobeQuat);
      }
    }
    this.targetProgress = state.layout === 'themes' ? 1 : 0;
    if (state.reducedMotion) {
      this.progress = this.targetProgress;
      this.intro = 1;
      this.velocityX = 0;
      this.velocityY = 0;
    }

    const selectionChanged = state.selectedId !== this.selectedId;
    this.selectedId = state.selectedId;
    const eventsChanged = state.events !== this.lastEventsRef;
    if (eventsChanged) {
      this.lastEventsRef = state.events;
      this.rebuildMarkers(state.events);
    } else {
      this.applySelection();
    }
    if (this.focusRecord && !this.markers.includes(this.focusRecord)) this.focusRecord = null;
    this.canvas.dataset.selected = state.selectedId ?? '';

    if (selectionChanged) {
      if (state.selectedId) {
        if (!this.resolveFocus(state.selectedId)) this.focusRecord = null;
      } else {
        this.focusRecord = null;
      }
    }
    this.wake();
  }

  setLocale(locale: Locale): void {
    if (this.locale === locale || this.disposed || this.failed) return;
    this.locale = locale;
    for (const marker of this.markers) this.updateMarkerText(marker);
    for (const label of this.themeLabels) label.element.textContent = themeLabel(label.theme, locale);
    this.lastDeclutter = -Infinity;
    this.wake();
  }

  focusEvent(id: string): void {
    if (this.disposed || this.failed) return;
    if (!this.resolveFocus(id)) this.pendingFocusId = id;
    this.wake();
  }

  resetView(): void {
    if (this.disposed || this.failed) return;
    this.focusRecord = null;
    this.detachedFraming = null;
    this.pendingFocusId = null;
    this.zoomTarget = 1;
    this.velocityX = 0;
    this.velocityY = 0;
    this.themeTiltX = 0;
    this.themeTiltY = 0;
    this.savedGlobeQuat.copy(this.defaultQuat);
    this.globeTargetQuat.copy(this.defaultQuat);
    this.lastInteraction = performance.now();
    this.wake();
  }

  /**
   * Draws the selected country's boundary on the globe. `reveal` turns the
   * globe toward the region only while the globe is active and no reader is open.
   */
  setAnchorRegion(region: AnchorRegion | null, reveal: boolean): void {
    if (this.disposed || this.failed) return;
    if (!region) {
      this.clearAnchor();
      this.wake();
      return;
    }
    if (this.anchorId !== region.id || !this.anchorOutline) {
      this.clearAnchor();
      const outline = buildRegionOutline(region, GLOBE_RADIUS);
      if (!outline) {
        this.wake();
        return;
      }
      outline.material.uniforms.uOpacity.value = 0;
      this.anchorOutline = outline;
      this.anchorId = region.id;
      this.anchorOpacity = 0;
      this.earthCore.add(outline.root);
    }
    this.canvas.dataset.anchor = region.id;
    if (reveal) this.revealAnchor(region);
    this.wake();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.stopLoop();
    this.resizeObserver?.disconnect();
    window.removeEventListener('resize', this.onWindowResize);
    document.removeEventListener('visibilitychange', this.onVisibilityChange);
    this.canvas.removeEventListener('webglcontextlost', this.onContextLost);
    this.canvas.removeEventListener('webglcontextrestored', this.onContextRestored);
    this.canvas.removeEventListener('wheel', this.onWheel);
    this.canvas.removeEventListener('pointerdown', this.onPointerDown);
    this.canvas.removeEventListener('pointermove', this.onPointerMove);
    this.canvas.removeEventListener('pointerup', this.endPointer);
    this.canvas.removeEventListener('pointercancel', this.endPointer);

    this.disposePost();
    this.clearAnchor();

    for (const child of [...this.scene.children]) {
      this.scene.remove(child);
      disposeNode(child);
    }
    if (this.eventMaterial) this.eventMaterial.dispose();
    if (this.renderer) {
      this.renderer.dispose();
      this.renderer.debug.onShaderError = null;
    }
    this.eventPoints = null;
    this.markers = [];
    this.markerForEvent.clear();
    this.markerRoot.remove();
    this.labelRoot.remove();
    this.themeLabels = [];
    this.lastEventsRef = null;
    this.canvas.dataset.ready = 'false';
    this.canvas.dataset.markers = '0';
  }

  private revealAnchor(region: AnchorRegion): void {
    if (this.layoutTarget !== 'globe' || this.selectedId !== null) return;
    const focus = region.focus;
    if (!focus || focus.length < 2) return;
    const lon = focus[0];
    const lat = focus[1];
    if (!Number.isFinite(lon) || !Number.isFinite(lat)) return;
    const vector = latLonToVector(clamp(lat, -90, 90), lon);
    const focusLat = Math.asin(clamp(vector[1], -1, 1));
    const focusLon = Math.atan2(vector[2], vector[0]);
    this.focusEuler.set(focusLat, focusLon - Math.PI / 2, 0, 'XYZ');
    this.focusQuat.setFromEuler(this.focusEuler);
    this.globeTargetQuat.copy(this.focusQuat);
    this.savedGlobeQuat.copy(this.focusQuat);
    this.velocityX = 0;
    this.velocityY = 0;
    this.lastInteraction = performance.now();
  }

  private clearAnchor(): void {
    if (this.anchorOutline) {
      disposeRegionOutline(this.anchorOutline);
      this.anchorOutline = null;
    }
    this.anchorId = null;
    this.anchorOpacity = 0;
    this.canvas.dataset.anchor = '';
  }

  private updateAnchor(dt: number): void {
    const outline = this.anchorOutline;
    if (!outline) return;
    const target = (1 - smoothstep(0.16, 0.52, this.progress)) * this.intro;
    if (this.reducedMotion) this.anchorOpacity = target;
    else this.anchorOpacity += (target - this.anchorOpacity) * (1 - Math.exp(-14 * dt));
    if (target < 0.002 && this.anchorOpacity < 0.004) this.anchorOpacity = 0;
    outline.material.uniforms.uOpacity.value = this.anchorOpacity;
    outline.root.visible = this.anchorOpacity > 0.004;
  }

  private resolveFocus(id: string): boolean {
    const record = this.markerForEvent.get(id);
    if (!record) return false;
    this.focusRecord = record;
    this.detachedFraming = null;
    this.velocityX = 0;
    this.velocityY = 0;
    this.pendingFocusId = null;
    if (!record.isGlobal && this.layoutTarget === 'globe') {
      const lat = Math.asin(clamp(record.baseY / EVENT_RADIUS, -1, 1));
      const lon = Math.atan2(record.baseZ, record.baseX);
      this.focusEuler.set(lat, lon - Math.PI / 2, 0, 'XYZ');
      this.focusQuat.setFromEuler(this.focusEuler);
      this.globeTargetQuat.copy(this.focusQuat);
    }
    this.applySelection();
    return true;
  }

  private rebuildMarkers(events: readonly NewsEvent[]): void {
    if (this.eventPoints) {
      this.globeGroup.remove(this.eventPoints);
      this.eventPoints.geometry.dispose();
      this.eventPoints = null;
    }
    this.markers = [];
    this.markerForEvent = new Map();
    this.markerRoot.replaceChildren();
    this.labelRects.length = 0;
    this.labelForced.length = 0;

    const accumulators = new Map<string, MarkerAccumulator>();
    const publishedTimes = new Map<string, number>();

    for (const event of events) {
      const published = Date.parse(event.publishedAt);
      const publishedTime = Number.isFinite(published) ? published : 0;
      publishedTimes.set(event.id, Math.max(publishedTime, publishedTimes.get(event.id) ?? 0));
      let eventHasLocation = false;
      for (const location of event.locations) {
        if (!Number.isFinite(location.lat) || !Number.isFinite(location.lon)) continue;
        const lat = clamp(location.lat, -90, 90);
        const lon = ((location.lon + 540) % 360) - 180;
        eventHasLocation = true;
        const key = `${location.relation}:${lat.toFixed(2)}:${lon.toFixed(2)}`;
        let group = accumulators.get(key);
        if (!group) {
          group = {
            key,
            label: location.label,
            relation: location.relation,
            precision: location.precision,
            theme: event.theme,
            eventIds: [],
            latestTime: publishedTime,
            latestEvent: event,
            lat,
            lon,
            global: false,
          };
          accumulators.set(key, group);
        }
        if (!group.eventIds.includes(event.id)) group.eventIds.push(event.id);
        if (publishedTime >= group.latestTime) {
          group.latestTime = publishedTime;
          group.latestEvent = event;
          group.theme = event.theme;
        }
      }
      if (!eventHasLocation) {
        const key = `global:${event.theme}`;
        let group = accumulators.get(key);
        if (!group) {
          group = {
            key,
            label: '',
            relation: 'global',
            precision: 'global',
            theme: event.theme,
            eventIds: [],
            latestTime: publishedTime,
            latestEvent: event,
            lat: 0,
            lon: 0,
            global: true,
          };
          accumulators.set(key, group);
        }
        group.eventIds.push(event.id);
      }
    }

    const groups = [...accumulators.values()].sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));

    const positions = new Float32Array(groups.length * 3);
    const themePositions = new Float32Array(groups.length * 3);
    const colors = new Float32Array(groups.length * 3);
    const seeds = new Float32Array(groups.length);
    const sizes = new Float32Array(groups.length);
    const culls = new Float32Array(groups.length);

    for (let index = 0; index < groups.length; index++) {
      const group = groups[index];
      group.eventIds.sort((a, b) => (publishedTimes.get(b) ?? 0) - (publishedTimes.get(a) ?? 0));
      const globalAngle = this.mobile
        ? MOBILE_GLOBAL_ANGLES[group.theme]
        : GLOBAL_ORBIT_ANGLE + (THEME_ORDER.indexOf(group.theme) - 2.5) * 0.24;
      const base = group.global
        ? globalOrbitPoint(globalAngle).map(value => value * this.orbitScale)
        : latLonToVector(group.lat, group.lon).map(value => value * EVENT_RADIUS);
      const localTheme = themeAnchor(group.theme, group.key, 1);
      const seed = eventSeed(group.key);
      const colorString = themes[group.theme].color;
      tmpColor.set(colorString);
      colors[index * 3] = tmpColor.r;
      colors[index * 3 + 1] = tmpColor.g;
      colors[index * 3 + 2] = tmpColor.b;
      positions[index * 3] = base[0];
      positions[index * 3 + 1] = base[1];
      positions[index * 3 + 2] = base[2];
      themePositions[index * 3] = localTheme[0];
      themePositions[index * 3 + 1] = localTheme[1];
      themePositions[index * 3 + 2] = localTheme[2];
      seeds[index] = seed;
      sizes[index] = 2.3 + Math.min(4.2, Math.sqrt(group.eventIds.length) * 1.45);
      culls[index] = group.global ? 0 : 1;

      const record: MarkerRecord = {
        key: group.key,
        label: group.label,
        relation: group.relation,
        theme: group.theme,
        color: colorString,
        eventIds: group.eventIds,
        latestEvent: group.latestEvent,
        isGlobal: group.global,
        seed,
        baseX: base[0],
        baseY: base[1],
        baseZ: base[2],
        themeX: localTheme[0],
        themeY: localTheme[1],
        themeZ: localTheme[2],
        button: document.createElement('button'),
        labelElement: document.createElement('span'),
        countElement: document.createElement('span'),
        labelWidth: 0,
        labelDefault: false,
        hover: false,
        focused: false,
        visible: false,
        displayed: false,
        screenX: 0,
        screenY: 0,
      };
      this.createMarkerElement(record, group);
      this.markers.push(record);
      for (const eventId of group.eventIds) {
        const existing = this.markerForEvent.get(eventId);
        if (!existing || (existing.relation !== 'event' && record.relation === 'event')) {
          this.markerForEvent.set(eventId, record);
        }
      }
    }

    if (groups.length > 0) {
      const geometry = new BufferGeometry();
      geometry.setAttribute('position', new BufferAttribute(positions, 3));
      geometry.setAttribute('aTheme', new BufferAttribute(themePositions, 3));
      geometry.setAttribute('aColor', new BufferAttribute(colors, 3));
      geometry.setAttribute('aSeed', new BufferAttribute(seeds, 1));
      geometry.setAttribute('aSize', new BufferAttribute(sizes, 1));
      geometry.setAttribute('aCull', new BufferAttribute(culls, 1));
      this.eventPoints = new Points(geometry, this.eventMaterial);
      this.eventPoints.frustumCulled = false;
      this.eventPoints.renderOrder = 4;
      this.globeGroup.add(this.eventPoints);
    }

    this.canvas.dataset.markers = String(this.markers.length);
    if (this.selectedId && !this.detachedFraming) {
      const selectedRecord = this.markerForEvent.get(this.selectedId);
      if (selectedRecord) this.focusRecord = selectedRecord;
    }
    if (this.pendingFocusId) {
      const pending = this.pendingFocusId;
      if (!this.resolveFocus(pending)) this.pendingFocusId = null;
    }
    this.applySelection();
  }

  private createMarkerElement(record: MarkerRecord, group: MarkerAccumulator): void {
    const button = record.button;
    button.type = 'button';
    button.className = `atlas-marker${record.isGlobal ? ' is-global' : ''}`;
    button.style.left = '0';
    button.style.top = '0';
    button.style.pointerEvents = 'auto';
    button.style.zIndex = '2';
    button.dataset.relation = record.relation;
    button.dataset.precision = group.precision;
    button.dataset.count = String(record.eventIds.length);
    button.style.setProperty('--marker-color', record.color);
    button.style.setProperty('--event-color', record.color);

    const dot = document.createElement('span');
    dot.className = 'marker-dot';
    dot.setAttribute('aria-hidden', 'true');
    const label = record.labelElement;
    label.className = 'marker-label';
    const count = record.countElement;
    count.className = 'marker-count';
    count.textContent = String(record.eventIds.length);
    count.hidden = record.eventIds.length <= 1;
    count.setAttribute('aria-hidden', 'true');
    button.append(dot, label, count);
    button.tabIndex = -1;
    button.style.display = 'none';
    label.style.display = 'none';

    this.updateMarkerText(record);
    button.setAttribute('aria-pressed', 'false');

    button.addEventListener('pointerdown', event => event.stopPropagation());
    button.addEventListener('click', event => {
      event.stopPropagation();
      if (performance.now() < this.suppressClickUntil) return;
      if (this.disposed || this.failed) return;
      const first = record.eventIds[0];
      if (!first) return;
      this.focusEvent(first);
      this.onPick(first, record.eventIds.slice());
    });
    button.addEventListener('pointerenter', () => {
      record.hover = true;
      this.setLabelDisplay(record, true);
    });
    button.addEventListener('pointerleave', () => {
      record.hover = false;
      this.setLabelDisplay(record, record.labelDefault || record.focused);
    });
    button.addEventListener('focus', () => {
      record.focused = true;
      this.setLabelDisplay(record, true);
    });
    button.addEventListener('blur', () => {
      record.focused = false;
      this.setLabelDisplay(record, record.labelDefault || record.hover);
    });

    this.markerRoot.appendChild(button);
  }

  private updateMarkerText(record: MarkerRecord): void {
    const locale = this.locale;
    const chinese = locale === 'zh-CN';
    const t = messages[locale];
    const theme = themeLabel(record.theme, locale);
    const global = t.footer.global;
    const place = record.label ? placeLabel(record.label, locale) : '';
    const name = record.isGlobal ? `${theme} · ${chinese ? '未定位' : 'Unlocated'}` : place || (chinese ? '未命名地点' : 'Unnamed place');
    const count = record.eventIds.length;
    const group = count > 1;
    const relation = record.relation === 'global' ? global : t.reader.relations[record.relation];
    const title = eventTitle(record.latestEvent, locale);
    const detail = chinese
      ? record.isGlobal ? `${global}，${theme}，${count} 条线索` : group ? `${name}，${count} 条线索，${relation}` : `${name}：${title}。${relation}`
      : record.isGlobal ? `${global}, ${theme}, ${count} ${count === 1 ? 'event' : 'events'}` : group ? `${name}, ${count} events, ${relation}` : `${name}: ${title}. ${relation}`;
    record.labelElement.textContent = name;
    record.labelWidth = estimateLabelWidth(name) + (count > 1 ? 28 : 0);
    record.button.setAttribute('aria-label', `${detail}${chinese ? (group ? '。按回车查看。' : '。按回车打开。') : (group ? '. Press Enter to view.' : '. Press Enter to open.')}`);
    record.button.dataset.tooltip = chinese ? `${group ? '查看线索' : '阅读资讯'} · ${name}` : `${group ? 'View events' : 'Read event'} · ${name}`;
  }

  private buildThemeLabels(): void {
    for (const theme of THEME_ORDER) {
      const element = document.createElement('div');
      element.className = 'atlas-theme-label';
      element.setAttribute('aria-hidden', 'true');
      element.textContent = themeLabel(theme, this.locale);
      element.style.left = '0';
      element.style.top = '0';
      element.style.display = 'none';
      element.style.pointerEvents = 'none';
      this.labelRoot.appendChild(element);
      this.themeLabels.push({ theme, element, x: 0, y: 0, visible: false });
    }
  }


  private applySelection(): void {
    for (const record of this.markers) {
      const selected = this.selectedId !== null && record.eventIds.includes(this.selectedId);
      record.button.classList.toggle('is-selected', selected);
      record.button.setAttribute('aria-pressed', selected ? 'true' : 'false');
      record.button.style.zIndex = selected ? '5' : '2';
      if (selected) {
        record.labelDefault = true;
        this.setLabelDisplay(record, true);
      }
    }
  }

  private setLabelDisplay(record: MarkerRecord, show: boolean): void {
    if (!record.button.isConnected) return;
    const next = show ? '' : 'none';
    if (record.labelElement.style.display !== next) record.labelElement.style.display = next;
  }

  private describeError(error: unknown, fallback: string): string {
    if (error instanceof Error && error.message) {
      return `${fallback} ${error.message}`.slice(0, 260);
    }
    return fallback;
  }

  private reportError(message: string): void {
    if (this.disposed) return;
    this.failed = true;
    this.stopLoop();
    this.recordNotice(message);
  }

  private reportTransientError(message: string): void {
    if (this.disposed) return;
    this.recordNotice(message);
  }

  private recordNotice(message: string): void {
    if (this.lastError === message) return;
    this.lastError = message;
    this.canvas.dataset.error = message;
    this.onError(message);
  }

  private disposePost(): void {
    this.finishPass?.material.dispose();
    this.outputPass?.material.dispose();
    const bloom = this.bloomPass as (UnrealBloomPass & { dispose?: () => void }) | null;
    bloom?.dispose?.();
    this.composer?.dispose();
    this.composer = null;
    this.bloomPass = null;
    this.finishPass = null;
    this.outputPass = null;
    this.postFailed = false;
  }

  private applyQuality(): void {
    if (this.failed || this.disposed) return;
    this.canvas.dataset.quality = this.quality;
    this.syncRendererSize();
    if (this.quality === 'full') this.ensureComposer();
    if (this.quality === 'light') this.composer?.setPixelRatio(this.pixelRatio);
  }

  private ensureComposer(): void {
    if (this.composer || this.postFailed || this.failed || this.quality !== 'full') return;
    try {
      const size = this.renderer.getSize(new Vector2());
      const composer = new EffectComposer(this.renderer);
      const renderPass = new RenderPass(this.scene, this.camera);
      const bloom = new UnrealBloomPass(new Vector2(size.x, size.y), 0.34, 0.58, 0.34);
      const output = new OutputPass();
      const finish = new ShaderPass({
        uniforms: {
          tDiffuse: { value: null },
          uResolution: { value: new Vector2(1, 1) },
          uTime: { value: 0 },
        },
        vertexShader: finishVertexShader,
        fragmentShader: finishFragmentShader,
      });
      composer.addPass(renderPass);
      composer.addPass(bloom);
      composer.addPass(output);
      composer.addPass(finish);
      composer.setPixelRatio(this.pixelRatio);
      composer.setSize(this.width, this.height);
      finish.uniforms.uResolution.value.set(this.width * this.pixelRatio, this.height * this.pixelRatio);
      this.composer = composer;
      this.bloomPass = bloom;
      this.outputPass = output;
      this.finishPass = finish;
    } catch (error) {
      this.postFailed = true;
      this.composer = null;
      this.reportTransientError(this.describeError(error, '后处理不可用，已保留轻量场景。'));
    }
  }

  private syncRendererSize(): void {
    if (this.failed || this.disposed || !this.renderer) return;
    const dprCap = this.quality === 'light' ? 1.25 : 1.75;
    this.pixelRatio = Math.min(window.devicePixelRatio || 1, dprCap);
    this.renderer.setPixelRatio(this.pixelRatio);
    this.renderer.setSize(this.width, this.height, false);
    this.canvas.style.width = '100%';
    this.canvas.style.height = '100%';
    this.land.uniforms.uPixelRatio.value = this.pixelRatio;
    this.dust.uniforms.uPixelRatio.value = this.pixelRatio;
    this.stars.material.uniforms.uPixelRatio.value = this.pixelRatio;
    this.eventUniforms.uPixelRatio.value = this.pixelRatio;
    if (this.composer) {
      this.composer.setPixelRatio(this.pixelRatio);
      this.composer.setSize(this.width, this.height);
      this.finishPass?.uniforms.uResolution.value.set(this.width * this.pixelRatio, this.height * this.pixelRatio);
    }
  }

  private resize(): void {
    if (this.disposed || this.failed) return;
    const rect = this.canvas.getBoundingClientRect();
    this.width = Math.max(1, Math.round(rect.width || this.overlay.clientWidth || window.innerWidth));
    this.height = Math.max(1, Math.round(rect.height || this.overlay.clientHeight || window.innerHeight));
    const overlayRect = this.overlay.getBoundingClientRect();
    this.overlayOffsetX = rect.left - overlayRect.left;
    this.overlayOffsetY = rect.top - overlayRect.top;
    const aspect = this.width / this.height;
    const wasMobile = this.mobile;
    this.mobile = this.width <= 760;
    this.themeScale = clusterScaleForAspect(aspect);
    this.orbitScale = this.mobile ? 0.9 : 1;

    const radiusPixels = this.mobile
      ? clamp(Math.min(this.width * 0.43, this.height * 0.24), 110, 230)
      : clamp(Math.min(this.height * 0.415, this.width * 0.29), 180, 520);
    const focalPixels = this.height / (2 * TAN_HALF);
    this.baseDistance = focalPixels / radiusPixels;

    const fitX = (THEME_EXTENT_X * this.themeScale * 1.18) / (TAN_HALF * aspect);
    const fitY = ((THEME_EXTENT_Y + 0.25) * this.themeScale * 1.18) / TAN_HALF;
    this.themeDistance = Math.max(this.baseDistance * 0.96, fitX, fitY);

    if (!this.hasSized) {
      this.cameraDistance = this.baseDistance;
      const initial = this.composition();
      const halfHeight = this.baseDistance * TAN_HALF;
      const halfWidth = halfHeight * aspect;
      this.cameraLookX = -(initial.cx - 0.5) * 2 * halfWidth;
      this.cameraLookY = (initial.cy - 0.5) * 2 * halfHeight;
      this.desiredLookX = this.cameraLookX;
      this.desiredLookY = this.cameraLookY;
      this.hasSized = true;
    }
    this.camera.aspect = aspect;
    this.camera.fov = FOV;
    this.camera.updateProjectionMatrix();
    this.camera.position.set(0, 0, this.cameraDistance);
    this.camera.lookAt(this.cameraLookX, this.cameraLookY, 0);
    this.camera.updateMatrixWorld(true);

    this.syncRendererSize();
    this.backgroundMaterial.uniforms.uAspect.value = aspect;
    this.orbit.line.scale.setScalar(this.orbitScale);
    this.land.uniforms.uThemeScale.value = this.themeScale;
    this.dust.uniforms.uThemeScale.value = this.themeScale;
    this.eventUniforms.uThemeScale.value = this.themeScale;
    this.canvas.dataset.width = String(this.width);
    this.canvas.dataset.height = String(this.height);
    if (this.hasSized && wasMobile !== this.mobile && this.lastEventsRef) {
      this.rebuildMarkers(this.lastEventsRef);
      if (this.focusRecord && !this.markers.includes(this.focusRecord)) this.focusRecord = null;
    }
    this.wake();
  }

  private composition(): CameraComposition {
    return this.mobile ? MOBILE_COMPOSITION : this.width < 1180 ? NARROW_COMPOSITION : DESKTOP_COMPOSITION;
  }

  private markerPosition(record: MarkerRecord, target: Vector3): Vector3 {
    const local = clamp((this.progress - record.seed * 0.34) / 0.66, 0, 1);
    const eased = local * local * (3 - 2 * local);
    const envelope = Math.sin(eased * Math.PI);
    const scale = this.themeScale;
    const dx = record.baseX - record.themeX * scale;
    const dy = record.baseY - record.themeY * scale;
    const dz = record.baseZ - record.themeZ * scale;
    const curl = 0.05 * envelope;
    const x = record.themeX * scale + dx * (1 - eased) + curl * Math.sin(record.seed * 47 + eased * 5.7);
    const y = record.themeY * scale + dy * (1 - eased) + curl * Math.cos(record.seed * 37 - eased * 4.3);
    const z = record.themeZ * scale + dz * (1 - eased) + curl * Math.sin(record.seed * 67 + eased * 6.1);
    target.set(x, y, z);
    if (record.isGlobal) {
      tmpVectorB.copy(target).applyQuaternion(this.globeGroup.quaternion);
      return target.lerp(tmpVectorB, eased);
    }
    return target.applyQuaternion(this.globeGroup.quaternion);
  }

  private updateCamera(dt: number): void {
    if (this.failed || this.disposed) return;
    const desiredDistance = this.desiredCameraDistance();
    const distanceRate = this.reducedMotion ? 16 : 3.1;
    this.zoom += (this.zoomTarget - this.zoom) * (1 - Math.exp(-(this.reducedMotion ? 18 : 7) * dt));
    this.cameraDistance += (desiredDistance - this.cameraDistance) * (1 - Math.exp(-distanceRate * dt));

    const comp = this.composition();
    const layoutEase = smoothstep(0, 1, this.progress);
    const baseCx = this.mix(comp.cx, this.mobile ? 0.5 : 0.51, layoutEase);
    const baseCy = this.mix(comp.cy, this.mobile ? 0.34 : 0.5, layoutEase);
    let targetLookX: number;
    let targetLookY: number;

    let fx = baseCx;
    let fy = baseCy;
    if (this.focusRecord) {
      this.markerPosition(this.focusRecord, this.focusScratch);
      const depth = Math.max(1.1, desiredDistance - this.focusScratch.z);
      const halfHeight = depth * TAN_HALF;
      const halfWidth = halfHeight * (this.width / this.height);
      fx = this.mix(comp.cx, comp.focusX, this.focusRecord.isGlobal ? 0.65 : 1);
      fy = this.mix(comp.cy, comp.focusY, this.focusRecord.isGlobal ? 0.65 : 1);
      targetLookX = this.focusScratch.x - (fx - 0.5) * 2 * halfWidth;
      targetLookY = this.focusScratch.y + (fy - 0.5) * 2 * halfHeight;
    } else if (this.detachedFraming) {
      targetLookX = this.detachedFraming.lookX * desiredDistance;
      targetLookY = this.detachedFraming.lookY * desiredDistance;
    } else {
      const halfHeight = desiredDistance * TAN_HALF;
      const halfWidth = halfHeight * (this.width / this.height);
      targetLookX = -(baseCx - 0.5) * 2 * halfWidth;
      targetLookY = (baseCy - 0.5) * 2 * halfHeight;
    }

    this.desiredLookX = targetLookX;
    this.desiredLookY = targetLookY;
    const lookRate = this.reducedMotion ? 18 : 2.9;
    const lookBlend = 1 - Math.exp(-lookRate * dt);
    this.cameraLookX += (targetLookX - this.cameraLookX) * lookBlend;
    this.cameraLookY += (targetLookY - this.cameraLookY) * lookBlend;
    this.camera.position.set(0, 0, this.cameraDistance);
    this.camera.lookAt(this.cameraLookX, this.cameraLookY, 0);
    this.camera.updateMatrixWorld(true);

    this.backgroundMaterial.uniforms.uCenter.value.set(fx, 1 - fy);
  }

  private mix(a: number, b: number, t: number): number {
    return a + (b - a) * t;
  }

  private updateGroup(dt: number, now: number): void {
    if (this.layoutTarget === 'globe' && this.progress < 0.05) {
      const idle = !this.focusRecord && !this.selectedId && !this.anchorOutline && this.pointers.length === 0;
      if (!this.reducedMotion && idle && performance.now() - this.lastInteraction > INITIAL_AUTO_ROTATE_DELAY) {
        this.dragEuler.set(0, dt * 0.012, 0, 'YXZ');
        this.dragQuat.setFromEuler(this.dragEuler);
        this.globeTargetQuat.premultiply(this.dragQuat);
      }
      if (!this.focusRecord && !this.selectedId && this.pointers.length === 0 && !this.reducedMotion
        && (Math.abs(this.velocityX) > 0.0001 || Math.abs(this.velocityY) > 0.0001)) {
        // The first frame only integrates time after the release, not time spent dragging.
        const coastDt = Math.min(dt, Math.max(0, (now - this.inertiaSince) / 1000));
        const decay = Math.exp(-INERTIA_DECAY * coastDt);
        const advance = (1 - decay) / INERTIA_DECAY;
        this.dragEuler.set(this.velocityX * advance, this.velocityY * advance, 0, 'YXZ');
        this.dragQuat.setFromEuler(this.dragEuler);
        this.globeGroup.quaternion.premultiply(this.dragQuat);
        this.globeTargetQuat.copy(this.globeGroup.quaternion);
        this.velocityX *= decay;
        this.velocityY *= decay;
      }
    }

    const rate = this.reducedMotion ? 20 : 7.2;
    if (!this.globeGroup.quaternion.equals(this.globeTargetQuat)) {
      this.globeGroup.quaternion.slerp(this.globeTargetQuat, 1 - Math.exp(-rate * dt));
    }
  }

  private projectMarkers(now: number): void {
    const w = this.width;
    const h = this.height;
    const cameraView = this.camera.position;
    for (const record of this.markers) {
      this.markerPosition(record, tmpVector);
      let presence = 1;
      if (!record.isGlobal) {
        tmpVectorB.copy(tmpVector).normalize();
        tmpVectorC.copy(cameraView).sub(tmpVector).normalize();
        const facing = tmpVectorB.dot(tmpVectorC);
        const themeMix = smoothstep(0.25, 0.68, this.progress);
        presence = Math.max(smoothstep(-0.03, 0.12, facing), themeMix);
      }
      tmpVector.project(this.camera);
      const x = this.overlayOffsetX + (tmpVector.x * 0.5 + 0.5) * w;
      const y = this.overlayOffsetY + (-tmpVector.y * 0.5 + 0.5) * h;
      record.screenX = x;
      record.screenY = y;
      const inBounds = tmpVector.z > -1 && tmpVector.z < 1 && x > 6 && x < w - 6
        && y > (this.mobile ? 160 : 115) && y < h - (this.mobile ? 160 : 135);
      const rightObscured = this.selectedId !== null
        ? x > w - 460 && y > 110
        : this.railOpen
          ? x > w - 365 && y > 150
          : x > w - 115 && y > 165 && y < 245;
      const leftObscured = x < 350 && y > 400 && y < h - 160;
      const obscured = !this.mobile && (rightObscured || leftObscured);
      const displayVisible = inBounds && !obscured && presence > 0.02;
      record.visible = displayVisible && presence > 0.22;
      const focusable = displayVisible && presence > 0.6;
      const tabIndex = focusable ? 0 : -1;
      if (record.button.tabIndex !== tabIndex) record.button.tabIndex = tabIndex;
      if (record.displayed !== displayVisible) {
        record.button.style.display = displayVisible ? '' : 'none';
        record.displayed = displayVisible;
        if (!displayVisible && document.activeElement === record.button) record.button.blur();
      }
      if (displayVisible) {
        record.button.style.opacity = presence >= 0.995 ? '' : presence.toFixed(2);
        const flipped = x > w - 185;
        record.button.style.flexDirection = flipped ? 'row-reverse' : '';
        record.button.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0) translate(${flipped ? 'calc(-100% + 12px)' : '-12px'}, -50%)`;
      }
    }
    if (now - this.lastDeclutter > 190) {
      this.lastDeclutter = now;
      this.updateLabelCollisions();
    }
  }

  private updateLabelCollisions(): void {
    this.labelRects.length = 0;
    this.labelForced.length = 0;
    for (const record of this.markers) {
      record.labelDefault = false;
      if (!record.visible) this.setLabelDisplay(record, false);
    }
    for (const record of this.markers) {
      if (!record.visible) continue;
      const selected = this.selectedId !== null && record.eventIds.includes(this.selectedId);
      if (selected || record.hover || record.focused) this.labelForced.push(record);
    }
    for (const record of this.labelForced) this.reserveLabel(record, true);

    let budget = this.mobile ? 4 : 9;
    for (const record of this.markers) {
      if (!record.visible || this.labelForced.includes(record) || record.eventIds.length <= 1) continue;
      if (this.reserveLabel(record, false)) budget--;
    }
    for (const record of this.markers) {
      if (!record.visible || this.labelForced.includes(record) || record.labelDefault || record.eventIds.length > 1) continue;
      if (budget <= 0) break;
      if (this.reserveLabel(record, false)) budget--;
    }
    for (const record of this.markers) {
      if (!record.visible) continue;
      this.setLabelDisplay(record, record.labelDefault || record.hover || record.focused);
    }
  }

  private reserveLabel(record: MarkerRecord, force: boolean): boolean {
    const width = record.labelWidth + 24;
    const left = record.screenX > this.width - 185 ? record.screenX - width - 10 : record.screenX + 10;
    const top = record.screenY - 12;
    const right = left + width;
    const bottom = top + 26;
    for (let i = 0; i < this.labelRects.length; i += 4) {
      const overlaps = left < this.labelRects[i + 2]
        && right > this.labelRects[i]
        && top < this.labelRects[i + 3]
        && bottom > this.labelRects[i + 1];
      if (overlaps && !force) return false;
    }
    record.labelDefault = true;
    this.labelRects.push(left, top, right, bottom);
    return true;
  }

  private updateThemeLabels(): void {
    const opacity = smoothstep(0.42, 0.92, this.progress);
    for (const label of this.themeLabels) {
      if (opacity < 0.01) {
        label.visible = false;
        label.element.style.display = 'none';
        continue;
      }
      const center = THEME_CLUSTERS[label.theme];
      const labelDirection = center[1] >= 0 ? 1 : -1;
      tmpVector.set(
        center[0] * this.themeScale,
        (center[1] + labelDirection * (this.mobile ? (labelDirection > 0 ? 0.36 : 0.28) : THEME_LABEL_Y)) * this.themeScale,
        center[2] * this.themeScale,
      );
      tmpVector.applyQuaternion(this.globeGroup.quaternion);
      tmpVector.project(this.camera);
      const x = this.overlayOffsetX + (tmpVector.x * 0.5 + 0.5) * this.width;
      const y = this.overlayOffsetY + (-tmpVector.y * 0.5 + 0.5) * this.height;
      label.x = x;
      label.y = y;
      label.visible = true;
      label.element.style.display = '';
      label.element.style.opacity = String(opacity);
      label.element.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0) translate(-50%, -50%)`;
    }
  }


  private updateOrbit(): void {
    const opacity = this.orbitMaterial.opacity;
    const target = (1 - smoothstep(0, 0.25, this.progress)) * 0.2 * this.intro;
    this.orbitMaterial.opacity = opacity + (target - opacity) * 0.16;
    this.orbit.line.visible = this.orbitMaterial.opacity > 0.002;
  }

  private updateUniforms(): void {
    const eased = smoothstep(0, 1, this.progress);
    this.land.uniforms.uProgress.value = this.progress;
    this.dust.uniforms.uProgress.value = this.progress;
    this.eventUniforms.uProgress.value = this.progress;
    this.land.uniforms.uIntro.value = this.intro;
    this.dust.uniforms.uIntro.value = this.intro;
    this.eventUniforms.uIntro.value = this.intro;
    this.land.uniforms.uCameraDistance.value = this.cameraDistance;
    this.dust.uniforms.uCameraDistance.value = this.cameraDistance;
    this.eventUniforms.uCameraDistance.value = this.cameraDistance;
    this.land.uniforms.uPixelRatio.value = this.pixelRatio;
    this.dust.uniforms.uPixelRatio.value = this.pixelRatio;
    this.eventUniforms.uPixelRatio.value = this.pixelRatio;
    this.land.material.uniforms.uThemeScale.value = this.themeScale;
    this.dust.material.uniforms.uThemeScale.value = this.themeScale;
    this.eventMaterial.uniforms.uThemeScale.value = this.themeScale;

    this.sphereMaterial.uniforms.uOpacity.value = (1 - eased * 0.995) * this.intro;
    this.atmosphereMaterial.uniforms.uOpacity.value = (1 - eased) * this.intro;
    const coreScale = 1 - eased * 0.82;
    this.earthCore.scale.setScalar(coreScale);
    this.earthCore.visible = this.sphereMaterial.uniforms.uOpacity.value > 0.006;
    this.backgroundMaterial.uniforms.uIntro.value = this.intro;
    this.stars.material.uniforms.uIntro.value = this.intro;
    this.stars.material.uniforms.uTime.value = this.reducedMotion ? 0 : this.elapsed;
    if (this.finishPass) this.finishPass.uniforms.uTime.value = this.reducedMotion ? 0 : this.elapsed;
    this.updateThemeLabels();
    this.updateOrbit();
  }

  private updateDataset(): void {
    const phase = Math.round(this.progress * 20) / 20;
    if (phase !== this.lastDatasetPhase) {
      this.lastDatasetPhase = phase;
      this.canvas.dataset.phase = phase.toFixed(2);
    }
    if (this.canvas.dataset.layout !== this.layoutTarget) this.canvas.dataset.layout = this.layoutTarget;
    const selected = this.selectedId ?? '';
    const anchor = this.anchorId ?? '';
    if (this.canvas.dataset.anchor !== anchor) this.canvas.dataset.anchor = anchor;
    if (this.canvas.dataset.selected !== selected) this.canvas.dataset.selected = selected;
    if (this.canvas.dataset.quality !== this.quality) this.canvas.dataset.quality = this.quality;
  }

  private tick = (now: number): void => {
    if (this.disposed) return;
    this.rafHandle = 0;
    if (this.failed || this.contextLost) return;
    if (document.hidden) return;
    if (this.lastFrame === 0) {
      this.lastFrame = now;
      this.wake();
      return;
    }
    const dt = Math.min(0.05, Math.max(0, (now - this.lastFrame) / 1000));
    this.lastFrame = now;
    if (dt <= 0) {
      this.wake();
      return;
    }

    const anchorTarget = this.anchorOutline ? (1 - smoothstep(0.16, 0.52, this.progress)) * this.intro : 0;
    const anchorSettled = !this.anchorOutline || Math.abs(anchorTarget - this.anchorOpacity) < 0.004;
    const idle = this.pointers.length === 0
      && Math.abs(this.targetProgress - this.progress) < 0.002
      && Math.abs(this.zoomTarget - this.zoom) < 0.002
      && Math.abs(this.cameraDistance - this.desiredCameraDistance()) < 0.01
      && Math.abs(this.cameraLookX - this.desiredLookX) < 0.006
      && Math.abs(this.cameraLookY - this.desiredLookY) < 0.006
      && Math.abs(this.velocityX) < 0.002
      && Math.abs(this.velocityY) < 0.002
      && anchorSettled
      && this.globeGroup.quaternion.angleTo(this.globeTargetQuat) < 0.002;
    const autoRotateActive = this.layoutTarget === 'globe' && this.progress < 0.05
      && !this.reducedMotion && !this.focusRecord && !this.selectedId && !this.anchorOutline
      && this.pointers.length === 0 && performance.now() - this.lastInteraction > INITIAL_AUTO_ROTATE_DELAY;
    const idleInterval = autoRotateActive ? 30 : 50;
    if (idle && now - this.lastDraw < idleInterval) {
      this.wake();
      return;
    }
    this.lastDraw = now;
    this.elapsed += this.reducedMotion ? 0 : dt;
    this.intro = this.reducedMotion ? 1 : Math.min(1, this.intro + dt / 1.15);
    if (this.reducedMotion) {
      this.progress = this.targetProgress;
    } else {
      const rate = 1 - Math.exp(-MORPH_RATE * dt);
      this.progress += (this.targetProgress - this.progress) * rate;
      if (Math.abs(this.targetProgress - this.progress) < 0.0008) this.progress = this.targetProgress;
    }

    this.updateGroup(dt, now);
    this.updateCamera(dt);
    this.updateUniforms();
    this.updateAnchor(dt);
    this.updateDataset();
    this.projectMarkers(now);
    this.renderFrame(dt);
    if (this.reducedMotion && idle && this.pointers.length === 0 && !this.contextLost) {
      this.rafHandle = 0;
      return;
    }
    this.wake();
  };

  private desiredCameraDistance(): number {
    const targetThemeDistance = this.mix(this.baseDistance, this.themeDistance, smoothstep(0, 1, this.progress));
    const scale = this.focusRecord ? FOCUS_DISTANCE_SCALE : this.detachedFraming?.distanceScale ?? 1;
    return targetThemeDistance * scale * this.zoom;
  }

  private renderFrame(dt: number): void {
    if (!this.renderer) return;
    if (this.quality === 'full') this.ensureComposer();
    try {
      if (this.quality === 'full' && this.composer) {
        this.composer.render(dt);
      } else {
        this.renderer.render(this.scene, this.camera);
      }
      if (this.contextRecoveryPending) {
        this.contextRecoveryPending = false;
        if (this.contextErrorShown) {
          this.contextErrorShown = false;
          this.lastError = '';
          delete this.canvas.dataset.error;
          this.onError('');
        }
      }
      if (!this.readyFired && !this.failed && (this.reducedMotion || this.intro >= 0.45)) {
        this.readyFired = true;
        this.canvas.dataset.ready = 'true';
        this.onReady();
      }
    } catch (error) {
      if (this.contextLost) return;
      this.reportError(this.describeError(error, '场景渲染中断。'));
    }
  }

  private wake(): void {
    if (this.disposed || this.failed || this.contextLost || this.rafHandle !== 0) return;
    this.rafHandle = requestAnimationFrame(this.tick);
  }

  private stopLoop(): void {
    if (this.rafHandle !== 0) {
      cancelAnimationFrame(this.rafHandle);
      this.rafHandle = 0;
    }
  }
}