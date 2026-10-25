import { describe, expect, it } from "vitest";
import {
  decodeOrganizationLogo,
  formatRnc,
  normalizeRnc,
  OrganizationSettingsUpdateSchema,
  organizationLogoBytesMatch,
} from "./organization-settings.js";

const lawyer = {
  name: "María Núñez",
  cardNumber: "12345",
  email: "maria@firma.example",
  mayApproveDrafts: true,
};

const firm = {
  legalName: "Núñez & Asociados S.R.L.",
  tradeName: "Núñez",
  rnc: "",
  addressLine: "",
  cityProvince: "",
  phone: "",
  email: "",
  website: "",
  bankName: "",
  bankAccount: "",
  invoiceFooter: "",
  accentColor: "",
  lawyers: [lawyer],
};

describe("RNC", () => {
  it("accepts a company RNC and a cédula with or without dashes", () => {
    expect(normalizeRnc("101123456")).toBe("101123456");
    expect(normalizeRnc("1-01-12345-6")).toBe("101123456");
    expect(normalizeRnc("001 1234567 8")).toBe("00112345678");
    expect(normalizeRnc("001-1234567-8")).toBe("00112345678");
    expect(normalizeRnc("")).toBe("");
    expect(normalizeRnc("   ")).toBe("");
  });

  it("rejects the wrong length and other characters", () => {
    expect(normalizeRnc("12345678")).toBeNull();
    expect(normalizeRnc("1234567890")).toBeNull();
    expect(normalizeRnc("10112345A")).toBeNull();
    expect(normalizeRnc("1-01-12345-6-1")).toBeNull();
  });

  it("formats stored digits", () => {
    expect(formatRnc("101123456")).toBe("1-01-12345-6");
    expect(formatRnc("00112345678")).toBe("001-1234567-8");
  });
});

describe("organization settings update", () => {
  it("stores digits and an uppercase document color", () => {
    expect(
      OrganizationSettingsUpdateSchema.parse({
        ...firm,
        rnc: "1-01-12345-6",
        accentColor: "#1f4b3a",
      }),
    ).toMatchObject({
      rnc: "101123456",
      accentColor: "#1F4B3A",
    });
  });

  it("rejects an RNC that is not 9 or 11 digits", () => {
    expect(OrganizationSettingsUpdateSchema.safeParse({ ...firm, rnc: "1234" }).success).toBe(
      false,
    );
  });
});

describe("organization logo bytes", () => {
  it("accepts PNG and JPEG magic bytes and a plain SVG", () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]);
    const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0x00]);
    const svg = new TextEncoder().encode("<svg xmlns='http://www.w3.org/2000/svg'></svg>");
    expect(organizationLogoBytesMatch(png, "image/png")).toBe(true);
    expect(organizationLogoBytesMatch(jpeg, "image/jpeg")).toBe(true);
    expect(organizationLogoBytesMatch(svg, "image/svg+xml")).toBe(true);
    expect(organizationLogoBytesMatch(png, "image/jpeg")).toBe(false);
  });

  it("rejects an SVG that contains a script", () => {
    const svg = new TextEncoder().encode("<svg><script>alert(1)</script></svg>");
    expect(organizationLogoBytesMatch(svg, "image/svg+xml")).toBe(false);
  });

  it("decodes a base64 logo", () => {
    const bytes = decodeOrganizationLogo(btoa("<svg></svg>"));
    expect(bytes && new TextDecoder().decode(bytes)).toBe("<svg></svg>");
    expect(decodeOrganizationLogo("not base64!!!")).toBeNull();
  });
});
