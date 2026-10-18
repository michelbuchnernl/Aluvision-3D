import { useEffect, useRef } from "react";
import { rectangleSelection, transformAroundPivot } from "./interaction";
import type { ScreenBounds } from "./interaction";
import { createPart } from "./sceneGeometry";
import { canvasLayout, sliceUv } from "./media";
import {
  teleportTarget,
  rigPositionFor,
  thumbstickStep,
  startPoint,
} from "./teleport";
import type { TeleportTarget } from "./teleport";
import type { CanvasLayout } from "./media";
import type { MediaRuntime } from "./mediaRuntime";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { TransformControls } from "three/addons/controls/TransformControls.js";
import {
  definition,
  effectiveMaterial,
  isLocked,
  isVisible,
  MATERIALS,
  validate,
  inEditContext,
  selectionUnits,
} from "./model";
import type { Project, Vec3, View, Preset, CameraBookmark } from "./model";
export type Tool = "select" | "move" | "rotate" | "measure";
export type VrState = "unsupported" | "ready" | "active";
export interface ViewportApi {
  /** Read-only: unit boxes in client pixels, for browser tests. */
  screenBoxes: () => ScreenBounds[];
  enterVr: () => Promise<string | void>;
  exitVr: () => void;
  fit: () => void;
  capture: () => string;
  bookmark: () => Omit<CameraBookmark, "id" | "name">;
  restore: (c: CameraBookmark) => void;
}
interface Props {
  project: Project;
  selected: string[];
  tool: Tool;
  view: View;
  preset: Preset;
  media?: MediaRuntime;
  onVrChange?: (state: VrState) => void;
  mediaVersion?: number;
  snap: number;
  freeHeight: boolean;
  contextId: string | null;
  measurement: Vec3[];
  onMeasure: (point: Vec3) => void;
  onEnterGroup: (objectId: string) => void;
  onSelect: (ids: string[], add: boolean) => void;
  onTransform: (
    changes: { id: string; position: Vec3; rotation: number }[],
  ) => void;
  onReady: (api: ViewportApi) => void;
  onError: (message: string) => void;
}
const v = (p: Vec3) => new THREE.Vector3(p.x, p.y, p.z);
export default function Viewport(props: Props) {
  const host = useRef<HTMLDivElement>(null),
    latest = useRef(props);
  latest.current = props;
  const runtime = useRef<any>(null);
  useEffect(() => {
    const el = host.current!;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: true,
        preserveDrawingBuffer: true,
      });
    } catch (e) {
      props.onError(
        "WebGL kon niet starten. Probeer een recente browser met hardwareversnelling.",
      );
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    el.append(renderer.domElement);
    renderer.domElement.setAttribute("aria-label", "3D-ontwerpvenster");
    renderer.domElement.setAttribute("role", "img");
    const scene = new THREE.Scene();
    renderer.xr.enabled = true;
    renderer.xr.setReferenceSpaceType("local-floor");
    const perspective = new THREE.PerspectiveCamera(42, 1, 1, 30000);
    const ortho = new THREE.OrthographicCamera(-500, 500, 500, -500, 1, 30000);
    // The perspective camera lives in a rig so a headset can be scaled (1 m = 100 cm) and teleported.
    const rig = new THREE.Group();
    rig.add(perspective);
    let camera: THREE.PerspectiveCamera | THREE.OrthographicCamera =
      perspective;
    perspective.position.set(1050, 760, 1000);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 90, 0);
    controls.enableDamping = true;
    controls.dampingFactor = 0.1;
    controls.minDistance = 30;
    controls.maxDistance = 8000;
    controls.mouseButtons = {
      LEFT: undefined as any,
      MIDDLE: THREE.MOUSE.ROTATE,
      RIGHT: THREE.MOUSE.PAN,
    };
    controls.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN };
    const transform = new TransformControls(camera, renderer.domElement);
    transform.setSize(0.85);
    const helper = transform.getHelper();
    scene.add(helper);
    const pivot = new THREE.Object3D();
    scene.add(pivot);
    const content = new THREE.Group();
    scene.add(content);
    scene.add(rig);
    const objects = new Map<string, THREE.Group>();
    let outline: THREE.BoxHelper[] = [];
    let active = false;
    let frame = 0;
    let startPivot = new THREE.Vector3();
    let startRot = 0;
    let starts = new Map<
      string,
      { position: THREE.Vector3; rotation: number }
    >();
    let dragged = false;
    transform.addEventListener("dragging-changed", (event: any) => {
      controls.enabled = !event.value;
      active = event.value;
      if (active) {
        dragged = true;
        startPivot.copy(pivot.position);
        startRot = pivot.rotation.y;
        starts = new Map();
        for (const id of latest.current.selected) {
          const instance = latest.current.project.objects.find(
            (o) => o.id === id,
          );
          if (instance && !isLocked(latest.current.project, instance))
            starts.set(id, {
              position: v(instance.position),
              rotation: (instance.rotation * Math.PI) / 180,
            });
        }
      } else {
        const changes = [...starts].map(([id, start]) => ({
          id,
          ...transformAroundPivot(
            start.position,
            (start.rotation * 180) / Math.PI,
            startPivot,
            pivot.position.clone().sub(startPivot),
            ((pivot.rotation.y - startRot) * 180) / Math.PI,
            latest.current.freeHeight,
          ),
        }));
        if (changes.length) latest.current.onTransform(changes);
      }
    });
    transform.addEventListener("objectChange", () => {
      if (!active) return;
      const delta = pivot.position.clone().sub(startPivot),
        angle = pivot.rotation.y - startRot;
      for (const [id, start] of starts) {
        const g = objects.get(id);
        if (!g) continue;
        const transformed = transformAroundPivot(
          start.position,
          (start.rotation * 180) / Math.PI,
          startPivot,
          delta,
          (angle * 180) / Math.PI,
          latest.current.freeHeight,
        );
        g.position.copy(v(transformed.position));
        g.rotation.y = (transformed.rotation * Math.PI) / 180;
      }
      outline.forEach((o) => o.update());
    });
    const resize = () => {
      const { width, height } = el.getBoundingClientRect();
      if (!width || !height) return;
      renderer.setSize(width, height);
      perspective.aspect = width / height;
      perspective.updateProjectionMatrix();
      const aspect = width / height,
        size = (ortho.top - ortho.bottom) / 2 || 500;
      ortho.left = -size * aspect;
      ortho.right = size * aspect;
      ortho.updateProjectionMatrix();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(el);
    const setView = (view: View) => {
      const p = latest.current.project;
      const size = Math.max(p.room.length, p.room.depth, p.room.height) * 1.6;
      const target = new THREE.Vector3(0, p.room.height / 2, 0);
      camera = view === "perspective" || view === "eye" ? perspective : ortho;
      camera.up.set(0, 1, 0);
      controls.object = camera;
      transform.camera = camera;
      const directions: Record<string, number[]> = {
        perspective: [1, 0.72, 1],
        top: [0, 1, 0.0001],
        bottom: [0, -1, 0.0001],
        front: [0, 0, 1],
        back: [0, 0, -1],
        left: [-1, 0, 0],
        right: [1, 0, 0],
      };
      if (view === "eye") {
        camera.position.set(-p.room.length * 0.4, 165, 0);
        target.set(p.room.length * 0.4, 150, 0);
      } else {
        const d = directions[view];
        camera.position
          .copy(target)
          .add(new THREE.Vector3(...d).normalize().multiplyScalar(size));
      }
      if (camera === ortho) {
        ortho.top = size * 0.4;
        ortho.bottom = -size * 0.4;
        ortho.zoom = 1;
      }
      controls.target.copy(target);
      camera.lookAt(target);
      resize();
      controls.update();
    };
    const fit = () => {
      const p = latest.current.project;
      let box = new THREE.Box3();
      const selected = latest.current.selected
        .map((id) => objects.get(id))
        .filter(Boolean);
      if (selected.length) selected.forEach((g) => box.expandByObject(g!));
      else
        box.setFromCenterAndSize(
          new THREE.Vector3(0, p.room.height / 2, 0),
          new THREE.Vector3(p.room.length, p.room.height, p.room.depth),
        );
      const sphere = box.getBoundingSphere(new THREE.Sphere());
      const dir = camera.position.clone().sub(controls.target).normalize();
      camera.position
        .copy(sphere.center)
        .add(dir.multiplyScalar(Math.max(sphere.radius * 2.6, 100)));
      controls.target.copy(sphere.center);
      if (camera === ortho) {
        ortho.top = Math.max(sphere.radius * 1.25, 70);
        ortho.bottom = -ortho.top;
        resize();
      }
      controls.update();
    };
    const api: ViewportApi = {
      screenBoxes: () => {
        const r = el.getBoundingClientRect();
        return measureBoxes().boxes.map((b) => ({
          ...b,
          left: b.left + r.left,
          right: b.right + r.left,
          top: b.top + r.top,
          bottom: b.bottom + r.top,
        }));
      },
      enterVr: async () => {
        const xr = (navigator as any).xr;
        if (!xr) return "WebXR is niet beschikbaar in deze browser.";
        try {
          const session = await xr.requestSession("immersive-vr", {
            optionalFeatures: ["local-floor", "bounded-floor"],
          });
          try {
            await session.requestReferenceSpace("local-floor");
          } catch {
            await session.end();
            return "Deze headset geeft geen vloerhoogte (local-floor); de VR-wandeling vraagt die.";
          }
          setView("perspective");
          vrSaved = {
            position: perspective.position.clone(),
            quaternion: perspective.quaternion.clone(),
          };
          perspective.near = 0.01;
          perspective.far = 300;
          perspective.updateProjectionMatrix();
          rig.scale.setScalar(100);
          const spawn = startPoint(latest.current.project);
          rig.position.set(spawn?.x ?? 0, 0, spawn?.z ?? 0);
          if (scene.fog instanceof THREE.FogExp2) scene.fog.density *= 100;
          helper.visible = false;
          session.addEventListener("end", endVr);
          await renderer.xr.setSession(session);
          latest.current.onVrChange?.("active");
          return spawn
            ? undefined
            : "Geen vrije vloerlocatie gevonden; je start in het midden.";
        } catch (e) {
          endVr();
          return e instanceof Error ? e.message : "VR kon niet starten.";
        }
      },
      exitVr: () => {
        void renderer.xr.getSession()?.end();
      },
      fit,
      capture: () => {
        renderer.render(scene, camera);
        return renderer.domElement.toDataURL("image/png");
      },
      bookmark: () => ({
        position: {
          x: camera.position.x,
          y: camera.position.y,
          z: camera.position.z,
        },
        target: {
          x: controls.target.x,
          y: controls.target.y,
          z: controls.target.z,
        },
        orthographic: camera === ortho,
        zoom: camera.zoom,
        frustumHeight: camera === ortho ? ortho.top - ortho.bottom : undefined,
      }),
      restore: (c) => {
        camera = c.orthographic ? ortho : perspective;
        controls.object = camera;
        transform.camera = camera;
        camera.position.copy(v(c.position));
        camera.zoom = c.zoom ?? 1;
        camera.updateProjectionMatrix();
        controls.target.copy(v(c.target));
        camera.lookAt(controls.target);
        if (c.orthographic) {
          ortho.top = c.frustumHeight
            ? c.frustumHeight / 2
            : camera.position.distanceTo(controls.target) * 0.4;
          ortho.bottom = -ortho.top;
        }
        resize();
        controls.update();
      },
    };
    const raycaster = new THREE.Raycaster();
    let down: { x: number; y: number; shift: boolean } | null = null;
    const rectangle = document.createElement("div");
    rectangle.className = "selection-rectangle";
    el.append(rectangle);
    const pointerDown = (e: PointerEvent) => {
      if (e.button !== 0 || transform.axis !== null || active) {
        down = null;
        return;
      }
      down = { x: e.clientX, y: e.clientY, shift: e.shiftKey };
      dragged = false;
    };
    const pointerMove = (e: PointerEvent) => {
      if (!down || active || latest.current.tool !== "select") return;
      const r = el.getBoundingClientRect();
      const dx = e.clientX - down.x,
        dy = e.clientY - down.y;
      if (Math.abs(dx) + Math.abs(dy) < 8) return;
      rectangle.style.display = "block";
      rectangle.style.left = `${Math.min(e.clientX, down.x) - r.left}px`;
      rectangle.style.top = `${Math.min(e.clientY, down.y) - r.top}px`;
      rectangle.style.width = `${Math.abs(dx)}px`;
      rectangle.style.height = `${Math.abs(dy)}px`;
      rectangle.classList.toggle("crossing", dx < 0);
    };
    /** Screen-space boxes of every selectable unit, relative to the viewport element. */
    const measureBoxes = () => {
      const r = el.getBoundingClientRect(),
        screenBoxes: ScreenBounds[] = [];
      const units = selectionUnits(
        latest.current.project,
        latest.current.contextId,
      );
      units.forEach((unit) => {
        const b = new THREE.Box3();
        for (const id of unit.objectIds) {
          const g = objects.get(id);
          if (g) b.expandByObject(g);
        }
        if (b.isEmpty()) return;
        const pts = [];
        for (const x of [b.min.x, b.max.x])
          for (const y of [b.min.y, b.max.y])
            for (const z of [b.min.z, b.max.z]) {
              const q = new THREE.Vector3(x, y, z).project(camera);
              pts.push({
                x: ((q.x + 1) * r.width) / 2,
                y: ((1 - q.y) * r.height) / 2,
                z: q.z,
              });
            }
        screenBoxes.push({
          id: unit.id,
          left: Math.min(...pts.map((q) => q.x)),
          right: Math.max(...pts.map((q) => q.x)),
          top: Math.min(...pts.map((q) => q.y)),
          bottom: Math.max(...pts.map((q) => q.y)),
          clipped: pts.every((q) => q.z > 1 || q.z < -1),
        });
      });
      return { units, boxes: screenBoxes };
    };
    const pointerUp = (e: PointerEvent) => {
      rectangle.style.display = "none";
      if (!down) return;
      const from = down;
      down = null;
      if (dragged || active || e.button !== 0) return;
      const r = el.getBoundingClientRect(),
        dx = e.clientX - from.x,
        dy = e.clientY - from.y;
      if (Math.hypot(dx, dy) > 8 && latest.current.tool === "select") {
        const { units, boxes: screenBoxes } = measureBoxes();
        const ids = rectangleSelection(
          screenBoxes,
          { x: from.x - r.left, y: from.y - r.top },
          { x: e.clientX - r.left, y: e.clientY - r.top },
        );
        latest.current.onSelect(
          units
            .filter((unit) => ids.includes(unit.id))
            .flatMap((unit) => unit.objectIds),
          from.shift,
        );
        return;
      }
      if (Math.hypot(dx, dy) > 8) return;
      raycaster.setFromCamera(
        new THREE.Vector2(
          ((e.clientX - r.left) / r.width) * 2 - 1,
          (-(e.clientY - r.top) / r.height) * 2 + 1,
        ),
        camera,
      );
      if (latest.current.tool === "measure") {
        const hits = raycaster.intersectObjects([...objects.values()], true);
        const point =
          hits[0]?.point ??
          raycaster.ray.intersectPlane(
            new THREE.Plane(new THREE.Vector3(0, 1, 0), 0),
            new THREE.Vector3(),
          );
        const room = latest.current.project.room;
        if (
          point &&
          (hits.length ||
            (Math.abs(point.x) <= room.length / 2 &&
              Math.abs(point.z) <= room.depth / 2))
        )
          latest.current.onMeasure({ x: point.x, y: point.y, z: point.z });
        return;
      }
      const hits = raycaster.intersectObjects(
        [...objects.values()].filter((g) =>
          inEditContext(
            latest.current.project,
            g.userData.instance,
            latest.current.contextId,
          ),
        ),
        true,
      );
      let g: THREE.Object3D | undefined = hits[0]?.object;
      while (g && !g.userData.instance) g = g.parent ?? undefined;
      let ids = g ? [g.userData.instance.id] : [];
      latest.current.onSelect(ids, from.shift);
    };
    const doubleClick = (event: MouseEvent) => {
      if (active || latest.current.tool === "measure") return;
      const r = el.getBoundingClientRect();
      raycaster.setFromCamera(
        new THREE.Vector2(
          ((event.clientX - r.left) / r.width) * 2 - 1,
          (-(event.clientY - r.top) / r.height) * 2 + 1,
        ),
        camera,
      );
      const hits = raycaster.intersectObjects(
        [...objects.values()].filter((g) =>
          inEditContext(
            latest.current.project,
            g.userData.instance,
            latest.current.contextId,
          ),
        ),
        true,
      );
      let target: THREE.Object3D | undefined = hits[0]?.object;
      while (target && !target.userData.instance)
        target = target.parent ?? undefined;
      if (target) latest.current.onEnterGroup(target.userData.instance.id);
    };
    renderer.domElement.addEventListener("dblclick", doubleClick);
    renderer.domElement.addEventListener("pointerdown", pointerDown);
    renderer.domElement.addEventListener("pointermove", pointerMove);
    window.addEventListener("pointerup", pointerUp);
    // Read-only WebXR: thumbstick forward aims at the floor, release teleports. No editing in VR.
    const marker = new THREE.Mesh(
      new THREE.RingGeometry(14, 20, 40).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({
        color: "#32b2a1",
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.9,
        depthTest: false,
      }),
    );
    marker.visible = false;
    marker.renderOrder = 999;
    scene.add(marker);
    const rayLine = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(),
        new THREE.Vector3(0, 0, -1),
      ]),
      new THREE.LineBasicMaterial({ color: "#32b2a1", depthTest: false }),
    );
    rayLine.visible = false;
    rayLine.renderOrder = 999;
    scene.add(rayLine);
    const pads = [0, 1].map((i) => {
      const c = renderer.xr.getController(i);
      rig.add(c);
      const s = {
        c,
        pad: undefined as Gamepad | undefined,
        aiming: false,
        last: undefined as TeleportTarget | undefined,
      };
      c.addEventListener("connected", (e: any) => {
        s.pad = e.data?.gamepad;
      });
      c.addEventListener("disconnected", () => {
        s.pad = undefined;
        s.aiming = false;
      });
      return s;
    });
    const hideAim = () => {
      marker.visible = false;
      rayLine.visible = false;
    };
    const teleportTo = (point: { x: number; z: number }) => {
      const head = renderer.xr
        .getCamera()
        .getWorldPosition(new THREE.Vector3());
      const pos = rigPositionFor(point, {
        x: head.x - rig.position.x,
        z: head.z - rig.position.z,
      });
      rig.position.set(pos.x, 0, pos.z);
    };
    const xrFrame = () => {
      const project = latest.current.project;
      for (const s of pads) {
        const step = thumbstickStep(
          s.aiming,
          s.pad ? (s.pad.axes[3] ?? s.pad.axes[1] ?? 0) : 0,
        );
        s.aiming = step.aiming;
        if (step.event === "commit") {
          if (s.last?.valid) teleportTo(s.last.point);
          s.last = undefined;
          hideAim();
        } else if (s.aiming) {
          const origin = s.c.getWorldPosition(new THREE.Vector3()),
            dir = new THREE.Vector3(0, 0, -1).applyQuaternion(
              s.c.getWorldQuaternion(new THREE.Quaternion()),
            );
          const t = teleportTarget(project, v(origin), v(dir));
          s.last = t;
          if (t) {
            marker.position.set(t.point.x, 1, t.point.z);
            (marker.material as THREE.MeshBasicMaterial).color.set(
              t.valid ? "#32b2a1" : "#f17c6b",
            );
            rayLine.geometry.setFromPoints([
              origin,
              new THREE.Vector3(t.point.x, 0, t.point.z),
            ]);
            marker.visible = rayLine.visible = true;
          } else hideAim();
        }
      }
    };
    let vrSaved: {
      position: THREE.Vector3;
      quaternion: THREE.Quaternion;
    } | null = null;
    const endVr = () => {
      if (!vrSaved) return;
      rig.scale.setScalar(1);
      rig.position.set(0, 0, 0);
      perspective.near = 1;
      perspective.far = 30000;
      perspective.position.copy(vrSaved.position);
      perspective.quaternion.copy(vrSaved.quaternion);
      perspective.updateProjectionMatrix();
      if (scene.fog instanceof THREE.FogExp2) scene.fog.density /= 100;
      helper.visible = true;
      vrSaved = null;
      hideAim();
      controls.update();
      resize();
      latest.current.onVrChange?.("ready");
    };
    const animate = () => {
      if (renderer.xr.isPresenting) xrFrame();
      else controls.update();
      const l = latest.current;
      l.media?.tick(
        l.project.canvases ?? [],
        runtime.current?.layouts ?? new Map(),
        l.project.media ?? [],
      );
      renderer.render(scene, camera);
    };
    renderer.setAnimationLoop(animate);
    runtime.current = {
      scene,
      content,
      objects,
      transform,
      pivot,
      setView,
      outline,
      setOutline: (o: THREE.BoxHelper[]) => {
        outline = o;
        if (runtime.current) runtime.current.outline = o;
      },
      renderer,
      layouts: new Map<string, CanvasLayout>(),
      active: () => active,
    };
    setView("perspective");
    latest.current.onReady(api);
    const xrNav = (navigator as any).xr;
    if (xrNav?.isSessionSupported)
      xrNav
        .isSessionSupported("immersive-vr")
        .then((ok: boolean) =>
          latest.current.onVrChange?.(ok ? "ready" : "unsupported"),
        )
        .catch(() => latest.current.onVrChange?.("unsupported"));
    else latest.current.onVrChange?.("unsupported");
    return () => {
      renderer.setAnimationLoop(null);
      renderer.xr
        .getSession()
        ?.end()
        .catch(() => {});
      observer.disconnect();
      renderer.domElement.removeEventListener("dblclick", doubleClick);
      window.removeEventListener("pointerup", pointerUp);
      controls.dispose();
      transform.dispose();
      dispose(content);
      renderer.dispose();
      el.replaceChildren();
      runtime.current = null;
    };
  }, []);
  useEffect(() => {
    const r = runtime.current;
    if (!r || r.active()) return;
    const { scene, content, objects, transform, pivot } = r;
    transform.detach();
    dispose(content);
    content.clear();
    objects.clear();
    r.outline.forEach((o: THREE.BoxHelper) => {
      scene.remove(o);
      o.geometry.dispose();
      (o.material as THREE.Material).dispose();
    });
    r.setOutline([]);
    const p = props.project,
      dark = props.preset !== "technical";
    scene.background = new THREE.Color(dark ? "#101b25" : "#e4e9ec");
    scene.fog =
      props.preset === "immersive"
        ? new THREE.FogExp2(
            "#101b25",
            0.00028 * (r.renderer.xr.isPresenting ? 100 : 1),
          )
        : null;
    r.renderer.toneMappingExposure = dark ? 1.1 : 1.15;
    const ambient = new THREE.HemisphereLight(
      dark ? "#a9d9eb" : "#ffffff",
      dark ? "#182b33" : "#909ca6",
      dark ? 1.25 : 2.3,
    );
    content.add(ambient);
    const sun = new THREE.DirectionalLight("#ffffff", dark ? 1.8 : 3);
    sun.position.set(300, 1000, 400);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -800;
    sun.shadow.camera.right = 800;
    sun.shadow.camera.top = 800;
    sun.shadow.camera.bottom = -800;
    sun.shadow.camera.far = 2500;
    sun.shadow.bias = -0.0003;
    content.add(sun);
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(p.room.length, p.room.depth),
      new THREE.MeshStandardMaterial({
        color: dark ? "#1b3038" : "#f2f3f1",
        roughness: 0.88,
        metalness: 0.05,
      }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.5;
    floor.receiveShadow = true;
    content.add(floor);
    const grid = new THREE.GridHelper(
      Math.max(p.room.length, p.room.depth) * 2,
      (Math.max(p.room.length, p.room.depth) * 2) / 100,
      dark ? "#46616b" : "#aebcc4",
      dark ? "#2c454f" : "#cbd4d8",
    );
    grid.position.y = -0.2;
    content.add(grid);
    const box = new THREE.Box3(
      new THREE.Vector3(-p.room.length / 2, 0, -p.room.depth / 2),
      new THREE.Vector3(p.room.length / 2, p.room.height, p.room.depth / 2),
    );
    const helper = new THREE.Box3Helper(
      box,
      new THREE.Color(dark ? "#4f737d" : "#95aab3"),
    );
    (helper.material as THREE.LineBasicMaterial).transparent = true;
    (helper.material as THREE.LineBasicMaterial).opacity = 0.35;
    content.add(helper);
    const label = (text: string, pos: THREE.Vector3) => {
      const canvas = document.createElement("canvas");
      canvas.width = 512;
      canvas.height = 96;
      const c = canvas.getContext("2d")!;
      c.font = "500 38px sans-serif";
      c.textAlign = "center";
      c.fillStyle = dark ? "#b3cdd1" : "#48606b";
      c.fillText(text, 256, 59);
      const texture = new THREE.CanvasTexture(canvas);
      const sprite = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: texture,
          depthTest: false,
          transparent: true,
        }),
      );
      sprite.position.copy(pos);
      sprite.scale.set(220, 42, 1);
      content.add(sprite);
    };
    label(
      `${p.room.length} cm`,
      new THREE.Vector3(0, 0, p.room.depth / 2 + 55),
    );
    label(
      `${p.room.depth} cm`,
      new THREE.Vector3(-p.room.length / 2 - 80, 0, 0),
    );
    const errorIds = new Set(
      validate(p)
        .filter((i) => i.severity === "error")
        .map((i) => i.objectId),
    );
    const layouts = new Map<string, CanvasLayout>(),
      slices = new Map<
        string,
        { ls: CanvasLayout["surfaces"][0]; tex: THREE.Texture }
      >();
    for (const c of p.canvases ?? []) {
      const layout = canvasLayout(p, c);
      layouts.set(c.id, layout);
      const asset = p.media?.find((m) => m.id === c.mediaId);
      if (!asset || !props.media) continue;
      const tex = props.media.textureFor(c, layout, asset);
      for (const ls of layout.surfaces) slices.set(ls.objectId, { ls, tex });
    }
    r.layouts = layouts;
    for (const o of p.objects) {
      if (!isVisible(p, o)) continue;
      const d = definition(p, o),
        s = d.size,
        m = MATERIALS[effectiveMaterial(p, o)];
      const material = new THREE.MeshStandardMaterial({
        color: m.color,
        metalness: m.metalness,
        roughness: m.roughness,
        transparent: !!m.opacity,
        opacity: m.opacity ?? 1,
        side: THREE.DoubleSide,
        emissive: d.kind === "panel" && dark ? "#287e86" : "#000000",
        emissiveIntensity: props.preset === "immersive" ? 0.6 : 0.16,
      });
      const g = createPart(d, material);
      const slice = slices.get(o.id);
      if (slice && d.kind === "panel")
        applySlice(g, material, slice.ls, slice.tex);
      g.position.copy(v(o.position));
      g.rotation.y = (o.rotation * Math.PI) / 180;
      g.userData.instance = o;
      if (!inEditContext(p, o, props.contextId)) {
        const materials = new Set<THREE.Material>();
        g.traverse((child: any) => {
          if (child.isMesh) {
            child.castShadow = false;
            (Array.isArray(child.material)
              ? child.material
              : [child.material]
            ).forEach((m: THREE.Material) => materials.add(m));
          }
        });
        materials.forEach((m) => {
          m.transparent = true;
          m.opacity *= 0.18;
          m.depthWrite = false;
        });
      }
      content.add(g);
      objects.set(o.id, g);
      if (errorIds.has(o.id)) {
        const h = new THREE.BoxHelper(g, 0xf17c6b);
        content.add(h);
      }
    }
    if (props.tool === "measure" && props.measurement.length) {
      for (const point of props.measurement) {
        const marker = new THREE.Mesh(
          new THREE.SphereGeometry(2.5, 12, 8),
          new THREE.MeshBasicMaterial({ color: "#e59630", depthTest: false }),
        );
        marker.position.copy(v(point));
        marker.renderOrder = 1000;
        content.add(marker);
      }
      if (props.measurement.length === 2) {
        const [a, b] = props.measurement;
        const line = new THREE.Line(
          new THREE.BufferGeometry().setFromPoints([v(a), v(b)]),
          new THREE.LineBasicMaterial({ color: "#e59630", depthTest: false }),
        );
        line.renderOrder = 1000;
        content.add(line);
        label(
          `${v(a).distanceTo(v(b)).toFixed(2)} cm`,
          v(a)
            .add(v(b))
            .multiplyScalar(0.5)
            .add(new THREE.Vector3(0, 10, 0)),
        );
      }
    }
    const outlines: THREE.BoxHelper[] = [];
    for (const id of props.selected) {
      const g = objects.get(id);
      if (g) {
        const h = new THREE.BoxHelper(g, 0x32b2a1);
        scene.add(h);
        outlines.push(h);
      }
    }
    r.setOutline(outlines);
    const movable = props.selected
      .map((id) => objects.get(id))
      .filter((g: any) => g && !isLocked(p, g.userData.instance));
    if (
      movable.length &&
      (props.tool === "move" || props.tool === "rotate") &&
      !p.objects.some((o) => props.selected.includes(o.id) && isLocked(p, o))
    ) {
      const centre = new THREE.Vector3();
      movable.forEach((g: any) => centre.add(g.position));
      centre.divideScalar(movable.length);
      pivot.position.copy(centre);
      pivot.rotation.set(0, 0, 0);
      transform.setMode(props.tool === "move" ? "translate" : "rotate");
      transform.showX = props.tool === "move";
      transform.showY = props.tool === "rotate" || props.freeHeight;
      transform.showZ = props.tool === "move";
      transform.setTranslationSnap(props.snap || null);
      transform.setRotationSnap(Math.PI / 12);
      transform.attach(pivot);
    }
  }, [
    props.project,
    props.selected,
    props.tool,
    props.preset,
    props.mediaVersion,
    props.snap,
    props.freeHeight,
    props.contextId,
    props.measurement,
  ]);
  useEffect(() => {
    runtime.current?.setView(props.view);
  }, [props.view]);
  return <div className="viewport" ref={host} data-testid="viewport" />;
}
/** Puts one slice of a shared canvas texture on the inward box face of a panel. */
function applySlice(
  g: THREE.Group,
  base: THREE.Material,
  ls: CanvasLayout["surfaces"][0],
  tex: THREE.Texture,
) {
  const mesh = g.children.find((c: any) => c.isMesh) as THREE.Mesh | undefined;
  if (!mesh || !(mesh.geometry instanceof THREE.BoxGeometry)) return;
  // BoxGeometry face order: +x, -x, +y, -y, +z, -z; four vertices per face.
  const face = ls.face === "+z" ? 4 : 5,
    uv = mesh.geometry.getAttribute("uv");
  for (let i = face * 4; i < face * 4 + 4; i++) {
    const m = sliceUv(ls, uv.getX(i), uv.getY(i));
    uv.setXY(i, m.u, m.v);
  }
  uv.needsUpdate = true;
  const projected = new THREE.MeshBasicMaterial({
    map: tex,
    toneMapped: false,
  });
  mesh.material = [0, 1, 2, 3, 4, 5].map((i) =>
    i === face ? projected : base,
  );
}
function dispose(root: THREE.Object3D) {
  const materials = new Set<THREE.Material>();
  root.traverse((o: any) => {
    o.geometry?.dispose();
    o.shadow?.dispose?.();
    if (o.material)
      (Array.isArray(o.material) ? o.material : [o.material]).forEach(
        (m: THREE.Material) => materials.add(m),
      );
  });
  materials.forEach((m: any) => {
    if (!m.map?.userData.shared) m.map?.dispose();
    m.dispose();
  });
}
