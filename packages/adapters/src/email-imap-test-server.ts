import type { Server, Socket } from "node:net";
import { createServer } from "node:net";

type StoredMessage = { uid: number; flags: string[]; raw: Buffer };

/** Enough IMAP and SMTP for the mailbox client. Not a mail server. */
export class TestMailServer {
  readonly user: string;
  readonly password: string;
  logins = 0;
  smtpMessages: Buffer[] = [];
  imapPort = 0;
  smtpPort = 0;
  private readonly folders = new Map<string, StoredMessage[]>([
    ["INBOX", []],
    ["Drafts", []],
    ["Sent", []],
  ]);
  private nextUid = 1;
  private imap?: Server;
  private smtp?: Server;
  private sockets = new Set<Socket>();

  constructor(user = "ada@example.test", password = "app-password") {
    this.user = user;
    this.password = password;
  }

  seed(folder: string, raw: Buffer, flags: string[] = []): number {
    const uid = this.nextUid;
    this.nextUid += 1;
    const box = this.folders.get(folder) ?? [];
    box.push({ uid, flags, raw });
    this.folders.set(folder, box);
    return uid;
  }

  messages(folder: string): StoredMessage[] {
    return this.folders.get(folder) ?? [];
  }

  async start(): Promise<void> {
    this.imap = createServer((socket) => this.acceptImap(socket));
    this.smtp = createServer((socket) => this.acceptSmtp(socket));
    await Promise.all([listen(this.imap), listen(this.smtp)]);
    this.imapPort = portOf(this.imap);
    this.smtpPort = portOf(this.smtp);
  }

  async stop(): Promise<void> {
    for (const socket of this.sockets) socket.destroy();
    await Promise.all([close(this.imap), close(this.smtp)]);
  }

  private acceptImap(socket: Socket): void {
    this.sockets.add(socket);
    socket.on("close", () => this.sockets.delete(socket));
    const state = {
      buf: Buffer.alloc(0),
      mode: "line" as "line" | "literal",
      need: 0,
      pending: "",
      authed: false,
      selected: "",
    };
    const write = (line: string) => socket.write(line);
    const dispatch = (line: string, literal?: Buffer) => {
      const match = /^(\S+)\s+(\S+)(?:\s+([\s\S]*))?$/.exec(line.trim());
      if (!match) return;
      const tag = match[1]!;
      const command = match[2]!.toUpperCase();
      const rest = match[3] ?? "";
      if (command === "CAPABILITY") {
        write("* CAPABILITY IMAP4rev1\r\n");
        write(`${tag} OK CAPABILITY\r\n`);
        return;
      }
      if (command === "NOOP" || command === "CHECK") {
        write(`${tag} OK ${command}\r\n`);
        return;
      }
      if (command === "LOGOUT") {
        write("* BYE\r\n");
        write(`${tag} OK LOGOUT\r\n`);
        socket.end();
        return;
      }
      if (command === "LOGIN") {
        const [user, password] = strings(rest);
        if (user === this.user && password === this.password) {
          state.authed = true;
          this.logins += 1;
          write(`${tag} OK LOGIN\r\n`);
        } else {
          write(`${tag} NO [AUTHENTICATIONFAILED] Invalid credentials\r\n`);
        }
        return;
      }
      if (!state.authed) {
        write(`${tag} NO Login required\r\n`);
        return;
      }
      if (command === "LIST") {
        const mailbox = strings(rest)[1] ?? "";
        if (mailbox === "") write('* LIST (\\Noselect) "/" ""\r\n');
        else {
          for (const name of this.folders.keys()) {
            const flag = name === "Drafts" ? " \\Drafts" : name === "Sent" ? " \\Sent" : "";
            write(`* LIST (\\HasNoChildren${flag}) "/" "${name}"\r\n`);
          }
        }
        write(`${tag} OK LIST\r\n`);
        return;
      }
      if (command === "SELECT" || command === "EXAMINE") {
        const name = strings(rest)[0] ? unquote(strings(rest)[0]!) : unquote(rest.trim());
        const box = this.folders.get(name);
        if (!box) {
          write(`${tag} NO No such mailbox\r\n`);
          return;
        }
        state.selected = name;
        const next = box.reduce((max, message) => Math.max(max, message.uid), 0) + 1;
        write("* FLAGS (\\Answered \\Flagged \\Deleted \\Seen \\Draft)\r\n");
        write(`* ${box.length} EXISTS\r\n`);
        write("* 0 RECENT\r\n");
        write("* OK [UIDVALIDITY 1] UIDs valid\r\n");
        write(`* OK [UIDNEXT ${next}] Next UID\r\n`);
        write(`${tag} OK [READ-WRITE] ${command}\r\n`);
        return;
      }
      if (command === "UID") {
        this.uid(tag, rest, literal, state.selected, write);
        return;
      }
      if (command === "APPEND") {
        const name = strings(rest)[0] ?? "";
        const box = this.folders.get(unquote(name));
        if (!box || !literal) {
          write(`${tag} NO APPEND failed\r\n`);
          return;
        }
        const flags = [...rest.matchAll(/\\[A-Za-z]+/g)].map((item) => item[0]);
        const uid = this.nextUid;
        this.nextUid += 1;
        box.push({ uid, flags, raw: Buffer.from(literal) });
        write(`${tag} OK [APPENDUID 1 ${uid}] APPEND\r\n`);
        return;
      }
      write(`${tag} OK ${command}\r\n`);
    };
    socket.write("* OK test ready\r\n");
    socket.on("data", (chunk) => {
      state.buf = Buffer.concat([state.buf, chunk]);
      for (;;) {
        if (state.mode === "literal") {
          if (state.buf.length < state.need) return;
          const literal = state.buf.subarray(0, state.need);
          state.buf = state.buf.subarray(state.need);
          state.mode = "line";
          dispatch(state.pending, literal);
          continue;
        }
        const end = state.buf.indexOf("\r\n");
        if (end < 0) return;
        const line = state.buf.subarray(0, end).toString("utf8");
        state.buf = state.buf.subarray(end + 2);
        const literal = /\{(\d+)\}$/.exec(line);
        if (literal) {
          state.pending = line.slice(0, -literal[0].length).trimEnd();
          state.need = Number(literal[1]);
          state.mode = "literal";
          socket.write("+ OK\r\n");
          continue;
        }
        dispatch(line);
      }
    });
  }

