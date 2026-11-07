import * as z from "zod";

/** Spanish unless the account locale is English. */
export function almaLanguage(locale: string | null | undefined): "en" | "es" {
  return locale?.toLowerCase().startsWith("en") ? "en" : "es";
}

export type AlmaCopy = { readonly en: string; readonly es: string };

export function almaText(copy: AlmaCopy, language: "en" | "es"): string {
  return copy[language];
}

export function almaInstructions(name: string, language: "en" | "es"): string {
  if (language === "en") {
    return `You are ${name}. You reply in English unless asked for another language. You prepare drafts for the person to review. You do not invent dates, amounts, diagnoses, coverage, or appointments. A missing fact is marked [DATO PENDIENTE]. You do not send messages or file anything.`;
  }
  return `Eres ${name}. Respondes en español de la República Dominicana y tratas de usted, salvo que te pidan otro idioma. Preparas borradores para que la persona los revise. No inventas fechas, montos, diagnósticos, coberturas ni citas. Si falta un dato, escribes [DATO PENDIENTE]. No envías mensajes ni presentas trámites.`;
}

export const TRIAL_LIMIT_ERROR = "trial_limit";

export function isTrialLimitError(error: unknown): boolean {
  const message =
    typeof error === "string"
      ? error
      : error &&
          typeof error === "object" &&
          "message" in error &&
          typeof error.message === "string"
        ? error.message
        : "";
  return message.trim() === TRIAL_LIMIT_ERROR;
}

const task = (id: string, title: AlmaCopy, prompt: AlmaCopy) => ({ id, title, prompt });

