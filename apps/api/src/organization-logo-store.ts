import { constants } from "node:fs";
import { mkdir, open } from "node:fs/promises";
import path from "node:path";
import type { ObjectStorage } from "@rakazo/adapter-kit";
import { objectStorageConfigFromEnv, S3ObjectStorage } from "@rakazo/adapters";

const O_NOFOLLOW = constants.O_NOFOLLOW ?? 0;
const CREATE_FLAGS = constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | O_NOFOLLOW;

/** Logo files are written once and kept. There is no delete. */
export interface OrganizationLogoStore {
  put(key: string, bytes: Uint8Array): Promise<void>;
  get(key: string): Promise<Uint8Array | null>;
}

export function organizationLogoKey(organizationId: string, logoId: string): string {
  const segment = (value: string) => {
    if (!value || value.length > 128 || /[^A-Za-z0-9_-]/.test(value)) {
      throw new Error("Invalid organization logo key");
    }
    return value;
  };
  return `organization-logos/${segment(organizationId)}/${segment(logoId)}`;
}

async function* once(bytes: Uint8Array) {
  yield bytes;
}

export class LocalOrganizationLogoStore implements OrganizationLogoStore {
  constructor(private readonly root: string) {}

  private resolve(key: string): string {
    if (!key.startsWith("organization-logos/") || key.includes("..")) {
      throw new Error("Invalid organization logo key");
    }
    const full = path.resolve(this.root, key);
    const root = path.resolve(this.root);
    if (full !== root && !full.startsWith(`${root}${path.sep}`)) {
      throw new Error("Invalid organization logo key");
    }
    return full;
  }

  async put(key: string, bytes: Uint8Array): Promise<void> {
    const file = this.resolve(key);
    await mkdir(path.dirname(file), { recursive: true });
    const handle = await open(file, CREATE_FLAGS, 0o600);
    try {
      await handle.writeFile(bytes);
    } finally {
      await handle.close();
    }
  }

  async get(key: string): Promise<Uint8Array | null> {
    let handle: Awaited<ReturnType<typeof open>>;
    try {
      handle = await open(this.resolve(key), constants.O_RDONLY | O_NOFOLLOW);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw error;
    }
    try {
      return new Uint8Array(await handle.readFile());
    } finally {
      await handle.close();
    }
  }
}

export class ObjectOrganizationLogoStore implements OrganizationLogoStore {
  constructor(private readonly storage: ObjectStorage) {}

  async put(key: string, bytes: Uint8Array): Promise<void> {
    if (!key.startsWith("organization-logos/") || key.includes("..")) {
      throw new Error("Invalid organization logo key");
    }
    await this.storage.put(key, once(bytes));
  }

  async get(key: string): Promise<Uint8Array | null> {
    try {
      const parts: Uint8Array[] = [];
      for await (const part of this.storage.get(key)) parts.push(part);
      const size = parts.reduce((sum, part) => sum + part.byteLength, 0);
      const bytes = new Uint8Array(size);
      let offset = 0;
      for (const part of parts) {
        bytes.set(part, offset);
        offset += part.byteLength;
      }
      return bytes;
    } catch (error) {
      const name = error && typeof error === "object" && "name" in error ? String(error.name) : "";
      const message = error instanceof Error ? error.message : "";
      const status =
        error && typeof error === "object" && "$metadata" in error
          ? (error.$metadata as { httpStatusCode?: number }).httpStatusCode
          : undefined;
      if (name === "NoSuchKey" || status === 404 || /not found|NoSuchKey|404/i.test(message)) {
        return null;
      }
      throw error;
    }
  }
}

/** The same local disk or object storage artifacts use. Logos are never sent to a CDN. */
export function createOrganizationLogoStore(
  dataDir: string,
  env: NodeJS.ProcessEnv = process.env,
): OrganizationLogoStore {
  const config = objectStorageConfigFromEnv(env);
  if (!config) return new LocalOrganizationLogoStore(dataDir);
  return new ObjectOrganizationLogoStore(new S3ObjectStorage(config));
}
