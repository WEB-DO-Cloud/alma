# Support card autofill in the saved card form

Draft for [elie222/rakazo](https://github.com/elie222/rakazo/issues/new). Not filed.

Compared with `main` at [`b67f5e4ef3f5128704a8777edb762719d061055d`](https://github.com/elie222/rakazo/commit/b67f5e4ef3f5128704a8777edb762719d061055d). The card editors match that commit. React Native is 0.86.3.

## Title

Support card autofill in the saved card form

## Body

### What happens

Adding or editing a saved card does not offer a card the person already has.

On the web form, and in the desktop app that hosts it, the browser and password managers are told not to fill the card. On the phone, Android autofill (the system service and password managers that use it) does not offer a saved card. iOS is pointed at the wrong kind of data for the security code and the name on the card.

Title and "When to use" should stay empty. The security code should stay masked. Saving should still require a valid card and should still clear the number and the code when the save starts.

### Cause

The web form is a normal form, but the card fields opt out.

The card number sets `autoComplete="off"`:

[`apps/web/src/components/vault/VaultItemEditor.tsx` lines 466-470](https://github.com/elie222/rakazo/blob/b67f5e4ef3f5128704a8777edb762719d061055d/apps/web/src/components/vault/VaultItemEditor.tsx#L466-L470)

Expiry and the name on the card use the shared field helper, which sets `autoComplete="off"` and does not pass a card token:

[`lines 384-390`](https://github.com/elie222/rakazo/blob/b67f5e4ef3f5128704a8777edb762719d061055d/apps/web/src/components/vault/VaultItemEditor.tsx#L384-L390), [`expiry`](https://github.com/elie222/rakazo/blob/b67f5e4ef3f5128704a8777edb762719d061055d/apps/web/src/components/vault/VaultItemEditor.tsx#L487-L497), [`name`](https://github.com/elie222/rakazo/blob/b67f5e4ef3f5128704a8777edb762719d061055d/apps/web/src/components/vault/VaultItemEditor.tsx#L510)

The security code is `type="password"` with `autoComplete="new-password"`, so it is a new password, not a card code:

[`lines 498-507`](https://github.com/elie222/rakazo/blob/b67f5e4ef3f5128704a8777edb762719d061055d/apps/web/src/components/vault/VaultItemEditor.tsx#L498-L507)

The phone form does set `cc-number`, `cc-exp`, `cc-csc`, and `cc-name`:

[`apps/mobile/components/vault-item-editor.tsx` lines 235-263](https://github.com/elie222/rakazo/blob/b67f5e4ef3f5128704a8777edb762719d061055d/apps/mobile/components/vault-item-editor.tsx#L235-L263)

React Native 0.86 maps `cc-number`, `cc-exp`, and `cc-csc` onto Android's `creditCardNumber`, `creditCardExpirationDate`, and `creditCardSecurityCode` hints. It does not know `cc-name`. That token is not in the Android `autoComplete` list, and `TextInput` forwards it unchanged. The native setter treats an unknown token like `off` and sets `importantForAutofill` to `no`:

[`ReactTextInputManager.kt` `setTextContentType`](https://github.com/facebook/react-native/blob/v0.86.3/packages/react-native/ReactAndroid/src/main/java/com/facebook/react/views/textinput/ReactTextInputManager.kt#L648-L659)

Android has no credit-card name hint. The hint it does have is `name`, mapped to `personName` ([the same map](https://github.com/facebook/react-native/blob/v0.86.3/packages/react-native/ReactAndroid/src/main/java/com/facebook/react/views/textinput/ReactTextInputManager.kt#L1064-L1078)). A view with importance `no` is left out of the autofill structure (`View.isImportantForAutofill`). A parent does that to its children only when it is `noExcludeDescendants` or `yesExcludeDescendants`. Nothing in this sheet, and not the modal host, sets either.

A token React Native does know only calls `setAutofillHints`. It does not set importance back to `yes`. The Android default for `autoComplete` is `off`, and `off` sets importance to `no`. These fields never set `importantForAutofill="yes"`, so a field that was turned off stays off. With importance `auto`, Android counts the view only when it already has hints or a real resource id.

On iOS, `textContentType` wins when both props are set ([`TextInput.js`](https://github.com/facebook/react-native/blob/v0.86.3/packages/react-native/Libraries/Components/TextInput/TextInput.js#L946-L955)). The security code sets `textContentType="none"`, so `cc-csc` never becomes `creditCardSecurityCode`. The cardholder sets `textContentType="name"`, so the suggestion is a contact name rather than `creditCardName`. This React Native version does support `creditCardExpiration`, `creditCardSecurityCode`, and `creditCardName` (iOS 17; an older system ignores an unknown type). `creditCardNumber` is already set and is older.

The security code stays masked (`secureTextEntry`). With a number pad, React Native stores that as a numeric password. That is the same input type Android's card sample uses for the security code, beside the `creditCardSecurityCode` hint. The missing piece is the hint plus importance, not a visible code.

Expiry should stay one field. For one view, Android's hint is `creditCardExpirationDate` (`cc-exp`). The month and year hints are for a form that already splits them. The parser already accepts `08/28`, `8/2028`, and `0828`. A service that can only write a date value may leave the text field blank. That does not decide whether the card is offered. The number field does.

### Change

On the web form, set `autoComplete="on"` and use `cc-number`, `cc-exp`, `cc-csc`, and `cc-name` on those four fields. Keep the security code `type="password"`. Leave Title and When to use on `off`.

On the phone, set `importantForAutofill="yes"` on the four card fields. Use `creditCardNumber`, `creditCardExpiration`, `creditCardSecurityCode`, and `creditCardName`. Keep `cc-number`, `cc-exp`, and `cc-csc`. On Android, use `name` for the cardholder instead of `cc-name`. Set Title and When to use to `autoComplete="off"`, `textContentType="none"`, and `importantForAutofill="no"`. Leave the mask, the parser, the clear-on-save, and the Save button as they are.

### How to check

Web: the four card inputs expose those tokens, the code input is still a password, and Title and When to use stay `off`.

Android, with a card saved in the system autofill service or a password manager: open Vault, add a card, focus Card number. The saved card should be offered. Accepting it fills the number, expiry, code, and name. Title and When to use stay empty. The code stays masked. Save still waits for a valid card and still clears the number and the code.