export const ALMA_WORK_SECTORS = [
  {
    id: "abogados",
    label: { en: "Law", es: "Abogados" },
    botName: { en: "Legal assistant", es: "Asistente legal" },
    tasks: [
      task(
        "matter",
        { en: "New matter checklist", es: "Lista de un caso" },
        {
          en: "List the facts still missing to open a matter. Do not state a deadline. Mark gaps as [DATO PENDIENTE].",
          es: "Lista los datos que faltan para abrir un caso. No afirmes plazos. Marca lo que falte como [DATO PENDIENTE].",
        },
      ),
      task(
        "chronology",
        { en: "Chronology", es: "Cronología" },
        {
          en: "Turn the notes I paste into a chronology. Add no fact that is not in the text.",
          es: "Convierte las notas que te pegue en una cronología. No agregues hechos que no estén en el texto.",
        },
      ),
      task(
        "draft",
        { en: "Draft", es: "Borrador" },
        {
          en: "Draft in formal Spanish, marked BORRADOR. It is not a signed act.",
          es: "Redacta un borrador en español formal, marcado BORRADOR. No es un acto firmado.",
        },
      ),
    ],
  },
  {
    id: "notaria",
    label: { en: "Notary office", es: "Notarías" },
    botName: { en: "Notary assistant", es: "Asistente notarial" },
    tasks: [
      task(
        "act",
        { en: "Act checklist", es: "Lista del acto" },
        {
          en: "Ask which act is being prepared and list the documents. Do not say the act is valid.",
          es: "Pregúntame qué acto se prepara y lista los documentos. No digas que el acto es válido.",
        },
      ),
      task(
        "power",
        { en: "Power of attorney draft", es: "Poder en borrador" },
        {
          en: "Draft a power of attorney marked BORRADOR. Leave unknown facts blank.",
          es: "Redacta un poder marcado BORRADOR. Deja en blanco los datos que no te di.",
        },
      ),
      task(
        "signing",
        { en: "Signing appointment", es: "Cita de firma" },
        {
          en: "Propose a text to schedule a signing. Do not confirm a time I did not give you.",
          es: "Propón un texto para coordinar una cita de firma. No confirmes una hora que yo no te haya dado.",
        },
      ),
    ],
  },
  {
    id: "arquitectura",
    label: { en: "Architecture", es: "Arquitectura" },
    botName: { en: "Site assistant", es: "Asistente de obra" },
    tasks: [
      task(
        "diary",
        { en: "Site diary", es: "Diario de obra" },
        {
          en: "Make a visit diary with date, place, what was seen, and what is pending. Do not certify structure.",
          es: "Arma un diario de visita con fecha, lugar, lo observado y lo pendiente. No certifiques estructura.",
        },
      ),
      task(
        "budget",
        { en: "Budget lines", es: "Partidas" },
        {
          en: "Make a table of line items from what I dictate. Do not invent prices.",
          es: "Haz una tabla de partidas a partir de lo que te dicte. No inventes precios.",
        },
      ),
      task(
        "permit",
        { en: "Permit letter", es: "Carta de trámite" },
        {
          en: "Draft a short municipal letter marked BORRADOR. Do not invent a file number.",
          es: "Redacta una carta breve para un trámite municipal, marcada BORRADOR, sin números de expediente inventados.",
        },
      ),
    ],
  },
  {
    id: "contabilidad",
    label: { en: "Accounting", es: "Contabilidad" },
    botName: { en: "Accounting assistant", es: "Asistente contable" },
    tasks: [
      task(
        "close",
        { en: "Month-end list", es: "Cierre del mes" },
        {
          en: "List month-end steps for me to mark. Do not compute tax or say a filing was sent.",
          es: "Lista los pasos de un cierre mensual para que yo marque lo que ya está. No calcules impuestos ni afirmes que algo está presentado.",
        },
      ),
      task(
        "docs",
        { en: "Missing documents", es: "Documentos faltantes" },
        {
          en: "From what I describe, list documents that would still be missing. Do not invent amounts.",
          es: "A partir de lo que te cuente, lista documentos que faltarían. No inventes montos.",
        },
      ),
      task(
        "chase",
        { en: "Follow-up draft", es: "Borrador de seguimiento" },
        {
          en: "Draft a short request for a document. I will review it before sending.",
          es: "Redacta un mensaje corto para pedir un documento. Yo lo reviso antes de enviarlo.",
        },
      ),
    ],
  },
  {
    id: "clinica-dental",
    label: { en: "Dental clinic", es: "Clínica dental" },
    botName: { en: "Dental desk", es: "Recepción dental" },
    tasks: [
      task(
        "confirm",
        { en: "Appointment text", es: "Texto de cita" },
        {
          en: "Draft a message to confirm an appointment. Do not invent the time or the name.",
          es: "Redacta un mensaje para confirmar una cita. No inventes la hora ni el nombre.",
        },
      ),
      task(
        "recall",
        { en: "Recall text", es: "Texto de seguimiento" },
        {
          en: "Draft a short invitation to a cleaning that is due. Do not state insurance coverage.",
          es: "Propón un texto breve para invitar a una limpieza vencida, sin afirmar cobertura de seguro.",
        },
      ),
      task(
        "desk",
        { en: "Front-desk list", es: "Lista de recepción" },
        {
          en: "List what reception should ask on a first visit. Do not give a diagnosis.",
          es: "Lista lo que recepción debe pedir en una primera visita. No des un diagnóstico.",
        },
      ),
    ],
  },
  {
    id: "clinica-medica",
    label: { en: "Medical clinic", es: "Clínica médica" },
    botName: { en: "Front desk", es: "Recepción" },
    tasks: [
      task(
        "confirm",
        { en: "Appointment text", es: "Texto de cita" },
        {
          en: "Draft a message to confirm an appointment. Do not invent the time or the name.",
          es: "Redacta un mensaje para confirmar una cita. No inventes la hora ni el nombre.",
        },
      ),
      task(
        "recall",
        { en: "Recall text", es: "Texto de seguimiento" },
        {
          en: "Draft a short reminder. Do not state insurance coverage.",
          es: "Propón un texto breve de recordatorio, sin afirmar cobertura de seguro.",
        },
      ),
      task(
        "urgent",
        { en: "Front-desk list", es: "Lista de recepción" },
        {
          en: "List non-clinical intake questions. If I describe an urgent symptom, say someone at the clinic should see them now. Do not diagnose.",
          es: "Lista preguntas de admisión no clínicas. Si describo un síntoma urgente, di que debe ver a una persona del consultorio ahora y no des un diagnóstico.",
        },
      ),
    ],
  },
  {
    id: "inmobiliaria",
    label: { en: "Real estate", es: "Inmobiliarias" },
    botName: { en: "Real estate assistant", es: "Asistente inmobiliario" },
    tasks: [
      task(
        "lead",
        { en: "Lead card", es: "Ficha" },
        {
          en: "Ask for zone, budget in US dollars, and timing, and make a card. Do not invent availability.",
          es: "Pregúntame zona, presupuesto en USD y plazo, y arma una ficha. No inventes disponibilidad.",
        },
      ),
      task(
        "visit",
        { en: "Visit text", es: "Texto de visita" },
        {
          en: "Draft a text to schedule a visit. Do not confirm a time I did not give you.",
          es: "Propón un texto para coordinar una visita. No confirmes una hora que yo no te haya dado.",
        },
      ),
      task(
        "follow",
        { en: "Next-day note", es: "Nota de seguimiento" },
        {
          en: "Draft a short follow-up for the next day. I will review it before sending.",
          es: "Redacta un seguimiento corto para el día siguiente. Yo lo reviso antes de enviarlo.",
        },
      ),
    ],
  },
  {
    id: "seguros",
    label: { en: "Insurance", es: "Seguros" },
    botName: { en: "Insurance assistant", es: "Asistente de seguros" },
    tasks: [
      task(
        "renewal",
        { en: "Renewal list", es: "Lista de renovación" },
        {
          en: "List the facts needed for a renewal. Do not invent a premium or say a policy is in force.",
          es: "Arma una lista de datos para una renovación. No inventes primas ni digas que la póliza está vigente.",
        },
      ),
      task(
        "compare",
        { en: "Compare figures", es: "Comparar cifras" },
        {
          en: "Compare only the numbers I paste. Mark a missing one as [DATO PENDIENTE].",
          es: "Compara solo las cifras que yo te pegue. Si falta una, márcala [DATO PENDIENTE].",
        },
      ),
      task(
        "claim",
        { en: "Claim pack", es: "Aviso de siniestro" },
        {
          en: "List what to gather for a first notice of loss. Do not decide coverage.",
          es: "Lista lo que hay que reunir para un primer aviso. No decidas cobertura.",
        },
      ),
    ],
  },
  {
    id: "otro",
    label: { en: "Other", es: "Otro" },
    botName: { en: "Assistant", es: "Asistente" },
    tasks: [
      task(
        "today",
        { en: "Today's task", es: "Tarea de hoy" },
        {
          en: "Ask what I do and what is due today.",
          es: "Pregúntame en qué trabajo y cuál es la tarea de hoy.",
        },
      ),
      task(
        "list",
        { en: "List", es: "Lista" },
        {
          en: "Turn what I dictate into a list of pending items.",
          es: "Convierte lo que te dicte en una lista de pendientes.",
        },
      ),
      task(
        "draft",
        { en: "Draft", es: "Borrador" },
        {
          en: "Draft a short message for me to review.",
          es: "Redacta un mensaje corto para que yo lo revise.",
        },
      ),
    ],
  },
] as const;

