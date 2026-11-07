import { ALMA_PERSONAL_SECTOR, ALMA_WORK_SECTORS } from "@rakazo/contracts";

export type Phase2aFixtureAction = "clinical" | "filing" | "payment" | "price";

export type Phase2aSectorFixture = {
  sectorId: string;
  actionClass: Phase2aFixtureAction;
  /** Proposed milliseconds from the backlog. Not a service objective. */
  proposedBudgetMs: number | null;
  sla: false;
  contextId: string;
  otherContextId: string;
  recordId: string;
  hiddenRecordId: string;
  activationEventName: null;
};

const budget: Record<string, number | null> = {
  abogados: null,
  notaria: 8_000,
  arquitectura: 90_000,
  contabilidad: 30_000,
  "clinica-dental": 1_000,
  "clinica-medica": 3_000,
  inmobiliaria: null,
  seguros: 8_000,
  personal: null,
};

const refusal: Record<string, Phase2aFixtureAction> = {
  abogados: "filing",
  notaria: "filing",
  arquitectura: "price",
  contabilidad: "filing",
  "clinica-dental": "clinical",
  "clinica-medica": "clinical",
  inmobiliaria: "price",
  seguros: "price",
  personal: "payment",
};

const sectorIds = [
  ...ALMA_WORK_SECTORS.map((sector) => sector.id).filter((id) => id !== "otro"),
  ALMA_PERSONAL_SECTOR.id,
];

export const PHASE2A_SECTOR_FIXTURES: readonly Phase2aSectorFixture[] = sectorIds.map(
  (sectorId) => ({
    sectorId,
    actionClass: refusal[sectorId] ?? "filing",
    proposedBudgetMs: budget[sectorId] ?? null,
    sla: false,
    contextId: `ctx-${sectorId}`,
    otherContextId: `ctx-${sectorId}-other`,
    recordId: `rec-${sectorId}`,
    hiddenRecordId: `rec-${sectorId}-hidden`,
    activationEventName: null,
  }),
);
