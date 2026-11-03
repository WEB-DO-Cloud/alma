# Memory

Bots remember what matters between conversations, and you can read, download or delete anything they
keep.

## What a bot remembers

Each bot writes notes as it works: your preferences, facts about the job, what it tried. Its notes are
indexed in a file called `MEMORY.md`.

You can also just tell it: "remember that invoices go to the finance folder".

A bot keeps its notes short, one fact per line. When something changes, it rewrites the old note
instead of adding a second one, and it deletes notes that no longer hold. It keeps at most 4 KB of
notes in `MEMORY.md`, merging or removing notes to make room. You can still add more by hand.

To see what a bot remembers, click its name at the top of the chat and open **Memory**. Each note can
be downloaded or deleted.

## Shared memory

Some things every bot should know, such as your name, your company, or how you like reports
written. Those go in **Shared memory**: every bot in the [space](./spaces.md) reads these notes and
keeps them up to date.

Find it in **Settings → Memory**.

## Server-managed memory

A deployment can set one memory provider for every Space:

- `MEMORY_PROVIDER=honcho`
- `HONCHO_BASE_URL`, for example `http://honcho-api:8000`
- `HONCHO_API_KEY`
- `HONCHO_REASONING_LEVEL=low`
- `MEMORY_DEFAULT_SCOPE=isolated` or `shared`

Each Space still gets its own Honcho workspace. The address and key stay on the server. They are not shown in the app and do not need `MCP_ALLOW_PRIVATE_ENDPOINT`, because the address comes from the server's own configuration.

**Settings → Memory** offers two choices. **ALMA memory (recommended)** is the default and has nothing to configure. A Space owner can choose **My own Honcho server** and enter a public HTTPS address and an API key. The key is stored encrypted and is not sent back to the app. **Test connection** checks that Honcho by creating the Space's workspace. Memories already stored are not copied across. **Default scope** and `MEMORY.md` stay.

If that server does not answer, chats continue and semantic recall is skipped. Memory settings shows a warning. The server's own Honcho is not used for a Space that opted out.

- A Space owner can run Honcho on their own computer. The guide is [Honcho on your own server](./memory-self-hosted-honcho.md).

## Memory providers

Optionally, connect a memory service so bots can also recall facts by meaning, not just by reading
their notes. In **Settings → Memory**, choose **Connect memory provider**:

- **Supermemory**: its cloud service, or your own instance.
- **Serenity**: choose **Recall and write**, or **Recall only** to keep it read-only.
- **Honcho**: reads from an existing Honcho peer and never writes to it.

Once connected, **Default scope** decides what bots share in the provider:

- **Isolated**: each bot recalls only what it saved. This is the default.
- **Shared**: bots in the space recall from one pool.

Each bot's settings also gain a **Memory scope** under **Advanced**, so one bot can differ from the
default.

## Open work

Separate from memory, each bot keeps a short list of **Open work**: things it has started and not
finished. It is in the bot's settings. You can add items for it, or mark them complete.

## Memory across spaces

Memory never crosses [spaces](./spaces.md). A bot in one space can't read notes from another.
