import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { AnswerCard } from "./AnswerCard";

describe("AnswerCard", () => {
  it("has an accessible answer control and calls its handler", async () => {
    const user = userEvent.setup();
    const onChoose = vi.fn();
    render(<AnswerCard choice={{ id: "A", en: "Blue Team", es: "Equipo Azul" }} index={0} isCorrect={false} onChoose={onChoose} revealed={false} selected={false} spanishAssist />);
    await user.click(screen.getByRole("button", { name: /blue team/i }));
    expect(onChoose).toHaveBeenCalledOnce();
    expect(screen.getByText("Equipo Azul")).toBeInTheDocument();
  });
});
