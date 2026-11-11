# Goldfish review: Phase 2C engagement

-   **Document:** `docs/designs/phase2c-engagement.md`
-   **Date:** 2026-11-07
-   **Method:** [Elephant-Goldfish Model](https://github.com/google/elephant-goldfish-model). Six fresh sessions. Each session was told to read only that note. Reviewers did not receive the application source or the earlier conversation.

Passes: zoom out, comprehension, design critic, structural, style, implementation readiness. All six returned fail on the first draft. The resolutions in the note were applied before implementation. A second swarm was not run. The edits close the two-way readings. They do not add a feature.

## Resolutions applied

-   **Flag off** throws only on the new RPCs for that flag. Existing send and push paths stay put.
-   **Rewards.** `readReferralRewardsConfig` throws on exact `true`. `blockedReferralReward` returns before any provider call. The existing grant runs only on today's switch. The prompt path does not add a grant. `paidAt` is set by today's settle, or by `payment_completed` with no grant when that switch is off.
-   **Activation** is the first `task_completed` for the referred organization.
-   **Hold list** is `send_email`, `mirrorMessagingOutbound` (no draft, no send), and a connector whose name contains `send`, is not read-only, and is not a payment kind. Recipient and body arguments are named. A missing pair creates no draft and still does not call the tool.
-   **No sender.** `claimDraft` gains no caller. Approved drafts show "Not sent". "Already sent." is only the existing terminal status and does not mean the recipient got it. The approval push body is "Not sent". Notify policy, when on, replaces digest and approval bodies.
-   **Digest** builds before insert, runs on the worker, and pushes only after the unique insert commits. Optional email stays, default off, with a fixed subject and no retry.
-   **Quiet hours** have one match rule. A batch row stores no text. One unsent row per user. The flush claim ignores a live lease.
-   **Practice marks** carry `userId` and `spaceId`.
-   **Sealed columns** include the transcript title and the share sentence.
-   **Transcript** uniqueness is per user and artifact. The insert winner is the one that transcribes.
-   **Personal context** is the oldest personal row owned by that user in the space. None means no draft and no note, and still no send.
-   **Zone** falls back to `America/Santo_Domingo` for null, empty, and invalid values.
-   **Monday** defaults on in the code. The open decision is for production, not for the pull request.
-   **One-hand** is the existing queue actions at 44 points.
-   **Hours** are shown as the two minute totals.
-   **Share sentence** does not say that a draft is sent.
-   **Compose** copies the eight names the same way Phase 2A is copied. Grants use `rakazo_app`.

## Contested

-   **Drop the undo seconds, the email toggle, the PDF, the hours line, the practice table, and the rewards flag.** The backlog asks for the 0/10/30/60 setting, optional email default off, a downloadable PDF, a stated hours method, a practice split, and a rewards flag that stays off. Those stay. The resolutions make each one do one thing.
-   **Delete digest email as an unapproved send.** The backlog asks for email, optional and off by default, through the provider the deployment already has. The note keeps it and forbids a new provider and a retry.
-   **Hold every tool whose name contains reply, post, forward, or deliver.** That set is wider than the backlog's external sends and would stop tools this note does not name. The hold list is the three cases in the resolutions.
-   **Turn off today's referral grant whenever the prompt flag is on.** That would change a billing path the prompt does not own. The prompt adds no grant. Today's grant stays on today's switch.

## Accepted without a further product change

-   Home-screen shortcuts, biometric unlock, and an Undo action inside the notification wait for a store build. The phone ships the route map, the 44-point queue actions, and `lockAvailability` returning `unavailable`.
-   Calendar and unread mail stay omitted. There is no first-party store to read.
-   No second review swarm.
