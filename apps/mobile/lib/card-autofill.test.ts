import { describe, expect, it } from "vitest";
import { cardAutofillTraits, noAutofillTraits } from "./card-autofill";

describe("card autofill traits", () => {
  it("marks each card field important and names the card content type", () => {
    expect(cardAutofillTraits("number", "ios")).toEqual({
      importantForAutofill: "yes",
      autoComplete: "cc-number",
      textContentType: "creditCardNumber",
    });
    expect(cardAutofillTraits("expiry", "ios")).toEqual({
      importantForAutofill: "yes",
      autoComplete: "cc-exp",
      textContentType: "creditCardExpiration",
    });
    expect(cardAutofillTraits("cvc", "ios")).toEqual({
      importantForAutofill: "yes",
      autoComplete: "cc-csc",
      textContentType: "creditCardSecurityCode",
    });
    expect(cardAutofillTraits("name", "ios")).toEqual({
      importantForAutofill: "yes",
      autoComplete: "cc-name",
      textContentType: "creditCardName",
    });
  });

  it("uses the Android name hint React Native maps, and leaves the other tokens alone", () => {
    expect(cardAutofillTraits("name", "android").autoComplete).toBe("name");
    expect(cardAutofillTraits("number", "android").autoComplete).toBe("cc-number");
    expect(cardAutofillTraits("expiry", "android").autoComplete).toBe("cc-exp");
    expect(cardAutofillTraits("cvc", "android").autoComplete).toBe("cc-csc");
    expect(cardAutofillTraits("name", "android").importantForAutofill).toBe("yes");
  });

  it("keeps a title and a note out of autofill", () => {
    expect(noAutofillTraits()).toEqual({
      importantForAutofill: "no",
      autoComplete: "off",
      textContentType: "none",
    });
  });
});
