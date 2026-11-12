import { fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { Button } from "@/components/ui/button";
import { renderWithClient, stubApi } from "@/test-utils";
import { JoinTeamForm } from "./join-team-form";

afterEach(() => {
  vi.unstubAllGlobals();
});

const NORTHWIND = {
  id: "2",
  name: "Northwind",
  url: "northwind",
  role: "MEMBER",
};

function join(link: string) {
  const onJoined = vi.fn();
  renderWithClient(
    <JoinTeamForm onJoined={onJoined}>
      {() => <Button type="submit">Join</Button>}
    </JoinTeamForm>,
  );
  fireEvent.change(screen.getByLabelText("Invite link"), {
    target: { value: link },
  });
  fireEvent.click(screen.getByRole("button", { name: "Join" }));
  return onJoined;
}

test("a pasted link joins its team", async () => {
  const fetch = stubApi(() => Response.json(NORTHWIND));
  const onJoined = join("https://compono-app.vercel.app/join/abc123");

  await waitFor(() => expect(onJoined).toHaveBeenCalledWith(NORTHWIND));
  const request = fetch.mock.calls[0]?.[0];
  expect(request?.method).toBe("POST");
  expect(request?.url).toBe("http://localhost/api/invite-links/abc123");
});

test("a link that isn't valid says so", async () => {
  stubApi(() =>
    Response.json({ detail: "invite_link_not_valid" }, { status: 404 }),
  );
  const onJoined = join("abc123");

  expect(
    await screen.findByText(/This invite link isn’t valid/),
  ).toBeInTheDocument();
  expect(onJoined).not.toHaveBeenCalled();
});

test("an empty link asks for one", async () => {
  const fetch = stubApi(() => undefined);
  join("   ");

  expect(await screen.findByText("Paste the invite link.")).toBeInTheDocument();
  expect(fetch).not.toHaveBeenCalled();
});
