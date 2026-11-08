# Vault card autofill

The saved-card form should accept a card from the operating system or a password manager. Title and "When to use" stay out of that fill. Validation, the masked security code, clearing secrets when a save starts, and the explicit Save button stay as they are.

Checked against React Native 0.86.3 (`ReactTextInputManager.kt`, `TextInput.js`) and Android 15 `View.isImportantForAutofill`. The two editors match upstream `main` at `b67f5e4ef3f5128704a8777edb762719d061055d`. `docs/upstream-issues/vault-card-autofill.patch` applies there at the same paths, including the new `apps/mobile/lib/card-autofill.ts`. Nothing is renamed.

## Cause

Web turns card autofill off. The card number sets `autoComplete="off"`. Expiry and the name on the card go through a helper that also sets `off`. The security code sets `autoComplete="new-password"`, which is a new-password field, not a card. The form itself does not disable autofill.

Mobile already sets `cc-number`, `cc-exp`, `cc-csc`, and `cc-name`. Android still does not offer a saved card.

React Native maps those tokens onto Android hints in `REACT_PROPS_AUTOFILL_HINTS_MAP`: `cc-number` to `creditCardNumber`, `cc-exp` to `creditCardExpirationDate`, `cc-csc` to `creditCardSecurityCode`. `cc-name` is not in that map, and it is not in the Android `autoComplete` union. `TextInput.js` forwards the raw string. The native setter then hits its invalid branch and calls `setImportantForAutofill(NO)`. Android has no credit-card name hint. The name hint is `name`, which maps to `personName`.

`View.isImportantForAutofill` returns false for `NO`, so that field is left out of the autofill structure. A parent only does the same when it is `noExcludeDescendants` or `yesExcludeDescendants`. The sheet, its groups, and the modal host do not set either. The exclusion is on the field.

A known hint does not mark the view important. The valid branch only calls `setAutofillHints`. The Android default for `autoComplete` is `off`, and `off` sets importance to `NO`. A later valid hint does not set it back. `AUTO` counts as important only when hints are present or the view has a real resource id. These fields never set `importantForAutofill="yes"`, which is the value that stays important even if `off` was applied first.

On iOS, `textContentType` wins when both props are set (`TextInput.js`). The security code sets `textContentType="none"`, so `cc-csc` never becomes `creditCardSecurityCode`. The cardholder sets `textContentType="name"`, so iOS offers a contact name instead of `creditCardName`. Expiry sets only `cc-exp`, which this React Native version maps to `creditCardExpiration` when the content type is left unset. `creditCardNumber`, `creditCardExpiration`, `creditCardSecurityCode`, and `creditCardName` are the content types this version documents (the last three from iOS 17; an older system ignores an unknown type).

The security code stays `secureTextEntry`. With `keyboardType="number-pad"`, React Native turns that into a numeric password. That is the input type Android's own card sample uses for the security code, next to the `creditCardSecurityCode` hint. Removing it would show the code. The hint and `importantForAutofill="yes"` are what classify the field as a card field.

Expiry stays one field. Android's hint for one view is `creditCardExpirationDate` (`cc-exp`). Month and year hints are for a form that already has two views. `parseCardExpiry` already accepts `08/28`, `8/2028`, and `0828`. Splitting the field would change the form. A service that writes only a date value can skip a text field, so expiry may stay empty while the other fields fill. That does not gate the offer: the number field, marked important, is what the service matches.

## Fix

Web: `cc-number`, `cc-exp`, `cc-csc`, and `cc-name` on those four fields. The security code stays `type="password"`. The form sets `autoComplete="on"`. Title and "When to use" keep `off`.

Mobile: each card field sets `importantForAutofill="yes"` and the content type above. Android uses `autoComplete="name"` for the cardholder. Every other card token is one React Native already maps. Title and "When to use" set `off`, `textContentType="none"`, and `importantForAutofill="no"`.

## Risks

A password manager can now write a saved card into the form. The value still sits only in the form until Save, and a save still clears the number and security code before it is sent.

Chrome may still guess the edit-mode title, whose label is "Name", because it often ignores `autocomplete="off"` on a field that looks like a name. The field is marked off. The card tokens are not on it.

Android expiry is a text field with a date hint. Some providers fill `MM/YY` or `MM/YYYY`, which the parser accepts. A provider that only emits a date object leaves expiry blank. The sheet is a modal dialog. A device that does not run autofill inside a dialog will still show nothing. This change does not rewrite the modal.

iOS 16 and earlier ignore the newer card content types. The card number type is older and still applies.

## Test plan

Unit tests assert the web autocomplete attributes, that the security code stays a password, and that title and "When to use" stay off. They assert the mobile trait map for iOS and Android, including the Android name hint and the excluded title.

On an Android phone with a card saved in the system autofill service or a password manager: Settings, Vault, add a card, focus Card number. The saved card should be offered. Accepting it should fill the number, expiry, security code, and name on card. Title and When to use should stay empty. The security code should stay masked. Save should still require a valid number, expiry, and code, and should not keep those values on screen after it starts.
