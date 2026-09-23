import { describe, expect, it } from "vitest";
import { DemoDataReplacer, detectSensitive, isDummy, looksLikePersonName, perturbNumber, scrubDeep } from "../src/index";

describe("privacy detection", () => {
  it("finds emails, phones, cards, keys, account ids, money and names", () => {
    const kinds = (t: string) => detectSensitive(t).map((f) => f.kind);
    expect(kinds("contact john.smith@acme.com")).toContain("email");
    expect(kinds("Support: +1 (415) 555-0132")).toContain("phone");
    expect(kinds("card 4242 4242 4242 4242")).toContain("payment_card");
    expect(kinds("key sk-live_abcdefghijklmnop1234")).toContain("api_key");
    expect(kinds("ACC-4481-2290-7713")).toContain("account_id");
    expect(kinds("Revenue $17,428")).toContain("money");
    expect(kinds("Michael Johnson")).toContain("person_name");
    expect(kinds("password: hunter22")).toContain("password");
    expect(kinds("Welcome back, John")).toContain("person_name");
  });
  it("does not flag UI labels as people", () => {
    expect(looksLikePersonName("Invite Member")).toBe(false);
    expect(looksLikePersonName("Account Settings")).toBe(false);
    expect(looksLikePersonName("Send Invite")).toBe(false);
    expect(looksLikePersonName("Kevin Lee")).toBe(true);
  });
  it("rejects non-Luhn digit runs as cards", () => {
    expect(detectSensitive("order 1234 5678 9012 3456").some((f) => f.kind === "payment_card")).toBe(false);
  });
});

describe("alternative demo data", () => {
  it("is deterministic and consistent across a project", () => {
    const a = new DemoDataReplacer([], "proj");
    const b = new DemoDataReplacer([], "proj");
    expect(a.scrub("Michael Johnson")).toBe(b.scrub("Michael Johnson"));
    expect(a.scrub("Michael Johnson")).toBe(a.scrub("Michael Johnson"));
    expect(a.scrub("Michael Johnson")).not.toBe("Michael Johnson");
  });
  it("keeps emails consistent with replaced names and uses example.com", () => {
    const r = new DemoDataReplacer([], "x");
    const name = r.scrub("Sarah Connor");
    const email = r.scrub("sarah.connor@acme-corp.com");
    expect(email.endsWith("@example.com")).toBe(true);
    expect(email.split("@")[0]).toBe(name.toLowerCase().replace(" ", "."));
  });
  it("replaces businesses, numbers and ids while keeping their shape", () => {
    const r = new DemoDataReplacer([], "x");
    expect(r.scrub("ABC Marketing")).not.toContain("ABC");
    const n = perturbNumber("42,718", 7);
    expect(n).toMatch(/^\d\d,\d\d\d$/);
    expect(n).not.toBe("42,718");
    const id = r.scrub("ACC-4481-2290-7713");
    expect(id).toMatch(/^ACC-\d{4}-\d{4}-\d{4}$/);
    expect(id).not.toBe("ACC-4481-2290-7713");
  });
  it("never replaces protected real UI labels", () => {
    const r = new DemoDataReplacer(["Kevin Lee"]);
    expect(r.scrub("Kevin Lee")).toBe("Kevin Lee");
  });
  it("is idempotent on its own dummy data", () => {
    const r = new DemoDataReplacer([], "x");
    const once = r.scrub("Invitation sent to john.smith@acme.com by Maria Garcia");
    expect(r.scrub(once)).toBe(once);
    expect(isDummy("noa.park@example.com")).toBe(true);
  });
  it("scrubDeep skips structural keys", () => {
    const r = new DemoDataReplacer([], "x");
    const out = scrubDeep({ id: "john.smith@acme.com", label: "john.smith@acme.com" }, r);
    expect(out.id).toBe("john.smith@acme.com");
    expect(out.label).toMatch(/@example\.com$/);
  });
});
