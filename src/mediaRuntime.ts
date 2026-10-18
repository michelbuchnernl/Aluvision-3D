import * as THREE from "three";
import { MAX_TEXTURE_PX, fitRect } from "./media.ts";
import type { CanvasLayout, MediaAsset, ProjectionCanvas } from "./media.ts";
/**
 * Browser-only media registry. Image/video files live in memory for the session;
 * the project stores only metadata, so a reloaded project shows "re-attach media".
 * One offscreen canvas per projection canvas feeds one texture shared by every panel,
 * which keeps all walls frame-synchronised by construction.
 */
interface Entry {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  texture: THREE.CanvasTexture;
  signature: string;
  scale: number;
}
type Source = HTMLImageElement | HTMLVideoElement;
export class MediaRuntime {
  private sources = new Map<string, Source>();
  private entries = new Map<string, Entry>();
  private listeners = new Set<() => void>();
  version = 0;
  playing = false;
  subscribe(fn: () => void) {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  }
  private changed() {
    this.version++;
    this.listeners.forEach((fn) => fn());
  }
  hasSource(mediaId: string) {
    return this.sources.has(mediaId);
  }
  video(mediaId: string) {
    const s = this.sources.get(mediaId);
    return s instanceof HTMLVideoElement ? s : undefined;
  }
  async attach(file: File, id: string): Promise<MediaAsset> {
    const url = URL.createObjectURL(file);
    try {
      const isVideo = file.type.startsWith("video/");
      if (!isVideo && !file.type.startsWith("image/"))
        throw Error("Alleen afbeeldingen en video worden ondersteund.");
      if (file.size > 500 * 1024 * 1024)
        throw Error("Bestand is groter dan 500 MB.");
      let source: Source, w: number, h: number, duration: number | undefined;
      if (isVideo) {
        const el = document.createElement("video");
        el.muted = true;
        el.loop = true;
        el.playsInline = true;
        el.preload = "auto";
        el.src = url;
        await new Promise<void>((res, rej) => {
          el.onloadeddata = () => res();
          el.onerror = () => rej(Error("Video kon niet worden gelezen."));
        });
        source = el;
        w = el.videoWidth;
        h = el.videoHeight;
        duration = Number.isFinite(el.duration) ? el.duration : undefined;
      } else {
        const el = new Image();
        el.src = url;
        await el.decode().catch(() => {
          throw Error("Afbeelding kon niet worden gelezen.");
        });
        source = el;
        w = el.naturalWidth;
        h = el.naturalHeight;
      }
      if (!w || !h) throw Error("Mediaafmeting onbekend.");
      const digest = await crypto.subtle
        .digest("SHA-256", await file.arrayBuffer())
        .then((b) =>
          [...new Uint8Array(b)]
            .map((x) => x.toString(16).padStart(2, "0"))
            .join(""),
        )
        .catch(() => undefined);
      this.sources.get(id) && this.release(id);
      this.sources.set(id, source);
      this.changed();
      return {
        id,
        name: file.name.slice(0, 120),
        kind: isVideo ? "video" : "image",
        widthPx: w,
        heightPx: h,
        bytes: file.size,
        ...(duration !== undefined ? { durationSec: duration } : {}),
        ...(digest ? { sha256: digest } : {}),
      };
    } catch (e) {
      URL.revokeObjectURL(url);
      throw e;
    }
  }
  release(id: string) {
    const s = this.sources.get(id);
    if (s instanceof HTMLVideoElement) s.pause();
    if (s) URL.revokeObjectURL(s.src);
    this.sources.delete(id);
  }
  setPlaying(value: boolean) {
    this.playing = value;
    for (const s of this.sources.values())
      if (s instanceof HTMLVideoElement) {
        if (value) void s.play().catch(() => (this.playing = false));
        else s.pause();
      }
    this.changed();
  }
  seek(seconds: number) {
    for (const s of this.sources.values())
      if (s instanceof HTMLVideoElement) s.currentTime = seconds;
  }
  /** Returns the shared texture for a canvas, redrawing only when its inputs changed. */
  textureFor(
    c: ProjectionCanvas,
    layout: CanvasLayout,
    media: MediaAsset | undefined,
  ): THREE.CanvasTexture {
    const scale = Math.min(1, MAX_TEXTURE_PX / Math.max(c.widthPx, c.heightPx));
    const w = Math.max(1, Math.round(c.widthPx * scale)),
      h = Math.max(1, Math.round(c.heightPx * scale));
    let e = this.entries.get(c.id);
    if (!e || e.canvas.width !== w || e.canvas.height !== h) {
      e?.texture.dispose();
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const texture = new THREE.CanvasTexture(canvas);
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.userData.shared = true;
      texture.anisotropy = 8;
      e = {
        canvas,
        ctx: canvas.getContext("2d")!,
        texture,
        signature: "",
        scale,
      };
      this.entries.set(c.id, e);
    }
    this.draw(e, c, layout, media);
    return e.texture;
  }
  /** Called every animation frame; only playing videos force a redraw. */
  tick(
    canvases: ProjectionCanvas[],
    layouts: Map<string, CanvasLayout>,
    media: MediaAsset[],
  ) {
    if (!this.playing) return;
    for (const c of canvases) {
      const m = media.find((v) => v.id === c.mediaId),
        e = this.entries.get(c.id),
        l = layouts.get(c.id);
      if (m?.kind === "video" && e && l && this.sources.has(m.id))
        this.draw(e, c, l, m, true);
    }
  }
  private draw(
    e: Entry,
    c: ProjectionCanvas,
    layout: CanvasLayout,
    media: MediaAsset | undefined,
    force = false,
  ) {
    const source = media ? this.sources.get(media.id) : undefined;
    const signature = JSON.stringify([
      c.widthPx,
      c.heightPx,
      c.fit,
      c.showSeams,
      media?.id,
      media?.kind,
      !!source,
      layout.seams.map((s) => s.uPx),
      layout.surfaces.map((s) => [s.objectId, s.uPx0, s.uPx1]),
    ]);
    if (!force && signature === e.signature) return;
    e.signature = signature;
    const { ctx, canvas } = e,
      W = canvas.width,
      H = canvas.height;
    ctx.save();
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, W, H);
    if (media?.kind === "test-pattern") this.pattern(ctx, c, layout, W, H);
    else if (source) {
      const mw =
          source instanceof HTMLVideoElement
            ? source.videoWidth
            : source.naturalWidth,
        mh =
          source instanceof HTMLVideoElement
            ? source.videoHeight
            : source.naturalHeight;
      const r = fitRect({ w: mw, h: mh }, { w: W, h: H }, c.fit);
      ctx.drawImage(source, r.sx, r.sy, r.sw, r.sh, r.dx, r.dy, r.dw, r.dh);
    } else {
      ctx.fillStyle = "#2a2f38";
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = "#e59630";
      ctx.font = `${Math.round(H / 14)}px sans-serif`;
      ctx.textAlign = "center";
      ctx.fillText(
        "Media niet geladen — koppel het bestand opnieuw",
        W / 2,
        H / 2,
      );
    }
    if (c.showSeams) {
      const k = e.scale;
      ctx.lineWidth = Math.max(2, H / 240);
      for (const s of layout.seams) {
        ctx.strokeStyle = s.cornerDeg > 0.5 ? "#ff5a4d" : "#ffd24d";
        ctx.setLineDash(s.cornerDeg > 0.5 ? [] : [H / 40, H / 60]);
        ctx.beginPath();
        ctx.moveTo(s.uPx * k, 0);
        ctx.lineTo(s.uPx * k, H);
        ctx.stroke();
      }
    }
    ctx.restore();
    e.texture.needsUpdate = true;
  }
  /** Calibration pattern: one grid cell is 50 cm of wall; labels count wall centimetres. */
  private pattern(
    ctx: CanvasRenderingContext2D,
    c: ProjectionCanvas,
    layout: CanvasLayout,
    W: number,
    H: number,
  ) {
    const g = ctx.createLinearGradient(0, 0, W, 0);
    layout.surfaces.forEach((s, i) => {
      const t = (s.u0 + s.u1) / 2;
      g.addColorStop(t, `hsl(${(i * 47 + 190) % 360} 45% 22%)`);
    });
    if (!layout.surfaces.length) g.addColorStop(0, "#123");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    const cmX = W / Math.max(1, layout.developedWidthCm),
      cmY = H / Math.max(1, layout.heightCm);
    ctx.strokeStyle = "rgba(255,255,255,.22)";
    ctx.lineWidth = 1;
    for (let x = 0; x <= layout.developedWidthCm; x += 50) {
      ctx.beginPath();
      ctx.moveTo(x * cmX, 0);
      ctx.lineTo(x * cmX, H);
      ctx.stroke();
    }
    for (let y = 0; y <= layout.heightCm; y += 50) {
      ctx.beginPath();
      ctx.moveTo(0, H - y * cmY);
      ctx.lineTo(W, H - y * cmY);
      ctx.stroke();
    }
    const fs = Math.max(10, Math.round(H / 18));
    ctx.font = `600 ${fs}px sans-serif`;
    ctx.fillStyle = "#fff";
    ctx.textAlign = "left";
    layout.surfaces.forEach((s, i) => {
      const x = s.uPx0 * (W / c.widthPx);
      ctx.fillText(`${i + 1}`, x + fs * 0.4, fs * 1.4);
      ctx.fillText(
        `${Math.round(s.u0 * layout.developedWidthCm)} cm`,
        x + fs * 0.4,
        H - fs * 0.5,
      );
    });
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = Math.max(2, H / 150);
    ctx.strokeRect(1, 1, W - 2, H - 2);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(W, H);
    ctx.moveTo(0, H);
    ctx.lineTo(W, 0);
    ctx.globalAlpha = 0.5;
    ctx.stroke();
    ctx.globalAlpha = 1;
    // Circle must look round on the wall when pixels are square.
    ctx.beginPath();
    ctx.arc(W / 2, H / 2, H * 0.28, 0, Math.PI * 2);
    ctx.stroke();
    ctx.textAlign = "center";
    ctx.font = `700 ${fs * 1.3}px sans-serif`;
    ctx.fillText(
      `${c.widthPx} × ${c.heightPx} px · ${Math.round(layout.developedWidthCm)} × ${Math.round(layout.heightCm)} cm`,
      W / 2,
      H / 2 + fs * 0.4,
    );
    ctx.fillText("→", W / 2, H * 0.2);
  }
  dispose() {
    for (const id of [...this.sources.keys()]) this.release(id);
    for (const e of this.entries.values()) e.texture.dispose();
    this.entries.clear();
    this.listeners.clear();
  }
}
