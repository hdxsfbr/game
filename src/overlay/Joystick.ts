import { el } from './dom';

/**
 * Touch play's walking control: a circle at the bottom left, a thumb that follows the finger. The
 * direction and how far the thumb is pushed give the walk, as `x` (screen right) and `z` (screen
 * down) in -1..1; a light touch near the centre counts as standing still.
 */
export class Joystick {
  readonly root: HTMLDivElement;
  private thumb: HTMLDivElement;
  private pointerId: number | null = null;
  private cx = 0;
  private cy = 0;
  x = 0;
  z = 0;

  constructor(ui: HTMLDivElement) {
    this.root = el('div', 'joy hidden');
    this.root.id = 'joy';
    this.thumb = el('div', 'joy-thumb');
    this.root.append(this.thumb);
    this.root.addEventListener('pointerdown', (e) => this.down(e));
    this.root.addEventListener('pointermove', (e) => this.move(e));
    this.root.addEventListener('pointerup', (e) => this.up(e));
    this.root.addEventListener('pointercancel', (e) => this.up(e));
    this.root.addEventListener('lostpointercapture', (e) => this.up(e));
    ui.appendChild(this.root);
  }

  /** Whether the finger is on the stick and pushing it. */
  get active(): boolean {
    return this.pointerId !== null && (this.x !== 0 || this.z !== 0);
  }

  show(on: boolean): void {
    if (this.root.classList.contains('hidden') === !on) return;
    this.root.classList.toggle('hidden', !on);
    if (!on) this.release();
  }

  private down(e: PointerEvent): void {
    if (this.pointerId !== null) return;
    e.preventDefault();
    this.pointerId = e.pointerId;
    try {
      this.root.setPointerCapture(e.pointerId);
    } catch {
      // Not a live pointer (a synthetic event); the move and up events still arrive on the stick.
    }
    const r = this.root.getBoundingClientRect();
    this.cx = r.left + r.width / 2;
    this.cy = r.top + r.height / 2;
    this.root.classList.add('held');
    this.move(e);
  }

  private move(e: PointerEvent): void {
    if (e.pointerId !== this.pointerId) return;
    // The thumb travels to the rim; the walk is full speed from about two thirds of the way out.
    const reach = this.root.clientWidth * 0.36;
    let dx = e.clientX - this.cx;
    let dy = e.clientY - this.cy;
    const d = Math.hypot(dx, dy);
    if (d > reach) {
      dx *= reach / d;
      dy *= reach / d;
    }
    this.thumb.style.transform = `translate(${dx}px, ${dy}px)`;
    const push = Math.min(1, d / (reach * 0.66));
    if (push < 0.18) {
      this.x = 0;
      this.z = 0;
    } else {
      this.x = (dx / (d || 1)) * push;
      this.z = (dy / (d || 1)) * push;
    }
  }

  private up(e: PointerEvent): void {
    if (e.pointerId !== this.pointerId) return;
    this.release();
  }

  private release(): void {
    this.pointerId = null;
    this.x = 0;
    this.z = 0;
    this.thumb.style.transform = '';
    this.root.classList.remove('held');
  }
}
