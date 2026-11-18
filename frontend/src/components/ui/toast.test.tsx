import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { Toasts, useToast } from "./toast";

function Notices() {
  const notify = useToast();
  return (
    <>
      <button
        type="button"
        onClick={() =>
          notify({
            title: "First notice",
            action: { label: "Done first", onClick: () => {} },
          })
        }
      >
        First
      </button>
      <button type="button" onClick={() => notify({ title: "Second notice" })}>
        Second
      </button>
    </>
  );
}

afterEach(() => vi.useRealTimers());

function setup() {
  vi.useFakeTimers();
  render(
    <Toasts>
      <Notices />
    </Toasts>,
  );
  return within(screen.getByRole("region", { name: "Notifications (F8)" }));
}

test("a toast expires after 2.5 seconds and its exit animation", () => {
  const notices = setup();
  fireEvent.click(screen.getByRole("button", { name: "First" }));
  act(() => vi.advanceTimersByTime(2700));
  expect(notices.queryByText("First notice")).not.toBeInTheDocument();
});

test("hovering one toast leaves other toast lifetimes independent", () => {
  const notices = setup();
  fireEvent.click(screen.getByRole("button", { name: "First" }));
  act(() => vi.advanceTimersByTime(600));
  fireEvent.click(screen.getByRole("button", { name: "Second" }));
  const second = notices
    .getByText("Second notice")
    .closest("li") as HTMLElement;
  fireEvent.pointerOver(second, { pointerType: "mouse" });
  fireEvent.pointerMove(second, { pointerType: "mouse" });
  act(() => vi.advanceTimersByTime(2200));
  expect(notices.queryByText("First notice")).not.toBeInTheDocument();
  expect(notices.getByText("Second notice")).toBeInTheDocument();
  fireEvent.pointerOut(second, { pointerType: "mouse" });
  act(() => vi.advanceTimersByTime(2700));
  expect(notices.queryByText("Second notice")).not.toBeInTheDocument();
});

test("a toast action dismisses only that toast", () => {
  const notices = setup();
  fireEvent.click(screen.getByRole("button", { name: "First" }));
  fireEvent.click(screen.getByRole("button", { name: "Second" }));
  fireEvent.click(notices.getByRole("button", { name: "Done first" }));
  act(() => vi.advanceTimersByTime(200));
  expect(notices.queryByText("First notice")).not.toBeInTheDocument();
  expect(notices.getByText("Second notice")).toBeInTheDocument();
});

test("leaving the window pauses a toast without resetting its remaining lifetime", () => {
  const notices = setup();
  fireEvent.click(screen.getByRole("button", { name: "First" }));
  act(() => vi.advanceTimersByTime(1500));
  fireEvent.blur(window);
  act(() => vi.advanceTimersByTime(5000));
  expect(notices.getByText("First notice")).toBeInTheDocument();
  fireEvent.focus(window);
  act(() => vi.advanceTimersByTime(1200));
  expect(notices.queryByText("First notice")).not.toBeInTheDocument();
});
