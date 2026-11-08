import type { TextInputProps } from "react-native";

/** A card field the system or a password manager can fill. Title and notes are not one of these. */
export type CardAutofillField = "number" | "expiry" | "cvc" | "name";

export type CardAutofillTraits = Required<
  Pick<TextInputProps, "autoComplete" | "textContentType" | "importantForAutofill">
>;

/**
 * Hints for one card field. Android drops a token it does not know and sets
 * `importantForAutofill` to `no`; `cc-name` is not a token it knows, `name` is. A known token
 * does not mark the field important, so each field says yes. iOS reads `textContentType`, and
 * that wins when both are set.
 */
export function cardAutofillTraits(field: CardAutofillField, os: string): CardAutofillTraits {
  const importantForAutofill = "yes" as const;
  switch (field) {
    case "number":
      return {
        importantForAutofill,
        autoComplete: "cc-number",
        textContentType: "creditCardNumber",
      };
    case "expiry":
      return {
        importantForAutofill,
        autoComplete: "cc-exp",
        textContentType: "creditCardExpiration",
      };
    case "cvc":
      return {
        importantForAutofill,
        autoComplete: "cc-csc",
        textContentType: "creditCardSecurityCode",
      };
    case "name":
      return {
        importantForAutofill,
        autoComplete: os === "android" ? "name" : "cc-name",
        textContentType: "creditCardName",
      };
  }
}

/** A title, a label, or a note. Not card data, so autofill stays off. */
export function noAutofillTraits(): CardAutofillTraits {
  return { importantForAutofill: "no", autoComplete: "off", textContentType: "none" };
}
