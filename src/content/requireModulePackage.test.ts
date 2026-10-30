import { describe, expect, it, vi } from "vitest";
import { requireModulePackage } from "./requireModulePackage";
import { fromCanonical } from "../../packages/content/src/tetherless-module";
import type { ContentModule } from "../../packages/content/src/schema";
import phishing from "../../content/modules/phishing-basics/phishing-basics.v1.json";
import { DdilLearningGateway } from "../sync/gateway/ddil-gateway";
import { FakeIDBFactory } from "../../tests/sync/fakes/fake-idb";
import { FakeTransport } from "../../tests/sync/fakes/fake-transport";

const valid = fromCanonical(phishing as ContentModule);
describe("downloaded module validation", () => {
  it("accepts the shared server format including optional fields", () => {
    expect(requireModulePackage(valid, valid.module_id, 1)).toBe(valid);
  });
  it.each([null, {}, { ...valid, questions: [] }, { ...valid, settings: null }])("rejects malformed content without crashing the renderer", (input) => {
    expect(() => requireModulePackage(input, valid.module_id, 1)).toThrow(/Invalid module package/);
  });
  it("rejects the wrong package ID or version and unsupported activities", () => {
    expect(() => requireModulePackage(valid, "other", 1)).toThrow(/does not match/);
    expect(() => requireModulePackage(valid, valid.module_id, 2)).toThrow(/does not match/);
    expect(() => requireModulePackage({ ...valid, activity_type: "game:future" }, valid.module_id, 1)).toThrow(/not supported/);
  });
  it("rejects unsupported schema versions and malformed optional sector lists", () => {
    expect(() => requireModulePackage({ ...valid, schema_version: "future" }, valid.module_id, 1)).toThrow(/Unsupported module schema/);
    expect(() => requireModulePackage({ ...valid, gamification: { sectors: {} } }, valid.module_id, 1)).toThrow(/sectors must be a list/);
  });
  it("uses the supplied choice ID when the answer key differs only by case", () => {
    const changed = { ...valid, questions: valid.questions.map((question) => ({ ...question, choices: question.choices.map((choice) => ({ ...choice, id: choice.id.toUpperCase() })), correct_choice: question.correct_choice.toLowerCase() })) };
    const parsed = requireModulePackage(changed, valid.module_id, 1);
    expect(parsed.questions[0].correct_choice).toBe(valid.questions[0].correct_choice.toUpperCase());
    expect(changed.questions[0].correct_choice).toBe(valid.questions[0].correct_choice.toLowerCase());
  });
  it("does not mark invalid content downloaded or poison a later valid retry", async () => {
    const get = vi.fn().mockResolvedValueOnce({ ...valid, content_version: 2 }).mockResolvedValue(valid);
    const gateway = new DdilLearningGateway({ idb: new FakeIDBFactory(), transport: new FakeTransport(Date.now), api: { get, post: vi.fn() } });
    await gateway.init();
    await expect(gateway.prepareModuleForOffline(valid.module_id, 1)).rejects.toThrow(/does not match/);
    await expect(gateway.getModule(valid.module_id, 1)).resolves.toEqual(valid);
    expect(get).toHaveBeenCalledTimes(2);
  });
});
