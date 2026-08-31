// @vitest-environment jsdom
// Kliknięcie bookmarkletu W PANELU odpalało go na naszej stronie, gdzie nie ma
// tokenu Glofoxa — użytkownik dostawał mylący komunikat „potrzebuję świeżego
// tokenu" i myślał, że zepsuty jest import.
import { describe, it, expect, afterEach } from "vitest";
import { render, fireEvent, cleanup } from "@testing-library/react";
import { BridgeView } from "../BridgeView";

afterEach(() => cleanup());

describe("BridgeView — bookmarklet", () => {
  it("nie odpala się po kliknięciu w panelu", () => {
    const { container } = render(<BridgeView />);
    const link = container.querySelector("a.bookmarklet")!;

    const notCancelled = fireEvent.click(link);

    expect(notCancelled).toBe(false); // preventDefault — skrypt się nie wykonuje
  });

  it("po kliknięciu tłumaczy, co zrobić zamiast tego", () => {
    const { container } = render(<BridgeView />);
    expect(container.textContent).not.toContain("Nie klikaj go tutaj");

    fireEvent.click(container.querySelector("a.bookmarklet")!);

    expect(container.textContent).toContain("Nie klikaj go tutaj");
  });

  it("nadal daje się przeciągnąć — href zostaje bookmarkletem", () => {
    const { container } = render(<BridgeView />);
    const href = container.querySelector("a.bookmarklet")!.getAttribute("href");

    expect(href?.startsWith("javascript:")).toBe(true);
  });
});
