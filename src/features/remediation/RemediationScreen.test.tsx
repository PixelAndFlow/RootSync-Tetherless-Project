import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { GatewayProvider } from "../../app/providers/GatewayProvider";
import { LearnerProfileProvider } from "../../app/providers/LearnerProfileProvider";
import { MockOfflineLearningGateway } from "../../services/offline/MockOfflineLearningGateway";
import { MockTrainerDataGateway } from "../../services/trainer/MockTrainerDataGateway";
import { moduleLibrary } from "../../content/modules";
import { RemediationScreen } from "./RemediationScreen";

const module = moduleLibrary[0]!;
const question = module.questions[0]!;
function open(gateway: MockOfflineLearningGateway) {
  localStorage.setItem("tetherless.learner-profile.v1", JSON.stringify({ learnerId: "student", deviceId: "device", displayName: "Sam", username: "sam" }));
  return render(<GatewayProvider gateways={{ offlineLearning: gateway, trainerData: new MockTrainerDataGateway() }}><LearnerProfileProvider><MemoryRouter initialEntries={[`/learner/missions/${module.module_id}/practice`]}><Routes><Route path="/learner/missions/:moduleId/practice" element={<RemediationScreen />} /><Route path="/learner/missions/:moduleId/results" element={<p>Debrief</p>} /></Routes></MemoryRouter></LearnerProfileProvider></GatewayProvider>);
}
async function withMissedQuestion() {
  const gateway = new MockOfflineLearningGateway();
  const attempt = await gateway.startAttempt({ learnerId: "student", moduleId: module.module_id, contentVersion: module.content_version, kind: "full" });
  await gateway.saveAnswer({ learnerId: "student", moduleId: module.module_id, attemptId: attempt.id, xpAward: 0, answer: { questionId: question.id, selectedChoiceId: question.choices.find((choice) => choice.id !== question.correct_choice)!.id, isCorrect: false, answeredAt: new Date().toISOString() } });
  await gateway.completeAttempt({ learnerId: "student", moduleId: module.module_id, attemptId: attempt.id, questionsTotal: module.questions.length, correctQuestionIds: [] });
  return gateway;
}
afterEach(() => localStorage.clear());

it("shows an empty state when there is no local mission record", async () => {
  open(new MockOfflineLearningGateway());
  expect(await screen.findByText("No completed mission to practice yet.")).toBeVisible();
});
it("allows retrying a failed local record read", async () => {
  const gateway = await withMissedQuestion();
  vi.spyOn(gateway, "getLearnerModuleRecord").mockRejectedValueOnce(new Error("read failure"));
  open(gateway);
  expect(await screen.findByRole("alert")).toHaveTextContent("Practice could not be prepared");
  await userEvent.click(screen.getByRole("button", { name: "Try again" }));
  expect(await screen.findByRole("heading", { name: question.prompt.en })).toBeVisible();
});
it("allows retrying a failed practice start", async () => {
  const gateway = await withMissedQuestion();
  const start = vi.spyOn(gateway, "startRemediation").mockRejectedValueOnce(new Error("write failure"));
  open(gateway);
  await screen.findByRole("alert");
  await userEvent.click(screen.getByRole("button", { name: "Try again" }));
  expect(await screen.findByRole("heading", { name: question.prompt.en })).toBeVisible();
  expect(start).toHaveBeenCalledTimes(2);
});
it("resumes practice with its original question set and saved feedback", async () => {
  const gateway = await withMissedQuestion();
  const attempt = await gateway.startRemediation({ learnerId: "student", moduleId: module.module_id, contentVersion: module.content_version, questionIds: [question.id] });
  await gateway.saveAnswer({ learnerId: "student", moduleId: module.module_id, attemptId: attempt.id, xpAward: 0, answer: { questionId: question.id, selectedChoiceId: question.correct_choice, isCorrect: true, answeredAt: new Date().toISOString() } });
  const start = vi.spyOn(gateway, "startRemediation");
  open(gateway);
  expect(await screen.findByText("Correct. Saved locally.")).toBeVisible();
  expect(start).not.toHaveBeenCalled();
  expect(screen.getByRole("button", { name: "Update mastery" })).toBeEnabled();
});
it("preserves answers and offers completion retry without concurrent writes", async () => {
  const gateway = await withMissedQuestion();
  let reject!: (reason: Error) => void;
  const complete = vi.spyOn(gateway, "completeAttempt").mockImplementationOnce(() => new Promise((_resolve, fail) => { reject = fail; }));
  open(gateway);
  await userEvent.click(await screen.findByRole("button", { name: `${question.choices.find((choice) => choice.id === question.correct_choice)!.en}.` }));
  const finish = screen.getByRole("button", { name: "Update mastery" });
  await userEvent.dblClick(finish);
  expect(complete).toHaveBeenCalledOnce();
  await act(async () => { reject(new Error("quota")); });
  expect(await screen.findByRole("alert")).toHaveTextContent("Your saved answers remain available");
  expect(screen.getByText("Correct. Saved locally.")).toBeVisible();
  await userEvent.click(screen.getByRole("button", { name: "Update mastery" }));
  expect(await screen.findByText("Debrief")).toBeVisible();
});
