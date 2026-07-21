import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import ConfirmDialog from "./ConfirmDialog";

function defaultProps(overrides = {}) {
  return {
    open: true,
    title: "Delete user?",
    message: "This permanently deletes the user.",
    confirmLabel: "Delete user",
    tone: "danger",
    onCancel: vi.fn(),
    onConfirm: vi.fn(),
    ...overrides,
  };
}

describe("ConfirmDialog", () => {
  it("renders nothing when open=false", () => {
    const { container } = render(<ConfirmDialog {...defaultProps({ open: false })} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders title and message when open", () => {
    render(<ConfirmDialog {...defaultProps()} />);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("Delete user?")).toBeInTheDocument();
    expect(screen.getByText("This permanently deletes the user.")).toBeInTheDocument();
  });

  it("invokes onCancel when Cancel is clicked", async () => {
    const user = userEvent.setup();
    const props = defaultProps();
    render(<ConfirmDialog {...props} />);
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(props.onCancel).toHaveBeenCalledTimes(1);
  });

  it("disables the confirm button until the typed value matches", async () => {
    const user = userEvent.setup();
    const props = defaultProps({ typedValue: "alex@example.com" });
    render(<ConfirmDialog {...props} />);

    const confirmBtn = screen.getByRole("button", { name: "Delete user" });
    expect(confirmBtn).toBeDisabled();

    const input = screen.getByRole("textbox");
    await user.type(input, "wrong");
    expect(confirmBtn).toBeDisabled();

    await user.clear(input);
    await user.type(input, "alex@example.com");
    expect(confirmBtn).not.toBeDisabled();

    await user.click(confirmBtn);
    expect(props.onConfirm).toHaveBeenCalledTimes(1);
    expect(props.onConfirm).toHaveBeenCalledWith(
      expect.objectContaining({ typed: "alex@example.com" })
    );
  });

  it("requires a reason when reasonRequired=true before enabling confirm", async () => {
    const user = userEvent.setup();
    const props = defaultProps({ reasonLabel: "Reason", reasonRequired: true });
    render(<ConfirmDialog {...props} />);

    const confirmBtn = screen.getByRole("button", { name: "Delete user" });
    expect(confirmBtn).toBeDisabled();

    await user.type(screen.getByRole("textbox"), "Spam record");
    expect(confirmBtn).not.toBeDisabled();

    await user.click(confirmBtn);
    expect(props.onConfirm).toHaveBeenCalledWith(
      expect.objectContaining({ reason: "Spam record" })
    );
  });

  it("does not enable confirm when reasonRequired=true and only whitespace is typed", async () => {
    const user = userEvent.setup();
    render(<ConfirmDialog {...defaultProps({ reasonLabel: "Reason", reasonRequired: true })} />);
    await user.type(screen.getByRole("textbox"), "   ");
    expect(screen.getByRole("button", { name: "Delete user" })).toBeDisabled();
  });

  it("ignores both typed and reason inputs when busy", async () => {
    const user = userEvent.setup();
    const props = defaultProps({
      typedValue: "DELETE",
      reasonLabel: "Reason",
      busy: true,
    });
    render(<ConfirmDialog {...props} />);
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(props.onCancel).not.toHaveBeenCalled();
  });
});
