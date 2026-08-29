// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { render, fireEvent, cleanup } from "@testing-library/react";
import { App } from "../../App";

afterEach(() => {
  cleanup();
  localStorage.clear();
});

describe("App — zakładki kombajnu", () => {
  it("otwiera ustawienia klubu", () => {
    const { getByText, container } = render(<App />);

    fireEvent.click(getByText("Ustawienia"));

    expect(container.textContent).toContain("Ustawienia klubu");
  });

  it("otwiera daty ważności", () => {
    const { getByText, container } = render(<App />);

    fireEvent.click(getByText("Daty ważności"));

    expect(container.textContent).toContain("Krótkie daty ważności");
  });

  it("otwiera zamówienia", () => {
    const { getByText, container } = render(<App />);

    fireEvent.click(getByText("Zamówienia"));

    expect(container.textContent).toContain("Najpierw zaimportuj snapshot");
  });
});