  private uid(
    tag: string,
    rest: string,
    literal: Buffer | undefined,
    selected: string,
    write: (line: string) => void,
    socketWrite: (
      write: (line: string) => void,
      head: string,
      body: Buffer,
      tail: string,
    ) => void = (send, head, body, tail) => {
      send(head);
      send(body.toString("latin1"));
      send(tail);
    },
  ): void {
    const command = /^(\S+)\s+([\s\S]*)$/.exec(rest.trim());
    if (!command || !selected) {
      write(`${tag} NO UID\r\n`);
      return;
    }
    const name = command[1]!.toUpperCase();
    const args = command[2] ?? "";
    const box = this.folders.get(selected) ?? [];
    if (name === "SEARCH") {
      const hits = box
        .filter((message) => matches(message.raw, args))
        .map((message) => message.uid);
      write(`* SEARCH${hits.map((uid) => ` ${uid}`).join("")}\r\n`);
      write(`${tag} OK SEARCH\r\n`);
      return;
    }
    if (name === "FETCH") {
      const set = args.split(/\s+/, 1)[0] ?? "";
      const uids = expand(set, box);
      let seq = 0;
      for (const message of box) {
        seq += 1;
        if (!uids.has(message.uid)) continue;
        const partial = /BODY(?:\.PEEK)?\[\]<(\d+)\.(\d+)>/i.exec(args);
        const start = partial ? Number(partial[1]) : 0;
        const length = partial ? Number(partial[2]) : message.raw.length - start;
        const slice = message.raw.subarray(start, start + length);
        const flags = message.flags.length ? message.flags.join(" ") : "\\Seen";
        socketWrite(
          write,
          `* ${seq} FETCH (UID ${message.uid} FLAGS (${flags}) BODY[] {${slice.length}}\r\n`,
          slice,
          ")\r\n",
        );
      }
      write(`${tag} OK FETCH\r\n`);
      return;
    }
    if (name === "APPEND" && literal) {
      write(`${tag} OK APPEND\r\n`);
      return;
    }
    write(`${tag} OK UID\r\n`);
  }

