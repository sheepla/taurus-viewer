import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  OverscrollController,
  OVERSCROLL_PAGES_TUNING,
  OVERSCROLL_SCROLL_TUNING,
  shouldEngageScrolledOverscroll,
} from "../../shared/overscroll";

describe("overscroll scrolled-mode section boundary detection", () => {
  it("engages when scrolling down at the section end", () => {
    // start at the very bottom: viewSize == start + size
    expect(shouldEngageScrolledOverscroll(800, 1000, 200, "next")).toBe(true);
    // a couple of pixels of slack still counts as the edge
    expect(shouldEngageScrolledOverscroll(798, 1000, 200, "next")).toBe(true);
  });

  it("keeps native scrolling while inside the section", () => {
    expect(shouldEngageScrolledOverscroll(400, 1000, 200, "next")).toBe(false);
    expect(shouldEngageScrolledOverscroll(0, 1000, 200, "next")).toBe(false);
  });

  it("engages when scrolling up at the section start", () => {
    expect(shouldEngageScrolledOverscroll(0, 1000, 200, "prev")).toBe(true);
    expect(shouldEngageScrolledOverscroll(2, 1000, 200, "prev")).toBe(true);
  });

  it("keeps native scrolling while scrolling up inside the section", () => {
    expect(shouldEngageScrolledOverscroll(200, 1000, 200, "prev")).toBe(false);
    expect(shouldEngageScrolledOverscroll(500, 1000, 200, "prev")).toBe(false);
  });

  it("does not engage for non-finite or zero geometry", () => {
    expect(shouldEngageScrolledOverscroll(Number.NaN, 1000, 200, "next")).toBe(false);
    expect(shouldEngageScrolledOverscroll(800, Number.POSITIVE_INFINITY, 200, "next")).toBe(false);
    expect(shouldEngageScrolledOverscroll(800, 1000, 0, "prev")).toBe(false);
  });
});

describe("OverscrollController gesture state machine", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("does not engage for a zero delta", () => {
    const controller = new OverscrollController();
    expect(controller.handleWheel(0)).toBeNull();
    expect(controller.currentPhase).toBe("idle");
  });

  it("uses the PAGES tuning by default", () => {
    const controller = new OverscrollController();
    expect(controller.threshold).toBe(OVERSCROLL_PAGES_TUNING.threshold);
    const feedback: Array<{ slow: boolean }> = [];
    controller.subscribe((fb) => feedback.push({ slow: fb.slow }));
    controller.handleWheel(10);
    expect(feedback[feedback.length - 1].slow).toBe(false);
  });

  it("accumulates deltas and triggers a forward page turn on the threshold", () => {
    const controller = new OverscrollController();
    expect(controller.currentPhase).toBe("idle");
    expect(controller.handleWheel(20)).toBeNull();
    expect(controller.currentPhase).toBe("pulling");
    expect(controller.handleWheel(20)).toBeNull();
    expect(controller.handleWheel(20)).toBe("next");
    expect(controller.currentPhase).toBe("cooldown");
  });

  it("triggers a backward page turn for negative deltas", () => {
    const controller = new OverscrollController();
    controller.handleWheel(-20);
    expect(controller.handleWheel(-40)).toBe("prev");
  });

  it("resets the accumulated delta when the direction reverses", () => {
    const controller = new OverscrollController();
    controller.handleWheel(30);
    expect(controller.handleWheel(-40)).toBeNull();
    expect(controller.handleWheel(-20)).toBe("prev");
  });

  it("respects a configured SCROLL threshold and slow feedback", () => {
    const controller = new OverscrollController(OVERSCROLL_SCROLL_TUNING);
    const feedbacks: Array<{ progress: number; slow: boolean }> = [];
    controller.subscribe((fb) =>
      feedbacks.push({ progress: fb.progress, slow: fb.slow }),
    );
    expect(controller.threshold).toBe(OVERSCROLL_SCROLL_TUNING.threshold);
    // two 50px ticks do not cross the 150px SCROLL threshold yet
    expect(controller.handleWheel(50)).toBeNull();
    expect(controller.handleWheel(50)).toBeNull();
    expect(controller.currentPhase).toBe("pulling");
    expect(feedbacks[feedbacks.length - 1].slow).toBe(true);
    expect(controller.handleWheel(50)).toBe("next");
  });

  it("re-applies tuning when configured and resets the gesture", () => {
    const controller = new OverscrollController(OVERSCROLL_PAGES_TUNING);
    controller.handleWheel(30);
    expect(controller.currentPhase).toBe("pulling");
    controller.configure(OVERSCROLL_SCROLL_TUNING);
    expect(controller.threshold).toBe(OVERSCROLL_SCROLL_TUNING.threshold);
    expect(controller.currentPhase).toBe("idle");
  });

  it("returns to idle after the reset timeout elapses without input", () => {
    const controller = new OverscrollController();
    controller.handleWheel(10);
    expect(controller.currentPhase).toBe("pulling");
    vi.advanceTimersByTime(500);
    expect(controller.currentPhase).toBe("idle");
  });

  it("keeps a SCROLL gesture alive longer than a PAGES one", () => {
    const controller = new OverscrollController(OVERSCROLL_SCROLL_TUNING);
    controller.handleWheel(30);
    expect(controller.currentPhase).toBe("pulling");
    // SCROLL reset is 650ms; still pulling before that.
    vi.advanceTimersByTime(600);
    expect(controller.currentPhase).toBe("pulling");
  });

  it("ignores further wheel input while in cooldown", () => {
    const controller = new OverscrollController();
    for (let i = 0; i < 3; i += 1) controller.handleWheel(20);
    expect(controller.currentPhase).toBe("cooldown");
    expect(controller.handleWheel(40)).toBeNull();
    expect(controller.currentPhase).toBe("cooldown");
  });

  it("returns to idle after the cooldown timeout", () => {
    const controller = new OverscrollController();
    for (let i = 0; i < 3; i += 1) controller.handleWheel(20);
    vi.advanceTimersByTime(1200);
    expect(controller.currentPhase).toBe("idle");
  });

  it("resets an in-progress gesture and notifies subscribers", () => {
    const controller = new OverscrollController();
    const feedbacks: Array<{ active: boolean; progress: number }> = [];
    controller.subscribe((fb) => feedbacks.push({ active: fb.active, progress: fb.progress }));

    controller.handleWheel(20);
    expect(feedbacks[feedbacks.length - 1]).toEqual({ active: true, progress: 0.4 });
    controller.reset();
    expect(controller.currentPhase).toBe("idle");
    expect(feedbacks[feedbacks.length - 1]).toEqual({ active: false, progress: 0 });
  });

  it("unsubscribes stop receiving feedback", () => {
    const controller = new OverscrollController();
    const cb = vi.fn();
    const unsubscribe = controller.subscribe(cb);
    unsubscribe();
    controller.handleWheel(OVERSCROLL_PAGES_TUNING.threshold);
    expect(cb).not.toHaveBeenCalled();
  });
});