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
    expect(screen.getByRole("button", { name: /blue team\./i })).toHaveAttribute("aria-pressed", "false");
  });

  it("prevents selection while a local save is in progress", async () => {
    const user = userEvent.setup();
    const onChoose = vi.fn();
    render(<AnswerCard choice={{ id: "A", en: "Blue Team" }} disabled index={0} isCorrect={false} onChoose={onChoose} revealed={false} selected={false} spanishAssist={false} />);
    const answer = screen.getByRole("button", { name: /blue team/i });
    expect(answer).toBeDisabled();
    await user.click(answer);
    expect(onChoose).not.toHaveBeenCalled();
  });

  it("uses the colour allocated by the mission question", () => {
    const { rerender } = render(<AnswerCard choice={{ id: "A", en: "Blue Team" }} colour="blue" index={0} isCorrect={false} onChoose={vi.fn()} revealed={false} selected={false} spanishAssist={false} />);
    expect(screen.getByRole("button", { name: /blue team/i })).toHaveClass("kahoot-answer-blue");

    rerender(<AnswerCard choice={{ id: "A", en: "Red Team" }} colour="red" index={1} isCorrect={false} onChoose={vi.fn()} revealed={false} selected={false} spanishAssist={false} />);
    expect(screen.getByRole("button", { name: /red team/i })).toHaveClass("kahoot-answer-red");
  });

  it("keeps all card colours fully visible after correct and incorrect answers", () => {
    const { rerender } = render(<AnswerCard choice={{ id: "A", en: "Blue Team" }} colour="blue" index={0} isCorrect onChoose={vi.fn()} revealed selected spanishAssist={false} />);
    expect(screen.getByRole("button", { name: /blue team\. correct answer/i })).toHaveClass("kahoot-answer-blue", "kahoot-answer-correct", "disabled:opacity-100");

    rerender(<AnswerCard choice={{ id: "B", en: "Red Team" }} colour="red" index={1} isCorrect={false} onChoose={vi.fn()} revealed selected spanishAssist={false} />);
    expect(screen.getByRole("button", { name: /red team\. incorrect answer/i })).toHaveClass("kahoot-answer-red", "kahoot-answer-selected-incorrect", "disabled:opacity-100");
  });

  it("uses the four-colour pattern for a scenario answer after it is revealed", () => {
    render(<AnswerCard choice={{ id: "A", en: "Written authorization", es: "AutorizaciÃ³n escrita" }} index={0} isCorrect={false} onChoose={vi.fn()} revealed selected spanishAssist />);
    const answer = screen.getByRole("button", { name: /written authorization\. incorrect answer/i });
    expect(answer).toHaveClass("kahoot-answer-card", "kahoot-answer-red", "kahoot-answer-selected-incorrect", "disabled:opacity-100");
    expect(screen.getByText("AutorizaciÃ³n escrita")).toHaveClass("answer-card-translation");
  });

  it("uses the same four-colour sequence for generic answer positions", () => {
    const { rerender } = render(<AnswerCard choice={{ id: "A", en: "First answer" }} index={0} isCorrect={false} onChoose={vi.fn()} revealed={false} selected={false} spanishAssist={false} />);
    expect(screen.getByRole("button", { name: /first answer/i })).toHaveClass("kahoot-answer-red");

    rerender(<AnswerCard choice={{ id: "B", en: "Second answer" }} index={1} isCorrect={false} onChoose={vi.fn()} revealed={false} selected={false} spanishAssist={false} />);
    expect(screen.getByRole("button", { name: /second answer/i })).toHaveClass("kahoot-answer-blue");

    rerender(<AnswerCard choice={{ id: "C", en: "Third answer" }} index={2} isCorrect={false} onChoose={vi.fn()} revealed={false} selected={false} spanishAssist={false} />);
    expect(screen.getByRole("button", { name: /third answer/i })).toHaveClass("kahoot-answer-orange");

    rerender(<AnswerCard choice={{ id: "D", en: "Fourth answer" }} index={3} isCorrect={false} onChoose={vi.fn()} revealed={false} selected={false} spanishAssist={false} />);
    expect(screen.getByRole("button", { name: /fourth answer/i })).toHaveClass("kahoot-answer-teal");
  });
});
