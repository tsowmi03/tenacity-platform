import React from "react";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({
  listReferrals: vi.fn(),
  setReferralStatus: vi.fn(async () => ({})),
  setReferralRewardApplied: vi.fn(async () => ({})),
}));

const users = vi.hoisted(() => ({
  listUsers: vi.fn(async () => [
    { id: "p1", displayName: "Rae Referrer" },
    { id: "p2", displayName: "Nina New" },
    { id: "p3", displayName: "Sam Sibling" },
    { id: "p4", displayName: "Olive Old" },
  ]),
}));

const authUser = vi.hoisted(() => ({ uid: "admin-1" }));

vi.mock("../AuthProvider", () => ({
  useAuth: () => ({ user: authUser, isAdmin: true }),
}));

vi.mock("../backend/referralsApi", async (importOriginal) => ({
  ...(await importOriginal()),
  ...api,
}));
vi.mock("../backend/usersApi", () => users);

import { ToastProvider } from "../components/ToastProvider";
import ReferralsPage from "./ReferralsPage";

function referral(overrides = {}) {
  return {
    id: "p1_p2",
    referrerParentId: "p1",
    newParentId: "p2",
    enrolmentIds: ["e1"],
    status: "pending",
    rewardApplied: false,
    newParentExisted: false,
    createdAtIso: "2026-10-09T00:00:00.000Z",
    ...overrides,
  };
}

function renderPage() {
  return render(
    <ToastProvider>
      <MemoryRouter initialEntries={["/referrals"]}>
        <ReferralsPage />
      </MemoryRouter>
    </ToastProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("ReferralsPage", () => {
  it("lists pending referrals with names, links and a flag for existing families", async () => {
    api.listReferrals.mockResolvedValue([
      referral(),
      referral({
        id: "p1_p4",
        newParentId: "p4",
        newParentExisted: true,
        enrolmentIds: ["e2", "e3"],
      }),
      referral({ id: "p3_p2", referrerParentId: "p3", status: "successful" }),
    ]);

    renderPage();

    await waitFor(() => expect(screen.getByText("Nina New")).toBeInTheDocument());
    expect(screen.getAllByText("Rae Referrer")).toHaveLength(2);
    expect(screen.getByText("Existing family")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Nina New" })).toHaveAttribute(
      "href",
      "/people/parents/p2"
    );
    expect(screen.getByRole("link", { name: "Child 2" })).toHaveAttribute(
      "href",
      "/enrolments/e3"
    );
    // The successful one is on its own tab, and its reward is still owed.
    expect(screen.queryByText("Sam Sibling")).not.toBeInTheDocument();
    expect(screen.getByText("1 reward still to apply")).toBeInTheDocument();
  });

  it("marks a referral successful through the API and reloads", async () => {
    api.listReferrals.mockResolvedValue([referral()]);
    renderPage();

    await userEvent.click(await screen.findByRole("button", { name: "Mark successful" }));

    expect(api.setReferralStatus).toHaveBeenCalledWith("p1_p2", "successful");
    await waitFor(() => expect(api.listReferrals).toHaveBeenCalledTimes(2));
  });

  it("ticks off the reward on a successful referral", async () => {
    api.listReferrals.mockResolvedValue([referral({ status: "successful" })]);
    renderPage();

    await userEvent.click(await screen.findByRole("button", { name: /Successful/ }));
    const row = (await screen.findByText("Reward owed")).closest("tr");
    await userEvent.click(within(row).getByRole("button", { name: "Reward applied" }));

    expect(api.setReferralRewardApplied).toHaveBeenCalledWith("p1_p2", true);
  });

  it("won't move a referral back to pending once its reward is applied", async () => {
    api.listReferrals.mockResolvedValue([
      referral({ status: "successful", rewardApplied: true }),
    ]);
    renderPage();

    await userEvent.click(await screen.findByRole("button", { name: /Successful/ }));
    expect(await screen.findByRole("button", { name: "Back to pending" })).toBeDisabled();
    expect(screen.queryByText(/still to apply/)).not.toBeInTheDocument();
  });
});
