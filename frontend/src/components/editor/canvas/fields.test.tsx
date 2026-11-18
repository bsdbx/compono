import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { expect, test, vi } from "vitest";
import { ChoiceField } from "./fields";

function Choice() {
  const [value, setValue] = useState("h3");
  return (
    <ChoiceField
      label="Tag"
      value={value}
      options={["", "h3", "a"]}
      onChange={setValue}
    />
  );
}

test("the custom choice menu can select an empty value as None", async () => {
  render(<Choice />);
  const field = screen.getByRole("combobox", { name: "Tag" });
  fireEvent.keyDown(field, { key: "ArrowDown" });
  fireEvent.click(await screen.findByRole("option", { name: "None" }));
  expect(field).toHaveTextContent("None");
  expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
});

test("an old option stays visible until a supported option replaces it", async () => {
  const change = vi.fn();
  render(
    <ChoiceField
      label="Role"
      value="old"
      options={["new"]}
      onChange={change}
    />,
  );
  const field = screen.getByRole("combobox", { name: "Role" });
  expect(field).toHaveTextContent("old");
  fireEvent.keyDown(field, { key: "ArrowDown" });
  expect(
    await screen.findByRole("option", { name: "old" }),
  ).toBeInTheDocument();
  fireEvent.click(screen.getByRole("option", { name: "new" }));
  expect(change).toHaveBeenCalledWith("new");
});