export const ALMA_PERSONAL_SECTOR = {
  id: "personal",
  label: { en: "Personal use", es: "Uso personal" },
  botName: { en: "Assistant", es: "Asistente" },
  tasks: [
    task(
      "day",
      { en: "Plan the day", es: "Ordenar el día" },
      {
        en: "Help me order my day. Ask for the three things that cannot slip and propose a schedule. Do not invent appointments.",
        es: "Ayúdame a ordenar mi día. Pregúntame las tres cosas que no pueden quedar pendientes y proponme un horario. No inventes citas.",
      },
    ),
    task(
      "reminder",
      { en: "Reminder", es: "Recordatorio" },
      {
        en: "Draft a short reminder I can copy. Ask what I should remember and for when.",
        es: "Redacta un recordatorio breve que yo pueda copiar. Pregúntame qué debo recordar y para cuándo.",
      },
    ),
    task(
      "reply",
      { en: "Reply draft", es: "Borrador de respuesta" },
      {
        en: "Help me draft a short polite reply. I will paste the message. Give me a draft to review.",
        es: "Ayúdame a redactar una respuesta corta y educada. Te pego el mensaje y me das el borrador para revisar.",
      },
    ),
  ],
} as const;

export const ALMA_WORK_SECTOR_IDS = ALMA_WORK_SECTORS.map((sector) => sector.id);
export type AlmaWorkSectorId = (typeof ALMA_WORK_SECTORS)[number]["id"];
export type AlmaSectorId = AlmaWorkSectorId | "personal";

export function almaSector(id: string | null | undefined) {
  if (id === "personal") return ALMA_PERSONAL_SECTOR;
  return ALMA_WORK_SECTORS.find((sector) => sector.id === id);
}

export function almaCatalogNames(): Set<string> {
  const names = new Set<string>(["Chief"]);
  for (const sector of [ALMA_PERSONAL_SECTOR, ...ALMA_WORK_SECTORS]) {
    names.add(sector.botName.en);
    names.add(sector.botName.es);
  }
  return names;
}

export const AlmaSectorChoiceSchema = z
  .object({
    use: z.enum(["personal", "work", "skip"]),
    sector: z.string().optional(),
  })
  .superRefine((value, context) => {
    if (value.use !== "work") return;
    if (!value.sector || !ALMA_WORK_SECTORS.some((sector) => sector.id === value.sector)) {
      context.addIssue({ code: "custom", message: "sector required", path: ["sector"] });
    }
  });

export const AlmaChecklistStepIdSchema = z.enum(["assistant", "calendar", "email", "file", "task"]);

export const AlmaChecklistSchema = z.object({
  visible: z.boolean(),
  dismissed: z.boolean(),
  steps: z.array(z.object({ id: AlmaChecklistStepIdSchema, done: z.boolean() })),
});
export type AlmaChecklist = z.infer<typeof AlmaChecklistSchema>;
