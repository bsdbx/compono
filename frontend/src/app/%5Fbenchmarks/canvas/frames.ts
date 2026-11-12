/**
 * A 60 Hz screen draws a frame every 16.7 ms. The time between frames jitters by a
 * millisecond or two, so a frame counts as slow only when it took more than 20 ms.
 */
export const SLOW_FRAME_MS = 20;

/** The canvas holds 60 fps when no more than 1 frame in 20 is slow. */
export const ALLOWED_SLOW_SHARE = 0.05;

export type FrameSummary = {
  fps: number;
  /** The share of frames that took more than SLOW_FRAME_MS, from 0 to 1 */
  slowShare: number;
  longestMs: number;
  holds60: boolean;
};

/** Summarizes the time between frames, in milliseconds. */
export function summarize(intervals: readonly number[]): FrameSummary {
  if (intervals.length === 0) {
    throw new Error("No frames were measured.");
  }
  const total = intervals.reduce((sum, ms) => sum + ms, 0);
  const slowShare =
    intervals.filter((ms) => ms > SLOW_FRAME_MS).length / intervals.length;
  return {
    fps: (intervals.length * 1000) / total,
    slowShare,
    longestMs: Math.max(...intervals),
    holds60: slowShare <= ALLOWED_SLOW_SHARE,
  };
}

/** The screen's refresh rate in Hz, from the time between frames when nothing happens. */
export function refreshRate(intervals: readonly number[]): number {
  const sorted = intervals.toSorted((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  if (median === undefined) {
    throw new Error("No frames were measured.");
  }
  return Math.round(1000 / median);
}

/** Calls step on every frame for the duration, and returns the time between the frames. */
export function measure(
  durationMs: number,
  step: (progress: number) => void,
): Promise<number[]> {
  return new Promise((resolve) => {
    const intervals: number[] = [];
    let start: number | undefined;
    let previous = 0;

    function frame(now: number) {
      if (start === undefined) {
        start = now;
      } else {
        intervals.push(now - previous);
      }
      previous = now;

      const progress = (now - start) / durationMs;
      if (progress >= 1) {
        resolve(intervals);
        return;
      }
      step(progress);
      requestAnimationFrame(frame);
    }

    requestAnimationFrame(frame);
  });
}

/** Waits for the next frames, so that what changed before has been drawn. */
export async function frames(count: number): Promise<void> {
  for (let drawn = 0; drawn < count; drawn++) {
    await new Promise(requestAnimationFrame);
  }
}
