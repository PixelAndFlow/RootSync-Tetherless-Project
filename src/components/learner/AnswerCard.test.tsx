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

  it("matches Blue Team and Red Team Kahoot cards to their team colours instead of answer order", () => {
    const { rerender } = render(<AnswerCard choice={{ id: "A", en: "Blue Team" }} index={0} isCorrect={false} isKahoot onChoose={vi.fn()} revealed={false} selected={false} spanishAssist={false} />);
    expect(screen.getByRole("button", { name: /blue team/i })).toHaveClass("kahoot-answer-blue");

    rerender(<AnswerCard choice={{ id: "A", en: "Red Team" }} index={1} isCorrect={false} isKahoot onChoose={vi.fn()} revealed={false} selected={false} spanishAssist={false} />);
    expect(screen.getByRole("button", { name: /red team/i })).toHaveClass("kahoot-answer-red");
  });

  it("keeps Kahoot card colours fully visible after correct and incorrect answers", () => {
    const { rerender } = render(<AnswerCard choice={{ id: "A", en: "Blue Team" }} index={0} isCorrect isKahoot onChoose={vi.fn()} revealed selected spanishAssist={false} />);
    expect(screen.getByRole("button", { name: /blue team\. correct answer/i })).toHaveClass("kahoot-answer-blue", "kahoot-answer-correct", "disabled:opacity-100");

    rerender(<AnswerCard choice={{ id: "B", en: "Red Team" }} index={1} isCorrect={false} isKahoot onChoose={vi.fn()} revealed selected spanishAssist={false} />);
    expect(screen.getByRole("button", { name: /red team\. incorrect answer/i })).toHaveClass("kahoot-answer-red", "kahoot-answer-selected-incorrect", "disabled:opacity-100");
  });

  it("keeps neutral question cards readable after an answer is revealed", () => {
    render(<AnswerCard choice={{ id: "A", en: "Written authorization", es: "AutorizaciÃ³n escrita" }} index={0} isCorrect={false} onChoose={vi.fn()} revealed selected spanishAssist />);
    const answer = screen.getByRole("button", { name: /written authorization\. incorrect answer/i });
    expect(answer).toHaveClass("answer-card-neutral", "disabled:opacity-100");
    expect(screen.getByText("AutorizaciÃ³n escrita")).toHaveClass("answer-card-translation");
  });
});
