import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { useState } from "react";
import { expect, test, vi } from "vitest";
import { choiceMenuOf } from "./choice-menus";
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

test("tag choices are grouped and can be searched and selected from the keyboard", async () => {
  const change = vi.fn();
  render(
    <ChoiceField
      label="Tag"
      value="div"
      options={["div", "p", "h1", "h2", "header"]}
      menu={choiceMenuOf("element", "tag")}
      onChange={change}
    />,
  );
  const field = screen.getByRole("combobox", { name: "Tag" });
  fireEvent.keyDown(field, { key: "ArrowDown" });
  const search = await screen.findByRole("combobox", { name: "Search tags" });
  await waitFor(() => expect(search).toHaveFocus());
  const layout = screen.getByRole("group", { name: "Layout" });
  expect(
    within(layout).getByRole("option", { name: "div" }),
  ).toBeInTheDocument();
  expect(
    within(screen.getByRole("group", { name: "Text" })).getByRole("option", {
      name: "p",
    }),
  ).toBeInTheDocument();

  fireEvent.change(search, { target: { value: "H" } });
  expect(
    screen.getAllByRole("option").map((option) => option.textContent),
  ).toEqual(["header", "h1", "h2"]);
  expect(
    screen.getByRole("option", { name: "header" }).querySelector("mark"),
  ).toHaveTextContent("h");
  fireEvent.keyDown(search, { key: "ArrowDown" });
  fireEvent.keyDown(search, { key: "Enter" });
  expect(change).toHaveBeenCalledWith("h1");
  await waitFor(() => expect(field).toHaveFocus());
});

test("search matches displayed names and clears when the menu reopens", async () => {
  render(
    <ChoiceField
      label="Subtype"
      value="Number"
      options={["Number", "Integer"]}
      menu={choiceMenuOf("number", "subtype")}
      onChange={() => {}}
    />,
  );
  const field = screen.getByRole("combobox", { name: "Subtype" });
  fireEvent.click(field);
  const search = await screen.findByRole("combobox", {
    name: "Search subtypes",
  });
  fireEvent.change(search, { target: { value: "dec" } });
  expect(screen.getByRole("option", { name: "Decimal" })).toBeInTheDocument();
  expect(
    screen.queryByRole("option", { name: "Integer" }),
  ).not.toBeInTheDocument();
  fireEvent.change(search, { target: { value: "unknown" } });
  expect(screen.getByRole("status")).toHaveTextContent("No matching options");
  fireEvent.keyDown(search, { key: "Escape" });
  await waitFor(() => expect(field).toHaveFocus());
  fireEvent.click(field);
  expect(
    await screen.findByRole("combobox", { name: "Search subtypes" }),
  ).toHaveValue("");
});
