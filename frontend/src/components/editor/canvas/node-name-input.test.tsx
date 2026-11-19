import { fireEvent, render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { NodeNameInput } from "./node-name-input";

function input() {
  const onSave = vi.fn();
  const onDone = vi.fn();
  render(<NodeNameInput name="Text" onSave={onSave} onDone={onDone} />);
  return {
    field: screen.getByRole("textbox", {
      name: "Node name",
    }) as HTMLInputElement,
    onSave,
    onDone,
  };
}

test("renaming focuses and selects the existing label, and Enter saves once", () => {
  const { field, onSave, onDone } = input();
  expect(field).toHaveFocus();
  expect(field.selectionStart).toBe(0);
  expect(field.selectionEnd).toBe(4);
  fireEvent.change(field, { target: { value: "Card title" } });
  fireEvent.keyDown(field, { key: "Enter" });
  fireEvent.blur(field);
  expect(onSave).toHaveBeenCalledExactlyOnceWith("Card title");
  expect(onDone).toHaveBeenCalledOnce();
});

test("Escape cancels even when the field then blurs", () => {
  const { field, onSave, onDone } = input();
  fireEvent.change(field, { target: { value: "Other" } });
  fireEvent.keyDown(field, { key: "Escape" });
  fireEvent.blur(field);
  expect(onSave).not.toHaveBeenCalled();
  expect(onDone).toHaveBeenCalledOnce();
});

test("leaving the field saves the label", () => {
  const { field, onSave, onDone } = input();
  fireEvent.change(field, { target: { value: "Title" } });
  fireEvent.blur(field);
  expect(onSave).toHaveBeenCalledExactlyOnceWith("Title");
  expect(onDone).toHaveBeenCalledOnce();
});

test("Enter during text composition does not end renaming", () => {
  const { field, onSave, onDone } = input();
  fireEvent.keyDown(field, { key: "Enter", isComposing: true });
  expect(onSave).not.toHaveBeenCalled();
  expect(onDone).not.toHaveBeenCalled();
});
