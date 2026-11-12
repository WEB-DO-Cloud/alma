# Email (IMAP/SMTP)

- **Status:** Implementing
- **Date:** 2026-11-12
- **Flag:** `ALMA_EMAIL_IMAP_CONNECTOR` is on only when the value is exactly `true`. Every other value, including unset, is off.

## Problem

People with mail on their own host (cPanel, Zoho, a hosting company, a company server) cannot connect that mailbox from Integrations. Gmail and Outlook sign-in do not speak to those servers. They need a mailbox that uses the ordinary incoming and outgoing mail ports, with the address and password they already have.

## Composio

Composio's catalog, checked while writing this, does not have a toolkit that logs in to a mail server the person names.

- Gmail is Google's own sign-in. It does not take an IMAP host.
- SMTP2GO is a send-only service with an API key. It does not read a mailbox.
- Nylas is a hosted mailbox grant. The person does not type their IMAP host, port, or password, and ALMA would be sending mail through Nylas rather than through their server.

None of those do what this screen does: accept a custom incoming server and outgoing server, test the password, and let the assistant read, draft, and send on that mailbox. This connector is not a second copy of a Composio app. Leave `ALMA_COMPOSIO_INTEGRATIONS` as it is. When both flags are on, Gmail and the other Composio apps stay in the list, and Email (IMAP/SMTP) is one more row.

## What the person sees

The row is **Email (IMAP/SMTP)**. In Spanish it is **Correo (IMAP/SMTP)**. Add opens a form, not a browser sign-in.

The form asks for the email address and the password. Under the password, one line: if the account uses two-step verification, use an app password. That line stays visible. The form cannot know two-step verification is on until a normal password is already rejected, and the rejection itself only says the password was not accepted.

Server fields stay hidden when ALMA finds the servers. A **Change servers** control opens them, already filled in. When nothing is found, those fields are open: username, incoming host, port, and security, and the same for outgoing mail. Security is SSL or STARTTLS. There is no option to send the password without encryption.

**Test connection** checks the password on both servers before anything is saved. **Save** appears after a test of these exact values succeeds. Changing a field requires the test again.

The same form is on the phone. The desktop app is the web app, so it gets the same form.

Words for the form and its errors exist in English and Spanish in code. This change does not edit the translation catalogs. Other screens keep using those catalogs.

## Finding the servers

From the address, in this order, stop at the first result whose hosts are public:

1. Thunderbird's public directory, `autoconfig.thunderbird.net`, for the address's domain and then its registered domain.
2. The domain's own autoconfig and autodiscover addresses, over HTTPS.
3. The domain's mail exchanger, matched to a known provider (Google, Microsoft, Zoho, Fastmail, Migadu, iCloud, Yandex, Namecheap Private Email, GoDaddy, Titan, Hostinger).
4. Guesses: `mail.<domain>`, then `imap.<domain>` and `smtp.<domain>`, on 993 with SSL, 465 with SSL, and 587 with STARTTLS. A guess counts only when both ports accept a connection.

A result that names a private, loopback, link-local, or metadata address is thrown away and the search continues. Plaintext sockets from a directory are thrown away too. The whole search gives up after a short budget. A failed search opens the server fields empty.

## Test and errors

The test logs in to the incoming server and authenticates to the outgoing server, then disconnects. It does not save the password and it does not send mail.

The screen shows one of these, in the person's language:

| What happened                  | English                                              | Spanish                                                        |
| ------------------------------ | ---------------------------------------------------- | -------------------------------------------------------------- |
| Password rejected              | The password was not accepted.                       | La contraseña no fue aceptada.                                 |
| Server not reached             | The server could not be reached.                     | No se pudo contactar el servidor.                              |
| Encryption failed              | The secure connection to the server failed.          | La conexión segura con el servidor falló.                      |
| Server has no password login   | This server does not accept password sign-in.        | Este servidor no acepta la contraseña.                         |
| Address is not a public server | That server address is not allowed.                  | Esa dirección de servidor no está permitida.                   |
| Too many tries                 | Too many attempts. Wait a few minutes and try again. | Demasiados intentos. Espera unos minutos e inténtalo de nuevo. |

Each try has a timeout. The password is not written to logs. A server error that echoes the password is not shown and is not logged.

## What is stored

No new table and no new column. The password and the server settings are one JSON value encrypted with the existing `EncryptedSecretStore` (AES-256-GCM, the record id as extra data). The ciphertext is a row in `secrets` with kind `email-imap`. The `connections` row points at it with `secretId` and `providerRef` and does not contain the password. Connection lists return the address as the label and never return the secret, the ciphertext, or the password.

Removing the account deletes that secret row. Turning the flag off leaves the rows in place and does not use them. Turning it on again uses them.

Save runs the same login test again. The browser cannot skip it.

## What the assistant can do

When the account is connected, the assistant gets these tools:

- List folders.
- Search messages by from, to, subject, date range, and text. At most 20 matches.
- Read one message: the text, and each attachment's name, type, and size. Text attachments are included up to a cap so the model can read them. A larger attachment is described and not inlined.
- Create a draft by appending it to the Drafts folder.
- Send through the outgoing server, then append a copy to Sent. If the copy cannot be saved, the result says the message was sent and the Sent folder was not updated. It is not sent a second time.
- Reply with `In-Reply-To` and `References`, and a `Re:` subject. Forward with `Fwd:` and the original message quoted. A forward does not set `In-Reply-To`, so it is not a reply.

Sending tools are named so they contain `send` and are not read-only. When Phase 2A and send-undo are both on, the existing hold runs before the tool: the message is not sent immediately, and the recipient and body are stored the same way as other send tools. The later dispatch, when `ALMA_UNDO_DISPATCH` is also on, still uses the deployment's own mail sender. It does not log in to this mailbox. This change does not add a second way to send after the wait.

Drafts are not sends. They are saved when the assistant asks, subject to the normal approval check for a tool that creates something.

## Safety

- User-supplied hosts are resolved first. Loopback, private, link-local, shared CGNAT space, and cloud metadata names and addresses are refused, including a name that points at one of those addresses. The connection then uses the address that was checked, so a later change of the name cannot redirect it.
- Directory lookups use the existing web fetch that already refuses private addresses and redirects.
- Ports below 1024 are refused except 25, 143, 465, 587, and 993. Security is SSL or STARTTLS only. Certificate checks stay on.
- One mailbox is used by one operation at a time. An idle connection is closed after a short wait, and a run ending closes idle ones. A failed connection is discarded.
- Tests and saves are limited to 8 per 10 minutes per person per process. Tool calls are limited to 30 per minute per mailbox per process. Each API or worker process keeps its own counts. A message over 8 MB is not downloaded or sent. Search returns at most 20 messages. Bodies and text attachments are capped.

## Flag

Off, the connector is not registered, the row is absent, and the three procedures respond as not found. On, the API and the worker both register it. Set `ALMA_EMAIL_IMAP_CONNECTOR=true` on both and restart both. The Compose stacks pass the variable through. No other new variable. No migration.

`yes`, `1`, and `TRUE` stay off.

## Questions

1. Should production turn `ALMA_EMAIL_IMAP_CONNECTOR` on after review? This change leaves it off.
2. The wait-before-send setting stops an IMAP send, and the later automatic send still uses the deployment mail sender, not this mailbox. Is that the behavior you want until a later change teaches that sender about this mailbox?
