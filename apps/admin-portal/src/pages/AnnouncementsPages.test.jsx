import React from "react";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({
  getAnnouncement: vi.fn(),
  listAnnouncements: vi.fn(),
  listUsers: vi.fn(),
}));

vi.mock("../backend/announcementsApi", () => ({
  getAnnouncement: api.getAnnouncement,
  listAnnouncements: api.listAnnouncements,
}));

vi.mock("../backend/usersApi", () => ({
  listUsers: api.listUsers,
}));

import AnnouncementDetailPage from "./AnnouncementDetailPage";
import AnnouncementsPage from "./AnnouncementsPage";
import { resetAnnouncementReportingCache } from "../backend/announcementReportingCache";

const announcement = {
  id: "announcement-1",
  title: "Term 3 timetable",
  body: "Please check the updated timetable before Monday.",
  audience: "parent",
  archived: false,
  createdAtIso: "2026-07-28T04:30:00.000Z",
};

const archivedAnnouncement = {
  id: "announcement-2",
  title: "Old holiday notice",
  body: "This notice is archived.",
  audience: "all",
  archived: true,
  createdAtIso: "2026-06-10T02:00:00.000Z",
};

const users = [
  {
    id: "parent-1",
    uid: "parent-1",
    firstName: "Pat",
    lastName: "Opened",
    displayName: "Pat Opened",
    email: "pat@example.com",
    role: "parent",
    readAnnouncements: ["announcement-1"],
  },
  {
    id: "parent-2",
    uid: "parent-2",
    firstName: "Nadia",
    lastName: "Waiting",
    displayName: "Nadia Waiting",
    email: "nadia@example.com",
    role: "parent",
    readAnnouncements: [],
  },
  {
    id: "tutor-1",
    uid: "tutor-1",
    firstName: "Tom",
    lastName: "Tutor",
    displayName: "Tom Tutor",
    email: "tutor@example.com",
    role: "tutor",
    readAnnouncements: ["announcement-1"],
  },
];

beforeEach(() => {
  vi.clearAllMocks();
  resetAnnouncementReportingCache();
  api.listAnnouncements.mockResolvedValue([announcement, archivedAnnouncement]);
  api.getAnnouncement.mockResolvedValue(announcement);
  api.listUsers.mockResolvedValue(users);
});

describe("AnnouncementsPage", () => {
  function renderPage() {
    return render(
      <MemoryRouter initialEntries={["/announcements"]}>
        <Routes>
          <Route path="/announcements" element={<AnnouncementsPage />} />
          <Route path="/announcements/:announcementId" element={<AnnouncementDetailPage />} />
          <Route path="/people/:kind/:id" element={<div>People detail route</div>} />
        </Routes>
      </MemoryRouter>,
    );
  }

  it("shows current-audience opening counts and defaults to published announcements", async () => {
    renderPage();

    const title = await screen.findByText("Term 3 timetable");
    const row = title.closest("tr");
    expect(within(row).getByText("1 opened")).toBeInTheDocument();
    expect(within(row).getByText("2 current users")).toBeInTheDocument();
    expect(screen.queryByText("Old holiday notice")).not.toBeInTheDocument();
    expect(screen.getByText(/opening times are not recorded/i)).toBeInTheDocument();
  });

  it("opens cached detail data without repeating the announcement or user fetch", async () => {
    const user = userEvent.setup();
    renderPage();

    await screen.findByText("Term 3 timetable");
    await user.selectOptions(screen.getByLabelText("Filter by announcement status"), "archived");
    await user.click(await screen.findByText("Old holiday notice"));

    expect(await screen.findByRole("heading", { level: 1, name: "Old holiday notice" })).toBeInTheDocument();
    expect(api.listAnnouncements).toHaveBeenCalledTimes(1);
    expect(api.listUsers).toHaveBeenCalledTimes(1);
    expect(api.getAnnouncement).not.toHaveBeenCalled();
  });

  it("shows a retryable error when reporting data cannot load", async () => {
    api.listAnnouncements.mockRejectedValue(new Error("Firestore unavailable"));
    renderPage();

    expect(await screen.findByText("Announcements could not be loaded")).toBeInTheDocument();
    expect(screen.getByText("Firestore unavailable")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
  });
});

describe("AnnouncementDetailPage", () => {
  function renderDetail() {
    return render(
      <MemoryRouter initialEntries={["/announcements/announcement-1"]}>
        <Routes>
          <Route path="/announcements/:announcementId" element={<AnnouncementDetailPage />} />
          <Route path="/people/:kind/:id" element={<div>People detail route</div>} />
        </Routes>
      </MemoryRouter>,
    );
  }

  it("shows opened and not-opened current audience users while excluding other roles", async () => {
    renderDetail();

    expect(await screen.findByRole("heading", { level: 1, name: "Term 3 timetable" })).toBeInTheDocument();
    expect(screen.getByText("Pat Opened")).toBeInTheDocument();
    expect(screen.getByText("Nadia Waiting")).toBeInTheDocument();
    expect(screen.queryByText("Tom Tutor")).not.toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Opened 1" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Not opened 1" })).toBeInTheDocument();
  });

  it("filters opening status and links users to their People record", async () => {
    const user = userEvent.setup();
    renderDetail();

    await screen.findByText("Pat Opened");
    await user.click(screen.getByRole("tab", { name: "Not opened 1" }));
    expect(screen.queryByText("Pat Opened")).not.toBeInTheDocument();
    await user.click(screen.getByText("Nadia Waiting"));
    expect(await screen.findByText("People detail route")).toBeInTheDocument();
  });

  it("handles a deleted announcement", async () => {
    api.getAnnouncement.mockResolvedValue(null);
    renderDetail();

    expect(await screen.findByRole("heading", { level: 1, name: "Announcement not found" })).toBeInTheDocument();
    await waitFor(() => expect(api.getAnnouncement).toHaveBeenCalledWith("announcement-1"));
  });
});