  private acceptSmtp(socket: Socket): void {
    this.sockets.add(socket);
    socket.on("close", () => this.sockets.delete(socket));
    let buf = "";
    let mode: "line" | "auth-user" | "auth-pass" | "data" = "line";
    let authed = false;
    let data = "";
    let loginUser = "";
    const write = (line: string) => socket.write(`${line}\r\n`);
    write("220 test ready");
    socket.on("data", (chunk) => {
      buf += chunk.toString("utf8");
      for (;;) {
        const end = buf.indexOf("\r\n");
        if (end < 0) return;
        const line = buf.slice(0, end);
        buf = buf.slice(end + 2);
        if (mode === "auth-user") {
          loginUser = Buffer.from(line, "base64").toString("utf8");
          mode = "auth-pass";
          write("334 UGFzc3dvcmQ6");
          continue;
        }
        if (mode === "auth-pass") {
          const password = Buffer.from(line, "base64").toString("utf8");
          authed = loginUser === this.user && password === this.password;
          mode = "line";
          write(authed ? "235 OK" : "535 Authentication failed");
          continue;
        }
        if (mode === "data") {
          if (line === ".") {
            mode = "line";
            this.smtpMessages.push(Buffer.from(data.replace(/\r\n\.\./g, "\r\n."), "utf8"));
            write("250 OK");
            continue;
          }
          data += `${line}\r\n`;
          continue;
        }
        const upper = line.toUpperCase();
        if (upper.startsWith("EHLO") || upper.startsWith("HELO")) {
          write("250-test");
          write("250 AUTH LOGIN PLAIN");
        } else if (upper.startsWith("AUTH PLAIN")) {
          const encoded = line.slice("AUTH PLAIN".length).trim();
          const [, user, password] = Buffer.from(encoded, "base64").toString("utf8").split("\0");
          authed = user === this.user && password === this.password;
          write(authed ? "235 OK" : "535 Authentication failed");
        } else if (upper === "AUTH LOGIN") {
          mode = "auth-user";
          write("334 VXNlcm5hbWU6");
        } else if (upper.startsWith("MAIL FROM") || upper.startsWith("RCPT TO")) {
          write(authed ? "250 OK" : "530 Authentication required");
        } else if (upper === "DATA") {
          if (!authed) write("530 Authentication required");
          else {
            mode = "data";
            data = "";
            write("354 Go ahead");
          }
        } else if (upper === "QUIT") {
          write("221 Bye");
          socket.end();
        } else {
          write("250 OK");
        }
      }
    });
  }
}

function matches(raw: Buffer, query: string): boolean {
  const text = raw.toString("utf8").toLowerCase();
  const tokens = query.match(/"[^"]*"|'[^']*'|\S+/g) ?? [];
  for (let index = 0; index < tokens.length; index += 1) {
    const token = unquote(tokens[index] ?? "")
      .replace(/[()]/g, "")
      .toUpperCase();
    const value = unquote(tokens[index + 1] ?? "").toLowerCase();
    if (token === "ALL") continue;
    if (
      token === "FROM" ||
      token === "TO" ||
      token === "SUBJECT" ||
      token === "TEXT" ||
      token === "BODY"
    ) {
      if (value && !text.includes(value)) return false;
      index += 1;
    }
  }
  return true;
}

function expand(set: string, box: StoredMessage[]): Set<number> {
  if (set === "*" || set === "1:*") return new Set(box.map((message) => message.uid));
  const uids = new Set<number>();
  for (const part of set.split(",")) {
    const value = Number(part);
    if (Number.isInteger(value)) uids.add(value);
  }
  return uids;
}

function strings(value: string): string[] {
  const found: string[] = [];
  const pattern = /"((?:\\.|[^"\\])*)"|(\S+)/g;
  for (const match of value.matchAll(pattern)) {
    found.push(match[1] !== undefined ? match[1].replace(/\\"/g, '"') : (match[2] ?? ""));
  }
  return found;
}

function unquote(value: string): string {
  if (value.startsWith('"') && value.endsWith('"')) return value.slice(1, -1).replace(/\\"/g, '"');
  return value;
}

function listen(server: Server): Promise<void> {
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
}

function portOf(server: Server): number {
  const address = server.address();
  return address && typeof address === "object" ? address.port : 0;
}

function close(server: Server | undefined): Promise<void> {
  if (!server) return Promise.resolve();
  return new Promise((resolve) => server.close(() => resolve()));
}
