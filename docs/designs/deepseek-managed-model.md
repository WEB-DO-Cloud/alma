# DeepSeek as the operator model

-   **Status:** In Review
-   **Date:** 2026-11-04

The operator can run the managed chat model on Pi against DeepSeek (`https://api.deepseek.com`, model id `deepseek-flash`, catalog label DeepSeek V4.1 Flash) instead of Grok Build. Grok Build stays the runtime when `ALMA_MODEL_RUNTIME` is unset. Voice stays on xAI.

## Environment

| Variable              | Meaning                                                                                        |
| --------------------- | ---------------------------------------------------------------------------------------------- |
| `ALMA_MODEL_RUNTIME`  | `grok-build` when unset. `pi` runs the caller's Pi runtime. Any other id still fails closed.   |
| `PI_DEFAULT_PROVIDER` | `deepseek` selects DeepSeek's key.                                                             |
| `PI_DEFAULT_MODEL`    | Model id. For `deepseek`, unset means `deepseek-flash`.                                        |
| `DEEPSEEK_API_KEY`    | Deployment key for provider `deepseek`. Not a user credential.                                 |
| `XAI_API_KEY`         | Unchanged. Operator speech-to-text, and the Grok Build fallback. DeepSeek does not replace it. |

`ALMA_MANAGED_MODEL` is unchanged. `0`, `false`, `no`, and `off` restore per-user keys.

## Runtime

`selectChatRuntime` still prefers the scripted test runtime. When the managed switch is on and the runtime is `pi`, chat uses the Pi runtime the API and worker already construct, so session recording stays at the composition root. That runtime reports `capabilities.managed` as the deployment model. The executor then runs every bot on that pair, does not read a member key, and does not meter the turn as credits.

`resolveDeploymentModel` learns `deepseek`: the key is `DEEPSEEK_API_KEY`, the default model is `deepseek-flash`. An unknown provider still gets no key.

Grok Build is untouched. It still reads `ALMA_MODEL_PROVIDER` and `ALMA_MODEL_ID`.

## Thinking

DeepSeek's thinking mode returns `reasoning_content`. The next request in a tool loop must send that field back, or the API rejects the turn. The same text must not appear in the reply.

Pi already stores the field as a thinking block whose signature is `reasoning_content`, and writes it back on the next request. Reply text is only `text` blocks.

A context rebuild drops thinking blocks because some providers bind a signature to the prefix it was signed in. `reasoning_content` is the reasoning text DeepSeek asked to see again, not that kind of signature. Those blocks stay, so a rebuild still echoes the field and still does not copy it into the reply.

## What the lawyer sees

While the managed model is on, `me.defaultProvider` and `me.defaultModel` are the configured model when one is set: the deployment model for runtime `pi`, or `ALMA_MODEL_ID` for Grok Build. Bot settings show that catalog label. They do not say Grok unless that is the label of the configured model. Grok Build with no model id still leaves both fields null.

Model and voice settings stay hidden. A bot's saved model is still ignored while the switch is on.

## Out of scope

Privacy copy and marketing copy stay as they are. No new sentence in the product. No schema change.
