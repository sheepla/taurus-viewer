import { useEffect, useRef, useState } from "react";
import { ArrowDown, ArrowUp } from "lucide-react";
import type { OverscrollFeedback } from "../shared/overscroll";

/**
 * Floating arrow indicator shown while the overscroll page-turn gesture is
 * being pulled. Shared by the PDF and EPUB viewers.
 */
export function OverscrollIndicator({ feedback }: { feedback: OverscrollFeedback }) {
  const atTop = feedback.direction === "prev";
  const active = feedback.active;
  const slow = feedback.slow;
  const Arrow = atTop ? ArrowUp : ArrowDown;
  const slide = 80;
  const margin = 24;
  // SCROLL mode renders the feedback slower so the section change is clearly
  // visible; PAGES mode keeps the snappy response.
  const opacityDuration = slow ? 500 : 200;
  const motionDuration = slow ? 600 : 300;
  const fadeDelay = slow ? 500 : 200;

  const [pos, setPos] = useState(0);
  const wasActive = useRef(false);

  useEffect(() => {
    if (active) {
      wasActive.current = true;
      setPos(feedback.progress);
      return;
    }
    if (wasActive.current) {
      wasActive.current = false;
      const t = window.setTimeout(() => setPos(0), fadeDelay);
      return () => window.clearTimeout(t);
    }
  }, [active, feedback.progress, fadeDelay]);

  const progress = Math.max(0, Math.min(1, pos));
  const translateY = atTop
    ? -slide * (1 - progress) + margin
    : slide * (1 - progress) - margin;
  return (
    <div
      className={`pointer-events-none absolute inset-x-0 z-10 flex justify-center ${
        atTop ? "top-0" : "bottom-0"
      }`}
    >
      <div
        className="transition-opacity"
        style={{
          opacity: active ? 1 : 0,
          transitionDuration: `${opacityDuration}ms`,
        }}
      >
        <div
          className="transition-transform ease-out"
          style={{
            transform: `translateY(${translateY}px)`,
            transitionDuration: `${motionDuration}ms`,
          }}
        >
          <div
            className="flex h-12 w-12 items-center justify-center rounded-full border border-border bg-background shadow-lg"
            style={{
              transform: `scale(${0.85 + progress * 0.15})`,
              transition: `transform ${motionDuration}ms ease-out`,
            }}
          >
            <Arrow size={20} className="text-foreground" />
          </div>
        </div>
      </div>
    </div>
  );
}
