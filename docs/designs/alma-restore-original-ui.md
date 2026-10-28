# Restore the original Rakazo UI

The phone had gained a menu on top of Rakazo: sample data, drafts for review, a separate chat, a separate computer, approval history, firm, and about. Sample-data mode could replace the home screen with that menu, and Account linked to it even when sample data was off. A Dictate button was also added beside the thread composer.

Those surfaces are removed. After sign-in, the phone opens the original inbox and the web app opens the original shell, including the signup survey and onboarding paths those flows already had. There is no sample-data mode.

The original thread Call control stays, and it still uses the existing call transcription path. The original composer has no microphone control, so none was added. Web Hold-to-talk and Call stay on the visibility rules they already use. Server speech-to-text, text-to-speech, the managed model, the Grok Build CLI, the draft approval gate, and organization settings stay. The web draft-review pages and organization settings from those server changes stay, because they are not the phone menu.

The ALMA name, logos, larger splash, black logo above sign-in and sign-up, and hidden model setup stay.

`docs/designs/alma-mobile-app.md` is the earlier menu spec and is now historical. The mobile Dictate section of `docs/designs/alma-managed-voice-calls.md` describes the control this change removed. The Rakazo attribution sentences that lived only on the removed About screen are gone with that screen. The Apache-2.0 `LICENSE` file is unchanged.
