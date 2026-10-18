import { useEffect, useRef } from "react";
import { rectangleSelection, transformAroundPivot } from "./interaction";
import type { ScreenBounds } from "./interaction";
import { createPart } from "./sceneGeometry";
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
export interface ViewportApi {
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
    const perspective = new THREE.PerspectiveCamera(42, 1, 1, 30000);
    const ortho = new THREE.OrthographicCamera(-500, 500, 500, -500, 1, 30000);
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
        const screenBoxes: ScreenBounds[] = [];
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
          const id = unit.id;
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
          const clipped = pts.every((q) => q.z > 1 || q.z < -1);
          const l = Math.min(...pts.map((q) => q.x)),
            rr = Math.max(...pts.map((q) => q.x)),
            t = Math.min(...pts.map((q) => q.y)),
            bb = Math.max(...pts.map((q) => q.y));
          screenBoxes.push({
            id,
            left: l,
            right: rr,
            top: t,
            bottom: bb,
            clipped,
          });
        });
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
    const animate = () => {
      frame = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };
    animate();
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
      active: () => active,
    };
    setView("perspective");
    latest.current.onReady(api);
    return () => {
      cancelAnimationFrame(frame);
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
        ? new THREE.FogExp2("#101b25", 0.00028)
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
    m.map?.dispose();
    m.dispose();
  });
}
