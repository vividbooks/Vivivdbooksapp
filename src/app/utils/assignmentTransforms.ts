/**
 * Natočení zadání konstrukčních úloh 9. ročníku, aby dané přímky nebyly vodorovné.
 *
 * V databázi jsou zadání uložená v původní (vodorovné) poloze — klient na ně nemá
 * UPDATE, viz `assignmentCanvasFixes.ts`. Otočení se proto dělá až při zobrazení
 * a stejné otočení se aplikuje na vzorová řešení, která se počítají v původní soustavě.
 */
import type { GeometrySubmissionSnapshot } from '../../../rysovani/src/components/FreeGeometryEditor';

export type SnapshotRotation = {
  /** Kladný úhel otáčí po směru hodinových ručiček (osa y roste dolů). */
  angleDeg: number;
};

/** Střed otáčení — přibližný střed kreslicí plochy. */
export const ROTATION_CENTER = { x: 330, y: 250 } as const;

const ROTATIONS: Record<string, SnapshotRotation> = {
  // Rovnoběžník s delší úhlopříčkou
  '4a1829f5-69f3-4737-b8e6-8b898b176901': { angleDeg: 13 },
  // Rovnoramenný trojúhelník s výškou
  '03b73633-c003-46dd-a9a3-1cd8253a2fea': { angleDeg: -17 },
  // Obdélník se středem strany
  '29b49708-92f0-4ef6-a947-8f0bdef02451': { angleDeg: 8 },
  // Rovnoramenný trojúhelník se středem ramene
  '519619a4-1076-4da8-b81a-bf1024d9b3a8': { angleDeg: 19 },
  // Čtverec se stranou na přímce
  '3f73cd7a-f6d9-46ef-a2f2-9f34d1479bbe': { angleDeg: -11 },
  // Lichoběžník s poloviční základnou
  '834c4b76-6217-4564-83f5-503900b0c711': { angleDeg: 7 },
  // Kosočtverec
  '605d7ecd-faf2-474d-a304-3ab328ae5d0e': { angleDeg: -14 },
  // Kosočtverec 2
  'c0376830-b727-477e-9837-48f9f47552b4': { angleDeg: 21 },
  // Kružnice mezi rovnoběžkami
  '46725d97-9b34-4003-ae15-c020b22a2704': { angleDeg: -9 },
  // Těžiště
  '61f0d7a6-9483-44de-83a8-a1b160fef1f2': { angleDeg: 10 },
  // Kružnice daná dvěma body
  'fda41fe6-dfad-4881-be72-771d509ba49f': { angleDeg: 16 },
  // Těžnice a rovnoběžka
  'c67ac52d-eaea-46b4-8fda-d4dff5d29488': { angleDeg: -20 },
  // Kružnice tečná k přímce
  'a6d9de88-c424-46fa-8af1-814c07a4466e': { angleDeg: 12 },
  // Trojúhelník z průsečíku výšek
  '66fa2048-f25d-43ce-97ca-491807df805b': { angleDeg: -15 },
  // Trojúhelník z osy úhlu
  '0daeda38-6964-4e93-a3db-745003b63e53': { angleDeg: -7 },
};

export function getAssignmentRotation(assignmentId: string | undefined): SnapshotRotation | null {
  if (!assignmentId) return null;
  return ROTATIONS[assignmentId] ?? null;
}

export function rotateAroundCenter(
  point: { x: number; y: number },
  angleDeg: number,
  center: { x: number; y: number } = ROTATION_CENTER,
): { x: number; y: number } {
  const t = (angleDeg * Math.PI) / 180;
  const cos = Math.cos(t);
  const sin = Math.sin(t);
  const dx = point.x - center.x;
  const dy = point.y - center.y;
  return {
    x: center.x + dx * cos - dy * sin,
    y: center.y + dx * sin + dy * cos,
  };
}

/** Obdélník kreslicí plochy — po otočení do něj vracíme pomocné body přímek. */
const CANVAS_RECT = { minX: 40, maxX: 620, minY: 60, maxY: 440 } as const;

/** Krajní body úseku přímky (bodem `p` ve směru `d`) uvnitř kreslicí plochy. */
function clipLineToCanvas(
  p: { x: number; y: number },
  d: { x: number; y: number },
): [{ x: number; y: number }, { x: number; y: number }] | null {
  const hits: { x: number; y: number; t: number }[] = [];
  const eps = 0.001;
  const addHit = (t: number) => {
    const x = p.x + d.x * t;
    const y = p.y + d.y * t;
    if (
      x >= CANVAS_RECT.minX - eps &&
      x <= CANVAS_RECT.maxX + eps &&
      y >= CANVAS_RECT.minY - eps &&
      y <= CANVAS_RECT.maxY + eps
    ) {
      hits.push({ x, y, t });
    }
  };
  if (Math.abs(d.x) > 1e-9) {
    addHit((CANVAS_RECT.minX - p.x) / d.x);
    addHit((CANVAS_RECT.maxX - p.x) / d.x);
  }
  if (Math.abs(d.y) > 1e-9) {
    addHit((CANVAS_RECT.minY - p.y) / d.y);
    addHit((CANVAS_RECT.maxY - p.y) / d.y);
  }
  if (hits.length < 2) return null;
  hits.sort((a, b) => a.t - b.t);
  return [hits[0]!, hits[hits.length - 1]!];
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Otočí celý snapshot o daný úhel; geometrie zůstává shodná, mění se jen poloha. */
export function rotateSnapshot(
  snapshot: GeometrySubmissionSnapshot,
  angleDeg: number,
): GeometrySubmissionSnapshot {
  if (!angleDeg || !Array.isArray(snapshot.points)) return snapshot;

  const byId = new Map<string, GeometrySubmissionSnapshot['points'][number]>();
  for (const point of snapshot.points) {
    const rotated = rotateAroundCenter(point, angleDeg);
    byId.set(point.id, { ...point, x: round2(rotated.x), y: round2(rotated.y) });
  }

  // Přímky zadané dvěma skrytými pomocnými body roztáhneme zpět přes celou plochu,
  // aby se po otočení nesmrskly do rohu.
  for (const shape of snapshot.shapes ?? []) {
    if (shape.type !== 'line') continue;
    const a = byId.get(shape.definition.p1Id);
    const b = shape.definition.p2Id ? byId.get(shape.definition.p2Id) : undefined;
    if (!a || !b || !a.hidden || !b.hidden) continue;
    const clipped = clipLineToCanvas(a, { x: b.x - a.x, y: b.y - a.y });
    if (!clipped) continue;
    const [start, end] = clipped;
    byId.set(a.id, { ...a, x: round2(start.x), y: round2(start.y) });
    byId.set(b.id, { ...b, x: round2(end.x), y: round2(end.y) });
  }

  return { ...snapshot, points: snapshot.points.map(p => byId.get(p.id)!) };
}

/** Otočí snapshot podle tabulky pro dané zadání (bez záznamu vrací původní). */
export function rotateSnapshotForAssignment(
  assignmentId: string | undefined,
  snapshot: GeometrySubmissionSnapshot,
): GeometrySubmissionSnapshot {
  const rotation = getAssignmentRotation(assignmentId);
  return rotation ? rotateSnapshot(snapshot, rotation.angleDeg) : snapshot;
}
