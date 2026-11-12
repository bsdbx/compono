import { afterEach, expect, test, vi } from "vitest";
import { frames, measure, refreshRate, summarize } from "./frames";

afterEach(() => {
  vi.useRealTimers();
});

function repeat(ms: number, count: number): number[] {
  return Array.from({ length: count }, () => ms);
}

test("frames 16.7 ms apart hold 60 fps", () => {
  const summary = summarize(repeat(1000 / 60, 240));

  expect(summary.fps).toBeCloseTo(60);
  expect(summary.slowShare).toBe(0);
  expect(summary.longestMs).toBeCloseTo(16.7, 1);
  expect(summary.holds60).toBe(true);
});

test("a frame is slow when it takes more than 20 ms", () => {
  expect(summarize([20, 20.1]).slowShare).toBe(0.5);
});

test("60 fps holds with 1 slow frame in 20, and not with more", () => {
  const withSlow = (slow: number) => [
    ...repeat(16.7, 100 - slow),
    ...repeat(33.4, slow),
  ];

  expect(summarize(withSlow(5)).holds60).toBe(true);
  expect(summarize(withSlow(6)).holds60).toBe(false);
});

test("the average fps and the longest frame count every frame", () => {
  // 60 frames in 1.5 seconds
  const summary = summarize([
    ...repeat(50 / 3, 30),
    50,
    ...repeat(100 / 3, 29),
  ]);

  expect(summary.fps).toBeCloseTo(60 / 1.5 - 0.0, 0);
  expect(summary.longestMs).toBe(50);
});

test("no frames is an error", () => {
  expect(() => summarize([])).toThrow("No frames were measured.");
  expect(() => refreshRate([])).toThrow("No frames were measured.");
});

test("the refresh rate is the median time between frames", () => {
  expect(refreshRate([16.7, 16.6, 33.4, 16.7])).toBe(60);
  // A slow frame doesn't change it
  expect(refreshRate([8.3, 8.4, 50, 8.3, 8.3])).toBe(120);
});

test("measure calls step on every frame, until the time is up", async () => {
  vi.useFakeTimers({ toFake: ["requestAnimationFrame", "performance"] });
  const steps: number[] = [];

  const measuring = measure(100, (progress) => steps.push(progress));
  await vi.advanceTimersByTimeAsync(200);

  // Fake frames come every 16 ms
  expect(await measuring).toEqual(repeat(16, 7));
  expect(steps).toEqual([0, 0.16, 0.32, 0.48, 0.64, 0.8, 0.96]);
});

test("frames waits for that many frames", async () => {
  vi.useFakeTimers({ toFake: ["requestAnimationFrame", "performance"] });
  let done = false;

  const waiting = frames(3).then(() => {
    done = true;
  });
  await vi.advanceTimersByTimeAsync(40);
  expect(done).toBe(false);
  await vi.advanceTimersByTimeAsync(16);
  await waiting;
  expect(done).toBe(true);
});
