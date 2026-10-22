import type { ArchiveFile } from '@adofai-reading/core';

type Source = ImageBitmap;

/** "#rrggbb" key for a tint, or "" when the tint is white (no tint needed). */
function tintKey(r: number, g: number, b: number): string {
  if (r > 254 && g > 254 && b > 254) return '';
  return `${Math.round(r)},${Math.round(g)},${Math.round(b)}`;
}

/**
 * Images from the level folder (decorations, backgrounds), decoded on first use. `get` returns null
 * until the image is ready (or if it is missing), so a frame never waits for decoding.
 */
export class LevelImages {
  private readonly ready = new Map<string, Source | null>();
  private readonly loading = new Set<string>();
  private readonly tinted = new Map<string, HTMLCanvasElement>();
  private readonly byName = new Map<string, ArchiveFile>();
  /** Called when an image finishes loading (so a paused view can redraw). */
  onLoad: (() => void) | null = null;

  constructor(archive: ArchiveFile[], levelPath: string) {
    const dir = levelPath.includes('/') ? levelPath.slice(0, levelPath.lastIndexOf('/') + 1) : '';
    // files next to the level win over same-named files elsewhere in the archive
    for (const f of archive) {
      const base = f.path.slice(f.path.lastIndexOf('/') + 1).toLowerCase();
      if (!this.byName.has(base)) this.byName.set(base, f);
    }
    for (const f of archive) {
      if (!f.path.startsWith(dir)) continue;
      this.byName.set(f.path.slice(dir.length).toLowerCase(), f);
      const base = f.path.slice(f.path.lastIndexOf('/') + 1).toLowerCase();
      this.byName.set(base, f);
    }
  }

  private find(name: string): ArchiveFile | undefined {
    const key = name.replace(/\\/g, '/').toLowerCase();
    return this.byName.get(key) ?? this.byName.get(key.slice(key.lastIndexOf('/') + 1));
  }

  /** Start decoding images ahead of time. */
  preload(names: string[]): void {
    for (const n of names) this.get(n);
  }

  get(name: string): Source | null {
    if (!name) return null;
    const hit = this.ready.get(name);
    if (hit !== undefined) return hit;
    if (!this.loading.has(name)) {
      this.loading.add(name);
      const file = this.find(name);
      if (!file) this.ready.set(name, null);
      else
        createImageBitmap(new Blob([file.data.slice()]))
          .then((img) => {
            this.ready.set(name, img);
            this.onLoad?.();
          })
          .catch(() => this.ready.set(name, null));
    }
    return null;
  }

  /** The image multiplied by a colour (cached per colour). */
  getTinted(name: string, r: number, g: number, b: number): CanvasImageSource | null {
    const img = this.get(name);
    if (!img) return null;
    const key = tintKey(r, g, b);
    if (!key) return img;
    const id = `${name}|${key}`;
    let c = this.tinted.get(id);
    if (!c) {
      c = document.createElement('canvas');
      c.width = img.width;
      c.height = img.height;
      const ctx = c.getContext('2d')!;
      ctx.drawImage(img, 0, 0);
      ctx.globalCompositeOperation = 'multiply';
      ctx.fillStyle = `rgb(${key})`;
      ctx.fillRect(0, 0, c.width, c.height);
      ctx.globalCompositeOperation = 'destination-in';
      ctx.drawImage(img, 0, 0);
      if (this.tinted.size > 256) this.tinted.clear();
      this.tinted.set(id, c);
    }
    return c;
  }

  dispose(): void {
    for (const img of this.ready.values()) img?.close();
    this.ready.clear();
    this.tinted.clear();
  }
}
