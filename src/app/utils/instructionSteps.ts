import type { GeometrySubmissionSnapshot } from '../../../rysovani/src/components/FreeGeometryEditor';
import { rotateSnapshotForAssignment } from './assignmentTransforms';

/** Jednotlivý krok zadání v DB (`geometry_circuit_assignments.instruction_steps`). */
export type InstructionStep = {
  text: string;
  image?: string | null;
  canvas_snapshot?: unknown;
  new_canvas_per_step?: boolean;
};

export type InstructionStepContent = {
  text: string;
  image: string | null;
  canvasSnapshot: GeometrySubmissionSnapshot | null;
};

/** Balíček kroků v `instruction_steps`, když sloupec `new_canvas_per_step` v DB chybí. */
type PackedInstructionSteps = {
  new_canvas_per_step?: boolean;
  steps: unknown[];
};

function isPackedInstructionSteps(raw: unknown): raw is PackedInstructionSteps {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return false;
  return Array.isArray((raw as { steps?: unknown }).steps);
}

function rawStepItems(raw: unknown): unknown[] {
  if (Array.isArray(raw)) return raw;
  if (isPackedInstructionSteps(raw)) return raw.steps;
  return [];
}

export function instructionStepsWantNewCanvasPerStep(raw: unknown): boolean {
  if (isPackedInstructionSteps(raw) && raw.new_canvas_per_step === true) return true;
  return rawStepItems(raw).some(
    item =>
      item &&
      typeof item === 'object' &&
      (item as { new_canvas_per_step?: unknown }).new_canvas_per_step === true,
  );
}

export function packInstructionStepsJson(
  steps: InstructionStep[],
  newCanvasPerStep: boolean,
): unknown {
  if (!newCanvasPerStep) return steps;
  const packedSteps =
    steps.length > 0 ? [{ ...steps[0]!, new_canvas_per_step: true }, ...steps.slice(1)] : steps;
  return { new_canvas_per_step: true, steps: packedSteps };
}

function parseStepImage(raw: unknown): string | null {
  if (raw == null) return null;
  if (typeof raw !== 'string') return null;
  const s = raw.trim();
  return s.length > 0 ? s : null;
}

export function parseCanvasSnapshot(raw: unknown): GeometrySubmissionSnapshot | null {
  if (!raw || typeof raw !== 'object') return null;
  const snap = raw as {
    points?: unknown;
    shapes?: unknown;
    freehandPaths?: unknown;
  };
  if (!Array.isArray(snap.points) || !Array.isArray(snap.shapes)) return null;
  return {
    points: snap.points as GeometrySubmissionSnapshot['points'],
    shapes: snap.shapes as GeometrySubmissionSnapshot['shapes'],
    freehandPaths: Array.isArray(snap.freehandPaths)
      ? (snap.freehandPaths as GeometrySubmissionSnapshot['freehandPaths'])
      : [],
  };
}

export function stepHasContent(step: Pick<InstructionStepContent, 'text' | 'image' | 'canvasSnapshot'>): boolean {
  return Boolean(step.text.trim()) || Boolean(step.image) || Boolean(step.canvasSnapshot);
}

export function instructionStepFallbackLabel(step: InstructionStepContent, index: number): string {
  const text = step.text.trim();
  if (text) return text;
  return `Krok ${index + 1}`;
}

export function normalizeInstructionSteps(raw: unknown): InstructionStepContent[] {
  const items = rawStepItems(raw);
  if (items.length === 0) return [];
  const out: InstructionStepContent[] = [];
  for (const item of items) {
    if (item && typeof item === 'object') {
      const rawText = 'text' in item ? (item as { text: unknown }).text : '';
      const text = typeof rawText === 'string' ? rawText.trim() : '';
      const image = parseStepImage(
        'image' in item ? (item as { image: unknown }).image : null,
      );
      const canvasSnapshot = parseCanvasSnapshot(
        'canvas_snapshot' in item ? (item as { canvas_snapshot: unknown }).canvas_snapshot : null,
      );
      if (!text && !image && !canvasSnapshot) continue;
      out.push({ text, image, canvasSnapshot });
    } else if (typeof item === 'string' && item.trim()) {
      out.push({ text: item.trim(), image: null, canvasSnapshot: null });
    }
  }
  return out;
}

