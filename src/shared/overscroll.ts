/**
 * Shared overscroll page-turn gesture used by both viewer formats.
 *
 * A wheel gesture that keeps accumulating delta eventually crosses the
 * threshold and triggers a page turn. Native scrolling and the per-format
 * boundary detection are handled by the callers; this module only owns the
 * gesture state machine and the visual feedback it emits.
 */

/** Margin from a section edge (in CSS pixels) within which overscroll engages. */
export const OVERSCROLL_EDGE_PX = 2;

export type OverscrollDirection = "next" | "prev";

/**
 * Returns true when the reader is at the edge of the current section in
 * SCROLL mode, based on the scrolled renderer's geometry.
 *
 * Mirrors foliate's own boundary checks (`paginator.js` `#scrollPrev`:
 * `start > 0`, `#scrollNext`: `viewSize - end > 2`).
 *
 * @param start Absolute scroll offset of the section (`|containerPosition|`).
 * @param viewSize Scrollable size of the current section.
 * @param size Viewport size of the scroll container.
 */
export function shouldEngageScrolledOverscroll(
  start: number,
  viewSize: number,
  size: number,
  direction: OverscrollDirection,
): boolean {
  if (
    !Number.isFinite(start) ||
    !Number.isFinite(viewSize) ||
    !Number.isFinite(size) ||
    size <= 0
  ) {
    return false;
  }
  if (direction === "next") return viewSize - (start + size) <= OVERSCROLL_EDGE_PX;
  return start <= OVERSCROLL_EDGE_PX;
}

export type OverscrollPhase = "idle" | "pulling" | "cooldown";

export type OverscrollFeedback = {
  active: boolean;
  direction: OverscrollDirection;
  /** Fill amount in [0, 1]; approaches 1 as the page turn threshold nears. */
  progress: number;
  /** Whether the caller wants a slower, longer feedback (SCROLL mode). */
  slow: boolean;
};

/** Timing and threshold of the overscroll gesture. */
export type OverscrollTuning = {
  /** Accumulated wheel delta required to trigger a page turn. */
  threshold: number;
  /** Idle timeout that abandons a slow, unfinished gesture. */
  resetMs: number;
  /** How long the triggered feedback stays visible. */
  cooldownMs: number;
  /** Whether the feedback should render slowly (SCROLL mode). */
  slow: boolean;
};

/** Fast PAGES-mode tuning: ~2 wheel ticks to turn. */
export const OVERSCROLL_PAGES_TUNING: OverscrollTuning = {
  threshold: 50,
  resetMs: 400,
  cooldownMs: 1000,
  slow: false,
};

/** Slower SCROLL-mode tuning: ~5 wheel ticks to turn, longer feedback. */
export const OVERSCROLL_SCROLL_TUNING: OverscrollTuning = {
  threshold: 150,
  resetMs: 650,
  cooldownMs: 1600,
  slow: true,
};

/**
 * State machine for the overscroll page-turn gesture. Callers feed wheel
 * deltas via {@link handleWheel} and receive the turn direction once the
 * accumulated delta crosses the threshold. Visual feedback is pushed through
 * subscribers while the gesture is active.
 */
export class OverscrollController {
  private tuning: OverscrollTuning;
  private phase: OverscrollPhase = "idle";
  private accumulatedDelta = 0;
  private direction: OverscrollDirection = "next";
  private resetTimer: number | null = null;
  private cooldownTimer: number | null = null;
  private readonly listeners = new Set<(feedback: OverscrollFeedback) => void>();

  constructor(tuning: OverscrollTuning = OVERSCROLL_PAGES_TUNING) {
    this.tuning = tuning;
  }

  get currentPhase(): OverscrollPhase {
    return this.phase;
  }

  get threshold(): number {
    return this.tuning.threshold;
  }

  /** Applies new gesture tuning, abandoning any in-progress gesture. */
  configure(tuning: OverscrollTuning): void {
    this.tuning = tuning;
    this.reset();
  }

  subscribe(cb: (feedback: OverscrollFeedback) => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  /**
   * Feeds a wheel delta into the gesture. Returns the page-turn direction when
   * the threshold was just crossed, otherwise null.
   */
  handleWheel(deltaY: number): OverscrollDirection | null {
    if (deltaY === 0) return null;
    if (this.phase === "cooldown") {
      this.notify();
      return null;
    }
    const direction: OverscrollDirection = deltaY > 0 ? "next" : "prev";
    if (this.phase === "idle") {
      this.phase = "pulling";
      this.accumulatedDelta = 0;
      this.direction = direction;
    } else if (this.direction !== direction) {
      this.accumulatedDelta = 0;
      this.direction = direction;
    }
    this.accumulatedDelta += deltaY;
    this.notify();

    if (this.resetTimer !== null) window.clearTimeout(this.resetTimer);
    this.resetTimer = window.setTimeout(() => {
      this.phase = "idle";
      this.accumulatedDelta = 0;
      this.direction = "next";
      this.notify();
    }, this.tuning.resetMs);

    if (Math.abs(this.accumulatedDelta) >= this.tuning.threshold) {
      const trigger = this.accumulatedDelta > 0 ? "next" : "prev";
      this.phase = "cooldown";
      this.accumulatedDelta = 0;
      this.direction = trigger;
      this.notify();
      if (this.cooldownTimer !== null) window.clearTimeout(this.cooldownTimer);
      this.cooldownTimer = window.setTimeout(() => {
        this.phase = "idle";
        this.accumulatedDelta = 0;
        this.direction = "next";
        this.notify();
      }, this.tuning.cooldownMs);
      return trigger;
    }
    return null;
  }

  /** Abandons an in-progress gesture (e.g. native scrolling resumed). */
  reset(): void {
    if (this.phase === "idle" && this.accumulatedDelta === 0) return;
    if (this.resetTimer !== null) window.clearTimeout(this.resetTimer);
    this.phase = "idle";
    this.accumulatedDelta = 0;
    this.direction = "next";
    this.notify();
  }

  dispose(): void {
    if (this.resetTimer !== null) window.clearTimeout(this.resetTimer);
    if (this.cooldownTimer !== null) window.clearTimeout(this.cooldownTimer);
    this.listeners.clear();
  }

  private notify(): void {
    const feedback = this.currentFeedback();
    for (const cb of this.listeners) cb(feedback);
  }

  private currentFeedback(): OverscrollFeedback {
    return {
      active: this.phase === "pulling" || this.phase === "cooldown",
      direction: this.direction,
      progress:
        this.phase === "pulling"
          ? Math.min(1, Math.abs(this.accumulatedDelta) / this.tuning.threshold)
          : this.phase === "cooldown"
            ? 1
            : 0,
      slow: this.tuning.slow,
    };
  }
}
