import React from "react";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { setMatchMediaMatches } from "../test/setup";
import Table from "./Table";

const ROWS = [
  { id: "a", name: "Ada Lovelace", year: "Year 11", status: "Active", note: "hidden" },
  { id: "b", name: "Alan Turing", year: "Year 12", status: "Paused", note: "hidden" },
];

const COLUMNS = [
  { key: "name", header: "Name", sortable: true },
  { key: "year", header: "Year" },
  { key: "status", header: "Status", sortable: true },
];

function renderTable(props = {}) {
  return render(
    <Table columns={COLUMNS} rows={ROWS} getRowKey={(row) => row.id} {...props} />
  );
}

describe("Table on a desktop viewport", () => {
  it("renders a real table", () => {
    const { container } = renderTable();

    expect(container.querySelector("table.table")).toBeInTheDocument();
    expect(container.querySelector(".table-cards")).not.toBeInTheDocument();
  });
});

describe("Table on a phone viewport", () => {
  it("renders cards instead of a table", () => {
    setMatchMediaMatches(true);
    const { container } = renderTable();

    expect(container.querySelector("table")).not.toBeInTheDocument();
    expect(container.querySelectorAll(".table-card")).toHaveLength(2);
  });

  it("defaults the first column to the card title and the rest to meta rows", () => {
    setMatchMediaMatches(true);
    const { container } = renderTable();

    const [first] = container.querySelectorAll(".table-card");
    expect(within(first).getByText("Ada Lovelace")).toHaveClass("table-card-title");

    const labels = [...first.querySelectorAll(".table-card-meta dt")].map((dt) => dt.textContent);
    expect(labels).toEqual(["Year", "Status"]);
  });

  it("honours explicit mobile roles and omits hidden columns", () => {
    setMatchMediaMatches(true);
    const { container } = renderTable({
      columns: [
        { key: "name", header: "Name", mobile: "title" },
        { key: "year", header: "Year", mobile: "subtitle" },
        { key: "status", header: "Status", mobile: "meta" },
        { key: "note", header: "Note", mobile: "hide" },
      ],
    });

    const [first] = container.querySelectorAll(".table-card");
    expect(within(first).getByText("Year 11")).toHaveClass("table-card-subtitle");
    expect(within(first).queryByText("hidden")).not.toBeInTheDocument();
  });

  it("does not also promote the first column when another claims the title", () => {
    setMatchMediaMatches(true);
    const { container } = renderTable({
      columns: [
        { key: "year", header: "Year" },
        { key: "name", header: "Name", mobile: "title" },
      ],
    });

    const [first] = container.querySelectorAll(".table-card");
    expect(first.querySelectorAll(".table-card-title")).toHaveLength(1);
    expect(within(first).getByText("Ada Lovelace")).toHaveClass("table-card-title");
    // The unannotated first column falls back to a meta row, not a second title.
    expect([...first.querySelectorAll(".table-card-meta dt")].map((dt) => dt.textContent))
      .toEqual(["Year"]);
  });

  it("keeps the card list a real list, with the tap target inside each item", () => {
    setMatchMediaMatches(true);
    const { container } = renderTable({ onRowClick: vi.fn() });

    const items = container.querySelectorAll(".table-cards > li");
    expect(items).toHaveLength(2);
    for (const li of items) {
      expect(li.getAttribute("role")).toBeNull();
      expect(li.querySelector(".table-card[role='button']")).toBeInTheDocument();
    }
  });

  it("renders group headings between cards", () => {
    setMatchMediaMatches(true);
    const { container } = renderTable({
      getGroupKey: (row) => row.year,
      renderGroupHeader: (key) => `Group ${key}`,
    });

    const groups = [...container.querySelectorAll(".table-card-group")].map((el) => el.textContent);
    expect(groups).toEqual(["Group Year 11", "Group Year 12"]);
  });

  it("makes the whole card activate onRowClick by pointer and keyboard", async () => {
    setMatchMediaMatches(true);
    const onRowClick = vi.fn();
    const user = userEvent.setup();
    renderTable({ onRowClick });

    const [first, second] = screen.getAllByRole("button");
    await user.click(first);
    expect(onRowClick).toHaveBeenCalledWith(ROWS[0]);

    second.focus();
    await user.keyboard("{Enter}");
    expect(onRowClick).toHaveBeenCalledWith(ROWS[1]);
  });

  it("offers sorting as a select, including a way back to the default order", async () => {
    setMatchMediaMatches(true);
    const onSortChange = vi.fn();
    const user = userEvent.setup();
    renderTable({ sort: { key: "name", direction: "asc" }, onSortChange });

    const select = screen.getByLabelText("Sort");
    expect(select).toHaveValue("name:asc");

    // Only sortable columns appear, both directions each, plus the reset.
    expect([...select.options].map((o) => o.value)).toEqual([
      "",
      "name:asc",
      "name:desc",
      "status:asc",
      "status:desc",
    ]);

    await user.selectOptions(select, "status:desc");
    expect(onSortChange).toHaveBeenCalledWith({ key: "status", direction: "desc" });

    await user.selectOptions(select, "");
    expect(onSortChange).toHaveBeenCalledWith(null);
  });

  it("hides the sort control when nothing is sortable", () => {
    setMatchMediaMatches(true);
    renderTable({ columns: [{ key: "name", header: "Name" }], onSortChange: vi.fn() });

    expect(screen.queryByLabelText("Sort")).not.toBeInTheDocument();
  });
});