export function instructionStepsHaveCanvasSnapshot(steps: InstructionStepContent[]): boolean {
  return steps.some(s => s.canvasSnapshot != null);
}

/** Úkoly, kde má být každý krok na novém plátně i bez sloupce v DB. */
const FORCE_NEW_CANVAS_PER_STEP_IDS = new Set([
  '7c3e9b12-4f8a-4d6e-9c21-8b5a0e17d4f3',
  'e5f1a8c3-2d47-4b9e-91c0-8a3f6d2e5b17',
  '42fbe250-54cd-4a0a-99f5-a6971a21037b',
  '50f6c4eb-f736-4fd0-baa3-545cd2e68085',
]);

export function assignmentUsesNewCanvasPerStep(row: {
  id?: string;
  new_canvas_per_step?: unknown;
  instruction_steps?: unknown;
}): boolean {
  if (row.id && FORCE_NEW_CANVAS_PER_STEP_IDS.has(row.id)) return true;
  if (row.new_canvas_per_step === true) return true;
  if (instructionStepsWantNewCanvasPerStep(row.instruction_steps)) return true;
  return instructionStepsHaveCanvasSnapshot(normalizeInstructionSteps(row.instruction_steps));
}

/** Sloučí texty kroků do jednoho pole pro `instruction_text` (zpětná kompatibilita). */
export function instructionStepsToFallbackText(stepTexts: string[]): string {
  if (stepTexts.length === 0) return '';
  if (stepTexts.length === 1) return stepTexts[0]!;
  return stepTexts.map((t, i) => `${i + 1}. ${t}`).join('\n\n');
}

const CIRCUMCIRCLE_ASSIGNMENT_ID = '4468a8e9-cb79-4dd7-9063-36734bd9ea4e';
const CIRCUMCIRCLE_STEP_4_TEXT =
  'Narýsuj libovolný trojúhelník včetně jeho kružnice opsané, aby platilo, že střed této kružnice leží na některé ze stran trojúhelníku.';

/** Natočí zadaný útvar, aby dané přímky nebyly vodorovné (viz `assignmentTransforms.ts`). */
function withAssignmentRotation(
  assignmentId: string | undefined,
  steps: InstructionStepContent[],
): InstructionStepContent[] {
  return steps.map(step =>
    step.canvasSnapshot
      ? { ...step, canvasSnapshot: rotateSnapshotForAssignment(assignmentId, step.canvasSnapshot) }
      : step,
  );
}

function withAssignmentStepOverrides(
  assignmentId: string | undefined,
  steps: InstructionStepContent[],
): InstructionStepContent[] {
  if (assignmentId === CIRCUMCIRCLE_ASSIGNMENT_ID && steps.length === 3) {
    return [
      ...steps,
      {
        text: CIRCUMCIRCLE_STEP_4_TEXT,
        image: null,
        canvasSnapshot: { points: [], shapes: [], freehandPaths: [] },
      },
    ];
  }
  return steps;
}

export function assignmentInstructionDisplay(row: {
  id?: string;
  instruction_steps?: unknown;
  instruction_text: string;
}):
  | { kind: 'steps'; steps: InstructionStepContent[] }
  | { kind: 'text'; text: string } {
  const steps = withAssignmentRotation(
    row.id,
    withAssignmentStepOverrides(row.id, normalizeInstructionSteps(row.instruction_steps)),
  );
  if (steps.length > 0) return { kind: 'steps', steps };
  return { kind: 'text', text: row.instruction_text || '' };
}

/** První obrázek z kroků — vhodné pro `instruction_image` u nových zadání. */
export function firstStepImage(steps: InstructionStepContent[]): string | null {
  for (const s of steps) {
    if (s.image) return s.image;
  }
  return null;
}

/** Serializace kroku pro uložení do DB. */
export function serializeInstructionStep(step: InstructionStepContent): InstructionStep {
  const out: InstructionStep = { text: step.text };
  if (step.image) out.image = step.image;
  if (step.canvasSnapshot) out.canvas_snapshot = step.canvasSnapshot;
  return out;
}
