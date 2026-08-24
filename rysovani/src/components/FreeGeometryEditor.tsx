import {
  useEffect,
  useRef,
  useState,
  useCallback,
  useMemo,
  type MutableRefObject,
  type ReactNode,
  type SVGProps,
} from 'react';
import { toast } from 'sonner@2.0.3';
import katex from 'katex';
import { 
  ArrowLeft, 
  MousePointer2, 
  Circle, 
  Minus, 
  Move,
  MoveDiagonal, 
  Dot,
  Trash2,
  Undo,
  RotateCw,
  Check,
  ArrowRight,
  ArrowUp,
  ZoomIn,
  ZoomOut,
  ArrowUpDown,
  Hand,
  FlipVertical,
  Pencil,
  Highlighter,
  Ruler,
  Moon,
  Sun,
  X,
  FileText,
  Share2,
  Copy,
  Loader2,
  Link,
  Printer,
  Grid2X2,
  Eraser,
  ImagePlus,
  Lock,
  Unlock,
  Palette,
  Sparkles,
} from 'lucide-react';
import { useIsMobile } from './ui/use-mobile';
import { Slider } from './ui/slider';
import protractorAsset from "figma:asset/7cb6453b8f9704d306161a4002715da792974ba7.png";
import { handleToolMenuClick } from './toolMenuHandler';
import { ConstructionProtocol, ConstructionStep, Latex } from './ConstructionProtocol';
import { projectId, publicAnonKey } from '../utils/supabase/info';
import { rafThrottle, detectDevicePerformance } from '../utils/performance';
import { useFitPanelScale } from '../hooks/useFitPanelScale';
import macosOpenHandCursor from '../assets/macos-open-hand.svg?url';

import Pero from '../imports/Group23910-135-1585';
import Pravitko from '../imports/Pravitko';
import Kruzitko from '../imports/Group23908-135-1191';
import Uhel from '../imports/Uhel';
import Papir from '../imports/Papir';

// --- TYPY ---

type ToolType = 'move' | 'point' | 'segment' | 'line' | 'lineDashed' | 'lineDashDot' | 'ray' | 'circle' | 'angle' | 'distance' | 'perpendicular' | 'pan' | 'paper' | 'freehand' | 'highlighter' | 'highlighterStraight' | 'eraser' | 'triangleRuler';

type TracePoint = { x: number; y: number };

// React 18 StrictMode (dev) může efekty spustit 2× (simulace remountu).
// Aby se detekce nespouštěla duplicitně, držíme si globální cache zpracovaných requestů.
const handledAutoDetectKeys: string[] = [];
const handledAutoDetectSet = new Set<string>();
function markAutoDetectHandled(key: string): boolean {
  if (handledAutoDetectSet.has(key)) return false;
  handledAutoDetectSet.add(key);
  handledAutoDetectKeys.push(key);
  if (handledAutoDetectKeys.length > 80) {
    const old = handledAutoDetectKeys.splice(0, handledAutoDetectKeys.length - 80);
    for (const k of old) handledAutoDetectSet.delete(k);
  }
  return true;
}

function sobelEdgesGray(gray: Uint8ClampedArray, w: number, h: number) {
  const mag = new Uint16Array(w * h);
  const idx = (x: number, y: number) => y * w + x;
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const a00 = gray[idx(x - 1, y - 1)];
      const a10 = gray[idx(x, y - 1)];
      const a20 = gray[idx(x + 1, y - 1)];
      const a01 = gray[idx(x - 1, y)];
      const a21 = gray[idx(x + 1, y)];
      const a02 = gray[idx(x - 1, y + 1)];
      const a12 = gray[idx(x, y + 1)];
      const a22 = gray[idx(x + 1, y + 1)];
      const gx = -a00 + a20 - 2 * a01 + 2 * a21 - a02 + a22;
      const gy = -a00 - 2 * a10 - a20 + a02 + 2 * a12 + a22;
      const m = Math.min(65535, Math.abs(gx) + Math.abs(gy));
      mag[idx(x, y)] = m;
    }
  }
  return mag;
}

function traceEdgePaths(edge: Uint8Array, w: number, h: number, maxPaths: number) {
  const visited = new Uint8Array(w * h);
  const paths: TracePoint[][] = [];
  const dirs = [
    [-1, -1], [0, -1], [1, -1],
    [-1, 0],           [1, 0],
    [-1, 1],  [0, 1],  [1, 1],
  ] as const;
  const idx = (x: number, y: number) => y * w + x;
  for (let y = 1; y < h - 1 && paths.length < maxPaths; y++) {
    for (let x = 1; x < w - 1 && paths.length < maxPaths; x++) {
      const i = idx(x, y);
      if (!edge[i] || visited[i]) continue;
      const path: TracePoint[] = [];
      let cx = x, cy = y;
      let safety = 0;
      while (safety++ < w * h) {
        const ci = idx(cx, cy);
        if (!edge[ci] || visited[ci]) break;
        visited[ci] = 1;
        path.push({ x: cx, y: cy });
        let found = false;
        for (const [dx, dy] of dirs) {
          const nx = cx + dx;
          const ny = cy + dy;
          const ni = idx(nx, ny);
          if (nx <= 0 || ny <= 0 || nx >= w - 1 || ny >= h - 1) continue;
          if (edge[ni] && !visited[ni]) {
            cx = nx;
            cy = ny;
            found = true;
            break;
          }
        }
        if (!found) break;
      }
      if (path.length >= 20) paths.push(path);
    }
  }
  return paths;
}

type LineModel = { a: number; b: number; c: number }; // ax + by + c = 0, normalized
type CircleModel = { cx: number; cy: number; r: number };

function lineFrom2Points(p1: TracePoint, p2: TracePoint): LineModel | null {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  const n = Math.hypot(dx, dy);
  if (n < 1e-6) return null;
  // normal vector (dy, -dx)
  const a = dy / n;
  const b = -dx / n;
  const c = -(a * p1.x + b * p1.y);
  return { a, b, c };
}

function distPointLine(p: TracePoint, l: LineModel) {
  return Math.abs(l.a * p.x + l.b * p.y + l.c);
}

function circleFrom3Points(p1: TracePoint, p2: TracePoint, p3: TracePoint): CircleModel | null {
  const ax = p1.x, ay = p1.y;
  const bx = p2.x, by = p2.y;
  const cx = p3.x, cy = p3.y;
  const d = 2 * (ax * (by - cy) + bx * (cy - ay) + cx * (ay - by));
  if (Math.abs(d) < 1e-6) return null;
  const ax2ay2 = ax * ax + ay * ay;
  const bx2by2 = bx * bx + by * by;
  const cx2cy2 = cx * cx + cy * cy;
  const ux = (ax2ay2 * (by - cy) + bx2by2 * (cy - ay) + cx2cy2 * (ay - by)) / d;
  const uy = (ax2ay2 * (cx - bx) + bx2by2 * (ax - cx) + cx2cy2 * (bx - ax)) / d;
  const r = Math.hypot(ax - ux, ay - uy);
  if (!Number.isFinite(r) || r < 1e-3) return null;
  return { cx: ux, cy: uy, r };
}

function distPointCircle(p: TracePoint, c: CircleModel) {
  return Math.abs(Math.hypot(p.x - c.cx, p.y - c.cy) - c.r);
}

export interface GeoPoint {
  id: string;
  x: number;
  y: number;
  label: string;
  hidden?: boolean;
  locked?: boolean;
}

export interface FreehandPath {
  id: string;
  points: {x: number, y: number}[];
  color: string;
  width: number;
  isHighlight?: boolean;
}

export interface GeoShape {
  id: string;
  type: 'segment' | 'line' | 'lineDashed' | 'lineDashDot' | 'ray' | 'circle' | 'circleArc';
  label: string;
  points: string[]; // IDs bodů, na kterých tvar závisí
  locked?: boolean;
  /** Tenší čára (přepínač „tenká“). */
  thinStroke?: boolean;
  /** Výraznější barva čáry (přepínač Zvýraznění). */
  emphasisStroke?: boolean;
  definition: {
    p1Id: string;
    p2Id?: string; // Pro kružnici je to bod na obvodu
    angle?: number; // Pro polopřímku zadanou úhlem
    length?: number; // Volitelně délka
    /** Úhel výseče v rad (circleArc) — část obvodu kolem směru k p2 */
    arcSpan?: number;
  };
}

interface AnimationState {
  isActive: boolean;
  type: 'segment' | 'line' | 'lineDashed' | 'lineDashDot' | 'ray' | 'circle' | 'circleArc' | 'angle' | null;
  startTime: number;
  p1: { x: number, y: number } | null;
  p2: { x: number, y: number } | null;
  angle?: number; // Cílový úhel pro animaci úhloměru
  baseAngle?: number; // Základní úhel (natočení nuly)
  /** Výsek kružnice (circleArc) — celkový úhel v rad */
  arcSpan?: number;
  progress: number;
}

interface AngleInputState {
  visible: boolean;
  value: number;
  vertexId: string | null;
  directionId: string | null;
  customVertex?: {x: number, y: number};
  baseAngle?: number;
  rotationOffset: number; // 0 nebo 180 (případně jiné násobky 90)
  isMirrored: boolean;
}

interface VisualEffect {
  id: string;
  x: number;
  y: number;
  startTime: number;
  color: string;
}

export type GeometrySubmissionSnapshot = {
  points: GeoPoint[];
  shapes: GeoShape[];
  freehandPaths: FreehandPath[];
};

function overlayPointById(
  points: GeoPoint[],
  id: string | undefined,
): GeoPoint | undefined {
  if (!id) return undefined;
  return points.find(p => p.id === id);
}

/** Vzorové řešení úkolu — kreslí se přes studentské rýsování, bez interakce. */
function drawSolutionOverlay(
  ctx: CanvasRenderingContext2D,
  snap: GeometrySubmissionSnapshot,
  scale: number,
  color: string,
) {
  const points = snap.points ?? [];
  const shapes = snap.shapes ?? [];
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.globalAlpha = 0.92;
  ctx.strokeStyle = color;
  ctx.fillStyle = color;

  for (const s of shapes) {
    const a = overlayPointById(points, s.definition.p1Id);
    const b = overlayPointById(points, s.definition.p2Id);
    if (!a) continue;
    const dashed = s.type === 'lineDashed' || s.type === 'lineDashDot' || Boolean(s.thinStroke);
    ctx.setLineDash(dashed ? [8 / scale, 6 / scale] : []);
    ctx.lineWidth = s.thinStroke ? 1.15 / scale : 2.15 / scale;

    if ((s.type === 'circle' || s.type === 'circleArc') && b) {
      const r = Math.hypot(b.x - a.x, b.y - a.y);
      if (r > 1) {
        ctx.beginPath();
        if (s.type === 'circleArc') {
          const span = s.definition.arcSpan ?? (2 * Math.PI) / 3;
          const th = Math.atan2(b.y - a.y, b.x - a.x);
          ctx.arc(a.x, a.y, r, th - span / 2, th + span / 2);
        } else {
          ctx.arc(a.x, a.y, r, 0, Math.PI * 2);
        }
        ctx.stroke();
      }
    } else if (s.type === 'segment' && b) {
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    } else if ((s.type === 'line' || s.type === 'lineDashed' || s.type === 'lineDashDot') && b) {
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const len = Math.hypot(dx, dy) || 1;
      const k = 4000 / len;
      ctx.beginPath();
      ctx.moveTo(a.x - dx * k, a.y - dy * k);
      ctx.lineTo(a.x + dx * k, a.y + dy * k);
      ctx.stroke();
    } else if (s.type === 'ray' && b) {
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const len = Math.hypot(dx, dy) || 1;
      const k = 4000 / len;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(a.x + dx * k, a.y + dy * k);
      ctx.stroke();
    }

    if (s.label) {
      const lx = b ? (a.x + b.x) / 2 : a.x + 10 / scale;
      const ly = b ? (a.y + b.y) / 2 : a.y - 12 / scale;
      ctx.setLineDash([]);
      ctx.font = `italic ${18 / scale}px Georgia, "Times New Roman", serif`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'bottom';
      ctx.fillText(s.label, lx + 8 / scale, ly - 4 / scale);
    }
  }

  ctx.setLineDash([]);
  ctx.lineWidth = 2.3 / scale;
  for (const p of points) {
    if (p.hidden) continue;
    const arm = 7 / scale;
    ctx.beginPath();
    ctx.moveTo(p.x, p.y - arm);
    ctx.lineTo(p.x, p.y + arm);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(p.x - arm, p.y);
    ctx.lineTo(p.x + arm, p.y);
    ctx.stroke();
    if (p.label) {
      ctx.font = `italic ${22 / scale}px Georgia, "Times New Roman", serif`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'bottom';
      ctx.fillText(p.label, p.x + 8 / scale, p.y - 6 / scale);
    }
  }
  ctx.restore();
}

/** Ohraničení všech objektů ve světových souřadnicích — pro vycentrování a „fit“ při otevření úkolu. */
function computeGeometryWorldBounds(snap: GeometrySubmissionSnapshot): {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
} | null {
  const points = snap.points ?? [];
  const shapes = snap.shapes ?? [];
  const freehandPaths = snap.freehandPaths ?? [];
  const pointById = new Map(points.map(p => [p.id, p]));

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let any = false;

  const expand = (x: number, y: number) => {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    any = true;
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  };

  for (const p of points) {
    expand(p.x, p.y);
  }

  for (const path of freehandPaths) {
    for (const q of path.points ?? []) {
      expand(q.x, q.y);
    }
  }

  for (const s of shapes) {
    const p1 = pointById.get(s.definition.p1Id);
    const p2 = s.definition.p2Id ? pointById.get(s.definition.p2Id) : undefined;
    if (p1) expand(p1.x, p1.y);
    if (p2) expand(p2.x, p2.y);

    if ((s.type === 'circle' || s.type === 'circleArc') && p1 && p2) {
      const r = Math.hypot(p2.x - p1.x, p2.y - p1.y);
      if (r > 1e-6) {
        expand(p1.x - r, p1.y - r);
        expand(p1.x + r, p1.y + r);
      }
    }
  }

  if (!any) return null;
  const bw = maxX - minX;
  const bh = maxY - minY;
  const pad = Math.max(48, 0.06 * Math.max(bw, bh));
  return {
    minX: minX - pad,
    minY: minY - pad,
    maxX: maxX + pad,
    maxY: maxY + pad,
  };
}

/** Ořízne vykreslené plátno na oblast s geometrií (světové bounds → bitmapové pixely). */
function cropCanvasToGeometryBounds(
  source: HTMLCanvasElement,
  snap: GeometrySubmissionSnapshot,
  offset: { x: number; y: number },
  scale: number,
  dpr: number,
): HTMLCanvasElement {
  const bounds = computeGeometryWorldBounds(snap);
  const cloneFull = () => {
    const clone = document.createElement('canvas');
    clone.width = source.width;
    clone.height = source.height;
    const ctx = clone.getContext('2d');
    if (ctx) ctx.drawImage(source, 0, 0);
    return clone;
  };
  if (!bounds) return cloneFull();

  const x0 = Math.max(0, Math.floor((offset.x + bounds.minX * scale) * dpr));
  const y0 = Math.max(0, Math.floor((offset.y + bounds.minY * scale) * dpr));
  const x1 = Math.min(source.width, Math.ceil((offset.x + bounds.maxX * scale) * dpr));
  const y1 = Math.min(source.height, Math.ceil((offset.y + bounds.maxY * scale) * dpr));
  const w = Math.max(1, x1 - x0);
  const h = Math.max(1, y1 - y0);

  const cropped = document.createElement('canvas');
  cropped.width = w;
  cropped.height = h;
  const ctx = cropped.getContext('2d');
  if (ctx) {
    ctx.drawImage(source, x0, y0, w, h, 0, 0, w, h);
  }
  return cropped;
}

function fitViewportToAssignmentBounds(
  bounds: { minX: number; minY: number; maxX: number; maxY: number },
  canvasW: number,
  canvasH: number,
  rightReservePx: number,
  padPx = 56,
): { scale: number; offset: { x: number; y: number } } {
  const visibleW = Math.max(canvasW - Math.max(0, rightReservePx), 1);
  const bw = Math.max(bounds.maxX - bounds.minX, 1e-6);
  const bh = Math.max(bounds.maxY - bounds.minY, 1e-6);
  const worldCx = (bounds.minX + bounds.maxX) / 2;
  const worldCy = (bounds.minY + bounds.maxY) / 2;

  const availW = Math.max(visibleW - padPx * 2, 1);
  const availH = Math.max(canvasH - padPx * 2, 1);

  const nextScale = Math.min(availW / bw, availH / bh, 5);
  const clampedScale = Math.max(Math.min(nextScale, 5), 0.1);

  const cxScreen = visibleW / 2;
  const cyScreen = canvasH / 2;

  return {
    scale: clampedScale,
    offset: {
      x: cxScreen - worldCx * clampedScale,
      y: cyScreen - worldCy * clampedScale,
    },
  };
}

type CanvasSharePayloadV1 = {
  v: 1;
  snapshot: GeometrySubmissionSnapshot;
};

function uint8ToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

function base64ToUint8(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function base64ToBase64Url(base64: string): string {
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function base64UrlToBase64(base64url: string): string {
  const base64 = base64url.replace(/-/g, '+').replace(/_/g, '/');
  const pad = base64.length % 4;
  return pad === 0 ? base64 : base64 + '='.repeat(4 - pad);
}

function encodeCanvasSharePayload(payload: CanvasSharePayloadV1): string {
  const json = JSON.stringify(payload);
  const bytes = new TextEncoder().encode(json);
  return base64ToBase64Url(uint8ToBase64(bytes));
}

/** Stejný limit jako při přidávání obrázků ke krokům zadání (TasksSheet). */
const MAX_BACKGROUND_IMAGE_BYTES = 1_500_000;

function decodeCanvasSharePayload(encoded: string): CanvasSharePayloadV1 | null {
  try {
    const base64 = base64UrlToBase64(encoded);
    const bytes = base64ToUint8(base64);
    const json = new TextDecoder().decode(bytes);
    const parsed = JSON.parse(json) as CanvasSharePayloadV1;
    if (!parsed || parsed.v !== 1 || !parsed.snapshot) return null;
    const s = parsed.snapshot as any;
    if (!Array.isArray(s.points) || !Array.isArray(s.shapes) || !Array.isArray(s.freehandPaths)) return null;
    return parsed;
  } catch {
    return null;
  }
}

interface FreeGeometryEditorProps {
  onBack: () => void;
  darkMode: boolean;
  onDarkModeChange: (dark: boolean) => void;
  deviceType?: 'board' | 'computer';
  sharedRecording?: { name: string; steps: any[] };
  /** Úkol ve značkové aplikaci: skrýt zpět a nahrávání. */
  embedInAssignment?: boolean;
  /** Jednorázové načtení plátna (náhled odevzdání). */
  initialCanvasSnapshot?: { points: GeoPoint[]; shapes: GeoShape[]; freehandPaths: FreehandPath[] } | null;
  /** Jen posun a zoom (bez úprav geometrie). */
  readOnlyCanvas?: boolean;
  /** Aktuální stav plátna pro odevzdání (serializuje rodič do DB). */
  submissionSnapshotRef?: MutableRefObject<(() => GeometrySubmissionSnapshot | null) | null>;
  /** Přímý přístup k vykreslovacímu canvasu (export náhledu do zadání úkolu jako PNG). */
  canvasExportRef?: MutableRefObject<(() => HTMLCanvasElement | null) | null>;
  /** Vedle Undo/Redo — tmavé tlačítko „Zadání“ (studentský úkol). */
  assignmentToolbarSlot?: ReactNode;
  /** Posun celé skupiny od pravého okraje (px), když je otevřený boční panel. */
  assignmentToolbarRightOffsetPx?: number;
  /** Obrázek „předlohy“, který lze promítnout přes plátno (např. obrázek u kroku úkolu). */
  projectionImageSrc?: string | null;
  /** Zda je předloha právě promítnutá. */
  projectionEnabled?: boolean;
  /** Průhlednost předlohy (0..1). */
  projectionOpacity?: number;
  /** Spustit detekci geometrických objektů (přímky/kružnice) z obrázku. */
  autoDetectImageSrc?: string | null;
  /** Změna hodnoty spustí novou detekci objektů (např. inkrement). */
  autoDetectRequestId?: number;
  /** Vzorové řešení vykreslené přes plátno (úkol). */
  overlaySnapshot?: GeometrySubmissionSnapshot | null;
}

interface RecordedStep {
  id: string;
  actionType: 'create-point' | 'create-segment' | 'create-line' | 'create-line-dashed' | 'create-line-dashdot' | 'create-ray' | 'create-circle' | 'create-angle' | 'move-point' | 'delete' | 'freehand';
  description: string;
  notation?: string; // LaTeX notation for construction log
  snapshot: {
    points: GeoPoint[];
    shapes: GeoShape[];
    freehandPaths: FreehandPath[];
  };
  // Vizualizace nástroje při přehrávání
  toolVisualization?: {
    type: 'ruler' | 'compass' | 'protractor' | null;
    p1?: { x: number; y: number }; // První bod
    p2?: { x: number; y: number }; // Druhý bod / pozice myši
    angle?: number; // Úhel natočení
    radius?: number; // Poloměr pro kružítko
  };
}

interface RecordingState {
  isRecording: boolean;
  steps: RecordedStep[];
  currentStepIndex: number;
  showEditor: boolean;
  showPlayer: boolean;
}

/** Vzdálenost bodu k úsečce vw (včetně projekce na konec). */
function distToSegment(
  p: { x: number; y: number },
  v: { x: number; y: number },
  w: { x: number; y: number }
) {
  const l2 = (w.x - v.x) ** 2 + (w.y - v.y) ** 2;
  if (l2 === 0) return { dist: Math.sqrt((p.x - v.x) ** 2 + (p.y - v.y) ** 2), proj: v, t: 0 };
  let t = ((p.x - v.x) * (w.x - v.x) + (p.y - v.y) * (w.y - v.y)) / l2;
  t = Math.max(0, Math.min(1, t));
  const proj = { x: v.x + t * (w.x - v.x), y: v.y + t * (w.y - v.y) };
  return {
    dist: Math.sqrt((p.x - proj.x) ** 2 + (p.y - proj.y) ** 2),
    proj,
    t
  };
}

/** Vzdálenost bodu k přímce (nekonečné) procházející v–w. */
function distPointToLine(
  p: { x: number; y: number },
  v: { x: number; y: number },
  w: { x: number; y: number }
): number {
  const dx = w.x - v.x;
  const dy = w.y - v.y;
  const len2 = dx * dx + dy * dy;
  if (len2 < 1e-18) return Math.hypot(p.x - v.x, p.y - v.y);
  return Math.abs(dy * p.x - dx * p.y + w.x * v.y - w.y * v.x) / Math.sqrt(len2);
}

/** Vzdálenost bodu k polopřímce z v přes w (nekonečně). */
function distPointToRay(
  p: { x: number; y: number },
  v: { x: number; y: number },
  w: { x: number; y: number }
): number {
  const dx = w.x - v.x;
  const dy = w.y - v.y;
  const len2 = dx * dx + dy * dy;
  if (len2 < 1e-18) return Math.hypot(p.x - v.x, p.y - v.y);
  let t = ((p.x - v.x) * dx + (p.y - v.y) * dy) / len2;
  if (t < 0) t = 0;
  const proj = { x: v.x + t * dx, y: v.y + t * dy };
  return Math.hypot(p.x - proj.x, p.y - proj.y);
}

/** Úhlová vzdálenost v rozsahu [0, π]. */
function angleDist(a: number, b: number): number {
  let d = Math.abs(a - b);
  while (d > Math.PI * 2) d -= Math.PI * 2;
  if (d > Math.PI) d = Math.PI * 2 - d;
  return d;
}

/** Střed výseče kolem směru p1→p2 (úhel v canvas souřadnicích). */
function circleArcAngles(
  p1: { x: number; y: number },
  p2: { x: number; y: number },
  arcSpanRad: number
) {
  const r = Math.hypot(p2.x - p1.x, p2.y - p1.y);
  const θ = Math.atan2(p2.y - p1.y, p2.x - p1.x);
  const half = arcSpanRad / 2;
  return { r, start: θ - half, end: θ + half };
}

/** Koncový bod oblouku s větší y (dole na plátně) — pozice táhla velikosti u výseku. */
function circleArcRadiusHandlePos(
  p1: { x: number; y: number },
  p2: { x: number; y: number },
  arcSpanRad: number
): { x: number; y: number } {
  const { r, start, end } = circleArcAngles(p1, p2, arcSpanRad);
  const ex = p1.x + r * Math.cos(end);
  const ey = p1.y + r * Math.sin(end);
  const sx = p1.x + r * Math.cos(start);
  const sy = p1.y + r * Math.sin(start);
  return ey >= sy ? { x: ex, y: ey } : { x: sx, y: sy };
}

/** Přichycení kurzoru na obvod kružnice (úhel v radiánech, bod na obvodu). */
function snapToCirclePerimeter(
  wx: number,
  wy: number,
  center: { x: number; y: number },
  radiusPx: number
) {
  const angle = Math.atan2(wy - center.y, wx - center.x);
  return {
    angle,
    x: center.x + Math.cos(angle) * radiusPx,
    y: center.y + Math.sin(angle) * radiusPx,
  };
}

/** Nejkratší rozdíl úhlů v (−π, π] — pro kontinuální sledování myši bez skoku přes ±π. */
function angleDelta(from: number, to: number): number {
  let d = to - from;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d <= -Math.PI) d += Math.PI * 2;
  return d;
}

const EMPTY_PROTECTED_IDS = new Set<string>();
/** Úkol bez výchozího sdíleného plátna — žádné ID k ochraně. */
const EMPTY_ASSIGNMENT_BASELINE_IDS = {
  points: EMPTY_PROTECTED_IDS,
  shapes: EMPTY_PROTECTED_IDS,
  freehand: EMPTY_PROTECTED_IDS,
};

/** Délka ryskované hrany pravítka v lokálních jednotkách (animace konstrukcí). */
const RULER_EDGE_LENGTH = 760;
/** Výška pravítka v lokálních jednotkách. */
const RULER_HEIGHT = 400;
/** Polovina délky ryskované hrany — animace konstrukcí. */
const RULER_HALF_LENGTH = RULER_EDGE_LENGTH / 2;
/** Zobrazení volně umístěného pravítka oproti nominální velikosti (1 = 100 %). */
const RULER_PLACED_SCALE = 0.8;

/** Vykreslení SVG pravítka v lokálních souřadnicích (musí sedět s drawPlacedRuler). */
const RULER_IMG_OFFSET_X = -40;
const RULER_IMG_WIDTH = 800;
const RULER_IMG_HEIGHT = RULER_HEIGHT;
const RULER_SVG_VIEWBOX_W = 467.08;
const RULER_SVG_VIEWBOX_H = 236.12;

/**
 * Rovné rýsovatelné hrany z pravitko4.svg (zaoblené rohy vynechány).
 * base: horizontální úsek mezi zaobleními dole; left/right: přímky ke krátkým stranám.
 */
const RULER_EDGE_SVG = {
  base: {
    a: { x: 2.43, y: 234.88 },
    b: { x: 464.83, y: 234.88 },
  },
  left: {
    a: { x: 1.57, y: 232.8 },
    b: { x: 231.55, y: 2.82 },
  },
  right: {
    a: { x: 465.7, y: 232.79 },
    b: { x: 235.72, y: 2.82 },
  },
} as const;

/** SVG y nejdelší strany — v lokálních souřadnicích ji mapujeme na y = 0. */
const RULER_BASE_SVG_Y = RULER_EDGE_SVG.base.a.y;
const RULER_IMG_OFFSET_Y = -(RULER_BASE_SVG_Y / RULER_SVG_VIEWBOX_H) * RULER_IMG_HEIGHT;

const rulerSvgToLocal = (sx: number, sy: number) => ({
  x: RULER_IMG_OFFSET_X + (sx / RULER_SVG_VIEWBOX_W) * RULER_IMG_WIDTH,
  y: RULER_IMG_OFFSET_Y + (sy / RULER_SVG_VIEWBOX_H) * RULER_IMG_HEIGHT,
});

const rulerEdgeToLocal = (edge: keyof typeof RULER_EDGE_SVG) => ({
  a: rulerSvgToLocal(RULER_EDGE_SVG[edge].a.x, RULER_EDGE_SVG[edge].a.y),
  b: rulerSvgToLocal(RULER_EDGE_SVG[edge].b.x, RULER_EDGE_SVG[edge].b.y),
});

const RULER_EDGES_LOCAL = {
  base: rulerEdgeToLocal('base'),
  left: rulerEdgeToLocal('left'),
  right: rulerEdgeToLocal('right'),
};

/** Vnější rohy trojúhelníku (otočení, hit-test těla). */
const RULER_APEX_LOCAL = rulerSvgToLocal(235.72, 2.82);
const RULER_BASE_LEFT_LOCAL = rulerSvgToLocal(1.57, 232.8);
const RULER_BASE_RIGHT_LOCAL = rulerSvgToLocal(465.7, 232.79);
/** Průsečík středové rysky a nejdelší strany. */
const RULER_ROTATION_PIVOT_LOCAL = rulerSvgToLocal(233.79, RULER_BASE_SVG_Y);

/** Jedno rotační kolečko uprostřed pravítka (na středové rysce). */
const RULER_ROTATE_WHEEL_LOCAL = {
  x: (RULER_APEX_LOCAL.x + RULER_ROTATION_PIVOT_LOCAL.x) / 2,
  y: RULER_ROTATION_PIVOT_LOCAL.y + (RULER_APEX_LOCAL.y - RULER_ROTATION_PIVOT_LOCAL.y) * 0.4,
};

const RULER_CORNERS_LOCAL = [
  { id: 'pivot' as const, x: RULER_ROTATION_PIVOT_LOCAL.x, y: RULER_ROTATION_PIVOT_LOCAL.y },
  { id: 'apex' as const, x: RULER_APEX_LOCAL.x, y: RULER_APEX_LOCAL.y },
  { id: 'baseLeft' as const, x: RULER_BASE_LEFT_LOCAL.x, y: RULER_BASE_LEFT_LOCAL.y },
  { id: 'baseRight' as const, x: RULER_BASE_RIGHT_LOCAL.x, y: RULER_BASE_RIGHT_LOCAL.y },
];
/** Poloměr chycení rotačního kolečka (px na obrazovce). */
const RULER_ROTATE_WHEEL_HIT_PX = 34;
/** Vizuální poloměr rotačního kolečka (px na obrazovce). */
const RULER_ROTATE_WHEEL_VISUAL_PX = 28;
/** Poloměr chycení rohů pro otáčení (px na obrazovce) — legacy, nepoužívá se. */
const RULER_ROTATE_HIT_PX = 52;
/** Poloměr chycení středu pro posun (px na obrazovce). */
const RULER_PIVOT_HIT_PX = 26;
/** Poloměr chycení strany pravítka pro rýsování přímky (px na obrazovce). */
const RULER_EDGE_HIT_PX = 22;

/** macOS-style open-hand kurzor pro intro animaci pravítka (px na obrazovce). */
const RULER_HAND_CURSOR_PX = 36;

/** Klasická reload ikona (Lucide RotateCw) — viewBox 24×24, střed v aktuálním originu. */
function strokeLucideRotateCw(
  ctx: CanvasRenderingContext2D,
  size: number,
  strokeStyle: string,
  lineWidthInViewBox: number = 2
) {
  const u = size / 24;
  ctx.save();
  ctx.scale(u, u);
  ctx.translate(-12, -12);
  ctx.strokeStyle = strokeStyle;
  ctx.lineWidth = lineWidthInViewBox;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  // M21 12 → oblouk po směru hodin na (12,3) → křivka → L21 8
  ctx.beginPath();
  ctx.moveTo(21, 12);
  ctx.arc(12, 12, 9, 0, -Math.PI / 2, false);
  ctx.bezierCurveTo(14.52, 3, 16.93, 4, 18.74, 5.74);
  ctx.lineTo(21, 8);
  ctx.stroke();
  // M21 3 v5 h-5
  ctx.beginPath();
  ctx.moveTo(21, 3);
  ctx.lineTo(21, 8);
  ctx.lineTo(16, 8);
  ctx.stroke();
  ctx.restore();
}

/** Modrý handle bobánek (střed / obvod kružítka). */
function drawHandleBobble(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  scale: number,
  opts?: { glow?: number; darkMode?: boolean }
) {
  const s = Math.max(scale, 0.25);
  ctx.save();

  if (opts?.glow && opts.glow > 0) {
    ctx.beginPath();
    ctx.arc(x, y, radius + opts.glow, 0, Math.PI * 2);
    ctx.fillStyle = opts.darkMode
      ? 'rgba(122, 162, 247, 0.22)'
      : 'rgba(59, 130, 246, 0.18)';
    ctx.fill();
  }

  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fillStyle = opts?.darkMode ? '#7aa2f7' : '#3b82f6';
  ctx.fill();
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 2.5 / s;
  ctx.stroke();
  ctx.restore();
}

const distancePointToSegment = (
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number
) => {
  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  if (lenSq < 1e-12) return Math.hypot(px - ax, py - ay);
  let t = ((px - ax) * dx + (py - ay) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
};

const projectOntoSegment = (
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number
) => {
  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  if (lenSq < 1e-12) return { x: ax, y: ay };
  let t = ((px - ax) * dx + (py - ay) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  return { x: ax + t * dx, y: ay + t * dy };
};

const getRulerDrawOriginFromPivot = (
  pivot: { x: number; y: number },
  angle: number
) => {
  const px = RULER_ROTATION_PIVOT_LOCAL.x * RULER_PLACED_SCALE;
  const py = RULER_ROTATION_PIVOT_LOCAL.y * RULER_PLACED_SCALE;
  return {
    x: pivot.x - Math.cos(angle) * px + Math.sin(angle) * py,
    y: pivot.y - Math.sin(angle) * px - Math.cos(angle) * py,
  };
};

const localToRulerWorld = (
  lx: number,
  ly: number,
  pivot: { x: number; y: number },
  angle: number
) => {
  const origin = getRulerDrawOriginFromPivot(pivot, angle);
  const sx = lx * RULER_PLACED_SCALE;
  const sy = ly * RULER_PLACED_SCALE;
  return {
    x: origin.x + sx * Math.cos(angle) - sy * Math.sin(angle),
    y: origin.y + sx * Math.sin(angle) + sy * Math.cos(angle),
  };
};

const worldToRulerLocal = (
  wx: number,
  wy: number,
  pivot: { x: number; y: number },
  angle: number
) => {
  const origin = getRulerDrawOriginFromPivot(pivot, angle);
  const dx = wx - origin.x;
  const dy = wy - origin.y;
  const cos = Math.cos(-angle);
  const sin = Math.sin(-angle);
  return {
    x: (dx * cos - dy * sin) / RULER_PLACED_SCALE,
    y: (dx * sin + dy * cos) / RULER_PLACED_SCALE,
  };
};

const isPointInRulerTriangle = (
  p: { x: number; y: number },
  a: { x: number; y: number },
  b: { x: number; y: number },
  c: { x: number; y: number }
) => {
  const sign = (
    p1: { x: number; y: number },
    p2: { x: number; y: number },
    p3: { x: number; y: number }
  ) => (p1.x - p3.x) * (p2.y - p3.y) - (p2.x - p3.x) * (p1.y - p3.y);
  const d1 = sign(p, a, b);
  const d2 = sign(p, b, c);
  const d3 = sign(p, c, a);
  const hasNeg = d1 < 0 || d2 < 0 || d3 < 0;
  const hasPos = d1 > 0 || d2 > 0 || d3 > 0;
  return !(hasNeg && hasPos);
};

type RulerCornerId = (typeof RULER_CORNERS_LOCAL)[number]['id'];
type RulerRotateCornerId = Exclude<RulerCornerId, 'pivot'>;

const hitTestPlacedRuler = (
  wx: number,
  wy: number,
  pivot: { x: number; y: number },
  angle: number,
  scale: number,
  isTabletMode: boolean
):
  | { type: 'rotate' }
  | { type: 'body' }
  | { type: 'miss' } => {
  // 1) Jedno rotační kolečko uprostřed
  const wheelWorld = localToRulerWorld(
    RULER_ROTATE_WHEEL_LOCAL.x,
    RULER_ROTATE_WHEEL_LOCAL.y,
    pivot,
    angle
  );
  const wheelHitPx = isTabletMode ? RULER_ROTATE_WHEEL_HIT_PX + 10 : RULER_ROTATE_WHEEL_HIT_PX;
  if (Math.hypot(wx - wheelWorld.x, wy - wheelWorld.y) < wheelHitPx / scale) {
    return { type: 'rotate' };
  }
  // 2) Tělo pravítka = posun
  const local = worldToRulerLocal(wx, wy, pivot, angle);
  if (
    isPointInRulerTriangle(
      local,
      RULER_BASE_LEFT_LOCAL,
      RULER_BASE_RIGHT_LOCAL,
      RULER_APEX_LOCAL
    )
  ) {
    return { type: 'body' };
  }
  return { type: 'miss' };
};

const PROTRACTOR_PLACED_RADIUS = 200;

const protractorArmEndWorld = (
  center: { x: number; y: number },
  baseAngle: number,
  highlightAngle: number,
  rotationOffset: number,
  isMirrored: boolean,
  radius = PROTRACTOR_PLACED_RADIUS
) => {
  const clampedAngle = Math.max(0, Math.min(180, highlightAngle));
  const hRad = -(clampedAngle * Math.PI) / 180;
  let lx = Math.cos(hRad) * radius;
  let ly = Math.sin(hRad) * radius;
  if (isMirrored) ly = -ly;
  const total = baseAngle + (rotationOffset * Math.PI) / 180;
  return {
    x: center.x + Math.cos(total) * lx - Math.sin(total) * ly,
    y: center.y + Math.sin(total) * lx + Math.cos(total) * ly,
  };
};

const protractorValueFromWorld = (
  wx: number,
  wy: number,
  center: { x: number; y: number },
  baseAngle: number,
  rotationOffset: number,
  isMirrored: boolean
): number => {
  const dx = wx - center.x;
  const dy = wy - center.y;
  if (Math.hypot(dx, dy) < 1e-6) return 0;
  const total = baseAngle + (rotationOffset * Math.PI) / 180;
  const cos = Math.cos(-total);
  const sin = Math.sin(-total);
  let lx = cos * dx - sin * dy;
  let ly = sin * dx + cos * dy;
  if (isMirrored) ly = -ly;
  const hRad = Math.atan2(ly, lx);
  if (hRad > 0) {
    return lx >= 0 ? 0 : 180;
  }
  const deg = (-hRad * 180) / Math.PI;
  return Math.round(Math.max(0, Math.min(180, deg)));
};

const hitTestPlacedProtractor = (
  wx: number,
  wy: number,
  center: { x: number; y: number },
  baseAngle: number,
  scale: number,
  highlightAngle = 45,
  rotationOffset = 0,
  isMirrored = false
): { type: 'rotate' } | { type: 'arm' } | { type: 'move' } | { type: 'miss' } => {
  const r = PROTRACTOR_PLACED_RADIUS;
  const dx = wx - center.x;
  const dy = wy - center.y;
  const dist = Math.hypot(dx, dy);

  // Rotate handle: u pravého konce základny (v lokálu +r,0), se screen prahem.
  const handle = {
    x: center.x + Math.cos(baseAngle) * r,
    y: center.y + Math.sin(baseAngle) * r,
  };
  const handleHit = 26 / scale;
  if (Math.hypot(wx - handle.x, wy - handle.y) <= handleHit) return { type: 'rotate' };

  // Rameno úhlu — kolečko na konci i samotná čára od středu.
  const armEnd = protractorArmEndWorld(center, baseAngle, highlightAngle, rotationOffset, isMirrored, r);
  const armHit = 22 / scale;
  if (Math.hypot(wx - armEnd.x, wy - armEnd.y) <= armHit) return { type: 'arm' };
  const armSeg = distToSegment({ x: wx, y: wy }, center, armEnd);
  if (armSeg.dist <= armHit && armSeg.t > 0.04) return { type: 'arm' };

  // Move: klik do oblasti úhloměru.
  if (dist <= r) return { type: 'move' };
  return { type: 'miss' };
};

type RulerRotationAnchor = { local: { x: number; y: number }; world: { x: number; y: number } } | null;

const pivotWorldFromAnchor = (
  anchorWorld: { x: number; y: number },
  anchorLocal: { x: number; y: number },
  angle: number
) => {
  // world = pivot + R(angle) * ((local - pivotLocal) * s)
  const s = RULER_PLACED_SCALE;
  const dx = (anchorLocal.x - RULER_ROTATION_PIVOT_LOCAL.x) * s;
  const dy = (anchorLocal.y - RULER_ROTATION_PIVOT_LOCAL.y) * s;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return {
    x: anchorWorld.x - (dx * cos - dy * sin),
    y: anchorWorld.y - (dx * sin + dy * cos),
  };
};

const SHAPE_THIN_STROKE_WORLD = 0.28;
/** Modré halo výběru (světové jednotky). */
const SELECTION_GLOW_STROKE_WORLD = 8.5;
/** Modrý obrys výběru (světové jednotky). */
const SELECTION_OUTLINE_STROKE_WORLD = 1.75;

// --- HLAVNÍ KOMPONENTA ---

export function FreeGeometryEditor({
  onBack,
  darkMode,
  onDarkModeChange,
  deviceType: deviceTypeProp,
  sharedRecording,
  embedInAssignment = false,
  initialCanvasSnapshot = null,
  readOnlyCanvas = false,
  submissionSnapshotRef,
  canvasExportRef,
  assignmentToolbarSlot,
  assignmentToolbarRightOffsetPx,
  projectionImageSrc = null,
  projectionEnabled = false,
  projectionOpacity = 0.35,
  autoDetectImageSrc = null,
  autoDetectRequestId = 0,
  overlaySnapshot = null,
}: FreeGeometryEditorProps) {
  const isMobile = useIsMobile();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const bgCanvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const toolbarPanelRef = useRef<HTMLDivElement>(null);
  const rulerDrawButtonsRef = useRef<HTMLDivElement>(null);
  const freeCircleDrawButtonsRef = useRef<HTMLDivElement>(null);
  const circleFixedPopupRef = useRef<HTMLDivElement>(null);
  const segmentPopupRef = useRef<HTMLDivElement>(null);
  const anglePopupRef = useRef<HTMLDivElement>(null);
  const topStandaloneToolbarRef = useRef<HTMLDivElement>(null);
  const topAssignmentToolbarRef = useRef<HTMLDivElement>(null);
  const topAssignmentZoomRef = useRef<HTMLDivElement>(null);
  const animationFrameRef = useRef<number>();
  const projectionImgRef = useRef<{ src: string; img: HTMLImageElement; loaded: boolean } | null>(null);
  const projectionWorldRectRef = useRef<{ src: string; x: number; y: number; w: number; h: number } | null>(null);
  const pointsStateRef = useRef<GeoPoint[]>([]);
  const shapesStateRef = useRef<GeoShape[]>([]);
  const lastHandledAutoDetectIdRef = useRef<number>(0);
  const autoDetectRunningRef = useRef(false);
  const appliedUrlCanvasSnapshotRef = useRef(false);
  /** Po načtení sdíleného plátna v úkolu — zajistí jedno vycentrování při dané velikosti okna / panelu. */
  const assignmentSnapshotFitLayoutKeyRef = useRef<string | null>(null);
  /** Animace posunu středu popisku při změně cílové pozice (ease-out). */
  const labelAnimByPointIdRef = useRef<
    Map<string, { from: { x: number; y: number }; to: { x: number; y: number }; startMs: number }>
  >(new Map());
  /** Stejná animace pro popisky tvarů (přímka, kružnice, …). */
  const shapeLabelAnimByShapeIdRef = useRef<
    Map<string, { from: { x: number; y: number }; to: { x: number; y: number }; startMs: number }>
  >(new Map());

  // Detekce vykon zar zenia - optimalizace pro stare tablety
  const devicePerformance = useMemo(() => detectDevicePerformance(), []);
  const isLowPerformance = devicePerformance === 'low';

  /** Pravítko / kružítko / úhloměr: +10 % času samotného tahu, +20 % času po dokončení tahu (nástroj déle zůstane vidět). */
  const constructionAnimMs = useMemo(() => {
    if (isLowPerformance) {
      return { total: 1100, fadeIn: 200, draw: 660, post: 240 };
    }
    return { total: 2200, fadeIn: 400, draw: 1320, post: 480 };
  }, [isLowPerformance]);

  const animPhase = useMemo(() => {
    const t = constructionAnimMs.total;
    const pIn = constructionAnimMs.fadeIn / t;
    const pDrawEnd = (constructionAnimMs.fadeIn + constructionAnimMs.draw) / t;
    return { pIn, pDrawEnd, totalMs: constructionAnimMs.total };
  }, [constructionAnimMs]);

  // State
  const [deviceType, setDeviceType] = useState<'board' | 'computer' | null>(deviceTypeProp ?? null);
  const [isTabletMode, setIsTabletMode] = useState(deviceTypeProp === 'board');
  const [activeTool, setActiveTool] = useState<ToolType>('move');
  const [points, setPoints] = useState<GeoPoint[]>([]);
  const [shapes, setShapes] = useState<GeoShape[]>([]);
  const [freehandPaths, setFreehandPaths] = useState<FreehandPath[]>([]);
  // const [currentPath, setCurrentPath] = useState<{x: number, y: number}[] | null>(null); // Replaced by ref
  const currentPathRef = useRef<{x: number, y: number}[] | null>(null);
  const lastHighlightPointRef = useRef<{x: number, y: number} | null>(null);
  const [selectedPointId, setSelectedPointId] = useState<string | null>(null); // Pro tvorbu tvarů (první klik)
  const [hoveredPointId, setHoveredPointId] = useState<string | null>(null);
  const [hoveredShape, setHoveredShape] = useState<{ id: string; proj: {x:number, y:number}; angle: number } | null>(null);
  const [draggedPointId, setDraggedPointId] = useState<string | null>(null);
  const [selection, setSelection] = useState<string | null>(null); // Vybraný bod pro editaci/smazání
  const [perpBaseId, setPerpBaseId] = useState<string | null>(null); // Základní čára pro kolmici
  
  // Viewport
  const [scale, setScale] = useState(isMobile ? 0.7 : 1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    pointsStateRef.current = points;
  }, [points]);

  useEffect(() => {
    shapesStateRef.current = shapes;
  }, [shapes]);

  /** Počáteční stav plátna v úkolu (sdílené plátno) — nesmí jít smazat při řešení. */
  const assignmentBaselineProtectedIds = useMemo(() => {
    if (!embedInAssignment || !initialCanvasSnapshot) return EMPTY_ASSIGNMENT_BASELINE_IDS;
    return {
      points: new Set(initialCanvasSnapshot.points.map(p => p.id)),
      shapes: new Set(initialCanvasSnapshot.shapes.map(s => s.id)),
      freehand: new Set((initialCanvasSnapshot.freehandPaths ?? []).map(f => f.id)),
    };
  }, [embedInAssignment, initialCanvasSnapshot]);
  const assignmentBaselineProtectedRef = useRef(assignmentBaselineProtectedIds);
  assignmentBaselineProtectedRef.current = assignmentBaselineProtectedIds;

  // Assets
  const rulerImageRef = useRef<HTMLImageElement | null>(null);
  const rulerHandCursorImageRef = useRef<HTMLImageElement | null>(null);
  const compassImageRef = useRef<HTMLImageElement | null>(null);
  const protractorImageRef = useRef<HTMLImageElement | null>(null);
  const [assetsLoaded, setAssetsLoaded] = useState(false);

  // Animation
  const [animState, setAnimState] = useState<AnimationState>({
    isActive: false,
    type: null,
    startTime: 0,
    p1: null,
    p2: null,
    progress: 0
  });

  const [angleInput, setAngleInput] = useState<AngleInputState>({
    visible: false,
    value: 45,
    vertexId: null,
    directionId: null,
    rotationOffset: 0,
    isMirrored: false
  });

  const [circleInput, setCircleInput] = useState({
    visible: false,
    /** true = submenu „Rozměr“ s pevným poloměrem; false = volná kružnice tažením kružítka */
    fixedRadius: false,
    radius: 5,
    center: null as { x: number; y: number } | null,
    handleAngle: 0, // úhel handle od středu (radiány)
    isDraggingCenter: false,
    isDraggingHandle: false,
    mode: 'circle' as 'point' | 'circle' | 'arc',
    /** Volná kružnice: výběr výseku tažením po obvodu. */
    freeDrawMode: 'idle' as 'idle' | 'pickArc',
    arcDraw: null as { startAngle: number; endAngle: number } | null,
    arcCrosshair: null as { x: number; y: number } | null,
  });
  /** Live pozice při tažení — bez setState každý frame (jinak se seká rAF smyčka). */
  const circleLiveRef = useRef<{
    center: { x: number; y: number };
    radius: number;
    handleAngle: number;
  } | null>(null);

  const [rulerToolState, setRulerToolState] = useState({
    active: false,
    /** Bod otáčení — průsečík nejdelší strany a středové rysky. */
    pivot: null as { x: number; y: number } | null,
    angle: 0,
    isDragging: false,
    drawMode: 'idle' as 'idle' | 'pickEdge',
    drawKind: null as 'line' | 'segment' | 'stroke' | null,
    crosshair: null as { x: number; y: number } | null,
    lineDraw: null as {
      edge: 'base' | 'left' | 'right';
      start: { x: number; y: number };
      end: { x: number; y: number };
    } | null,
  });

  const [segmentInput, setSegmentInput] = useState({
    visible: false,
    length: 5,
    active: false,
    mode: 'free' as 'free' | 'fixed' // Režim: volná úsečka nebo fixní délka
  });

  const [perpTabletState, setPerpTabletState] = useState<{
    step: 'idle' | 'selectLine' | 'positioning';
    selectedLineId: string | null;
    currentPos: {x: number, y: number} | null;
  }>({
    step: 'idle',
    selectedLineId: null,
    currentPos: null
  });

  const [angleTabletState, setAngleTabletState] = useState<{
    step: 'idle' | 'selectLine' | 'positioning';
    selectedLineId: string | null;
    currentPos: {x: number, y: number} | null;
    baseAngle: number;
  }>({
    step: 'idle',
    selectedLineId: null,
    currentPos: null,
    baseAngle: 0
  });

  const [circleTabletState, setCircleTabletState] = useState<{
    active: boolean;
    centerId: string | null;
    center: {x: number, y: number} | null;
    radius: number;
    isDraggingHandle: boolean;
    handlePos: {x: number, y: number} | null;
  }>({
    active: false,
    centerId: null,
    center: null,
    radius: 150, // 3 cm = 3 * 50px
    isDraggingHandle: false,
    handlePos: null
  });

  const mousePosRef = useRef<{x: number, y: number} | null>(null);
  const isPanning = useRef(false);
  const lastPanPos = useRef({ x: 0, y: 0 });
  const circleTabletRadiusRef = useRef<number>(150); // Real-time radius tracking pro smooth rendering
  const circleTabletHandlePosRef = useRef<{x: number, y: number} | null>(null); // Real-time handle position pro smooth rendering
  const nearestIntersectionRef = useRef<{x: number, y: number} | null>(null); // Intersection snap indicator for visual feedback
  const nearestLineSnapRef = useRef<{x: number, y: number} | null>(null); // Line snap indicator for visual feedback (point tool)
  const dragSnapPreviewRef = useRef<{x: number, y: number} | null>(null); // Snap preview during point drag
  const draggedPointIdRef = useRef<string | null>(null); // Mirrors draggedPointId state — no closure staleness
  const draggedPointPosRef = useRef<{x: number, y: number} | null>(null); // Real-time drag position (ref to avoid setPoints on every mousemove)
  const dragUpdateRafRef = useRef<number | null>(null); // RAF handle for throttled setPoints during drag
  const pendingCircleCenterRef = useRef<string | null>(null); // ID of point created as circle center (removed if circle not completed)
  const mouseMoveThrottleRef = useRef(false); // Throttle flag for conditional throttling
  const lastTouchTimeRef = useRef<number>(0); // Timestamp posledniho touch eventu pro prevenci double-tap
  /** Tablet úhel/kolmice ve fázi „vyber linku“: zvýraznění čáry jen po touchmove, ne ze zastaralého hoveredShape */
  const anglePerpLineHoverFromMoveRef = useRef(false);
  const suppressAngleHoverPreviewRef = useRef(false);
  const suppressDrawingToolsForExportRef = useRef(false);
  const renderCanvasRef = useRef<(() => void) | null>(null);
  const rulerDraggingRef = useRef(false);
  const rulerDragModeRef = useRef<'move' | 'rotate' | null>(null);
  const rulerPivotRef = useRef<{ x: number; y: number } | null>(null);
  const rulerAngleRef = useRef(0);
  const rulerDragStartRef = useRef<{
    mouseX: number;
    mouseY: number;
    pivotX: number;
    pivotY: number;
  } | null>(null);
  const rulerRotateStartRef = useRef<{
    mouseAngle: number;
    startAngle: number;
  } | null>(null);
  const rulerRotationAnchorRef = useRef<RulerRotationAnchor>(null);
  const protractorDraggingRef = useRef(false);
  const protractorDragModeRef = useRef<'move' | 'rotate' | 'arm' | null>(null);
  const protractorCenterRef = useRef<{ x: number; y: number } | null>(null);
  const protractorAngleRef = useRef(0);
  const protractorDragStartRef = useRef<{
    mouseX: number;
    mouseY: number;
    centerX: number;
    centerY: number;
  } | null>(null);
  const protractorRotateStartRef = useRef<{
    mouseAngle: number;
    startAngle: number;
  } | null>(null);
  const protractorMoveHoverRef = useRef(false);
  const [protractorMoveHover, setProtractorMoveHover] = useState(false);
  const protractorArmHoverRef = useRef(false);
  const [protractorArmHover, setProtractorArmHover] = useState(false);
  const angleArmHelperPointIdRef = useRef<string | null>(null);
  const keepRulerToolAfterAnimRef = useRef(false);
  const keepCompassToolAfterAnimRef = useRef(false);
  const rulerPendingDrawKindRef = useRef<'line' | 'segment' | 'stroke' | null>(null);
  /** Jednorázová intro animace: ručička pohne pravítkem, aby bylo jasné, že jde posouvat. */
  const rulerIntroRef = useRef<{
    active: boolean;
    startTime: number;
    basePivot: { x: number; y: number } | null;
    baseAngle: number;
    handPos: { x: number; y: number } | null;
  }>({
    active: false,
    startTime: 0,
    basePivot: null,
    baseAngle: 0,
    handPos: null,
  });
  const rulerLineDrawRef = useRef<{
    edge: 'base' | 'left' | 'right';
    start: { x: number; y: number };
    end: { x: number; y: number };
  } | null>(null);
  const circleArcDrawRef = useRef<{
    startAngle: number;
    endAngle: number;
    lastAngle: number;
  } | null>(null);

  const stopRulerIntroAnimation = (commitCurrent = false) => {
    const intro = rulerIntroRef.current;
    if (!intro.active) return;
    const pivot = commitCurrent
      ? (rulerPivotRef.current ?? intro.basePivot)
      : intro.basePivot;
    const angle = commitCurrent ? rulerAngleRef.current : intro.baseAngle;
    intro.active = false;
    intro.startTime = 0;
    intro.basePivot = null;
    intro.handPos = null;
    if (pivot) {
      rulerPivotRef.current = pivot;
      rulerAngleRef.current = angle;
      setRulerToolState(prev => ({
        ...prev,
        pivot,
        angle,
      }));
    }
  };

  const resetPlacedRuler = () => {
    rulerIntroRef.current = {
      active: false,
      startTime: 0,
      basePivot: null,
      baseAngle: 0,
      handPos: null,
    };
    rulerDraggingRef.current = false;
    rulerDragModeRef.current = null;
    rulerPivotRef.current = null;
    rulerDragStartRef.current = null;
    rulerRotateStartRef.current = null;
    rulerRotationAnchorRef.current = null;
    rulerLineDrawRef.current = null;
    rulerPendingDrawKindRef.current = null;
    rulerRotateHoverRef.current = false;
    rulerRotateCornerRef.current = null;
    rulerMoveHoverRef.current = false;
    setRulerRotateHover(false);
    setRulerMoveHover(false);
    setRulerToolState({
      active: false,
      pivot: null,
      angle: 0,
      isDragging: false,
      drawMode: 'idle',
      drawKind: null,
      crosshair: null,
      lineDraw: null,
    });
  };

  const resetPlacedProtractor = () => {
    protractorDraggingRef.current = false;
    protractorDragModeRef.current = null;
    protractorCenterRef.current = null;
    protractorAngleRef.current = 0;
    protractorDragStartRef.current = null;
    protractorRotateStartRef.current = null;
    protractorMoveHoverRef.current = false;
    setProtractorMoveHover(false);
    protractorArmHoverRef.current = false;
    setProtractorArmHover(false);
    removeAngleArmHelperPoint();
    setAngleInput(prev =>
      prev.visible || prev.customVertex
        ? {
            ...prev,
            visible: false,
            customVertex: undefined,
            baseAngle: undefined,
            vertexId: null,
            directionId: null,
          }
        : prev
    );
  };

  const resetPlacedCompass = () => {
    circleArcDrawRef.current = null;
    setCircleInput(prev => ({
      ...prev,
      visible: false,
      fixedRadius: false,
      center: null,
      isDraggingCenter: false,
      isDraggingHandle: false,
      freeDrawMode: 'idle',
      arcDraw: null,
      arcCrosshair: null,
    }));
    setCircleTabletState({
      active: false,
      centerId: null,
      center: null,
      radius: 150,
      isDraggingHandle: false,
      handlePos: null,
    });
    circleCenterHoverRef.current = false;
    setCircleCenterHover(false);
    circleHandleHoverRef.current = false;
    circleLiveRef.current = null;
    keepCompassToolAfterAnimRef.current = false;
  };

  const selectSidebarTool = (toolId: string) => {
    resetPlacedRuler();
    if (toolId === 'angle') {
      // Při každém kliknutí na úhloměr v bočním panelu znovu umístit doprostřed plátna
      // (musí fungovat i když už je activeTool === 'angle', takže nespoléhat jen na useEffect).
      if (canvasSize.width >= 8 && canvasSize.height >= 8) {
        const cx = (canvasSize.width / 2 - offset.x) / scale;
        const cy = (canvasSize.height / 2 - offset.y) / scale;
        protractorCenterRef.current = { x: cx, y: cy };
      } else {
        protractorCenterRef.current = null;
      }
      protractorAngleRef.current = 0;
      setAngleInput(prev => ({
        ...prev,
        visible: true,
        customVertex: protractorCenterRef.current ?? prev.customVertex,
        baseAngle: 0,
        vertexId: null,
        directionId: null,
      }));
      setHoveredShape(null);
    } else {
      resetPlacedProtractor();
    }
    if (toolId !== 'circle' && toolId !== '__popup__circle_fixed') {
      resetPlacedCompass();
    }
    handleToolMenuClick(
      toolId,
      setCircleInput,
      setActiveTool,
      setSelectedPointId,
      setActiveGroup,
      setSegmentInput,
      setPerpTabletState,
      isTabletMode,
      setCircleTabletState
    );
  };

  /** Skrýt volné pravítko a kružítko (např. při otevření jiné skupiny nástrojů). */
  const dismissPlacedDrawingTools = () => {
    resetPlacedRuler();
    resetPlacedProtractor();
    resetPlacedCompass();
    setPerpTabletState({ step: 'idle', selectedLineId: null, currentPos: null });
    anglePerpLineHoverFromMoveRef.current = false;
    setHoveredShape(null);
    // Pokud uživatel klikne do bočního panelu, umístěné pomůcky nesmí „znovu naskočit“
    // (u úhloměru/kolmice to jinak udělá auto-efekt, pokud activeTool zůstane aktivní).
    setActiveTool(prev =>
      prev === 'circle' || prev === 'triangleRuler' || prev === 'angle' || prev === 'perpendicular'
        ? 'move'
        : prev
    );
    setSelectedPointId(null);
  };

  const openToolSubmenu = (groupId: string, isMenuOpen: boolean) => {
    const opening = !isMenuOpen;
    setActiveGroup(opening ? groupId : null);
    // Jakýkoliv klik do bočního panelu nástrojů má „uklidit“ umístěné pomůcky,
    // aby úhloměr/pravítko nezůstávaly vidět při přepnutí či zavření menu.
    dismissPlacedDrawingTools();
  };

  const rulerRotateHoverRef = useRef(false);
  const rulerRotateCornerRef = useRef<RulerRotateCornerId | null>(null);
  const rulerMoveHoverRef = useRef(false);
  const [rulerRotateHover, setRulerRotateHover] = useState(false);
  const [rulerMoveHover, setRulerMoveHover] = useState(false);
  const circleCenterHoverRef = useRef(false);
  const [circleCenterHover, setCircleCenterHover] = useState(false);
  const circleHandleHoverRef = useRef(false);

  // Circle tool / popup „Rozměr“: kružítko uprostřed plátna při aktivaci.
  useEffect(() => {
    if (!circleInput.visible) return;
    if (circleInput.center) return;
    if (activeTool !== 'circle' && !circleInput.fixedRadius) return;

    const p = {
      x: (canvasSize.width / 2 - offset.x) / scale,
      y: (canvasSize.height / 2 - offset.y) / scale,
    };

    setCircleInput(prev => ({
      ...prev,
      center: { x: p.x, y: p.y },
      radius: prev.fixedRadius ? prev.radius : 3,
      handleAngle: prev.fixedRadius ? prev.handleAngle : 0,
    }));
  }, [activeTool, circleInput.visible, circleInput.center, circleInput.fixedRadius, canvasSize.width, canvasSize.height, offset.x, offset.y, scale]);

  // Nástroj Pravítko: po výběru zobraz trojúhelníkové pravítko uprostřed plátna.
  useEffect(() => {
    if (activeTool !== 'triangleRuler') {
      resetPlacedRuler();
      return;
    }
    setRulerToolState(prev => {
      if (prev.active && prev.pivot) return prev;
      const cx = (canvasSize.width / 2 - offset.x) / scale;
      const cy = (canvasSize.height / 2 - offset.y) / scale;
      const pivot = { x: cx, y: cy };
      rulerPivotRef.current = pivot;
      rulerAngleRef.current = 0;
      return {
        active: true,
        pivot,
        angle: 0,
        isDragging: false,
        drawMode: 'idle',
        drawKind: null,
        crosshair: null,
        lineDraw: null,
      };
    });
  }, [activeTool, canvasSize.width, canvasSize.height, offset.x, offset.y, scale]);

  // Nástroj Úhloměr: po výběru zobraz úhloměr uprostřed plátna (jako umístěný nástroj).
  useEffect(() => {
    if (activeTool !== 'angle') {
      resetPlacedProtractor();
      return;
    }
    if (canvasSize.width < 8 || canvasSize.height < 8) return;

    const cx = (canvasSize.width / 2 - offset.x) / scale;
    const cy = (canvasSize.height / 2 - offset.y) / scale;
    if (!protractorCenterRef.current) {
      protractorCenterRef.current = { x: cx, y: cy };
    }
    const center = protractorCenterRef.current;
    // Otevři panel úhloměru a naváž ho na umístěný úhloměr.
    setAngleInput(prev => ({
      ...prev,
      visible: true,
      customVertex: center,
      baseAngle: protractorAngleRef.current,
      vertexId: null,
      directionId: null,
    }));
  }, [activeTool, canvasSize.width, canvasSize.height, offset.x, offset.y, scale]);

  // Pomocný bod na konci ramene úhloměru — sleduje velikost úhlu, po narýsování zmizí.
  useEffect(() => {
    syncAngleArmHelperPoint();
  }, [
    activeTool,
    angleInput.value,
    angleInput.rotationOffset,
    angleInput.isMirrored,
    angleInput.customVertex,
    angleInput.baseAngle,
    animState.isActive,
    animState.type,
  ]);

  // Kružítko: skrýt při přepnutí na jiný nástroj (záloha pro setActiveTool mimo boční panel).
  useEffect(() => {
    if (activeTool === 'circle') return;
    if (
      !circleInput.visible &&
      !circleInput.center &&
      circleInput.freeDrawMode === 'idle' &&
      !circleTabletState.active
    ) {
      return;
    }
    resetPlacedCompass();
  }, [activeTool]);

  const pinchRef = useRef<{ active: boolean; lastDist: number; lastCenter: { x: number; y: number } }>({ active: false, lastDist: 0, lastCenter: { x: 0, y: 0 } });
  const [visualEffects, setVisualEffects] = useState<VisualEffect[]>([]);
  const [activeGroup, setActiveGroup] = useState<string | null>(null);
  const [showMeasurements, setShowMeasurements] = useState(false); // Toggle pro zobrazení měření - defaultně vypnuté
  const [showGrid, setShowGrid] = useState(false);
  const canvasWarningTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [canvasWarning, setCanvasWarning] = useState<string | null>(null);

  // Highlight color (for highlighter + highlighterStraight)
  const HIGHLIGHT_COLORS = useMemo(() => ([
    { id: 'yellow', label: 'Žlutá', rgba: 'rgba(250, 204, 21, 0.4)', swatch: '#facc15' },
    { id: 'green', label: 'Zelená', rgba: 'rgba(34, 197, 94, 0.35)', swatch: '#22c55e' },
    { id: 'blue', label: 'Modrá', rgba: 'rgba(59, 130, 246, 0.30)', swatch: '#3b82f6' },
    { id: 'pink', label: 'Růžová', rgba: 'rgba(236, 72, 153, 0.30)', swatch: '#ec4899' },
  ] as const), []);
  type HighlightColorId = typeof HIGHLIGHT_COLORS[number]['id'];
  const [highlightColorId, setHighlightColorId] = useState<HighlightColorId>('yellow');
  const [showHighlightPalette, setShowHighlightPalette] = useState(false);

  const highlightColor = useMemo(() => {
    return HIGHLIGHT_COLORS.find(c => c.id === highlightColorId) ?? HIGHLIGHT_COLORS[0];
  }, [HIGHLIGHT_COLORS, highlightColorId]);

  // Use a ref for immediate updates (avoid 1-frame lag in preview strokes).
  const highlightColorRgbaRef = useRef<string>(highlightColor.rgba);
  useEffect(() => {
    highlightColorRgbaRef.current = highlightColor.rgba;
  }, [highlightColor.rgba]);

  useEffect(() => {
    // Close palette when leaving highlight tools.
    if (activeTool !== 'highlighter' && activeTool !== 'highlighterStraight') {
      if (showHighlightPalette) setShowHighlightPalette(false);
    }
  }, [activeTool, showHighlightPalette]);
  
  const showCanvasWarning = (msg: string) => {
    if (canvasWarningTimerRef.current) clearTimeout(canvasWarningTimerRef.current);
    setCanvasWarning(msg);
    canvasWarningTimerRef.current = setTimeout(() => setCanvasWarning(null), 2500);
  };
  
  // Výběr tvarů, laso a group drag
  const [selectedShapeIds, setSelectedShapeIds] = useState<string[]>([]);
  const [selectedFreehandIds, setSelectedFreehandIds] = useState<string[]>([]);

  /** Po narýsování nového objektu zrušit výběr — nový tvar/bod nemá být „aktivní“. */
  const clearSelectionAfterPlacement = useCallback(() => {
    setSelection(null);
    setSelectedShapeIds([]);
    setSelectedFreehandIds([]);
  }, []);

  const [hoveredShapeForMove, setHoveredShapeForMove] = useState<string | null>(null);
  const marqueeRef = useRef<{startX: number, startY: number, endX: number, endY: number} | null>(null);
  const groupDragRef = useRef<{ startWx: number; startWy: number; pointSnapshots: {id: string; x: number; y: number}[] } | null>(null);
  const groupDragLiveRef = useRef<Map<string, { x: number; y: number }> | null>(null);
  const prevActiveToolRef = useRef<ToolType>('move');

  const PIXELS_PER_CM = 50; // Základní jednotka: 50px = 1cm (odpovídá mřížce)
  /** Kolmý odstup popisku písmena od čáry/kružnice — ve světě = px / scale (jako u bodů) */
  const SHAPE_LABEL_PAD_SCREEN_PX = 18;
  /** Výsek z režimu Kružítko–rozměr: cca 5 % obvodu (+5 %) kolem zvoleného směru (bod na obvodu). */
  const COMPASS_ARC_FRACTION = 0.05 * 1.05;
  const COMPASS_ARC_SPAN_RAD = 2 * Math.PI * COMPASS_ARC_FRACTION;

  // Historie pro undo/redo
  const [history, setHistory] = useState<{points: GeoPoint[], shapes: GeoShape[], freehandPaths: FreehandPath[], constructionSteps: ConstructionStep[], constructionCounter: number}[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);

  // Zápis konstrukce
  const [constructionSteps, setConstructionSteps] = useState<ConstructionStep[]>([]);
  const [showConstructionPanel, setShowConstructionPanel] = useState(false);
  const constructionStepCounter = useRef(0);

  // Nahrávání a přehrávání
  const [recordingState, setRecordingState] = useState<RecordingState>({
    isRecording: false,
    steps: [],
    currentStepIndex: -1,
    showEditor: false,
    showPlayer: false
  });
  const [editableSteps, setEditableSteps] = useState<RecordedStep[]>([]);
  const [showCloseConfirm, setShowCloseConfirm] = useState(false);
  const [showRenameModal, setShowRenameModal] = useState(false);
  const [circleRadiusDraft, setCircleRadiusDraft] = useState<string>('');
  const [segmentLengthDraft, setSegmentLengthDraft] = useState<string>('');

  const toolbarPanelScale = useFitPanelScale(
    toolbarPanelRef,
    [embedInAssignment, selectedShapeIds.length, activeGroup, selection],
    { verticalPadding: 12, horizontalPadding: 28 }
  );
  const rulerDrawButtonsScale = useFitPanelScale(
    rulerDrawButtonsRef,
    [rulerToolState.drawMode, rulerToolState.drawKind],
    { verticalPadding: 100, horizontalPadding: 8, enabled: activeTool === 'triangleRuler' && rulerToolState.active }
  );
  const freeCircleDrawButtonsScale = useFitPanelScale(
    freeCircleDrawButtonsRef,
    [circleInput.freeDrawMode],
    { verticalPadding: 100, horizontalPadding: 8, enabled: circleInput.visible && !circleInput.fixedRadius && !!circleInput.center }
  );
  const circleFixedPopupScale = useFitPanelScale(
    circleFixedPopupRef,
    [circleInput.radius, circleInput.center],
    { verticalPadding: 72, horizontalPadding: 32, enabled: circleInput.visible && circleInput.fixedRadius }
  );
  const segmentPopupScale = useFitPanelScale(
    segmentPopupRef,
    [segmentInput.length],
    { verticalPadding: 72, horizontalPadding: 32, enabled: segmentInput.visible }
  );
  const anglePopupScale = useFitPanelScale(
    anglePopupRef,
    [angleInput.value],
    { verticalPadding: 72, horizontalPadding: 32, enabled: angleInput.visible }
  );
  const topStandaloneToolbarScale = useFitPanelScale(
    topStandaloneToolbarRef,
    [
      historyIndex,
      history.length,
      showConstructionPanel,
      recordingState.isRecording,
      constructionSteps.length,
      showMeasurements,
      showGrid,
      isTabletMode,
      scale,
      canvasExportRef,
    ],
    {
      verticalPadding: 16,
      horizontalPadding: 100,
      enabled: !embedInAssignment && !recordingState.showPlayer && !readOnlyCanvas,
    }
  );
  const topAssignmentToolbarScale = useFitPanelScale(
    topAssignmentToolbarRef,
    [historyIndex, history.length, assignmentToolbarRightOffsetPx],
    {
      verticalPadding: 16,
      horizontalPadding: (assignmentToolbarRightOffsetPx ?? 16) + 16,
      enabled: embedInAssignment && !recordingState.showPlayer && !readOnlyCanvas,
    }
  );
  const topAssignmentZoomScale = useFitPanelScale(
    topAssignmentZoomRef,
    [showMeasurements, showGrid, isTabletMode, scale, assignmentToolbarRightOffsetPx],
    {
      verticalPadding: 16,
      horizontalPadding: (assignmentToolbarRightOffsetPx ?? 16) + 100,
      enabled: embedInAssignment && !recordingState.showPlayer,
    }
  );

  /** Dolní panely (výběr / rýsování) — info tipy a toasty musí jít nad ně. */
  const showBottomSelectionBar =
    !recordingState.showPlayer &&
    ((((selection || selectedShapeIds.length > 0) && !selectedFreehandIds.length) ||
      activeTool === 'highlighter' ||
      activeTool === 'highlighterStraight'));
  const showBottomDrawButtons =
    !recordingState.showPlayer &&
    !animState.isActive &&
    ((circleInput.visible && !circleInput.fixedRadius && !!circleInput.center) ||
      (activeTool === 'triangleRuler' && rulerToolState.active));
  const bottomChromeOffsetPx = showBottomDrawButtons
    ? 150
    : showBottomSelectionBar
      ? 100
      : 24;

  useEffect(() => {
    const value = `calc(${bottomChromeOffsetPx}px + env(safe-area-inset-bottom, 0px))`;
    document.documentElement.style.setProperty('--geometry-bottom-chrome', value);
    return () => {
      document.documentElement.style.removeProperty('--geometry-bottom-chrome');
    };
  }, [bottomChromeOffsetPx]);

  const [renameDraft, setRenameDraft] = useState<{
    pointIds: string[];
    shapeIds: string[];
    pointsById: Record<string, string>;
    shapesById: Record<string, string>;
  }>({
    pointIds: [],
    shapeIds: [],
    pointsById: {},
    shapesById: {},
  });
  const previousStateRef = useRef<{points: GeoPoint[], shapes: GeoShape[], freehandPaths: FreehandPath[]} | null>(null);
  const pendingToolVisualizationRef = useRef<RecordedStep['toolVisualization']>(undefined);
  const playbackAnimationTimeoutRef = useRef<number | null>(null);
  const recordingDebounceTimeoutRef = useRef<number | null>(null);

  // Sharing state
  const [recordingName, setRecordingName] = useState('');
  const [isSavingRecording, setIsSavingRecording] = useState(false);
  const [shareLink, setShareLink] = useState<string | null>(null);

  /** Předloha z volného režimu (bez `embedInAssignment`); z úkolu řídí rodič přes props. */
  const [freeProjection, setFreeProjection] = useState<{
    src: string;
    enabled: boolean;
    opacity: number;
  } | null>(null);
  const [showBackgroundImageDialog, setShowBackgroundImageDialog] = useState(false);
  const [backgroundImageDraft, setBackgroundImageDraft] = useState<string | null>(null);
  const [backgroundImageDraftOpacity, setBackgroundImageDraftOpacity] = useState(0.35);
  const backgroundImageInputRef = useRef<HTMLInputElement>(null);

  const effectiveProjectionSrc = embedInAssignment ? projectionImageSrc : (freeProjection?.src ?? null);
  const effectiveProjectionEnabled = embedInAssignment
    ? projectionEnabled
    : Boolean(freeProjection?.enabled && freeProjection?.src);
  const effectiveProjectionOpacity = embedInAssignment
    ? projectionOpacity
    : (freeProjection?.opacity ?? 0.35);

  const formatCmInput = (v: number) =>
    Number.isFinite(v) ? v.toFixed(1).replace('.', ',') : '';
  const parseCmInput = (raw: string): number | null => {
    const t = raw.trim();
    if (!t) return null;
    const normalized = t.replace(',', '.');
    const n = Number(normalized);
    return Number.isFinite(n) ? n : NaN;
  };

  useEffect(() => {
    if (circleInput.visible && circleInput.fixedRadius) {
      setCircleRadiusDraft(formatCmInput(circleInput.radius));
    }
  }, [circleInput.visible, circleInput.fixedRadius, circleInput.radius]);

  useEffect(() => {
    if (segmentInput.visible) setSegmentLengthDraft(formatCmInput(segmentInput.length));
  }, [segmentInput.visible]);

  useEffect(() => {
    if (!showRenameModal) return;

    const relevantPointIds = new Set<string>();
    const relevantShapes: typeof shapes = [];

    if (selection) {
      relevantPointIds.add(selection);
      shapes.forEach(s => {
        if (s.points.includes(selection)) {
          relevantShapes.push(s);
          s.points.forEach(pid => relevantPointIds.add(pid));
        }
      });
    }
    selectedShapeIds.forEach(sid => {
      const s = shapes.find(sh => sh.id === sid);
      if (s) {
        relevantShapes.push(s);
        s.points.forEach(pid => relevantPointIds.add(pid));
      }
    });

    const uniqueShapeIds = [
      ...new Set(relevantShapes.filter(s => s.type !== 'segment').map(s => s.id)),
    ];
    // Rename intent:
    // - If a point is selected and there are NO explicitly selected shapes, prefer renaming the point
    //   (even if multiple shapes pass through it).
    // - If shapes are explicitly selected, rename shapes.
    const renamePointOnly = Boolean(selection && selectedShapeIds.length === 0);
    const pointIds = renamePointOnly
      ? (points.some(p => p.id === selection) ? [selection] : [])
      : [];
    const shapeIds = renamePointOnly ? [] : uniqueShapeIds;

    const pointsById: Record<string, string> = {};
    for (const pid of pointIds) {
      const p = points.find(pp => pp.id === pid);
      if (p) pointsById[pid] = p.label;
    }
    const shapesById: Record<string, string> = {};
    for (const sid of shapeIds) {
      const s = shapes.find(ss => ss.id === sid);
      if (s) shapesById[sid] = s.label;
    }

    setRenameDraft({
      pointIds,
      shapeIds,
      pointsById,
      shapesById,
    });
  }, [showRenameModal]);

  const openBackgroundImageDialog = () => {
    if (!embedInAssignment && freeProjection?.src) {
      setBackgroundImageDraft(freeProjection.src);
      setBackgroundImageDraftOpacity(freeProjection.opacity);
    } else {
      setBackgroundImageDraft(null);
      setBackgroundImageDraftOpacity(0.35);
    }
    setShowBackgroundImageDialog(true);
  };

  const onPickBackgroundFile = (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast.error('Vyber obrázek (JPG, PNG, …)');
      return;
    }
    if (file.size > MAX_BACKGROUND_IMAGE_BYTES) {
      toast.error('Obrázek je moc velký (max. cca 1,5 MB)');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setBackgroundImageDraft(reader.result as string);
    reader.readAsDataURL(file);
  };

  const confirmBackgroundImage = () => {
    if (!backgroundImageDraft?.trim()) {
      toast.error('Nejdřív vyber obrázek.');
      return;
    }
    setFreeProjection({
      src: backgroundImageDraft,
      enabled: true,
      opacity: Math.max(0.05, Math.min(0.95, backgroundImageDraftOpacity)),
    });
    projectionWorldRectRef.current = null;
    setShowBackgroundImageDialog(false);
    toast.success('Předloha je promítnuta na plátno.');
  };

  const hideFreeProjectionFromCanvas = () => {
    setFreeProjection(prev => (prev ? { ...prev, enabled: false } : null));
    setShowBackgroundImageDialog(false);
    toast.message('Předloha je skrytá.');
  };

  const removeFreeProjection = () => {
    setFreeProjection(null);
    setBackgroundImageDraft(null);
    projectionWorldRectRef.current = null;
    setShowBackgroundImageDialog(false);
    toast.message('Předloha byla odstraněna.');
  };

  useEffect(() => {
    if (!showBackgroundImageDialog || embedInAssignment) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShowBackgroundImageDialog(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [showBackgroundImageDialog, embedInAssignment]);

  // Auto-start player when sharedRecording is provided
  useEffect(() => {
    if (sharedRecording && sharedRecording.steps.length > 0) {
      setRecordingState({
        isRecording: false,
        steps: sharedRecording.steps as RecordedStep[],
        currentStepIndex: -1,
        showEditor: false,
        showPlayer: true
      });
      // Clear canvas for playback
      setPoints([]);
      setShapes([]);
      setFreehandPaths([]);
    }
  }, [sharedRecording]);

  useEffect(() => {
    if (readOnlyCanvas) setActiveTool('pan');
  }, [readOnlyCanvas]);

  useEffect(() => {
    if (sharedRecording && sharedRecording.steps.length > 0) return;
    if (!initialCanvasSnapshot) return;
    setPoints(initialCanvasSnapshot.points);
    setShapes(initialCanvasSnapshot.shapes);
    setFreehandPaths(initialCanvasSnapshot.freehandPaths ?? []);
  }, [sharedRecording, initialCanvasSnapshot]);

  useEffect(() => {
    if (appliedUrlCanvasSnapshotRef.current) return;
    if (sharedRecording && sharedRecording.steps.length > 0) return;

    const encoded = new URLSearchParams(window.location.search).get('canvas');
    if (!encoded) return;

    const payload = decodeCanvasSharePayload(encoded);
    appliedUrlCanvasSnapshotRef.current = true;
    if (!payload) {
      toast.error('Sdílené plátno se nepodařilo načíst (neplatný odkaz).');
      return;
    }

    setPoints(payload.snapshot.points);
    setShapes(payload.snapshot.shapes);
    setFreehandPaths(payload.snapshot.freehandPaths ?? []);
  }, [sharedRecording]);

  const shareCanvasSnapshot = useCallback(async () => {
    const payload: CanvasSharePayloadV1 = {
      v: 1,
      snapshot: {
        points: JSON.parse(JSON.stringify(points)) as GeoPoint[],
        shapes: JSON.parse(JSON.stringify(shapes)) as GeoShape[],
        freehandPaths: JSON.parse(JSON.stringify(freehandPaths)) as FreehandPath[],
      },
    };

    const encoded = encodeCanvasSharePayload(payload);
    const url = new URL(window.location.href);
    url.searchParams.set('canvas', encoded);
    url.searchParams.delete('recording');

    const link = url.toString();

    try {
      await navigator.clipboard.writeText(link);
      toast.success('Odkaz na plátno zkopírován do schránky.');
    } catch {
      // Fallback: allow manual copy (e.g. older iOS / insecure context)
      window.prompt('Zkopírujte odkaz na sdílení plátna:', link);
    }
  }, [freehandPaths, points, shapes]);

  useEffect(() => {
    if (!submissionSnapshotRef) return;
    submissionSnapshotRef.current = () => {
      try {
        return {
          points: JSON.parse(JSON.stringify(points)) as GeoPoint[],
          shapes: JSON.parse(JSON.stringify(shapes)) as GeoShape[],
          freehandPaths: JSON.parse(JSON.stringify(freehandPaths)) as FreehandPath[],
        };
      } catch {
        return null;
      }
    };
    return () => {
      submissionSnapshotRef.current = null;
    };
  }, [points, shapes, freehandPaths, submissionSnapshotRef]);

  useEffect(() => {
    if (!canvasExportRef) return;
    canvasExportRef.current = () => {
      const canvas = canvasRef.current;
      if (!canvas) return null;
      const dpr = isLowPerformance ? 1 : (window.devicePixelRatio || 1);
      suppressDrawingToolsForExportRef.current = true;
      renderCanvasRef.current?.();
      const exportCanvas = cropCanvasToGeometryBounds(
        canvas,
        { points, shapes, freehandPaths },
        offset,
        scale,
        dpr,
      );
      suppressDrawingToolsForExportRef.current = false;
      renderCanvasRef.current?.();
      return exportCanvas;
    };
    return () => {
      canvasExportRef.current = null;
    };
  }, [canvasExportRef, points, shapes, freehandPaths, offset, scale, isLowPerformance]);

  // Save recording to server
  const saveRecordingToServer = async (name: string, steps: RecordedStep[]) => {
    setIsSavingRecording(true);
    try {
      const res = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-b149bbbb/recordings`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${publicAnonKey}`,
          },
          body: JSON.stringify({
            name,
            steps,
            deviceType: deviceType || 'computer'
          })
        }
      );
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `Server error (${res.status})`);
      }
      const data = await res.json();
      const link = `${window.location.origin}${window.location.pathname}?recording=${data.id}`;
      setShareLink(link);
      toast.success('Zaznam ulozen a pripraveny ke sdileni!');
      return data.id;
    } catch (e: any) {
      console.error('Failed to save recording:', e);
      toast.error(`Chyba pri ukladani: ${e.message}`);
      return null;
    } finally {
      setIsSavingRecording(false);
    }
  };

  // Tisk - zachytit finalni konstrukci a zobrazit se zapisem
  const handlePrint = async () => {
    const steps = recordingState.steps;
    if (steps.length === 0) return;

    // Skocit na posledni krok - zobrazit finalni stav
    const lastIndex = steps.length - 1;
    const lastStep = steps[lastIndex];
    setRecordingState(prev => ({ ...prev, currentStepIndex: lastIndex }));
    setPoints(lastStep.snapshot.points);
    setShapes(lastStep.snapshot.shapes);
    setFreehandPaths(lastStep.snapshot.freehandPaths || []);
    // Zrusit animaci
    setAnimState({
      isActive: false,
      type: null,
      startTime: 0,
      p1: null,
      p2: null,
      progress: 0
    });

    // Pockat na vykresleni canvasu
    await new Promise(resolve => setTimeout(resolve, 600));

    const canvas = canvasRef.current;
    if (!canvas) {
      toast.error('Canvas neni dostupny');
      return;
    }
    const imageDataUrl = canvas.toDataURL('image/png');

    // Sestavit HTML kroků - použít constructionSteps s LaTeX notací
    const title = recordingName.trim() || 'Konstrukce';
    const renderLatex = (math: string): string => {
      try {
        return katex.renderToString(math, { throwOnError: false, displayMode: false, strict: false });
      } catch { return math; }
    };

    // Použít recording steps s jejich notation (LaTeX) a description
    const stepsHtml = steps.map((step, i) => {
      const hasNotation = step.notation && step.notation.trim();
      const latexHtml = hasNotation ? renderLatex(step.notation!) : '';
      const desc = step.description || `Krok ${i + 1}`;
      return `<tr>
        <td style="padding:8px 12px 8px 0;font-weight:bold;color:#6366f1;vertical-align:top;white-space:nowrap;font-size:15px">${i + 1}.</td>
        <td style="padding:8px 0;vertical-align:top">
          ${hasNotation ? `<div style="font-size:16px;line-height:1.6">${latexHtml}</div>` : ''}
          <div style="font-size:${hasNotation ? '12' : '14'}px;color:${hasNotation ? '#94a3b8' : '#1a1a2e'};${hasNotation ? 'margin-top:2px' : ''}">${desc}</div>
        </td>
      </tr>`;
    }).join('');

    const stepCount = steps.length;

    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      toast.error('Nelze otevrit tiskove okno (povolte vyskakovaci okna)');
      return;
    }
    printWindow.document.write(`<!DOCTYPE html>
<html><head><title>${title} - Tisk</title>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.css" crossorigin="anonymous">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Segoe UI', system-ui, -apple-system, sans-serif; padding: 24px; color: #1a1a2e; }
  .header { text-align: center; margin-bottom: 24px; padding-bottom: 16px; border-bottom: 2px solid #e2e8f0; }
  .header h1 { font-size: 22px; color: #1e1b4b; margin-bottom: 4px; }
  .header .meta { font-size: 12px; color: #94a3b8; }
  .content { display: flex; gap: 32px; align-items: flex-start; }
  .canvas-section { flex: 3; }
  .canvas-section img { width: 100%; border: 1px solid #e2e8f0; border-radius: 8px; }
  .steps-section { flex: 2; }
  .steps-section h2 { font-size: 16px; color: #4338ca; margin-bottom: 12px; padding-bottom: 8px; border-bottom: 1px solid #e2e8f0; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  tr:not(:last-child) td { border-bottom: 1px solid #f1f5f9; }
  .katex { font-size: 1.1em !important; }
  @media print {
    body { padding: 10mm; }
    .content { gap: 20px; }
  }
  @page { size: landscape; margin: 10mm; }
</style>
</head><body>
  <div class="header">
    <h1>${title}</h1>
    <div class="meta">${new Date().toLocaleDateString('cs-CZ')} | ${stepCount} krok${stepCount === 1 ? '' : stepCount <= 4 ? 'y' : 'ů'}</div>
  </div>
  <div class="content">
    <div class="canvas-section">
      <img src="${imageDataUrl}" alt="Konstrukce" />
    </div>
    <div class="steps-section">
      <h2>Zápis konstrukce</h2>
      <table>${stepsHtml}</table>
    </div>
  </div>
</body></html>`);
    printWindow.document.close();
    // Pockat na nacteni obrazku a pak tisknout
    setTimeout(() => { printWindow.focus(); printWindow.print(); }, 400);
  };

  const getIcon = (icon: any) => {
    if (!icon) return null;
    if (typeof icon === 'object' && 'default' in icon) return icon.default;
    return icon;
  };

  // Funkce pro získání ikony nástroje podle typu akce
  const getActionIcon = (actionType: string) => {
    switch(actionType) {
      case 'create-point': return <Dot className="size-4" />;
      case 'create-segment': return <Minus className="size-4" />;
      case 'create-line': return <ArrowUpDown className="size-4" />;
      case 'create-line-dashed': return <ArrowUpDown className="size-4" />;
      case 'create-line-dashdot': return <ArrowUpDown className="size-4" />;
      case 'create-ray': return <ArrowRight className="size-4" />;
      case 'create-circle': return <Circle className="size-4" />;
      case 'create-angle': return <span className="text-xs font-bold">∠</span>;
      case 'move-point': return <MoveDiagonal className="size-4" />;
      case 'delete': return <Trash2 className="size-4" />;
      case 'freehand': return <Pencil className="size-4" />;
      default: return <Dot className="size-4" />;
    }
  };

  const applyLineStyle = (
    ctx: CanvasRenderingContext2D,
    style: 'solid' | 'dashed' | 'dashdot',
    scaleForDash: number = 1
  ) => {
    if (style === 'solid') {
      ctx.setLineDash([]);
      return;
    }
    if (style === 'dashed') {
      ctx.setLineDash([12 / scaleForDash, 8 / scaleForDash]);
      return;
    }
    // čerchovaná: čárka–mezera–tečka–mezera
    ctx.setLineDash([12 / scaleForDash, 7 / scaleForDash, 2 / scaleForDash, 7 / scaleForDash]);
  };

  const isPointLocked = (pointId: string): boolean => {
    const p = pointsStateRef.current.find(pt => pt.id === pointId);
    if (p?.locked) return true;
    // If the point belongs to any locked shape, treat it as locked for movement.
    return shapesStateRef.current.some(s => s.locked && s.points?.includes(pointId));
  };

  const areAnyPointsLocked = (pointIds: Iterable<string>): boolean => {
    for (const id of pointIds) {
      if (isPointLocked(id)) return true;
    }
    return false;
  };

  const isAnySelectedShapeLocked = (): boolean =>
    selectedShapeIds.some(id => shapesStateRef.current.find(s => s.id === id)?.locked);

  const getSelectionLockState = (): 'none' | 'locked' | 'unlocked' | 'mixed' => {
    const hasPoint = Boolean(selection);
    const hasShapes = selectedShapeIds.length > 0;
    if (!hasPoint && !hasShapes) return 'none';
    if (hasPoint && !hasShapes && selection) return isPointLocked(selection) ? 'locked' : 'unlocked';
    if (hasShapes) {
      const lockedFlags = selectedShapeIds
        .map(id => Boolean(shapesStateRef.current.find(s => s.id === id)?.locked));
      const any = lockedFlags.some(Boolean);
      const all = lockedFlags.every(Boolean);
      return all ? 'locked' : any ? 'mixed' : 'unlocked';
    }
    return 'unlocked';
  };

  const toggleLockSelection = () => {
    const lockState = getSelectionLockState();
    const nextLocked = lockState !== 'locked'; // mixed/unlocked => lock; locked => unlock

    // Point-only selection (no shapes selected)
    if (selection && selectedShapeIds.length === 0) {
      if (nextLocked && shapesStateRef.current.some(s => s.locked && s.points?.includes(selection))) {
        // already effectively locked via shape; still allow explicit lock for clarity
      }
      setPoints(prev => prev.map(p => p.id === selection ? { ...p, locked: nextLocked } : p));
      toast.message(nextLocked ? 'Bod zamčen.' : 'Bod odemčen.');
      return;
    }

    if (selectedShapeIds.length > 0) {
      const ids = new Set(selectedShapeIds);
      setShapes(prev => prev.map(s => ids.has(s.id) ? { ...s, locked: nextLocked } : s));
      toast.message(nextLocked ? 'Tvar zamčen.' : 'Tvar odemčen.');
      return;
    }

    toast.message('Nejdřív vyber objekt.');
  };

  const getSelectionThinStrokeState = (): 'noShapes' | 'allThin' | 'mixed' | 'normal' => {
    if (selectedShapeIds.length === 0) return 'noShapes';
    const list = shapesStateRef.current;
    const flags = selectedShapeIds.map(id => Boolean(list.find(s => s.id === id)?.thinStroke));
    const any = flags.some(Boolean);
    const all = flags.every(Boolean);
    if (all) return 'allThin';
    if (any) return 'mixed';
    return 'normal';
  };

  const getSelectionEmphasisStrokeState = (): 'noShapes' | 'allEmphasis' | 'mixed' | 'normal' => {
    if (selectedShapeIds.length === 0) return 'noShapes';
    const list = shapesStateRef.current;
    const flags = selectedShapeIds.map(id => Boolean(list.find(s => s.id === id)?.emphasisStroke));
    const any = flags.some(Boolean);
    const all = flags.every(Boolean);
    if (all) return 'allEmphasis';
    if (any) return 'mixed';
    return 'normal';
  };

  const toggleThinStrokeOnSelection = () => {
    if (selectedShapeIds.length === 0) return;
    const st = getSelectionThinStrokeState();
    const nextThin = st !== 'allThin';
    const ids = new Set(selectedShapeIds);
    setShapes(prev =>
      prev.map(s =>
        ids.has(s.id)
          ? { ...s, ...(nextThin ? { thinStroke: true } : { thinStroke: undefined }) }
          : s,
      ),
    );
  };

  const toggleEmphasisStrokeOnSelection = () => {
    if (selectedShapeIds.length === 0) return;
    const st = getSelectionEmphasisStrokeState();
    const nextEm = st !== 'allEmphasis';
    const ids = new Set(selectedShapeIds);
    setShapes(prev =>
      prev.map(s =>
        ids.has(s.id)
          ? { ...s, ...(nextEm ? { emphasisStroke: true } : { emphasisStroke: undefined }) }
          : s,
      ),
    );
  };

  // --- SVG IKONY ---
  const Icons = {
    Move: () => (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 3l7.07 16.97 2.51-7.39 7.39-2.51L3 3z" />
        <path d="M13 13l6 6" />
      </svg>
    ),
    Pencil: () => (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
      </svg>
    ),
    Ruler: () => (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M2 17h20" />
        <path d="M2 7h20" />
        <path d="M2 7v10" />
        <path d="M22 7v10" />
        <path d="M6 7v4" />
        <path d="M10 7v2" />
        <path d="M14 7v4" />
        <path d="M18 7v2" />
      </svg>
    ),
    Compass: () => (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="5" r="2" />
        <path d="M12 7v14" />
        <path d="M8 21l4-14 4 14" />
      </svg>
    ),
    Protractor: () => (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M2 19h20" />
        <path d="M12 19v-2" />
        <path d="M12 2C7.03 2 3 6.03 3 11v8" />
        <path d="M21 11c0-4.97-4.03-9-9-9" />
      </svg>
    ),
    DashedLine: (props: SVGProps<SVGSVGElement>) => (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" {...props}>
        <line x1="3" y1="12" x2="21" y2="12" strokeDasharray="5 4" />
      </svg>
    ),
    DashDotLine: (props: SVGProps<SVGSVGElement>) => (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" {...props}>
        <line x1="3" y1="12" x2="21" y2="12" strokeDasharray="6 3 1.2 3" />
      </svg>
    ),
    /** Úsečka — |AB| */
    NotationSegment: (props: SVGProps<SVGSVGElement>) => (
      <svg viewBox="0 0 24 24" fill="none" {...props}>
        <text x="12" y="16" textAnchor="middle" fill="currentColor" fontSize="13" fontStyle="italic" fontFamily="Georgia, 'Times New Roman', serif" fontWeight="500">|AB|</text>
      </svg>
    ),
    /** Přímka — šipky oběma směry */
    NotationLine: (props: SVGProps<SVGSVGElement>) => (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" {...props}>
        <path d="M3 12h18" />
        <path d="M6.2 9.2L3 12l3.2 2.8" />
        <path d="M17.8 9.2L21 12l-3.2 2.8" />
        <circle cx="9" cy="12" r="1.15" fill="currentColor" stroke="none" />
        <circle cx="15" cy="12" r="1.15" fill="currentColor" stroke="none" />
      </svg>
    ),
    /** Polopřímka — ↦ */
    NotationRay: (props: SVGProps<SVGSVGElement>) => (
      <svg viewBox="0 0 24 24" fill="none" {...props}>
        <text x="12" y="17.5" textAnchor="middle" fill="currentColor" fontSize="21" fontFamily="Georgia, 'Times New Roman', serif" fontWeight="500">↦</text>
      </svg>
    ),
    /** Kolmice — ⊥ */
    NotationPerpendicular: (props: SVGProps<SVGSVGElement>) => (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
        <path d="M5 19h14" />
        <path d="M12 5v14" />
      </svg>
    ),
    /** Úsečka o rozměru — |AB|= */
    NotationSegmentLength: (props: SVGProps<SVGSVGElement>) => (
      <svg viewBox="0 0 24 24" fill="none" {...props}>
        <text x="12" y="16" textAnchor="middle" fill="currentColor" fontSize="11.5" fontStyle="italic" fontFamily="Georgia, 'Times New Roman', serif" fontWeight="500">|AB|=</text>
      </svg>
    ),
  };

  const toolGroups = [
    {
      id: 'group_move',
      icon: MousePointer2,
      label: 'Výběr',
      tools: [
        { id: 'move', label: 'Výběr', icon: MousePointer2 }
      ]
    },
    {
      id: 'group_pan',
      icon: Hand,
      label: 'Posun plátna',
      tools: [{ id: 'pan', label: 'Posun plátna', icon: Hand }]
    },
    {
      id: 'group_point',
      icon: Pero,
      label: 'Bod a Kreslení',
      tools: [
        { id: 'point', label: 'Bod', icon: Dot },
        { id: 'freehand', label: 'Volné pero', icon: Pencil },
        { id: 'highlighter', label: 'Zvýraznění', icon: Highlighter },
        { id: 'highlighterStraight', label: 'Zvýraznění podle pravítka', icon: Ruler }
      ]
    },
    {
      id: 'group_construct',
      icon: Pravitko,
      label: 'Konstrukce',
      tools: [
        { id: 'triangleRuler', label: 'Pravítko', icon: Move },
        { id: 'segment', label: 'Úsečka', icon: Icons.NotationSegment },
        { id: 'line', label: 'Přímka', icon: Icons.NotationLine },
        { id: 'ray', label: 'Polopřímka', icon: Icons.NotationRay },
        { id: 'perpendicular', label: 'Kolmice', icon: Icons.NotationPerpendicular },
        { id: '__popup__segment_fixed', label: 'Úsečka o rozměru', icon: Icons.NotationSegmentLength },
        { id: 'lineDashed', label: 'Čárkovaná čára', icon: Icons.DashedLine },
        { id: 'lineDashDot', label: 'Čerchovaná čára', icon: Icons.DashDotLine }
      ]
    },
    {
      id: 'group_circles',
      icon: Kruzitko,
      label: 'Kružnice',
      tools: [
        { id: 'circle', label: 'Kružnice', icon: Circle },
        { id: '__popup__circle_fixed', label: 'Rozměr', icon: Ruler }
      ]
    },
    {
      id: 'group_angles',
      icon: Uhel,
      label: 'Úhly',
      tools: [
        { id: 'angle', label: 'Úhel', icon: Icons.Protractor }
      ]
    },
    {
        id: 'group_paper',
        icon: Papir,
        label: 'Papír',
        tools: [
             { id: 'paper', label: 'Papír', icon: Papir } // Placeholder tool
        ]
    }
  ];

  // --- MAZÁNÍ ---
  const deleteGeometrySelectionRunnerRef = useRef<(() => void) | null>(null);

  const deletePoint = (id: string) => {
    if (assignmentBaselineProtectedRef.current.points.has(id)) {
      toast.message('Část zadání ze sdíleného plátna nelze smazat.');
      return;
    }
    // Effect
    const p = points.find(pt => pt.id === id);
    if (p) triggerEffect(p.x, p.y, '#ef4444');

    // 1. Smazat tvary závislé na bodu
    setShapes(prev => prev.filter(s => !s.points.includes(id)));
    // 2. Smazat bod
    setPoints(prev => prev.filter(p => p.id !== id));
    // 3. Zrušit výběr
    if (selection === id) setSelection(null);
    if (selectedPointId === id) setSelectedPointId(null);
  };

  deleteGeometrySelectionRunnerRef.current = () => {
    const prot = assignmentBaselineProtectedRef.current;
    if (selectedFreehandIds.length > 0) {
      const idsToDelete = new Set(selectedFreehandIds.filter(id => !prot.freehand.has(id)));
      if (idsToDelete.size === 0) {
        toast.message('Část zadání ze sdíleného plátna nelze smazat.');
        return;
      }
      setFreehandPaths(prev => prev.filter(p => !idsToDelete.has(p.id)));
      setSelectedFreehandIds([]);
      return;
    }
    if (selectedShapeIds.length > 0) {
      const shapeIdsToDelete = new Set(selectedShapeIds.filter(id => !prot.shapes.has(id)));
      if (shapeIdsToDelete.size === 0) {
        toast.message('Část zadání ze sdíleného plátna nelze smazat.');
        return;
      }
      const pointIdsToDelete = new Set<string>();
      shapes.forEach(s => {
        if (shapeIdsToDelete.has(s.id)) {
          s.points.forEach(pid => pointIdsToDelete.add(pid));
        }
      });
      setShapes(prev => prev.filter(s => !shapeIdsToDelete.has(s.id)));
      const remainingShapes = shapes.filter(s => !shapeIdsToDelete.has(s.id));
      const usedPointIds = new Set<string>();
      remainingShapes.forEach(s => s.points.forEach(pid => usedPointIds.add(pid)));
      setPoints(prev =>
        prev.filter(p => {
          if (prot.points.has(p.id)) return true;
          return !pointIdsToDelete.has(p.id) || usedPointIds.has(p.id);
        }),
      );
      setSelectedShapeIds([]);
      return;
    }
    if (selection) {
      deletePoint(selection);
    }
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // When typing into inputs (rename dialogs, forms), never treat Backspace/Delete as "delete geometry".
      // Also avoid global shortcuts while rename modal is open.
      const target = e.target as HTMLElement | null;
      const isTypingTarget =
        !!target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          (target as HTMLElement).isContentEditable);
      if (showRenameModal || isTypingTarget) {
        // Still allow Escape to close tools; it is handled below.
        if (e.key !== 'Escape') return;
      }

      if ((e.key === 'Delete' || e.key === 'Backspace') && (selection || selectedShapeIds.length > 0 || selectedFreehandIds.length > 0)) {
        deleteGeometrySelectionRunnerRef.current?.();
      }
      if (e.key === 'Escape') {
        setActiveTool('move');
        setSelectedPointId(null);
        setSelection(null);
        setSelectedShapeIds([]);
        setSelectedFreehandIds([]);
        setActiveGroup(null);
        setAngleInput(prev => ({ ...prev, visible: false }));
        setAngleTabletState({ step: 'idle', selectedLineId: null, currentPos: null, baseAngle: 0 });
        marqueeRef.current = null;
        groupDragRef.current = null;
        groupDragLiveRef.current = null;
      }
      // Undo/Redo shortcuts
      if (e.ctrlKey && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        handleUndo();
      }
      if (e.ctrlKey && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
        e.preventDefault();
        handleRedo();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selection, historyIndex, history, selectedShapeIds, selectedFreehandIds, shapes, points, freehandPaths, showRenameModal]);

  const triggerEffect = (x: number, y: number, color: string = '#3b82f6') => {
    setVisualEffects(prev => [...prev, {
      id: crypto.randomUUID(),
      x,
      y,
      startTime: performance.now(),
      color
    }]);
  };

  // --- HISTORIE (UNDO/REDO) ---
  const isUndoRedoRef = useRef(false);
  const historyRef = useRef(history);
  const historyIndexRef = useRef(historyIndex);
  historyRef.current = history;
  historyIndexRef.current = historyIndex;
  const suppressHistoryRef = useRef(false);
  const didDragSinceSuppressRef = useRef(false);

  const commitHistorySnapshot = useCallback(() => {
    if (points.length === 0 && shapes.length === 0 && freehandPaths.length === 0) return;
    const newState = {
      points: [...points],
      shapes: [...shapes],
      freehandPaths: [...freehandPaths],
      constructionSteps: [...constructionSteps],
      constructionCounter: constructionStepCounter.current
    };
    setHistory(prev => {
      const idx = historyIndexRef.current;
      const newHistory = [...prev.slice(0, idx + 1), newState];
      if (newHistory.length > 50) return newHistory.slice(newHistory.length - 50);
      return newHistory;
    });
    setHistoryIndex(prev => Math.min(prev + 1, 49));
  }, [constructionSteps, freehandPaths, points, shapes]);

  // Automatické ukládání do historie při změně stavu
  useEffect(() => {
    if (isUndoRedoRef.current) {
      isUndoRedoRef.current = false;
      return;
    }

    if (suppressHistoryRef.current) return;

    if (points.length === 0 && shapes.length === 0 && freehandPaths.length === 0) {
      return;
    }
    commitHistorySnapshot();
  }, [points, shapes, freehandPaths, commitHistorySnapshot]);

  // Automatické zachytávání změn při nahrávání
  useEffect(() => {
    if (!recordingState.isRecording || isUndoRedoRef.current) {
      previousStateRef.current = { points: [...points], shapes: [...shapes], freehandPaths: [...freehandPaths] };
      return;
    }

    if (!previousStateRef.current) {
      previousStateRef.current = { points: [...points], shapes: [...shapes], freehandPaths: [...freehandPaths] };
      return;
    }

    // Zrušit předchozí debounce timeout
    if (recordingDebounceTimeoutRef.current !== null) {
      window.clearTimeout(recordingDebounceTimeoutRef.current);
    }

    // Počkat 50ms, aby se dokončily všechny state updaty (body + tvar)
    recordingDebounceTimeoutRef.current = window.setTimeout(() => {
      const prev = previousStateRef.current;
      if (!prev) return;

      let description = '';
      let actionType: RecordedStep['actionType'] = 'create-point';

      // Detekce změn
      // Priorita: Pokud se vytváří tvar a body současně, ignorovat body
      if (shapes.length > prev.shapes.length && points.length > prev.points.length) {
        // Vytváří se tvar + body současně -> zaznamenat pouze tvar
        const newShape = shapes[shapes.length - 1];
    const typeNames: Record<string, string> = { segment: 'úsečky', line: 'přímky', lineDashed: 'čárkované přímky', lineDashDot: 'čerchované přímky', ray: 'polopřímky', circle: 'kružnice', angle: 'úhlu' };
        description = `Vytvoření ${typeNames[newShape.type] || newShape.type} ${newShape.label}`;
        if (newShape.type === 'segment') actionType = 'create-segment';
        else if (newShape.type === 'line') actionType = 'create-line';
        else if (newShape.type === 'lineDashed') actionType = 'create-line-dashed';
        else if (newShape.type === 'lineDashDot') actionType = 'create-line-dashdot';
        else if (newShape.type === 'ray') actionType = 'create-ray';
        else if (newShape.type === 'circle' || newShape.type === 'circleArc') actionType = 'create-circle';
        else if (newShape.type === 'angle') actionType = 'create-angle';
        else actionType = 'create-segment';
      } else if (shapes.length > prev.shapes.length) {
        // Pouze tvar (bez nových bodů)
        const newShape = shapes[shapes.length - 1];
        const typeNames: Record<string, string> = { segment: 'úsečky', line: 'přímky', lineDashed: 'čárkované přímky', lineDashDot: 'čerchované přímky', ray: 'polopřímky', circle: 'kružnice', angle: 'úhlu' };
        description = `Vytvoření ${typeNames[newShape.type] || newShape.type} ${newShape.label}`;
        if (newShape.type === 'segment') actionType = 'create-segment';
        else if (newShape.type === 'line') actionType = 'create-line';
        else if (newShape.type === 'lineDashed') actionType = 'create-line-dashed';
        else if (newShape.type === 'lineDashDot') actionType = 'create-line-dashdot';
        else if (newShape.type === 'ray') actionType = 'create-ray';
        else if (newShape.type === 'circle' || newShape.type === 'circleArc') actionType = 'create-circle';
        else if (newShape.type === 'angle') actionType = 'create-angle';
        else actionType = 'create-segment';
      } else if (points.length > prev.points.length) {
        // Pouze bod (bez tvaru)
        // NEZAZNAMENÁVAT, pokud je nastavený toolVisualization (body jsou součástí tvaru)
        // Zaznamenat pouze pokud je to samostatný bod vytvořený nástrojem "Bod" (point tool)
        const toolViz = pendingToolVisualizationRef.current;
        if (!toolViz) {
          // Pouze pokud NENÍ nastavený žádný tool visualization
          const newPoint = points[points.length - 1];
          description = `Vytvoření bodu ${newPoint.label}`;
          actionType = 'create-point';
        }
      } else if (shapes.length < prev.shapes.length && points.length < prev.points.length) {
        // Shape + its anchor points deleted together (eraser or delete with cleanup)
        const deletedShape = prev.shapes.find(s => !shapes.some(sh => sh.id === s.id));
        description = `Smazání tvaru ${deletedShape?.label || ''}`;
        actionType = 'delete';
      } else if (shapes.length < prev.shapes.length) {
        const deletedShape = prev.shapes.find(s => !shapes.some(sh => sh.id === s.id));
        description = `Smazání tvaru ${deletedShape?.label || ''}`;
        actionType = 'delete';
      } else if (points.length < prev.points.length) {
        const deletedPoint = prev.points.find(p => !points.some(pt => pt.id === p.id));
        description = `Smazání bodu ${deletedPoint?.label || ''}`;
        actionType = 'delete';
      } else if (freehandPaths.length > prev.freehandPaths.length) {
        description = 'Kreslení perem';
        actionType = 'freehand';
      } else if (freehandPaths.length < prev.freehandPaths.length) {
        description = 'Smazání cesty';
        actionType = 'delete';
      } else {
        // Kontrola posunutí bodu
        const movedPoint = points.find(p => {
          const prevPoint = prev.points.find(pp => pp.id === p.id);
          return prevPoint && (prevPoint.x !== p.x || prevPoint.y !== p.y);
        });
        if (movedPoint) {
          description = `Posunutí bodu ${movedPoint.label}`;
          actionType = 'move-point';
        }
      }

      if (description) {
        saveRecordingStep(actionType, description, pendingToolVisualizationRef.current);
        pendingToolVisualizationRef.current = undefined; // Vymazat po použití
      }

      previousStateRef.current = { points: [...points], shapes: [...shapes], freehandPaths: [...freehandPaths] };
      recordingDebounceTimeoutRef.current = null;
    }, 50);
  }, [points, shapes, freehandPaths, recordingState.isRecording]);

  const handleUndo = () => {
    const idx = historyIndexRef.current;
    const hist = historyRef.current;
    if (idx > 0) {
      isUndoRedoRef.current = true;
      const prevState = hist[idx - 1];
      setPoints(prevState.points);
      setShapes(prevState.shapes);
      setFreehandPaths(prevState.freehandPaths);
      if (prevState.constructionSteps) {
        setConstructionSteps(prevState.constructionSteps);
        constructionStepCounter.current = prevState.constructionCounter ?? prevState.constructionSteps.length;
      }
      historyIndexRef.current = idx - 1;
      setHistoryIndex(idx - 1);
    } else if (idx === 0) {
      // Undo prvni akce -> obnov prazdny stav
      isUndoRedoRef.current = true;
      setPoints([]);
      setShapes([]);
      setFreehandPaths([]);
      setConstructionSteps([]);
      constructionStepCounter.current = 0;
      historyIndexRef.current = -1;
      setHistoryIndex(-1);
    }
  };

  const handleRedo = () => {
    const idx = historyIndexRef.current;
    const hist = historyRef.current;
    if (idx < hist.length - 1) {
      isUndoRedoRef.current = true;
      const nextState = hist[idx + 1];
      setPoints(nextState.points);
      setShapes(nextState.shapes);
      setFreehandPaths(nextState.freehandPaths);
      if (nextState.constructionSteps) {
        setConstructionSteps(nextState.constructionSteps);
        constructionStepCounter.current = nextState.constructionCounter ?? nextState.constructionSteps.length;
      }
      historyIndexRef.current = idx + 1;
      setHistoryIndex(idx + 1);
    }
  };

  // --- NAHRÁVÁNÍ ---
  const saveRecordingStep = (
    actionType: RecordedStep['actionType'], 
    description: string,
    toolVisualization?: RecordedStep['toolVisualization']
  ) => {
    if (!recordingState.isRecording) return;
    
    const step: RecordedStep = {
      id: `step-${Date.now()}-${Math.random()}`,
      actionType,
      description,
      snapshot: {
        points: JSON.parse(JSON.stringify(points)),
        shapes: JSON.parse(JSON.stringify(shapes)),
        freehandPaths: JSON.parse(JSON.stringify(freehandPaths))
      },
      toolVisualization
    };
    
    setRecordingState(prev => ({
      ...prev,
      steps: [...prev.steps, step]
    }));
  };

  const toggleRecording = () => {
    if (recordingState.isRecording) {
      // Zastavit nahrávání
      if (recordingState.steps.length === 0) {
        // Žádné kroky - jen vypni nahrávání
        setRecordingState(prev => ({
          ...prev,
          isRecording: false
        }));
      } else {
        // Auto-populate notation from constructionSteps
        const stepsWithNotation = recordingState.steps.map((step, idx) => {
          if (step.notation) return step; // already has notation
          const prevSnapshot = idx > 0 ? recordingState.steps[idx - 1].snapshot : { points: [] as GeoPoint[], shapes: [] as GeoShape[] };
          const prevPointIds = new Set(prevSnapshot.points.map((p: GeoPoint) => p.id));
          const prevShapeIds = new Set(prevSnapshot.shapes.map((s: GeoShape) => s.id));
          const newIds = [
            ...step.snapshot.points.filter((p: GeoPoint) => !prevPointIds.has(p.id)).map((p: GeoPoint) => p.id),
            ...step.snapshot.shapes.filter((s: GeoShape) => !prevShapeIds.has(s.id)).map((s: GeoShape) => s.id),
          ];
          const matchingCS = newIds.length > 0
            ? constructionSteps.find(cs => cs.objectIds.some(id => newIds.includes(id)))
            : undefined;
          return {
            ...step,
            notation: matchingCS ? (matchingCS.latex || matchingCS.notation) : ''
          };
        });
        // Otevrit editor primo po nahravani
        setEditableSteps(stepsWithNotation);
        setRecordingState(prev => ({
          ...prev,
          isRecording: false,
          showEditor: true,
          currentStepIndex: -1
        }));
        setShareLink(null);
        setRecordingName('');
      }
    } else {
      // Začít nahrávání - reset předchozího stavu
      previousStateRef.current = { 
        points: [...points], 
        shapes: [...shapes], 
        freehandPaths: [...freehandPaths] 
      };
      setRecordingState({
        isRecording: true,
        steps: [],
        currentStepIndex: -1,
        showEditor: false,
        showPlayer: false
      });
    }
  };

  // --- NAČTENÍ OBRÁZKŮ ---
  useEffect(() => {
    let loadedCount = 0;
    const TOTAL_ASSETS = 3;
    const checkLoaded = () => {
      loadedCount++;
      if (loadedCount === TOTAL_ASSETS) setAssetsLoaded(true);
    };

    const ruler = new Image();
    ruler.crossOrigin = 'anonymous';
    ruler.onload = () => { rulerImageRef.current = ruler; checkLoaded(); };
    ruler.src = 'https://jjpiguuubvmiobmixwgh.supabase.co/storage/v1/object/public/Admin%20math/pravitko4.svg';

    const compass = new Image();
    compass.crossOrigin = 'anonymous';
    compass.onload = () => { compassImageRef.current = compass; checkLoaded(); };
    compass.src = 'https://jjpiguuubvmiobmixwgh.supabase.co/storage/v1/object/public/Admin%20math/kruzitko.svg';

    const protractor = new Image();
    // Assets from figma:asset do not need crossOrigin usually, but it's safe.
    // However, figma:asset imports returns a URL string.
    protractor.onload = () => { protractorImageRef.current = protractor; checkLoaded(); };
    protractor.src = protractorAsset;
  }, []);

  useEffect(() => {
    const img = new Image();
    img.onload = () => {
      rulerHandCursorImageRef.current = img;
    };
    img.src = macosOpenHandCursor;
  }, []);

  // --- GENERÁTORY NÁZVŮ ---
  const getNextPointLabel = () => {
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    // Jednoduchá logika - najde první volné písmeno, nebo přidá index
    for (const char of alphabet) {
      if (!points.some(p => p.label === char)) return char;
    }
    return 'A' + (points.length + 1);
  };

  const getNextShapeLabel = (type: 'segment' | 'line' | 'lineDashed' | 'lineDashDot' | 'circle' | 'circleArc' | 'ray') => {
    if (type === 'circle' || type === 'circleArc') {
      const labels = ['k', 'l', 'm', 'n', 'o'];
      for (const char of labels) {
        if (!shapes.some(s => s.label === char)) return char;
      }
      return 'k' + (shapes.length + 1);
    } else if (type === 'ray') {
      // Polopřímky
      return 'r' + (shapes.length + 1);
    } else {
      const labels = ['p', 'q', 'r', 's', 't', 'u', 'v'];
      for (const char of labels) {
        if (!shapes.some(s => s.label === char)) return char;
      }
      return 'p' + (shapes.length + 1);
    }
  };

  // --- ZÁPIS KONSTRUKCE ---
  const addConstructionStep = (
    type: ConstructionStep['type'],
    notation: string,
    latex: string,
    description: string,
    objectIds: string[] = [],
    descriptionLatex?: string
  ) => {
    constructionStepCounter.current += 1;
    const step: ConstructionStep = {
      id: crypto.randomUUID(),
      stepNumber: constructionStepCounter.current,
      type,
      notation,
      latex,
      description,
      objectIds,
      ...(descriptionLatex ? { descriptionLatex } : {})
    };
    setConstructionSteps(prev => [...prev, step]);
  };

  const clearConstructionSteps = () => {
    setConstructionSteps([]);
    constructionStepCounter.current = 0;
  };

  // Helper: najde label bodu podle ID
  const getPointLabel = (pointId: string, extraPoints?: GeoPoint[]): string => {
    const p = points.find(pt => pt.id === pointId) || (extraPoints || []).find(pt => pt.id === pointId);
    return p ? (p.label || '?') : '?';
  };

  // Helper: "povýší" skrytý/neoznačený bod na viditelný s labelem
  // Používá se, když nástroj (např. kružnice) potřebuje viditelný střed na průsečíku
  const promoteToVisiblePoint = (pointId: string | undefined | null): string | null => {
    if (!pointId) return null;
    const p = points.find(pt => pt.id === pointId);
    if (p && (p.hidden || !p.label)) {
      const newLabel = getNextPointLabel();
      setPoints(prev => prev.map(pt =>
        pt.id === pointId ? { ...pt, hidden: false, label: newLabel } : pt
      ));
      return newLabel;
    }
    return p?.label || null;
  };

  /** Další volné písmeno; `reserved` drží labely už přidělené v tomto kroku (např. oba konce úsečky). */
  const takeNextPointLabel = (reserved: Set<string> = new Set()): string => {
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const existing = pointsStateRef.current;
    for (const char of alphabet) {
      if (!existing.some(p => p.label === char) && !reserved.has(char)) {
        reserved.add(char);
        return char;
      }
    }
    const fallback = 'A' + (existing.length + reserved.size + 1);
    reserved.add(fallback);
    return fallback;
  };

  /** Stejná logika jako při kliknutí nástrojem Úsečka — snap na bod/průsečík, jinak nový pojmenovaný bod. */
  const resolveSegmentEndpointAt = (
    wx: number,
    wy: number,
    reservedLabels: Set<string>,
    excludeId?: string,
    secondEndpoint = false
  ): { point: GeoPoint; isNew: boolean } => {
    const snapThreshold = secondEndpoint ? (isTabletMode ? 18 : 12) : SNAP_PX;
    const snapPos = getSnapPosition(wx, wy, snapThreshold, excludeId);
    const SNAP_MATCH_ON_POINT_PX = 2;
    let snappedShape: GeoPoint | null = null;
    if (snapPos) {
      const p = getSnappingPoint(snapPos.x, snapPos.y, snapThreshold, excludeId);
      if (p) {
        const dPx = Math.hypot((p.x - snapPos.x) * scale, (p.y - snapPos.y) * scale);
        if (dPx <= SNAP_MATCH_ON_POINT_PX) snappedShape = p;
      }
    }
    if (snappedShape && snappedShape.id !== excludeId) {
      const live = pointsStateRef.current.find(pt => pt.id === snappedShape!.id) ?? snappedShape;
      return { point: live, isNew: false };
    }
    const intFallback = snapPos ? null : findNearestIntersection(wx, wy, snapThreshold);
    const ptX = snapPos ? snapPos.x : (intFallback?.x ?? wx);
    const ptY = snapPos ? snapPos.y : (intFallback?.y ?? wy);
    const newPoint: GeoPoint = {
      id: crypto.randomUUID(),
      x: ptX,
      y: ptY,
      label: takeNextPointLabel(reservedLabels),
      hidden: false,
    };
    return { point: newPoint, isNew: true };
  };

  // Helper: vzdálenost v cm (desetinná čárka — stejně jako měření na plátně)
  const distanceCm = (x1: number, y1: number, x2: number, y2: number): string => {
    const px = Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
    const cm = px / PIXELS_PER_CM;
    const s = cm % 1 === 0 ? cm.toFixed(0) : cm.toFixed(1);
    return s.replace('.', ',');
  };

  /** V LaTeX / KaTeX použít desetinnou čárku jako `3{,}5`, aby se neoddělovala jako interpunkce */
  const decimalForLatex = (displayCm: string): string =>
    displayCm.includes(',') ? displayCm.replace(',', '{,}') : displayCm;

  const latexIt = (s: string) => `\\textit{${s}}`;

  /** Označení základu kolmice v zápisu (úsečka AB, ne interní label p). */
  const getPerpendicularBaseRef = (baseShape: GeoShape): string => {
    const lA = getPointLabel(baseShape.definition.p1Id);
    const lB = baseShape.definition.p2Id ? getPointLabel(baseShape.definition.p2Id) : '';
    const hasBoth = lA !== '?' && lB !== '?' && lA !== '' && lB !== '';
    if (baseShape.type === 'segment' && hasBoth) return `${lA}${lB}`;
    return baseShape.label;
  };

  const getPerpendicularConstructionTexts = (qLabel: string, baseShape: GeoShape) => {
    const baseRef = getPerpendicularBaseRef(baseShape);
    const notation = `${qLabel} ⊥ ${baseRef}`;
    const latex = `${qLabel} \\perp ${baseRef}`;
    if (baseShape.type === 'segment') {
      return {
        notation,
        latex,
        description: `Kolmice ${qLabel} k úsečce ${baseRef}`,
        descriptionLatex: `\\text{Kolmice } ${latexIt(qLabel)} \\text{ k úsečce } ${latexIt(baseRef)}`,
      };
    }
    if (baseShape.type === 'lineDashed') {
      return {
        notation,
        latex,
        description: `Kolmice ${qLabel} k čárkované přímce ${baseRef}`,
        descriptionLatex: `\\text{Kolmice } ${latexIt(qLabel)} \\text{ k čárkované přímce } ${latexIt(baseRef)}`,
      };
    }
    if (baseShape.type === 'lineDashDot') {
      return {
        notation,
        latex,
        description: `Kolmice ${qLabel} k čerchované přímce ${baseRef}`,
        descriptionLatex: `\\text{Kolmice } ${latexIt(qLabel)} \\text{ k čerchované přímce } ${latexIt(baseRef)}`,
      };
    }
    if (baseShape.type === 'ray') {
      return {
        notation,
        latex,
        description: `Kolmice ${qLabel} k polopřímce ${baseRef}`,
        descriptionLatex: `\\text{Kolmice } ${latexIt(qLabel)} \\text{ k polopřímce } ${latexIt(baseRef)}`,
      };
    }
    return {
      notation,
      latex,
      description: `Kolmice ${qLabel} k přímce ${baseRef}`,
      descriptionLatex: `\\text{Kolmice } ${latexIt(qLabel)} \\text{ k přímce } ${latexIt(baseRef)}`,
    };
  };
  const descLatexPoint = (label: string) => `\\text{Bod } ${latexIt(label)}`;
  const descLatexLine = (lineLabel: string, lA: string, lB: string, dashed: boolean) =>
    dashed
      ? `\\text{Čárkovaná přímka } ${latexIt(lineLabel)} \\text{ procházející body } ${latexIt(lA)}\\text{, }${latexIt(lB)}`
      : `\\text{Přímka } ${latexIt(lineLabel)} \\text{ procházející body } ${latexIt(lA)}\\text{, }${latexIt(lB)}`;
  const descLatexLineShort = (lineLabel: string, dashed: boolean) =>
    dashed
      ? `\\text{Čárkovaná přímka } ${latexIt(lineLabel)}`
      : `\\text{Přímka } ${latexIt(lineLabel)}`;

  // --- POHYB A ZOOM ---
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const measure = () => {
      const w = el.clientWidth;
      const h = el.clientHeight;
      if (w > 0 && h > 0) {
        setCanvasSize(prev => (prev.width === w && prev.height === h ? prev : { width: w, height: h }));
      }
    };

    measure();
    // Re-measure on next frame in case layout wasn't settled yet on initial mount
    // (happens with Suspense / lazy-loaded routes where the parent height is 0
    // for one frame and then becomes the real viewport height).
    const raf = requestAnimationFrame(measure);

    // Track future container size changes (window resize, orientation, parent layout shifts)
    const ro = new ResizeObserver(() => measure());
    ro.observe(el);

    window.addEventListener('resize', measure);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, []);

  /** Sdílené plátno v úkolu / náhled odevzdání: po otevření vycentrovat a přizoomovat, aby byl vidět celý obsah. */
  useEffect(() => {
    if (sharedRecording && sharedRecording.steps.length > 0) return;
    if (!initialCanvasSnapshot) {
      assignmentSnapshotFitLayoutKeyRef.current = null;
      return;
    }
    if (!embedInAssignment && !readOnlyCanvas) return;
    if (canvasSize.width < 8 || canvasSize.height < 8) return;

    const bounds = computeGeometryWorldBounds(initialCanvasSnapshot);
    if (!bounds) return;

    const right = assignmentToolbarRightOffsetPx ?? 0;
    const layoutKey = [
      initialCanvasSnapshot.points.map(p => p.id).join(','),
      initialCanvasSnapshot.shapes.map(s => s.id).join(','),
      (initialCanvasSnapshot.freehandPaths ?? []).map(f => f.id).join(','),
      canvasSize.width,
      canvasSize.height,
      right,
    ].join('|');

    if (assignmentSnapshotFitLayoutKeyRef.current === layoutKey) return;

    const { scale: nextScale, offset: nextOffset } = fitViewportToAssignmentBounds(
      bounds,
      canvasSize.width,
      canvasSize.height,
      right,
    );
    setScale(nextScale);
    setOffset(nextOffset);
    assignmentSnapshotFitLayoutKeyRef.current = layoutKey;
  }, [
    sharedRecording,
    embedInAssignment,
    readOnlyCanvas,
    initialCanvasSnapshot,
    canvasSize.width,
    canvasSize.height,
    assignmentToolbarRightOffsetPx,
  ]);

  // Cleanup pending circle center when tool changes or circle creation is cancelled
  useEffect(() => {
    if (activeTool !== 'circle' && pendingCircleCenterRef.current) {
      const pendingId = pendingCircleCenterRef.current;
      pendingCircleCenterRef.current = null;
      // Remove the orphaned center point (only if it's not used by any shape)
      setPoints(prev => {
        // IMPORTANT: use ref-backed shapes to avoid stale closure deleting a valid point.
        const usedByShape = shapesStateRef.current.some(s =>
          s.definition.p1Id === pendingId || s.definition.p2Id === pendingId
        );
        if (usedByShape) return prev;
        return prev.filter(p => p.id !== pendingId);
      });
    }
  }, [activeTool]);

  // Native wheel listener with { passive: false } to prevent browser zoom (trackpad pinch)
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const onWheel = (e: WheelEvent) => { e.preventDefault(); };
    container.addEventListener('wheel', onWheel, { passive: false });
    return () => container.removeEventListener('wheel', onWheel);
  }, []);

  // Odstranit animační stav popisků u smazaných bodů
  useEffect(() => {
    const ids = new Set(points.map(pt => pt.id));
    const map = labelAnimByPointIdRef.current;
    for (const id of map.keys()) {
      if (!ids.has(id)) map.delete(id);
    }
  }, [points]);

  useEffect(() => {
    const ids = new Set(shapes.map(s => s.id));
    const map = shapeLabelAnimByShapeIdRef.current;
    for (const id of map.keys()) {
      if (!ids.has(id)) map.delete(id);
    }
  }, [shapes]);

  const screenToWorld = (sx: number, sy: number) => ({
    x: (sx - offset.x) / scale,
    y: (sy - offset.y) / scale
  });

  /** Cílový střed popisku: poloměr o ~30 px na obrazovce menší než dřív (min. 12 px), pak násobek dál od bodu; úhel dle odsazení od čar/kružnic/volné kresby. */
  const getPointLabelAnchor = useCallback(
    (p: GeoPoint): { x: number; y: number } => {
      const LABEL_ANCHOR_BASE_PX = 20;
      const LABEL_ANCHOR_CLOSER_PX = 30;
      const LABEL_ANCHOR_MIN_RADIUS_PX = 12;
      const LABEL_ANCHOR_FARTHER = 1.65;
      const screenRadiusPx =
        Math.max(
          LABEL_ANCHOR_MIN_RADIUS_PX,
          Math.sqrt(2) * LABEL_ANCHOR_BASE_PX - LABEL_ANCHOR_CLOSER_PX
        ) * LABEL_ANCHOR_FARTHER;
      const R = screenRadiusPx / scale;
      const off = screenRadiusPx / Math.sqrt(2) / scale;
      if (!p.label) return { x: p.x + off, y: p.y - off };

      const NUM = 8;
      const baseAngle = Math.atan2(-1, 1);
      const EXT = 100000;

      const minDistToGeometry = (cx: number, cy: number): number => {
        let minD = Infinity;

        shapes.forEach(shape => {
          const p1 = points.find(pt => pt.id === shape.definition.p1Id);
          const p2 = points.find(pt => pt.id === shape.definition.p2Id);
          if (!p1 || !p2) return;

          if (shape.type === 'circle' || shape.type === 'circleArc') {
            const r = Math.sqrt((p2.x - p1.x) ** 2 + (p2.y - p1.y) ** 2);
            const distFromCenter = Math.sqrt((cx - p1.x) ** 2 + (cy - p1.y) ** 2);
            const distToCircle = Math.abs(distFromCenter - r);
            minD = Math.min(minD, distToCircle);
          } else {
            let start: { x: number; y: number } = p1;
            let end: { x: number; y: number } = p2;
            if (shape.type === 'line' || shape.type === 'lineDashed' || shape.type === 'ray') {
              const dx = p2.x - p1.x;
              const dy = p2.y - p1.y;
              const len = Math.sqrt(dx * dx + dy * dy);
              if (len > 0.001) {
                if (shape.type === 'line' || shape.type === 'lineDashed') {
                  start = { x: p1.x - (dx / len) * EXT, y: p1.y - (dy / len) * EXT };
                }
                end = { x: p1.x + (dx / len) * EXT, y: p1.y + (dy / len) * EXT };
              }
            }
            const res = distToSegment({ x: cx, y: cy }, start, end);
            minD = Math.min(minD, res.dist);
          }
        });

        for (const path of freehandPaths) {
          for (let j = 0; j < path.points.length - 1; j++) {
            const a = path.points[j];
            const b = path.points[j + 1];
            const res = distToSegment({ x: cx, y: cy }, a, b);
            minD = Math.min(minD, res.dist);
          }
        }

        return minD === Infinity ? 1e9 : minD;
      };

      let best = -1;
      let bx = p.x + off;
      let by = p.y - off;

      for (let i = 0; i < NUM; i++) {
        const ang = baseAngle + (i * 2 * Math.PI) / NUM;
        const ax = p.x + Math.cos(ang) * R;
        const ay = p.y + Math.sin(ang) * R;
        const score = minDistToGeometry(ax, ay);
        if (score > best) {
          best = score;
          bx = ax;
          by = ay;
        }
      }
      return { x: bx, y: by };
    },
    [scale, shapes, points, freehandPaths]
  );

  const LABEL_ANIM_MS = 220;

  /** Vykreslení + klik: aktuální střed popisku (plynulý přechod při změně cíle). */
  const getPointLabelDrawPosition = useCallback(
    (p: GeoPoint): { x: number; y: number } => {
      const target = getPointLabelAnchor(p);
      if (isLowPerformance) return target;

      const now = performance.now();
      const map = labelAnimByPointIdRef.current;
      const EPS2 = 0.12 * 0.12;
      let anim = map.get(p.id);
      const targetMoved =
        !anim ||
        (anim.to.x - target.x) ** 2 + (anim.to.y - target.y) ** 2 > EPS2;

      if (targetMoved) {
        let from = target;
        if (anim) {
          const te = Math.min(1, (now - anim.startMs) / LABEL_ANIM_MS);
          const easePrev = 1 - Math.pow(1 - te, 3);
          from = {
            x: anim.from.x + (anim.to.x - anim.from.x) * easePrev,
            y: anim.from.y + (anim.to.y - anim.from.y) * easePrev
          };
        }
        anim = { from, to: target, startMs: now };
        map.set(p.id, anim);
      }

      anim = map.get(p.id)!;
      const t = Math.min(1, (now - anim.startMs) / LABEL_ANIM_MS);
      const ease = 1 - Math.pow(1 - t, 3);
      return {
        x: anim.from.x + (anim.to.x - anim.from.x) * ease,
        y: anim.from.y + (anim.to.y - anim.from.y) * ease
      };
    },
    [getPointLabelAnchor, isLowPerformance]
  );

  /**
   * Plynulý posun středu popisku tvaru (stejné cubic ease jako u bodů).
   * U kružnice se cíl mění každý snímek při tažení táhla — nesmí se každý frame restartovat animace
   * (malý EPS); při malé změně jen aktualizujeme `to`, při velkém skoku (jiná strana / skok) nový běh.
   */
  const getShapeLabelDrawPosition = useCallback(
    (shapeId: string, target: { x: number; y: number }): { x: number; y: number } => {
      if (isLowPerformance) return target;
      const now = performance.now();
      const map = shapeLabelAnimByShapeIdRef.current;
      /** Skok větší než ~24 px na obrazovce mezi snímky = nová animace (ne při plynulém tažení). */
      const bigJumpWorld = 24 / scale;
      const BIG_JUMP2 = bigJumpWorld * bigJumpWorld;

      let anim = map.get(shapeId);
      if (!anim) {
        anim = { from: target, to: target, startMs: now };
        map.set(shapeId, anim);
      } else {
        const d2 = (anim.to.x - target.x) ** 2 + (anim.to.y - target.y) ** 2;
        if (d2 < 1e-14) {
          /* beze změny */
        } else if (d2 <= BIG_JUMP2) {
          anim = { ...anim, to: target };
          map.set(shapeId, anim);
        } else {
          const te = Math.min(1, (now - anim.startMs) / LABEL_ANIM_MS);
          const easePrev = 1 - Math.pow(1 - te, 3);
          const from = {
            x: anim.from.x + (anim.to.x - anim.from.x) * easePrev,
            y: anim.from.y + (anim.to.y - anim.from.y) * easePrev
          };
          anim = { from, to: target, startMs: now };
          map.set(shapeId, anim);
        }
      }

      anim = map.get(shapeId)!;
      const t = Math.min(1, (now - anim.startMs) / LABEL_ANIM_MS);
      const ease = 1 - Math.pow(1 - t, 3);
      return {
        x: anim.from.x + (anim.to.x - anim.from.x) * ease,
        y: anim.from.y + (anim.to.y - anim.from.y) * ease
      };
    },
    [isLowPerformance, scale]
  );

  // Global snap radius in screen pixels (smaller = less "sticky" snapping).
  const SNAP_PX = isTabletMode ? 10 : 6;

  const getSnappingPoint = (
    wx: number,
    wy: number,
    threshold = SNAP_PX,
    excludeId?: string | Set<string>,
    skipHiddenPoints = false
  ) => {
    const excludeSet =
      excludeId instanceof Set ? excludeId : excludeId ? new Set([excludeId]) : undefined;
    const threshWorld = threshold / scale;
    let closest: GeoPoint | null = null;
    let minDist = threshWorld;

    for (const p of points) {
      if (excludeSet?.has(p.id)) continue;
      if (skipHiddenPoints && p.hidden) continue;
      const pGeom =
        draggedPointIdRef.current === p.id && draggedPointPosRef.current
          ? { ...p, x: draggedPointPosRef.current.x, y: draggedPointPosRef.current.y }
          : p;
      const circleHandleShape = shapes.find(
        s => (s.type === 'circle' || s.type === 'circleArc') && s.definition.p2Id === p.id
      );
      const isCircleHandle = !!circleHandleShape;
      const snapDist = isCircleHandle ? Math.min(threshWorld, 14 / scale) : threshWorld;
      let hitX = pGeom.x;
      let hitY = pGeom.y;
      if (circleHandleShape?.type === 'circleArc') {
        const cenRaw = points.find(pt => pt.id === circleHandleShape.definition.p1Id);
        if (cenRaw) {
          const cenGeom =
            draggedPointIdRef.current === cenRaw.id && draggedPointPosRef.current
              ? { ...cenRaw, x: draggedPointPosRef.current.x, y: draggedPointPosRef.current.y }
              : cenRaw;
          const span = circleHandleShape.definition.arcSpan ?? COMPASS_ARC_SPAN_RAD;
          const hp = circleArcRadiusHandlePos(cenGeom, pGeom, span);
          hitX = hp.x;
          hitY = hp.y;
        }
      }
      const distToPoint = Math.sqrt((hitX - wx) ** 2 + (hitY - wy) ** 2);

      const labelAnchor = p.label ? getPointLabelDrawPosition(p) : null;
      const distToLabel = labelAnchor
        ? Math.sqrt((labelAnchor.x - wx) ** 2 + (labelAnchor.y - wy) ** 2)
        : Infinity;

      // Clicking/hovering near a point label should NOT extend the snapping radius far beyond the point.
      // Otherwise intersection points (whose labels are often pushed away) feel "stickier" than standalone points.
      const labelHit =
        !isCircleHandle && !!p.label && distToLabel < 4 / scale && distToPoint < snapDist;
      const isNear = distToPoint < snapDist || labelHit;
      // Klik na popisek: střed bodu může být dál než snap — porovnávat min(od bodu, od popisku), jinak se bod nevybere a „uhne“ to
      const effectiveDist = labelHit ? Math.min(distToPoint, distToLabel) : distToPoint;

      if (isNear && effectiveDist < minDist) {
        minDist = effectiveDist;
        closest = p;
      }
    }
    return closest;
  };

  // Unified snap: always pick whichever target (existing point OR intersection) is geometrically closer
  const getSnapPosition = (
    wx: number,
    wy: number,
    threshold = SNAP_PX,
    excludeId?: string | Set<string>,
    skipHiddenPoints = false
  ): { x: number; y: number } | null => {
    const pointSnap = getSnappingPoint(wx, wy, threshold, excludeId, skipHiddenPoints);
    const intSnap = findNearestIntersection(wx, wy, threshold);

    const dPoint = pointSnap ? Math.sqrt((pointSnap.x - wx) ** 2 + (pointSnap.y - wy) ** 2) * scale : Infinity;
    const dInt   = intSnap   ? Math.sqrt((intSnap.x   - wx) ** 2 + (intSnap.y   - wy) ** 2) * scale : Infinity;

    if (!pointSnap && !intSnap) return null;
    if (!intSnap) return { x: pointSnap!.x, y: pointSnap!.y };
    if (!pointSnap) return intSnap;

    return dInt < dPoint ? intSnap : { x: pointSnap.x, y: pointSnap.y };
  };

  /**
   * Stejné jako getSnapPosition, ale pokud je kurzor u existujícího bodu, vždy použije přesně jeho souřadnice.
   * (U kolmice jinak často vyhrál průsečík linek těsně u vrcholu a kolmice „uskočila“ místo projití bodem.)
   */
  const getSnapPositionPreferPoint = (
    wx: number,
    wy: number,
    threshold = SNAP_PX,
    excludeId?: string | Set<string>,
    skipHiddenPoints = false
  ): { x: number; y: number } | null => {
    const pointSnap = getSnappingPoint(wx, wy, threshold, excludeId, skipHiddenPoints);
    if (pointSnap) {
      return { x: pointSnap.x, y: pointSnap.y };
    }
    return getSnapPosition(wx, wy, threshold, excludeId, skipHiddenPoints);
  };

  // Helper: najde nejbližší bod NA tvaru (čára, úsečka, polopřímka, kružnice) v okolí bodu.
  // Vrací pouze body na VNITŘKU tvaru — nikdy ne na pozici existujícího bodu.
  const snapToNearestShape = (wx: number, wy: number, threshold = SNAP_PX, excludePointIds?: Set<string>): {x: number, y: number} | null => {
    const thresh = threshold / scale;
    // Minimum distance a candidate must be from any existing labeled point (to avoid "snapping to a point")
    const minFromPoint = 10 / scale;
    let bestDist = thresh;
    let bestPt: {x: number, y: number} | null = null;

    const isTooCloseToAnyPoint = (cx: number, cy: number): boolean => {
      for (const p of points) {
        if (excludePointIds?.has(p.id)) continue;
        const d = Math.sqrt((p.x - cx) ** 2 + (p.y - cy) ** 2);
        if (d < minFromPoint) return true;
      }
      return false;
    };

    for (const s of shapes) {
      const p1 = points.find(p => p.id === s.definition.p1Id);
      if (!p1) continue;

      if (s.type === 'circle' || s.type === 'circleArc') {
        const p2 = s.definition.p2Id ? points.find(p => p.id === s.definition.p2Id) : null;
        if (!p2) continue;
        const r = Math.sqrt((p2.x - p1.x) ** 2 + (p2.y - p1.y) ** 2);
        if (r < 0.0001) continue;
        const dx = wx - p1.x, dy = wy - p1.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 0.0001) continue;
        const candidate = { x: p1.x + (dx / dist) * r, y: p1.y + (dy / dist) * r };
        const d = Math.abs(dist - r);
        if (d < bestDist && !isTooCloseToAnyPoint(candidate.x, candidate.y)) {
          bestDist = d; bestPt = candidate;
        }
      } else {
        // line, segment, ray — projekce na přímku (pouze vnitřek, ne krajní body)
        const p2 = s.definition.p2Id ? points.find(p => p.id === s.definition.p2Id) : null;
        if (!p2) continue;
        const dx = p2.x - p1.x, dy = p2.y - p1.y;
        const lenSq = dx * dx + dy * dy;
        if (lenSq < 0.0001) continue;
        let t = ((wx - p1.x) * dx + (wy - p1.y) * dy) / lenSq;
        // Clamp but leave a margin from endpoints to avoid snapping to labeled points
        const margin = 0.02;
        if (s.type === 'segment') t = Math.max(margin, Math.min(1 - margin, t));
        else if (s.type === 'ray') t = Math.max(margin, t);
        const candidate = { x: p1.x + t * dx, y: p1.y + t * dy };
        const d = Math.sqrt((wx - candidate.x) ** 2 + (wy - candidate.y) ** 2);
        if (d < bestDist && !isTooCloseToAnyPoint(candidate.x, candidate.y)) {
          bestDist = d; bestPt = candidate;
        }
      }
    }
    return bestPt;
  };

  /** Snap při tažení bodu / přímky — body a průsečíky mají prioritu, jinak místo na tvaru. */
  const getDragSnapPosition = (
    wx: number,
    wy: number,
    excludePointIds: Set<string>
  ): { x: number; y: number } | null => {
    const refineToPointCenter = (pos: { x: number; y: number }) => {
      const mergeWorld = 8 / scale;
      for (const p of pointsStateRef.current) {
        if (excludePointIds.has(p.id)) continue;
        if (!p.label) continue;
        if (Math.hypot(p.x - pos.x, p.y - pos.y) <= mergeWorld) {
          return { x: p.x, y: p.y };
        }
      }
      return pos;
    };

    const snappedPoint = getSnappingPoint(wx, wy, SNAP_PX, excludePointIds);
    if (snappedPoint) {
      const exact = pointsStateRef.current.find(p => p.id === snappedPoint.id) ?? snappedPoint;
      return { x: exact.x, y: exact.y };
    }
    const intSnap = findNearestIntersection(wx, wy, SNAP_PX);
    if (intSnap) return refineToPointCenter(intSnap);
    const shapeSnap = snapToNearestShape(wx, wy, SNAP_PX, excludePointIds);
    return shapeSnap ? refineToPointCenter(shapeSnap) : null;
  };

  /** Posune group-drag deltu tak, aby vybraná přímka prošla středem blízkého bodu. */
  const getLineThroughPointSnapOffset = (
    dx: number,
    dy: number,
    snapshots: { id: string; x: number; y: number }[],
    excludeIds: Set<string>,
    selectedShapeIds: string[],
    mouseWx: number,
    mouseWy: number
  ): { dx: number; dy: number; snapPoint: { x: number; y: number } | null; dist: number } => {
    const snapMap = new Map(snapshots.map(s => [s.id, s]));
    const lineTypes = new Set(['line', 'lineDashed', 'lineDashDot', 'segment']);
    let bestDx = dx;
    let bestDy = dy;
    let bestDist = SNAP_PX / scale;
    let bestSnapPoint: { x: number; y: number } | null = null;

    for (const shapeId of selectedShapeIds) {
      const shape = shapes.find(s => s.id === shapeId);
      if (!shape || !lineTypes.has(shape.type)) continue;
      const p1 = snapMap.get(shape.definition.p1Id);
      const p2 = shape.definition.p2Id ? snapMap.get(shape.definition.p2Id) : null;
      if (!p1 || !p2) continue;

      for (const pt of pointsStateRef.current) {
        if (excludeIds.has(pt.id)) continue;
        if (!pt.label) continue;

        const p1x = p1.x + dx;
        const p1y = p1.y + dy;
        const p2x = p2.x + dx;
        const p2y = p2.y + dy;
        const edx = p2x - p1x;
        const edy = p2y - p1y;
        const len = Math.hypot(edx, edy);
        if (len < 1e-6) continue;

        const signed = ((pt.y - p1y) * edx - (pt.x - p1x) * edy) / len;
        const dist = Math.abs(signed);
        const mouseNearPt = Math.hypot(mouseWx - pt.x, mouseWy - pt.y) * scale;
        const threshWorld =
          (mouseNearPt <= SNAP_PX * 2 ? SNAP_PX * 2.5 : SNAP_PX) / scale;
        if (dist >= threshWorld) continue;

        const nx = -edy / len;
        const ny = edx / len;
        if (dist < bestDist) {
          bestDist = dist;
          bestDx = dx + signed * nx;
          bestDy = dy + signed * ny;
          bestSnapPoint = { x: pt.x, y: pt.y };
        }
      }
    }

    return { dx: bestDx, dy: bestDy, snapPoint: bestSnapPoint, dist: bestDist };
  };

  /** U group dragu posune delta tak, aby nejbližší bod výběru přesně seděl na snap cíli. */
  const getGroupDragSnapOffset = (
    dx: number,
    dy: number,
    snapshots: { id: string; x: number; y: number }[],
    excludeIds: Set<string>,
    selectedShapeIds: string[],
    mouseWx: number,
    mouseWy: number
  ): { dx: number; dy: number; snapPoint: { x: number; y: number } | null } => {
    const lineSnap = getLineThroughPointSnapOffset(
      dx,
      dy,
      snapshots,
      excludeIds,
      selectedShapeIds,
      mouseWx,
      mouseWy
    );
    if (lineSnap.snapPoint) {
      return { dx: lineSnap.dx, dy: lineSnap.dy, snapPoint: lineSnap.snapPoint };
    }

    let bestDx = dx;
    let bestDy = dy;
    let bestDist = SNAP_PX / scale;
    let bestSnapPoint: { x: number; y: number } | null = null;

    for (const snap of snapshots) {
      const mx = snap.x + dx;
      const my = snap.y + dy;
      const pos = getDragSnapPosition(mx, my, excludeIds);
      if (!pos) continue;
      const dist = Math.hypot(mx - pos.x, my - pos.y);
      if (dist < bestDist) {
        bestDist = dist;
        bestDx = dx + (pos.x - mx);
        bestDy = dy + (pos.y - my);
        bestSnapPoint = pos;
      }
    }

    return { dx: bestDx, dy: bestDy, snapPoint: bestSnapPoint };
  };

  /** Přichytí světový bod k existujícímu bodu, průsečíku nebo čáře. */
  const snapToPointsAndShapes = (
    wx: number,
    wy: number,
    threshold = 25
  ): { x: number; y: number } => {
    const snapPoint = getSnapPositionPreferPoint(wx, wy, threshold);
    if (snapPoint) return snapPoint;
    const snapShape = snapToNearestShape(wx, wy, threshold);
    return snapShape ?? { x: wx, y: wy };
  };

  // Helper: najde nejbližší průsečík dvou čar/kružnic v okolí bodu
  const findNearestIntersection = (wx: number, wy: number, threshold = SNAP_PX): {x: number, y: number} | null => {
    const lineShapes = shapes.filter(s => ['line', 'lineDashed', 'lineDashDot', 'segment', 'ray'].includes(s.type));
    const circleShapes = shapes.filter(s => s.type === 'circle' || s.type === 'circleArc');
    const effectiveThreshold = threshold; // already accounts for tablet mode via SNAP_PX
    const thresh = effectiveThreshold / scale;

    let bestDist = thresh;
    let bestPoint: {x: number, y: number} | null = null;

    // 1. Line-line intersections
    for (let i = 0; i < lineShapes.length; i++) {
      for (let j = i + 1; j < lineShapes.length; j++) {
        const s1 = lineShapes[i];
        const s2 = lineShapes[j];
        const a1 = points.find(p => p.id === s1.definition.p1Id);
        const a2 = s1.definition.p2Id ? points.find(p => p.id === s1.definition.p2Id) : null;
        const b1 = points.find(p => p.id === s2.definition.p1Id);
        const b2 = s2.definition.p2Id ? points.find(p => p.id === s2.definition.p2Id) : null;
        if (!a1 || !a2 || !b1 || !b2) continue;

        const dx1 = a2.x - a1.x, dy1 = a2.y - a1.y;
        const dx2 = b2.x - b1.x, dy2 = b2.y - b1.y;
        const denom = dx1 * dy2 - dy1 * dx2;
        if (Math.abs(denom) < 1e-10) continue;

        const t = ((b1.x - a1.x) * dy2 - (b1.y - a1.y) * dx2) / denom;
        const u = ((b1.x - a1.x) * dy1 - (b1.y - a1.y) * dx1) / denom;

        const ix = a1.x + t * dx1;
        const iy = a1.y + t * dy1;
        const distWorld = Math.sqrt((ix - wx) ** 2 + (iy - wy) ** 2);

        if (s1.type === 'segment' && (t < 0 || t > 1)) continue;
        if (s1.type === 'ray' && t < 0) continue;
        if (s2.type === 'segment' && (u < 0 || u > 1)) continue;
        if (s2.type === 'ray' && u < 0) continue;

        if (distWorld < bestDist) {
          bestDist = distWorld;
          bestPoint = { x: ix, y: iy };
        }
      }
    }

    // 2. Circle-line intersections
    for (const circle of circleShapes) {
      const cc = points.find(p => p.id === circle.definition.p1Id);
      const cp = circle.definition.p2Id ? points.find(p => p.id === circle.definition.p2Id) : null;
      if (!cc || !cp) continue;
      const r = Math.sqrt((cp.x - cc.x) ** 2 + (cp.y - cc.y) ** 2);

      for (const line of lineShapes) {
        const lp1 = points.find(p => p.id === line.definition.p1Id);
        const lp2 = line.definition.p2Id ? points.find(p => p.id === line.definition.p2Id) : null;
        if (!lp1 || !lp2) continue;

        const ldx = lp2.x - lp1.x, ldy = lp2.y - lp1.y;
        const lLen = Math.sqrt(ldx * ldx + ldy * ldy);
        if (lLen < 1e-10) continue;

        // |P + t*D - C|^2 = r^2
        const fx = lp1.x - cc.x, fy = lp1.y - cc.y;
        const qa = ldx * ldx + ldy * ldy;
        const qb = 2 * (fx * ldx + fy * ldy);
        const qc = fx * fx + fy * fy - r * r;
        const discriminant = qb * qb - 4 * qa * qc;
        if (discriminant < 0) continue;

        const sqrtD = Math.sqrt(discriminant);
        for (const sign of [-1, 1]) {
          const t = (-qb + sign * sqrtD) / (2 * qa);
          if (line.type === 'segment' && (t < 0 || t > 1)) continue;
          if (line.type === 'ray' && t < 0) continue;

          const ix = lp1.x + t * ldx;
          const iy = lp1.y + t * ldy;
          const dist = Math.sqrt((ix - wx) ** 2 + (iy - wy) ** 2);
          if (dist < bestDist) {
            bestDist = dist;
            bestPoint = { x: ix, y: iy };
          }
        }
      }
    }

    // 3. Circle-circle intersections
    for (let i = 0; i < circleShapes.length; i++) {
      for (let j = i + 1; j < circleShapes.length; j++) {
        const c1 = circleShapes[i], c2 = circleShapes[j];
        const c1c = points.find(p => p.id === c1.definition.p1Id);
        const c1p = c1.definition.p2Id ? points.find(p => p.id === c1.definition.p2Id) : null;
        const c2c = points.find(p => p.id === c2.definition.p1Id);
        const c2p = c2.definition.p2Id ? points.find(p => p.id === c2.definition.p2Id) : null;
        if (!c1c || !c1p || !c2c || !c2p) continue;

        const r1 = Math.sqrt((c1p.x - c1c.x) ** 2 + (c1p.y - c1c.y) ** 2);
        const r2 = Math.sqrt((c2p.x - c2c.x) ** 2 + (c2p.y - c2c.y) ** 2);
        const ddx = c2c.x - c1c.x, ddy = c2c.y - c1c.y;
        const d = Math.sqrt(ddx * ddx + ddy * ddy);

        if (d > r1 + r2 || d < Math.abs(r1 - r2) || d < 1e-10) continue;

        const aa = (r1 * r1 - r2 * r2 + d * d) / (2 * d);
        const h = Math.sqrt(Math.max(0, r1 * r1 - aa * aa));
        const mx = c1c.x + aa * ddx / d;
        const my = c1c.y + aa * ddy / d;

        for (const sign of [-1, 1]) {
          const ix = mx + sign * h * ddy / d;
          const iy = my - sign * h * ddx / d;
          const dist = Math.sqrt((ix - wx) ** 2 + (iy - wy) ** 2);
          if (dist < bestDist) {
            bestDist = dist;
            bestPoint = { x: ix, y: iy };
          }
        }
      }
    }

    return bestPoint;
  };

  // --- INTERAKCE MYŠÍ ---
  
  // Helper: zoom k středu viewportu (pro tlačítka a slider)
  const zoomToCenter = (newScale: number) => {
    const clampedScale = Math.min(Math.max(0.1, newScale), 5);
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) {
      setScale(clampedScale);
      return;
    }
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;
    const worldX = (centerX - offset.x) / scale;
    const worldY = (centerY - offset.y) / scale;
    setScale(clampedScale);
    setOffset({
      x: centerX - worldX * clampedScale,
      y: centerY - worldY * clampedScale
    });
  };

  const handleWheel = (e: React.WheelEvent) => {
    // preventDefault() is already called by the native listener (passive: false) above
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;

    // Aktuální pozice myši v rámci elementu
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    // Citlivost zoomu
    const zoomFactor = -e.deltaY * 0.005;
    const newScale = Math.min(Math.max(0.1, scale + zoomFactor), 5);
    
    // Zoomování směrem k myši:
    // Světové souřadnice pod myší před zoomem
    const worldX = (mouseX - offset.x) / scale;
    const worldY = (mouseY - offset.y) / scale;

    // Nový offset tak, aby světové souřadnice pod myší zůstaly stejné
    const newOffsetX = mouseX - worldX * newScale;
    const newOffsetY = mouseY - worldY * newScale;

    setScale(newScale);
    setOffset({ x: newOffsetX, y: newOffsetY });
  };

  /** Hover nad čárou pro nástroje úhel/kolmice — stejná geometrie jako v handleMouseMove. Na tabletu se v mousedown volá znovu u pozice ťuku, protože React stav hoveredShape je často o snímek pozadu. */
  const getLineHoverAtWorld = (
    wx: number,
    wy: number
  ): { id: string; proj: { x: number; y: number }; angle: number } | null => {
    if (activeTool !== 'angle' && activeTool !== 'perpendicular') return null;
    let closest: { id: string; proj: { x: number; y: number }; angle: number } | null = null;
    const isInPositioningMode =
      (activeTool === 'perpendicular' && isTabletMode && perpTabletState.step === 'positioning') ||
      (activeTool === 'angle' && isTabletMode && angleTabletState.step === 'positioning');
    const isTouchActive = (Date.now() - lastTouchTimeRef.current) < 1000;
    const baseThreshold = isTouchActive ? 80 : 50;
    let minD = isInPositioningMode ? Infinity : baseThreshold / scale;

    const hoverShapePriority = (t: GeoShape['type']) =>
      activeTool === 'perpendicular'
        ? ({ segment: 5, ray: 4, lineDashed: 3, lineDashDot: 3, line: 2 } as const)[t] ?? 0
        : ({ segment: 4, lineDashed: 3, lineDashDot: 3, line: 2 } as const)[t] ?? 0;

    shapes.forEach(shape => {
      const isPerpRay = activeTool === 'perpendicular' && shape.type === 'ray';
      // Úhloměr: přímka/úsečka. Kolmice: navíc i polopřímka (narýsované rameno úhlu).
      if (
        shape.type === 'segment' ||
        shape.type === 'line' ||
        shape.type === 'lineDashed' ||
        shape.type === 'lineDashDot' ||
        isPerpRay
      ) {
        if (activeTool === 'perpendicular' && isTabletMode && perpTabletState.step === 'positioning') {
          if (shape.id !== perpTabletState.selectedLineId) return;
        }
        if (activeTool === 'angle' && isTabletMode && angleTabletState.step === 'positioning') {
          if (shape.id !== angleTabletState.selectedLineId) return;
        }
        const p1 = points.find(p => p.id === shape.definition.p1Id);
        const p2 = points.find(p => p.id === shape.definition.p2Id);
        if (p1 && p2) {
          let start = p1;
          let end = p2;
          if (shape.type === 'line' || shape.type === 'lineDashed' || shape.type === 'lineDashDot') {
            const dx = p2.x - p1.x;
            const dy = p2.y - p1.y;
            const len = Math.sqrt(dx * dx + dy * dy);
            if (len > 0.001) {
              const EXT = 100000;
              if (shape.type === 'line' || shape.type === 'lineDashed' || shape.type === 'lineDashDot') {
                start = { x: p1.x - (dx / len) * EXT, y: p1.y - (dy / len) * EXT } as any;
              }
              end = { x: p1.x + (dx / len) * EXT, y: p1.y + (dy / len) * EXT } as any;
            }
          } else if (shape.type === 'ray') {
            const dx = p2.x - p1.x;
            const dy = p2.y - p1.y;
            const len = Math.sqrt(dx * dx + dy * dy);
            if (len > 0.001) {
              const EXT = 100000;
              start = p1;
              end = { x: p1.x + (dx / len) * EXT, y: p1.y + (dy / len) * EXT } as any;
            }
          }

          const res = distToSegment({ x: wx, y: wy }, start, end);
          const currentShape = closest ? shapes.find(s => s.id === closest!.id) : undefined;
          const preferCandidate =
            res.dist < minD - 1e-6 ||
            (Math.abs(res.dist - minD) < 1e-6 &&
              (!currentShape || hoverShapePriority(shape.type) > hoverShapePriority(currentShape.type)));
          if (preferCandidate) {
            minD = res.dist;
            const angle = Math.atan2(p2.y - p1.y, p2.x - p1.x);
            closest = { id: shape.id, proj: res.proj, angle };
          }
        }
      }
    });
    return closest;
  };

  /** Hover nad přímkou/úsečkou/polopřímkou pro snap úhloměru (NE pro výběr linky v angle/perpendicular workflow). */
  const getLineHoverForProtractorSnap = (
    wx: number,
    wy: number
  ): { id: string; proj: { x: number; y: number }; angle: number } | null => {
    let closest: { id: string; proj: { x: number; y: number }; angle: number } | null = null;
    const isTouchActive = Date.now() - lastTouchTimeRef.current < 1000;
    const baseThreshold = isTouchActive ? 80 : 50;
    let minD = baseThreshold / scale;

    const hoverShapePriority = (t: GeoShape['type']) =>
      ({ segment: 5, ray: 4, lineDashed: 3, lineDashDot: 3, line: 2 } as const)[t] ?? 0;

    for (const shape of shapes) {
      if (
        shape.type !== 'segment' &&
        shape.type !== 'line' &&
        shape.type !== 'lineDashed' &&
        shape.type !== 'lineDashDot' &&
        shape.type !== 'ray'
      ) {
        continue;
      }

      const p1 = points.find(p => p.id === shape.definition.p1Id);
      const p2 = shape.definition.p2Id ? points.find(p => p.id === shape.definition.p2Id) : null;
      if (!p1 || !p2) continue;

      let start = p1;
      let end = p2;

      if (shape.type === 'line' || shape.type === 'lineDashed' || shape.type === 'lineDashDot') {
        const dx = p2.x - p1.x;
        const dy = p2.y - p1.y;
        const len = Math.sqrt(dx * dx + dy * dy);
        if (len > 0.001) {
          const EXT = 100000;
          start = { x: p1.x - (dx / len) * EXT, y: p1.y - (dy / len) * EXT } as any;
          end = { x: p1.x + (dx / len) * EXT, y: p1.y + (dy / len) * EXT } as any;
        }
      } else if (shape.type === 'ray') {
        const dx = p2.x - p1.x;
        const dy = p2.y - p1.y;
        const len = Math.sqrt(dx * dx + dy * dy);
        if (len > 0.001) {
          const EXT = 100000;
          start = p1;
          end = { x: p1.x + (dx / len) * EXT, y: p1.y + (dy / len) * EXT } as any;
        }
      }

      const res = distToSegment({ x: wx, y: wy }, start, end);
      const currentShape = closest ? shapes.find(s => s.id === closest!.id) : undefined;
      const preferCandidate =
        res.dist < minD - 1e-6 ||
        (Math.abs(res.dist - minD) < 1e-6 &&
          (!currentShape || hoverShapePriority(shape.type) > hoverShapePriority(currentShape.type)));

      if (preferCandidate) {
        minD = res.dist;
        const angle = Math.atan2(p2.y - p1.y, p2.x - p1.x);
        closest = { id: shape.id, proj: res.proj, angle };
      }
    }

    return closest;
  };

  /** Přichytí střed umístěného úhloměru k bodům, úsečkám a přímkám. */
  const snapPlacedProtractor = (
    wx: number,
    wy: number,
    currentAngle: number,
    thresholdPx = 30
  ): { center: { x: number; y: number }; baseAngle: number } => {
    const posSnap = getSnapPositionPreferPoint(wx, wy, thresholdPx);
    if (posSnap) {
      const lineAlign = getLineHoverForProtractorSnap(posSnap.x, posSnap.y);
      return {
        center: posSnap,
        baseAngle: lineAlign?.angle ?? currentAngle,
      };
    }

    const lineHover = getLineHoverForProtractorSnap(wx, wy);
    if (lineHover) {
      return {
        center: lineHover.proj,
        baseAngle: lineHover.angle,
      };
    }

    const shapeSnap = snapToNearestShape(wx, wy, thresholdPx);
    if (shapeSnap) {
      const lineAlign = getLineHoverForProtractorSnap(shapeSnap.x, shapeSnap.y);
      return {
        center: shapeSnap,
        baseAngle: lineAlign?.angle ?? currentAngle,
      };
    }

    return { center: { x: wx, y: wy }, baseAngle: currentAngle };
  };

  const removeAngleArmHelperPoint = () => {
    const id = angleArmHelperPointIdRef.current;
    if (!id) return;
    angleArmHelperPointIdRef.current = null;
    setPoints(prev => prev.filter(p => p.id !== id));
  };

  const syncAngleArmHelperPoint = () => {
    if (activeTool !== 'angle') {
      removeAngleArmHelperPoint();
      return;
    }
    if (animState.isActive && animState.type === 'angle') return;

    const center = protractorCenterRef.current ?? angleInput.customVertex ?? null;
    if (!center) {
      removeAngleArmHelperPoint();
      return;
    }
    const baseAngle = protractorCenterRef.current
      ? protractorAngleRef.current
      : (angleInput.baseAngle ?? 0);
    const armEnd = protractorArmEndWorld(
      center,
      baseAngle,
      angleInput.value,
      angleInput.rotationOffset,
      angleInput.isMirrored
    );

    const existingId = angleArmHelperPointIdRef.current;
    if (existingId) {
      setPoints(prev =>
        prev.map(p =>
          p.id === existingId ? { ...p, x: armEnd.x, y: armEnd.y, hidden: false, locked: true } : p
        )
      );
      return;
    }

    const newId = crypto.randomUUID();
    angleArmHelperPointIdRef.current = newId;
    setPoints(prev => [
      ...prev,
      {
        id: newId,
        x: armEnd.x,
        y: armEnd.y,
        label: '',
        hidden: false,
        locked: true,
      },
    ]);
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (animState.isActive) return;
    
    // Zavřít otevřené submenu při kliknutí na canvas
    setActiveGroup(null);
    
    // Ignorovat syntetické *mouse* události z prohlížeče krátce po touchi (duplicitní klik).
    // Dotyk z handleTouchStart volá handleMouseDown s __fromTouchBridge — ten se nesmí zahodit.
    const fromTouchBridge = Boolean((e as unknown as { __fromTouchBridge?: boolean }).__fromTouchBridge);
    if (!fromTouchBridge) {
      const timeSinceTouch = Date.now() - lastTouchTimeRef.current;
      if (timeSinceTouch < 500 && timeSinceTouch > 0) {
        return;
      }
    }

    if (readOnlyCanvas) {
      isPanning.current = true;
      lastPanPos.current = { x: e.clientX, y: e.clientY };
      return;
    }

    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const wx = (e.clientX - rect.left - offset.x) / scale;
    const wy = (e.clientY - rect.top - offset.y) / scale;

    // Tablet touch: synchronní hover nad čárou v místě ťuku (stav hoveredShape z předchozího gesta by jinak vybral špatnou linku)
    const lineHoverForAnglePerp =
      fromTouchBridge && isTabletMode && (activeTool === 'angle' || activeTool === 'perpendicular')
        ? getLineHoverAtWorld(wx, wy)
        : hoveredShape;
    if (fromTouchBridge && isTabletMode && (activeTool === 'angle' || activeTool === 'perpendicular')) {
      setHoveredShape(lineHoverForAnglePerp);
    }

    // Compass mode - handle center/handle dragging or repositioning
    if (
      circleInput.visible &&
      circleInput.center &&
      !circleInput.fixedRadius &&
      circleInput.freeDrawMode === 'pickArc'
    ) {
      const r = circleInput.radius * PIXELS_PER_CM;
      const snap = snapToCirclePerimeter(wx, wy, circleInput.center, r);
      circleArcDrawRef.current = {
        startAngle: snap.angle,
        endAngle: snap.angle,
        lastAngle: snap.angle,
      };
      setCircleInput(prev => ({
        ...prev,
        arcDraw: { startAngle: snap.angle, endAngle: snap.angle },
        arcCrosshair: { x: snap.x, y: snap.y },
      }));
      return;
    }

    if (circleInput.visible && circleInput.center) {
      const r = circleInput.radius * PIXELS_PER_CM;
      const ha = circleInput.handleAngle;
      const handleX = circleInput.center.x + Math.cos(ha) * r;
      const handleY = circleInput.center.y + Math.sin(ha) * r;
      // Badge otočení je kousek za tužkou
      const badgeX = handleX + Math.cos(ha) * (28 / scale);
      const badgeY = handleY + Math.sin(ha) * (28 / scale);
      
      const distToHandle = Math.hypot(wx - handleX, wy - handleY);
      const distToBadge = Math.hypot(wx - badgeX, wy - badgeY);
      const distToCenter = Math.hypot(wx - circleInput.center.x, wy - circleInput.center.y);
      
      const handleThreshold = 48 / scale;
      const badgeThreshold = 28 / scale;
      const centerThreshold = 52 / scale;
      // Tělo kružítka (mezi středem a tužkou) — posun
      const onBody =
        distToCenter < r * 0.75 &&
        distToCenter > centerThreshold * 0.5 &&
        distToHandle > handleThreshold;
      
      if (distToHandle < handleThreshold || distToBadge < badgeThreshold) {
        circleLiveRef.current = {
          center: { ...circleInput.center },
          radius: circleInput.radius,
          handleAngle: circleInput.handleAngle,
        };
        setCircleInput(prev => ({ ...prev, isDraggingHandle: true }));
      } else if (distToCenter < centerThreshold || onBody) {
        circleLiveRef.current = {
          center: { ...circleInput.center },
          radius: circleInput.radius,
          handleAngle: circleInput.handleAngle,
        };
        setCircleInput(prev => ({ ...prev, isDraggingCenter: true }));
      }
      return;
    }
    // circleInput.visible + no center: center is initialized by effect when circle tool is selected

    // Nástroj Pravítko — rýsování přímky podél strany nebo posun/otočení
    if (activeTool === 'triangleRuler') {
      // Interakce uživatele ukončí intro animaci (ponechá aktuální pozici).
      if (rulerIntroRef.current.active) {
        stopRulerIntroAnimation(true);
      }
      const angle = rulerAngleRef.current;
      let pivot = rulerPivotRef.current ?? rulerToolState.pivot;
      if (!pivot) {
        const cx = (canvasSize.width / 2 - offset.x) / scale;
        const cy = (canvasSize.height / 2 - offset.y) / scale;
        pivot = { x: cx, y: cy };
        rulerPivotRef.current = pivot;
      }

      if (rulerToolState.drawMode === 'pickEdge') {
        const snappedInput = getRulerDrawSnapInput(wx, wy, pivot);
        const snap = snapToRulerEdge(snappedInput.x, snappedInput.y, pivot, angle, scale);
        rulerLineDrawRef.current = {
          edge: snap.edge,
          start: { x: snap.point.x, y: snap.point.y },
          end: { x: snap.point.x, y: snap.point.y },
        };
        setRulerToolState(prev => ({
          ...prev,
          crosshair: snap.point,
          lineDraw: {
            edge: snap.edge,
            start: snap.point,
            end: snap.point,
          },
        }));
        return;
      }

      const hit = hitTestPlacedRuler(wx, wy, pivot, angle, scale, isTabletMode);
      if (hit.type === 'miss') return;

      rulerDraggingRef.current = true;

      if (hit.type === 'rotate') {
        rulerDragModeRef.current = 'rotate';
        rulerRotateCornerRef.current = null;
        rulerDragStartRef.current = null;
        const anchor =
          rulerRotationAnchorRef.current ?? {
            local: { x: RULER_ROTATION_PIVOT_LOCAL.x, y: RULER_ROTATION_PIVOT_LOCAL.y },
            world: pivot,
          };
        rulerRotateStartRef.current = {
          mouseAngle: Math.atan2(wy - anchor.world.y, wx - anchor.world.x),
          startAngle: angle,
        };
        setRulerToolState(prev => ({
          ...prev,
          active: true,
          pivot,
          isDragging: true,
        }));
      } else {
        // body — posun
        rulerDragModeRef.current = 'move';
        rulerRotateStartRef.current = null;
        rulerDragStartRef.current = {
          mouseX: wx,
          mouseY: wy,
          pivotX: pivot.x,
          pivotY: pivot.y,
        };
        setRulerToolState(prev => ({
          ...prev,
          active: true,
          pivot,
          isDragging: true,
        }));
      }
      return;
    }

    // Nástroj Úhloměr — umístěný úhloměr (posun/otočení) místo původního "klik na čáru" workflow
    if (activeTool === 'angle') {
      const center = protractorCenterRef.current ?? {
        x: (canvasSize.width / 2 - offset.x) / scale,
        y: (canvasSize.height / 2 - offset.y) / scale,
      };
      protractorCenterRef.current = center;
      const baseAngle = protractorAngleRef.current;
      const hit = hitTestPlacedProtractor(
        wx,
        wy,
        center,
        baseAngle,
        scale,
        angleInput.value,
        angleInput.rotationOffset,
        angleInput.isMirrored
      );
      if (hit.type === 'miss') return;

      protractorDraggingRef.current = true;
      if (hit.type === 'rotate') {
        protractorDragModeRef.current = 'rotate';
        protractorDragStartRef.current = null;
        protractorRotateStartRef.current = {
          mouseAngle: Math.atan2(wy - center.y, wx - center.x),
          startAngle: baseAngle,
        };
      } else if (hit.type === 'arm') {
        protractorDragModeRef.current = 'arm';
        protractorDragStartRef.current = null;
        protractorRotateStartRef.current = null;
      } else {
        protractorDragModeRef.current = 'move';
        protractorRotateStartRef.current = null;
        protractorDragStartRef.current = {
          mouseX: wx,
          mouseY: wy,
          centerX: center.x,
          centerY: center.y,
        };
      }

      // Sync panel state immediately
      setAngleInput(prev => ({
        ...prev,
        visible: true,
        customVertex: center,
        baseAngle,
        vertexId: null,
        directionId: null,
      }));
      return;
    }

    if (angleInput.visible && activeTool !== 'angle') {
      showCanvasWarning('Nejdříve nastavte úhel');
      return; // Nedělat nic - uživatel musí kliknout na "Narýsovat" nebo zavřít popup
    }

    if (segmentInput.visible) {
      showCanvasWarning('Nejdříve nastavte délku');
      return; // Nedělat nic - uživatel musí kliknout na "Použít" nebo zavřít popup
    }

    // Pokud máme nástroj úhel a hoverujeme nad tvarem, otevřeme dialog (lineHoverForAnglePerp = přesný hit u tablet touch)
    if (activeTool === 'angle' && lineHoverForAnglePerp) {
        const hs = lineHoverForAnglePerp;
        // Tablet mód - krokový workflow
        if (isTabletMode) {
          if (angleTabletState.step === 'selectLine') {
            // Krok 1: Výběr linky (s přichytáváním na body)
            const baseShape = shapes.find(s => s.id === hs.id);
            if (baseShape && ['line', 'lineDashed', 'lineDashDot', 'segment'].includes(baseShape.type)) {
              let initPos = hs.proj;
              const snap = getSnapPosition(hs.proj.x, hs.proj.y, 25);
              if (snap) initPos = snap;
              setAngleTabletState({
                step: 'positioning',
                selectedLineId: baseShape.id,
                currentPos: initPos,
                baseAngle: hs.angle
              });
            }
            return;
          }
          // Krok 2: positioning - čekáme na tlačítko, ne na klik
          return;
        }
        
        // PC mód - původní logika (jeden klik otevře popup) s přichytáváním na body/průsečíky
        let anglePos = hs.proj;
        const snapAngle = getSnapPosition(hs.proj.x, hs.proj.y, 25);
        if (snapAngle) {
          anglePos = snapAngle;
        }
        setAngleInput({
            visible: true,
            value: 45,
            vertexId: null, 
            directionId: null,
            customVertex: anglePos,
            baseAngle: hs.angle,
            rotationOffset: 0,
            isMirrored: false
        });
        return;
    }
    // Tablet mód úhloměr - pokud jsme v positioning a klikli mimo linku, ignoruj
    if (activeTool === 'angle' && isTabletMode && angleTabletState.step === 'positioning') {
        return;
    }
    
    // TABLET MÓD - Detekce kliknutí na handle kružnice (PŘED snappingem!)
    if (activeTool === 'circle' && isTabletMode && circleTabletState.active && circleTabletState.center) {
      // Spočítám pozici handle - použij handlePos pokud existuje, jinak fallback napravo
      const handleX = circleTabletState.handlePos 
        ? circleTabletState.handlePos.x 
        : circleTabletState.center.x + circleTabletState.radius;
      const handleY = circleTabletState.handlePos 
        ? circleTabletState.handlePos.y 
        : circleTabletState.center.y;
      const distToHandle = Math.sqrt(Math.pow(wx - handleX, 2) + Math.pow(wy - handleY, 2));
      
      if (distToHandle < 40) {
        setCircleTabletState(prev => ({
          ...prev,
          isDraggingHandle: true
        }));
        return;
      }
    }

    // When picking the second point of a segment, snapping back to the first point (A) should be
    // possible, but only in a very small radius. Otherwise it feels "sticky".
    const segmentFirstPointId = activeTool === 'segment' && selectedPointId ? selectedPointId : null;
    const snappedOther = getSnappingPoint(
      wx,
      wy,
      SNAP_PX,
      segmentFirstPointId ?? undefined,
      activeTool === 'move',
    );
    const segmentAOnlySnapPx = isTabletMode ? 14 : 10;
    const snappedA = segmentFirstPointId
      ? getSnappingPoint(wx, wy, segmentAOnlySnapPx, undefined, activeTool === 'move')
      : null;
    const snapped =
      segmentFirstPointId && snappedA?.id === segmentFirstPointId ? snappedA : snappedOther;

    // NÁSTROJ: POSUN PLÁTNA (PAN)
    if (activeTool === 'pan') {
       isPanning.current = true;
       lastPanPos.current = { x: e.clientX, y: e.clientY };
       return;
    }

    // 1. NÁSTROJ: POSUN (MOVE) — výběr bodů i tvarů + group drag
    if (activeTool === 'move') {
      if (snapped) {
        // Locked point cannot be moved (but can still be selected).
        if (isPointLocked(snapped.id)) {
          setSelection(snapped.id);
          if (!(e.ctrlKey || e.metaKey)) setSelectedShapeIds([]);
          toast.message('Objekt je zamčený.');
          return;
        }

        // Circle radius handle: when user grabs the handle point (p2Id),
        // do NOT group-drag the whole circle; drag only this point to resize.
        const circleForHandleDrag = shapes.find(
          s =>
            (s.type === 'circle' || s.type === 'circleArc') &&
            selectedShapeIds.includes(s.id) &&
            s.definition.p2Id === snapped.id,
        );
        if (circleForHandleDrag) {
          suppressHistoryRef.current = true;
          didDragSinceSuppressRef.current = false;
          draggedPointIdRef.current = snapped.id;
          setDraggedPointId(snapped.id);
          setSelection(snapped.id);
          // Keep the circle selected; do not clear selectedShapeIds.
          return;
        }

        // Bod je součástí vybraných tvarů? => group drag
        const isPartOfSelection = selectedShapeIds.length > 0 && shapes.some(s => 
          selectedShapeIds.includes(s.id) && s.points.includes(snapped.id)
        );
        if (isPartOfSelection) {
          if (isAnySelectedShapeLocked()) {
            setSelection(snapped.id);
            toast.message('Objekt je zamčený.');
            return;
          }
          // Začít group drag všech bodů vybraných tvarů
          suppressHistoryRef.current = true;
          didDragSinceSuppressRef.current = false;
          const allPointIds = new Set<string>();
          shapes.forEach(s => {
            if (selectedShapeIds.includes(s.id)) s.points.forEach(pid => allPointIds.add(pid));
          });
          if (areAnyPointsLocked(allPointIds)) {
            setSelection(snapped.id);
            toast.message('Objekt je zamčený.');
            return;
          }
          groupDragRef.current = {
            startWx: wx, startWy: wy,
            pointSnapshots: points.filter(p => allPointIds.has(p.id)).map(p => ({ id: p.id, x: p.x, y: p.y }))
          };
        } else {
          suppressHistoryRef.current = true;
          didDragSinceSuppressRef.current = false;
          draggedPointIdRef.current = snapped.id;
          setDraggedPointId(snapped.id);
          setSelection(snapped.id);
          if (!(e.ctrlKey || e.metaKey)) setSelectedShapeIds([]);
        }
      } else {
        // Zkusit vybrat tvar kliknutím
        const clickedShapeId = getHoveredShapeAtPoint(wx, wy);
        if (clickedShapeId) {
          const clickedLocked = Boolean(shapes.find(s => s.id === clickedShapeId)?.locked);
          const alreadySelected = selectedShapeIds.includes(clickedShapeId);
          if (e.ctrlKey || e.metaKey) {
            // Ctrl+klik: přepnout výběr (bez zahájení tahu)
            setSelectedShapeIds(prev => 
              alreadySelected 
                ? prev.filter(id => id !== clickedShapeId)
                : [...prev, clickedShapeId]
            );
          } else {
            // Normální klik: vybrat tvar a připravit group drag
            if (!alreadySelected) {
              setSelectedShapeIds([clickedShapeId]);
            }
            if (clickedLocked) {
              toast.message('Objekt je zamčený.');
              setSelection(null);
              setSelectedFreehandIds([]);
              return;
            }
            const effectiveIds = alreadySelected ? selectedShapeIds : [clickedShapeId];
            const allPointIds = new Set<string>();
            shapes.forEach(s => {
              if (effectiveIds.includes(s.id)) s.points.forEach(pid => allPointIds.add(pid));
            });
            if (allPointIds.size > 0) {
              if (areAnyPointsLocked(allPointIds)) {
                toast.message('Objekt je zamčený.');
                setSelection(null);
                setSelectedFreehandIds([]);
                return;
              }
              suppressHistoryRef.current = true;
              didDragSinceSuppressRef.current = false;
              groupDragRef.current = {
                startWx: wx, startWy: wy,
                pointSnapshots: points.filter(p => allPointIds.has(p.id)).map(p => ({ id: p.id, x: p.x, y: p.y }))
              };
            }
          }
          setSelection(null);
          setSelectedFreehandIds([]);
        } else {
          // Zkusit vybrat volnou kresbu / zvýrazňovač
          const clickedFreehandId = getFreehandPathAtPoint(wx, wy);
          if (clickedFreehandId) {
            if (e.ctrlKey || e.metaKey) {
              setSelectedFreehandIds(prev =>
                prev.includes(clickedFreehandId)
                  ? prev.filter(id => id !== clickedFreehandId)
                  : [...prev, clickedFreehandId]
              );
            } else {
              setSelectedFreehandIds([clickedFreehandId]);
            }
            setSelection(null);
            setSelectedShapeIds([]);
          } else {
            // Empty space click: start rectangle marquee selection
            setSelection(null);
            setSelectedFreehandIds([]);
            if (!(e.ctrlKey || e.metaKey)) {
              setSelectedShapeIds([]);
            }
            groupDragRef.current = null;
            marqueeRef.current = { startX: wx, startY: wy, endX: wx, endY: wy };
          }
        }
      }
      return;
    }

    // 1b. NÁSTROJ: GUMA (ERASER) — smaže bod nebo tvar pod kurzorem
    if (activeTool === 'eraser') {
      const prot = assignmentBaselineProtectedRef.current;
      const eraseSelectedShapes = () => {
        const ids = new Set(selectedShapeIds.filter(id => !prot.shapes.has(id)));
        if (ids.size === 0) {
          if (selectedShapeIds.some(id => prot.shapes.has(id))) {
            toast.message('Část zadání ze sdíleného plátna nelze smazat.');
          }
          return false;
        }
        const pointIdsToDelete = new Set<string>();
        shapes.forEach(s => {
          if (ids.has(s.id)) s.points.forEach(pid => pointIdsToDelete.add(pid));
        });
        setShapes(prev => prev.filter(s => !ids.has(s.id)));
        // Remove anchor points that are not used by remaining shapes and have no label
        const remainingShapes = shapes.filter(s => !ids.has(s.id));
        const usedPointIds = new Set<string>();
        remainingShapes.forEach(s => s.points.forEach(pid => usedPointIds.add(pid)));
        setPoints(prev =>
          prev.filter(p => {
            if (prot.points.has(p.id)) return true;
            if (!pointIdsToDelete.has(p.id)) return true;
            if (usedPointIds.has(p.id)) return true;
            if (p.label) return true;
            return false;
          }),
        );
        setSelectedShapeIds([]);
        setSelection(null);
        return true;
      };

      // Prefer snapped point (click on point deletes it)
      if (snapped) {
        deletePoint(snapped.id);
        return;
      }
      // Otherwise delete the hovered shape (keep labeled points)
      const shapeId = hoveredShapeForMove ?? getHoveredShapeAtPoint(wx, wy);
      if (shapeId) {
        // If the clicked shape is selected, erase the whole selection.
        if (selectedShapeIds.includes(shapeId) && eraseSelectedShapes()) return;

        if (prot.shapes.has(shapeId)) {
          toast.message('Část zadání ze sdíleného plátna nelze smazat.');
          return;
        }

        const erasedShape = shapes.find(s => s.id === shapeId);
        setShapes(prev => prev.filter(s => s.id !== shapeId));
        if (erasedShape) {
          const remainingShapes = shapes.filter(s => s.id !== shapeId);
          const usedByOthers = new Set<string>();
          remainingShapes.forEach(s => s.points.forEach(pid => usedByOthers.add(pid)));
          setPoints(prev => prev.filter(p => {
            if (prot.points.has(p.id)) return true;
            if (!erasedShape.points.includes(p.id)) return true;
            if (usedByOthers.has(p.id)) return true;
            if (p.label) return true;
            return false;
          }));
        }
        // Clear selection if we erased the selected item.
        if (selectedShapeIds.includes(shapeId)) setSelectedShapeIds([]);
        return;
      }
      const freehandId = getFreehandPathAtPoint(wx, wy);
      if (freehandId) {
        if (prot.freehand.has(freehandId)) {
          toast.message('Část zadání ze sdíleného plátna nelze smazat.');
          return;
        }
        setFreehandPaths(prev => prev.filter(p => p.id !== freehandId));
      }
      return;
    }

    // 2. NÁSTROJ: BOD (POINT)
    if (activeTool === 'point') {
      // Snap priority: intersection > line > free placement. Never snap to existing labeled points.
      // Intersection always wins if present in range.
      const intersection = findNearestIntersection(wx, wy);
      const lineSnap = intersection ? null : snapToNearestShape(wx, wy);

      let px = wx;
      let py = wy;
      let promotedHidden = false;

      if (intersection) {
        px = intersection.x;
        py = intersection.y;
        const hiddenAtIntersection = points.find(p => (!p.label || p.hidden) && Math.sqrt((p.x - px) ** 2 + (p.y - py) ** 2) * scale < 6);
        if (hiddenAtIntersection) {
          const assignedLabel = promoteToVisiblePoint(hiddenAtIntersection.id);
          triggerEffect(px, py, '#3b82f6');
          if (assignedLabel) addConstructionStep('point', assignedLabel, assignedLabel, `Bod ${assignedLabel}`, [hiddenAtIntersection.id], descLatexPoint(assignedLabel));
          clearSelectionAfterPlacement();
          promotedHidden = true;
        }
      } else if (lineSnap) {
        px = lineSnap.x;
        py = lineSnap.y;
        const hiddenAtLine = points.find(p => (!p.label || p.hidden) && Math.sqrt((p.x - px) ** 2 + (p.y - py) ** 2) * scale < 6);
        if (hiddenAtLine) {
          const assignedLabel = promoteToVisiblePoint(hiddenAtLine.id);
          triggerEffect(px, py, '#3b82f6');
          if (assignedLabel) addConstructionStep('point', assignedLabel, assignedLabel, `Bod ${assignedLabel}`, [hiddenAtLine.id], descLatexPoint(assignedLabel));
          clearSelectionAfterPlacement();
          promotedHidden = true;
        }
      }

      if (!promotedHidden) {
        // If there's a hidden construction point exactly here (common for protractor-created angles),
        // promote it even when we didn't snap to an intersection/line.
        const hiddenNearby = points.find(
          p =>
            p.hidden &&
            Math.sqrt((p.x - px) ** 2 + (p.y - py) ** 2) * scale < 6,
        );
        if (hiddenNearby) {
          const assignedLabel = promoteToVisiblePoint(hiddenNearby.id);
          triggerEffect(px, py, '#3b82f6');
          if (assignedLabel)
            addConstructionStep(
              'point',
              assignedLabel,
              assignedLabel,
              `Bod ${assignedLabel}`,
              [hiddenNearby.id],
              descLatexPoint(assignedLabel),
            );
          clearSelectionAfterPlacement();
          return;
        }

        // Check if a labeled point is already very close to this position
        const alreadyThere = points.some(p => p.label && Math.sqrt((p.x - px) ** 2 + (p.y - py) ** 2) * scale < 6);
        if (!alreadyThere) {
          const newPoint: GeoPoint = {
            id: crypto.randomUUID(),
            x: px,
            y: py,
            label: getNextPointLabel()
          };
          setPoints(prev => [...prev, newPoint]);
          triggerEffect(px, py, '#3b82f6');
          addConstructionStep('point', newPoint.label, newPoint.label, `Bod ${newPoint.label}`, [newPoint.id], descLatexPoint(newPoint.label));
          clearSelectionAfterPlacement();
        }
      }
      return;
    }

    // 3. NÁSTROJ: KOLMICE
    if (activeTool === 'perpendicular') {
      // Tablet mód - speciální workflow
      if (isTabletMode) {
        if (perpTabletState.step === 'selectLine') {
          // Krok 1: Výběr linky (s přichytáváním na body)
          if (lineHoverForAnglePerp) {
            const hs = lineHoverForAnglePerp;
            const baseShape = shapes.find(s => s.id === hs.id);
            if (baseShape && ['line', 'lineDashed', 'segment', 'ray'].includes(baseShape.type)) {
              let initPos = hs.proj;
              const snap = getSnapPositionPreferPoint(hs.proj.x, hs.proj.y, 25, undefined, true);
              if (snap) initPos = snap;
              setPerpTabletState({
                step: 'positioning',
                selectedLineId: baseShape.id,
                currentPos: initPos
              });
            }
          }
          return;
        }
        // Krok 2: positioning - čekáme na tlačítko "Narýsovat", ne na klik
        return;
      }
      
      // PC mód - původní logika (jeden klik)
      if (lineHoverForAnglePerp) {
        const hs = lineHoverForAnglePerp;
        const baseShape = shapes.find(s => s.id === hs.id);
        if (baseShape && ['line', 'lineDashed', 'segment', 'ray'].includes(baseShape.type)) {
            
            const bp1 = points.find(p => p.id === baseShape.definition.p1Id);
            const bp2 = baseShape.definition.p2Id ? points.find(p => p.id === baseShape.definition.p2Id) : null;
            
            let dx = 1, dy = 0;
            if (bp1 && bp2) {
               dx = bp2.x - bp1.x;
               dy = bp2.y - bp1.y;
            } else if (baseShape.definition.angle !== undefined) {
               const rad = -baseShape.definition.angle * Math.PI / 180;
               dx = Math.cos(rad);
               dy = Math.sin(rad);
            }

            const perpDx = -dy;
            const perpDy = dx;
            const len = Math.sqrt(perpDx*perpDx + perpDy*perpDy) || 1;
            
            // Snap: viditelné body + průsečíky; skryté konstrukční body ne (jinak „ukradnou“ kolmici od projekce na přímku).
            const snapPos = getSnapPositionPreferPoint(wx, wy, SNAP_PX, undefined, true);
            const pX = snapPos ? snapPos.x : hs.proj.x;
            const pY = snapPos ? snapPos.y : hs.proj.y;
            
            const newP1Id = crypto.randomUUID();
            const newP2Id = crypto.randomUUID();
            
            // Pro čistý vizuál (neon) chceme, aby definiční body byly skryté
            const newP1: GeoPoint = {
                id: newP1Id,
                x: pX,
                y: pY,
                label: '',
                hidden: true
            };
            
            const newP2: GeoPoint = {
                id: newP2Id,
                x: pX + (perpDx / len) * 100,
                y: pY + (perpDy / len) * 100,
                label: '',
                hidden: true
            };
            
            setPoints(prev => [...prev, newP1, newP2]);
            
            const newLine: GeoShape = {
                id: crypto.randomUUID(),
                type: 'line', 
                label: getNextShapeLabel('line'),
                points: [newP1Id, newP2Id],
                definition: {
                    p1Id: newP1Id,
                    p2Id: newP2Id
                }
            };
            
            // Nastavit pravítko pro přehrávač (kolmé pravítko)
            // p1 = průsečík, p2 = 100px ve směru kolmice (krátká vzdálenost = detekce kolmice v animaci)
            pendingToolVisualizationRef.current = {
                type: 'ruler',
                p1: { x: pX, y: pY },
                p2: { x: pX + (perpDx / len) * 100, y: pY + (perpDy / len) * 100 },
                angle: Math.atan2(perpDy, perpDx) * 180 / Math.PI
            };
            
            setShapes(prev => [...prev, newLine]);
            triggerEffect(pX, pY, '#3b82f6');
            // Zápis konstrukce - kolmice
            {
              const perpTexts = getPerpendicularConstructionTexts(newLine.label, baseShape);
              addConstructionStep(
                'perpendicular',
                perpTexts.notation,
                perpTexts.latex,
                perpTexts.description,
                [newLine.id],
                perpTexts.descriptionLatex
              );
            }
            setActiveTool('move'); // Reset nástroje po dokončení
            clearSelectionAfterPlacement();
        }
      }
      return;
    }

    // 5. NÁSTROJ: VOLNÉ PERO / ZVÝRAZŇOVAČ / ZVÝRAZŇOVAČ (pravítko — jako trvalý Shift)
    if (activeTool === 'freehand' || activeTool === 'highlighter' || activeTool === 'highlighterStraight') {
       const straightHighlight =
         activeTool === 'highlighterStraight' ||
         (activeTool === 'highlighter' && e.shiftKey);
       if (straightHighlight && lastHighlightPointRef.current) {
         const start = lastHighlightPointRef.current;
         const end = { x: wx, y: wy };
         const dx = end.x - start.x;
         const dy = end.y - start.y;
         if (dx * dx + dy * dy > 1e-12) {
           setFreehandPaths(prev => [...prev, {
             id: crypto.randomUUID(),
             points: [start, end],
             color: highlightColorRgbaRef.current,
             width: 20,
             isHighlight: true,
           }]);
          // Finish the straight highlight after the 2nd click.
          // Next highlight requires a new click to set the start point again.
          lastHighlightPointRef.current = null;
         }
         clearSelectionAfterPlacement();
         return;
       }
       if (activeTool === 'highlighterStraight') {
         lastHighlightPointRef.current = { x: wx, y: wy };
         clearSelectionAfterPlacement();
         return;
       }
       currentPathRef.current = [{ x: wx, y: wy }];
       return;
    }

    // 4. NÁSTROJE TVARŮ (ÚSEČKA, PŘÍMKA, POLOPŘÍMKA, KRUŽNICE, ÚHEL)
    // V tablet módu úhloměr nepoužívá 2-bodový workflow
    if (activeTool === 'angle' && isTabletMode) return;
    if (activeTool === 'circle' && circleInput.visible) return;
    if (activeTool === 'triangleRuler') return;

    if (['segment', 'line', 'lineDashed', 'lineDashDot', 'ray', 'circle', 'angle'].includes(activeTool)) {
      const segmentSecondPointSnapPx = isTabletMode ? 18 : 12;
      const snapThreshold =
        activeTool === 'segment' && selectedPointId !== null ? segmentSecondPointSnapPx : SNAP_PX;
      // Nejprve bod vs. průsečík jako u getSnapPosition, ale u kružnice preferuj existující bod,
      // aby se střed (typicky označený bod) nepřichytil na blízký průsečík/projekci a "neuskočil".
      const snapPos = activeTool === 'circle'
        ? getSnapPositionPreferPoint(wx, wy, SNAP_PX)
        : getSnapPosition(wx, wy, snapThreshold);
      const SNAP_MATCH_ON_POINT_PX = 2;
      let snappedShape: GeoPoint | null = null;
      if (activeTool === 'circle') {
        // For circle construction, if the cursor is near an existing point, ALWAYS reuse that point.
        // Otherwise the snap might pick a nearby intersection/projection and the intended center/radius point "jumps".
        snappedShape = getSnappingPoint(wx, wy, SNAP_PX);
      } else if (snapPos) {
        const p = getSnappingPoint(snapPos.x, snapPos.y, snapThreshold);
        if (p) {
          const dPx = Math.hypot((p.x - snapPos.x) * scale, (p.y - snapPos.y) * scale);
          if (dPx <= SNAP_MATCH_ON_POINT_PX) snappedShape = p;
        }
      }
      let targetPointId = snappedShape?.id;

      // Pokud klikneme do prázdna, vytvoříme bod automaticky
      // KROMĚ: druhého kliku s aktivním fixním poloměrem (ten vytvoří bod sám)
      // KROMĚ: druhého kliku s aktivní fixní délkou úsečky (ten vytvoří bod sám)
      if (!targetPointId) {
        const skipAutoPoint = 
          (activeTool === 'segment' && segmentInput.active && segmentInput.mode === 'fixed' && selectedPointId !== null) ||
          (activeTool === 'circle' && isTabletMode && selectedPointId === null); // Tablet circle first click handled by its own section with intersection snapping
        
        if (!skipAutoPoint) {
          // Auto-created points:
          // - line/lineDashed: always hidden helper points (clean look)
          // - ray: hide ONLY the 2nd point (direction helper) when clicked on empty canvas
          const isHidden =
            activeTool === 'line' ||
            activeTool === 'lineDashed' ||
            activeTool === 'lineDashDot' ||
            (activeTool === 'ray' && selectedPointId !== null);
          // Pro kružnici: pokud je už vybraný první bod (střed), druhý bod (na obvodu) nemá label
          const isCircleRadiusPoint = activeTool === 'circle' && selectedPointId !== null;
          const intFallback = snapPos ? null : findNearestIntersection(wx, wy);
          const ptX = snapPos ? snapPos.x : (intFallback?.x ?? wx);
          const ptY = snapPos ? snapPos.y : (intFallback?.y ?? wy);
          const newPoint: GeoPoint = {
            id: crypto.randomUUID(),
            x: ptX,
            y: ptY,
            label: (isHidden || isCircleRadiusPoint) ? '' : getNextPointLabel(),
            hidden: isHidden
          };
          
          // Nastavit pending visualization, aby recording věděl, že body jsou součástí tvaru
          if (selectedPointId === null) {
            // První bod - nastavíme placeholder pro nástroj
            pendingToolVisualizationRef.current = {
              type: activeTool === 'circle' ? 'compass' : 'ruler',
              p1: { x: wx, y: wy },
              p2: { x: wx, y: wy },
              angle: 0
            };
          }
          
          setPoints(prev => [...prev, newPoint]);
          triggerEffect(ptX, ptY, '#3b82f6'); // Effect at actual (possibly snapped) position
          targetPointId = newPoint.id;
          // Track auto-created circle center for cleanup if circle not completed
          if (activeTool === 'circle' && selectedPointId === null) {
            pendingCircleCenterRef.current = newPoint.id;
          }
        }
      }

      if (selectedPointId === null) {
        // První kliknutí
        
        // TABLET MÓD PRO KRUŽNICI (skip if compass mode is active)
        if (activeTool === 'circle' && isTabletMode && !selectedPointId && !circleInput.visible) {
          // První klik - vytvoř/vyber bod a aktivuj workflow
          let centerId = targetPointId;
          let centerPos = { x: wx, y: wy };
          
          // Pokud není snapped na existující bod, vytvoříme nový
          if (!centerId) {
            const intFallback = snapPos ? null : findNearestIntersection(wx, wy);
            const cX = snapPos ? snapPos.x : (intFallback?.x ?? wx);
            const cY = snapPos ? snapPos.y : (intFallback?.y ?? wy);
            const newCenterPoint: GeoPoint = {
              id: crypto.randomUUID(),
              x: cX,
              y: cY,
              label: getNextPointLabel(),
              hidden: false
            };
            setPoints(prev => [...prev, newCenterPoint]);
            centerId = newCenterPoint.id;
            centerPos = { x: cX, y: cY };
            pendingCircleCenterRef.current = newCenterPoint.id;
          } else {
            // Použijeme existující bod
            const existingPoint = points.find(p => p.id === centerId);
            if (existingPoint) {
              centerPos = { x: existingPoint.x, y: existingPoint.y };
              // Pokud je bod skrytý (např. definiční bod přímky na průsečíku), povýšíme ho na viditelný
              promoteToVisiblePoint(centerId);
            }
          }
          
          // Nastavíme selectedPointId aby se aktivoval ghost
          setSelectedPointId(centerId);
          
          // A aktivujeme tablet state pro tracking handle
          const initialRadius = 150; // 3 cm defaultně
          circleTabletHandlePosRef.current = null; // Reset ref
          circleTabletRadiusRef.current = initialRadius;
          setCircleTabletState({
            active: true,
            centerId: centerId,
            center: centerPos,
            radius: initialRadius,
            isDraggingHandle: false,
            handlePos: null
          });
          triggerEffect(centerPos.x, centerPos.y, '#3b82f6');
          return;
        }
        
        // V tablet módu: pokud je circle workflow aktivní, ignoruj další kliknutí na canvas
        // (uživatel musí použít "Narýsovat" tlačítko)
        if (activeTool === 'circle' && isTabletMode && circleTabletState.active) {
          return;
        }
        
        // Vybereme existující bod nebo použijeme ten vytvořený
        // Pro kružnici: pokud bod je skrytý (průsečík přímek), povýšíme na viditelný
        if (activeTool === 'circle') {
          promoteToVisiblePoint(targetPointId);
        }
        setSelectedPointId(targetPointId);
        // Effect
        const p = points.find(pt => pt.id === targetPointId);
        if (p) triggerEffect(p.x, p.y, '#3b82f6');
      } else {
        // Druhé kliknutí
        if (selectedPointId === targetPointId && activeTool !== 'circle') {
          return;
        }

        // Effect
        const pTarget = points.find(pt => pt.id === targetPointId);
        if (pTarget) triggerEffect(pTarget.x, pTarget.y, '#3b82f6');

        const p1 = points.find(p => p.id === selectedPointId)!;
        let p2 = points.find(p => p.id === targetPointId);
        if (!p2) {
           p2 = { id: targetPointId, x: wx, y: wy, label: '?' } as GeoPoint; 
        }

        if (activeTool === 'angle') {
          // Pro úhel nezačínáme animaci hned, ale zobrazíme input
          setAngleInput({
            visible: true,
            value: 45,
            vertexId: selectedPointId,
            directionId: targetPointId,
            rotationOffset: 0,
            isMirrored: false
          });
          setSelectedPointId(null);
          return;
        }

        // Pro úsečku s fixní délkou
        if (activeTool === 'segment' && segmentInput.active && segmentInput.mode === 'fixed') {
          const angle = Math.atan2(p2.y - p1.y, p2.x - p1.x);
          const fixedLength = segmentInput.length * PIXELS_PER_CM;
          
          // Vytvoříme druhý bod na přesné vzdálenosti ve směru kliku
          const newPoint: GeoPoint = {
            id: crypto.randomUUID(),
            x: p1.x + Math.cos(angle) * fixedLength,
            y: p1.y + Math.sin(angle) * fixedLength,
            label: getNextPointLabel(),
            hidden: false
          };
          setPoints(prev => [...prev, newPoint]);
          
          // Spustíme animaci s novým bodem jako p2
          startConstructionAnimation('segment', p1, newPoint);
          
          // Deaktivujeme fixní režim po vytvoření
          setSegmentInput(prev => ({ ...prev, active: false }));
          setSelectedPointId(null);
          return;
        }

        if (activeTool === 'circle') pendingCircleCenterRef.current = null;
        startConstructionAnimation(activeTool as 'segment'|'line'|'lineDashed'|'lineDashDot'|'circle'|'ray', p1, p2);
        setSelectedPointId(null);
      }
    }
  };

  const confirmAngle = () => {
    // Potlač hover/floating preview po kliknutí na Vytvořit,
    // jinak může úhloměr krátce "uskočit" na hover/mouse ghost ještě před animací / skrytím.
    suppressAngleHoverPreviewRef.current = true;
    setTimeout(() => {
      suppressAngleHoverPreviewRef.current = false;
    }, 150);

    // Okamžitě skryj popup, aby se nestihl vykreslit "input protractor" v jiném stavu.
    setAngleInput(prev => ({ ...prev, visible: false }));

    // Podpora pro customVertex (přichycení k čáře)
    if (angleInput.customVertex && angleInput.baseAngle !== undefined) {
         // Reset angle tablet state po narýsování
         if (isTabletMode) {
           setAngleTabletState({ step: 'idle', selectedLineId: null, currentPos: null, baseAngle: 0 });
         }
         
         const startP = { ...angleInput.customVertex, id: 'temp-vertex' };
         
         // Base orientation including user rotation
         const rotationRad = angleInput.rotationOffset * Math.PI / 180;
         const totalBaseAngle = angleInput.baseAngle + rotationRad;
         
         // Angle value direction depends on mirroring
         // Default (not mirrored) draws "up" (negative angle in canvas Y-down)
         let angleDiff = angleInput.value * Math.PI / 180;
         if (!angleInput.isMirrored) {
             angleDiff = -angleDiff;
         }
         
         const finalRad = totalBaseAngle + angleDiff;

         const helperId = angleArmHelperPointIdRef.current;
         const helperPt = helperId ? points.find(p => p.id === helperId) : null;
         const armEnd = helperPt ?? protractorArmEndWorld(
           startP,
           angleInput.baseAngle,
           angleInput.value,
           angleInput.rotationOffset,
           angleInput.isMirrored
         );

         const dummyP2 = {
             x: armEnd.x,
             y: armEnd.y,
             id: helperPt?.id ?? 'temp-end',
         };

         // Uložit vizualizaci úhloměru
         pendingToolVisualizationRef.current = {
           type: 'protractor',
           p1: { x: startP.x, y: startP.y },
           p2: { x: dummyP2.x, y: dummyP2.y },
           angle: totalBaseAngle
         };

         setAnimState({
             isActive: true,
             type: 'angle',
             startTime: performance.now(),
             p1: startP,
             p2: dummyP2,
             angle: angleInput.value, 
             baseAngle: angleInput.baseAngle,
             rotationOffset: angleInput.rotationOffset,
             isMirrored: angleInput.isMirrored,
             progress: 0
         });
         return;
    }

    if (!angleInput.vertexId || !angleInput.directionId) return;
    
    const p1 = points.find(p => p.id === angleInput.vertexId);
    const pDirection = points.find(p => p.id === angleInput.directionId);
    
    if (p1 && pDirection) {
      const baseAngle = Math.atan2(pDirection.y - p1.y, pDirection.x - p1.x);
      
      const rotationRad = angleInput.rotationOffset * Math.PI / 180;
      const totalBaseAngle = baseAngle + rotationRad;

      let angleDiff = angleInput.value * Math.PI / 180;
      if (!angleInput.isMirrored) {
          angleDiff = -angleDiff;
      }
      
      const targetAngle = totalBaseAngle + angleDiff;
      
      const dist = 300;
      const helperId = angleArmHelperPointIdRef.current;
      const helperPt = helperId ? points.find(p => p.id === helperId) : null;
      const p2 = helperPt ?? {
        id: 'temp-angle-point',
        x: p1.x + Math.cos(targetAngle) * dist,
        y: p1.y + Math.sin(targetAngle) * dist
      };

      // Uložit vizualizaci úhloměru
      pendingToolVisualizationRef.current = {
        type: 'protractor',
        p1: { x: p1.x, y: p1.y },
        p2: { x: p2.x, y: p2.y },
        angle: totalBaseAngle
      };

      setAnimState({
        isActive: true,
        type: 'angle',
        startTime: performance.now(),
        p1: p1,
        p2: p2,
        angle: angleInput.value,
        rotationOffset: angleInput.rotationOffset,
        isMirrored: angleInput.isMirrored,
        progress: 0
      });
    }
    
    // Reset angle tablet state po narýsování
    if (isTabletMode) {
      setAngleTabletState({ step: 'idle', selectedLineId: null, currentPos: null, baseAngle: 0 });
    }
  };

  // Detekce volné kresby / zvýrazňovače pod kurzorem
  const getFreehandPathAtPoint = (wx: number, wy: number): string | null => {
    const TOLERANCE = 10 / scale;
    for (let i = freehandPaths.length - 1; i >= 0; i--) {
      const path = freehandPaths[i];
      const halfWidth = path.width / 2 / scale + TOLERANCE;
      for (let j = 0; j < path.points.length - 1; j++) {
        const p1 = path.points[j];
        const p2 = path.points[j + 1];
        const dx = p2.x - p1.x;
        const dy = p2.y - p1.y;
        const len2 = dx * dx + dy * dy;
        if (len2 === 0) continue;
        const t = Math.max(0, Math.min(1, ((wx - p1.x) * dx + (wy - p1.y) * dy) / len2));
        const projX = p1.x + t * dx;
        const projY = p1.y + t * dy;
        const dist = Math.sqrt((wx - projX) ** 2 + (wy - projY) ** 2);
        if (dist <= halfWidth) return path.id;
      }
    }
    return null;
  };

  // Detekce nejbližšího tvaru pod kurzorem (pro výběr kliknutím)
  const getHoveredShapeAtPoint = (wx: number, wy: number, threshold = 15): string | null => {
    let closestId: string | null = null;
    let minD = threshold / scale;

    shapes.forEach(shape => {
      const p1 = points.find(p => p.id === shape.definition.p1Id);
      const p2 = points.find(p => p.id === shape.definition.p2Id);
      if (!p1 || !p2) return;

      if (shape.type === 'circle' || shape.type === 'circleArc') {
        const r = Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2));
        const distFromCenter = Math.sqrt(Math.pow(wx - p1.x, 2) + Math.pow(wy - p1.y, 2));
        const distToCircle = Math.abs(distFromCenter - r);
        if (distToCircle < minD) {
          minD = distToCircle;
          closestId = shape.id;
        }
      } else {
        let start: {x:number,y:number} = p1;
        let end: {x:number,y:number} = p2;
        if (shape.type === 'line' || shape.type === 'lineDashed' || shape.type === 'ray') {
          const dx = p2.x - p1.x;
          const dy = p2.y - p1.y;
          const len = Math.sqrt(dx * dx + dy * dy);
          if (len > 0.001) {
            const EXT = 100000;
            if (shape.type === 'line' || shape.type === 'lineDashed') start = { x: p1.x - dx / len * EXT, y: p1.y - dy / len * EXT };
            end = { x: p1.x + dx / len * EXT, y: p1.y + dy / len * EXT };
          }
        }
        const res = distToSegment({ x: wx, y: wy }, start, end);
        if (res.dist < minD) {
          minD = res.dist;
          closestId = shape.id;
        }
      }
    });
    return closestId;
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    // Panning logic
    if ((readOnlyCanvas || activeTool === 'pan') && isPanning.current) {
        const dx = e.clientX - lastPanPos.current.x;
        const dy = e.clientY - lastPanPos.current.y;
        setOffset(prev => ({ x: prev.x + dx, y: prev.y + dy }));
        lastPanPos.current = { x: e.clientX, y: e.clientY };
        return;
    }

    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const wx = (e.clientX - rect.left - offset.x) / scale;
    const wy = (e.clientY - rect.top - offset.y) / scale;

    // Volná kružnice — výběr výseku tažením po obvodu
    if (
      circleInput.visible &&
      circleInput.center &&
      !circleInput.fixedRadius &&
      circleInput.freeDrawMode === 'pickArc'
    ) {
      const r = circleInput.radius * PIXELS_PER_CM;
      const snap = snapToCirclePerimeter(wx, wy, circleInput.center, r);
      if (circleArcDrawRef.current) {
        const delta = angleDelta(circleArcDrawRef.current.lastAngle, snap.angle);
        const endAngle = circleArcDrawRef.current.endAngle + delta;
        circleArcDrawRef.current.lastAngle = snap.angle;
        circleArcDrawRef.current.endAngle = endAngle;
        setCircleInput(prev => ({
          ...prev,
          arcDraw: {
            startAngle: circleArcDrawRef.current!.startAngle,
            endAngle,
          },
          arcCrosshair: { x: snap.x, y: snap.y },
        }));
      } else {
        setCircleInput(prev => ({ ...prev, arcCrosshair: { x: snap.x, y: snap.y } }));
      }
      mousePosRef.current = { x: wx, y: wy };
      return;
    }

    // Kružítko — hover nad středem (posun) / tužkou (otočení) — jen refy, bez setState u handle
    if (
      circleInput.visible &&
      circleInput.center &&
      circleInput.freeDrawMode !== 'pickArc' &&
      !circleInput.isDraggingHandle &&
      !circleInput.isDraggingCenter
    ) {
      const r = circleInput.radius * PIXELS_PER_CM;
      const ha = circleInput.handleAngle;
      const hx = circleInput.center.x + Math.cos(ha) * r;
      const hy = circleInput.center.y + Math.sin(ha) * r;
      const badgeX = hx + Math.cos(ha) * (28 / scale);
      const badgeY = hy + Math.sin(ha) * (28 / scale);
      const handleHover =
        Math.hypot(wx - hx, wy - hy) < 48 / scale ||
        Math.hypot(wx - badgeX, wy - badgeY) < 28 / scale;
      const centerHover =
        !handleHover &&
        Math.hypot(wx - circleInput.center.x, wy - circleInput.center.y) < 52 / scale;
      circleHandleHoverRef.current = handleHover;
      if (centerHover !== circleCenterHoverRef.current) {
        circleCenterHoverRef.current = centerHover;
        setCircleCenterHover(centerHover);
      }
    } else if (!circleInput.isDraggingHandle && !circleInput.isDraggingCenter) {
      circleHandleHoverRef.current = false;
      if (circleCenterHoverRef.current) {
        circleCenterHoverRef.current = false;
        setCircleCenterHover(false);
      }
    }

    // Nástroj Pravítko — křížek pro rýsování podél strany
    if (activeTool === 'triangleRuler' && rulerToolState.drawMode === 'pickEdge') {
      const pivot = rulerPivotRef.current ?? rulerToolState.pivot;
      if (pivot) {
        const angle = rulerAngleRef.current;
        const snappedInput = getRulerDrawSnapInput(wx, wy, pivot);
        if (rulerLineDrawRef.current) {
          const { edge, start } = rulerLineDrawRef.current;
          const { a, b } = getRulerEdgeWorld(edge, pivot, angle);
          // Při tažení držíme stejnou hranu, ale dovolíme snap na její konce (včetně stupnice na krátké straně).
          const endpointThresholdWorld = (RULER_EDGE_HIT_PX + 22) / scale;
          const [ea, eb] = getRulerSnapEndpointsForEdgeLocal(edge, scale);
          const eaw = localToRulerWorld(ea.x, ea.y, pivot, angle);
          const ebw = localToRulerWorld(eb.x, eb.y, pivot, angle);
          const da = Math.hypot(snappedInput.x - eaw.x, snappedInput.y - eaw.y);
          const db = Math.hypot(snappedInput.x - ebw.x, snappedInput.y - ebw.y);
          const end =
            da <= endpointThresholdWorld
              ? eaw
              : db <= endpointThresholdWorld
                ? ebw
                : projectOntoSegment(snappedInput.x, snappedInput.y, a.x, a.y, b.x, b.y);
          rulerLineDrawRef.current.end = end;
          setRulerToolState(prev => ({
            ...prev,
            crosshair: end,
            lineDraw: { edge, start, end },
          }));
        } else {
          const snap = snapToRulerEdge(snappedInput.x, snappedInput.y, pivot, angle, scale);
          setRulerToolState(prev => ({ ...prev, crosshair: snap.point }));
        }
      }
      mousePosRef.current = { x: wx, y: wy };
      return;
    }

    // Nástroj Pravítko — posun nebo otočení
    if (activeTool === 'triangleRuler' && rulerDraggingRef.current) {
      const pivot = rulerPivotRef.current ?? rulerToolState.pivot;
      if (!pivot) return;

      if (rulerDragModeRef.current === 'rotate' && rulerRotateStartRef.current) {
        const start = rulerRotateStartRef.current;
        const anchor =
          rulerRotationAnchorRef.current ?? {
            local: { x: RULER_ROTATION_PIVOT_LOCAL.x, y: RULER_ROTATION_PIVOT_LOCAL.y },
            world: pivot,
          };
        const currentMouseAngle = Math.atan2(wy - anchor.world.y, wx - anchor.world.x);
        const newAngle = start.startAngle + (currentMouseAngle - start.mouseAngle);
        const newPivot = pivotWorldFromAnchor(anchor.world, anchor.local, newAngle);
        rulerAngleRef.current = newAngle;
        rulerPivotRef.current = newPivot;
        setRulerToolState(prev => ({ ...prev, angle: newAngle, pivot: newPivot }));
      } else if (rulerDragStartRef.current) {
        const start = rulerDragStartRef.current;
        const rawPivot = {
          x: start.pivotX + (wx - start.mouseX),
          y: start.pivotY + (wy - start.mouseY),
        };
        const snapped = snapRulerPivotByHandles(rawPivot, rulerAngleRef.current, 25);
        rulerRotationAnchorRef.current = snapped.anchor;
        rulerPivotRef.current = snapped.pivot;
        setRulerToolState(prev => ({ ...prev, pivot: snapped.pivot }));
      }
      return;
    }

    // Nástroj Úhloměr — posun nebo otočení umístěného úhloměru
    if (activeTool === 'angle' && protractorDraggingRef.current) {
      const center = protractorCenterRef.current;
      if (!center) return;

      if (protractorDragModeRef.current === 'rotate' && protractorRotateStartRef.current) {
        const start = protractorRotateStartRef.current;
        const currentMouseAngle = Math.atan2(wy - center.y, wx - center.x);
        const newAngle = start.startAngle + (currentMouseAngle - start.mouseAngle);
        protractorAngleRef.current = newAngle;
        setAngleInput(prev => ({
          ...prev,
          visible: true,
          customVertex: center,
          baseAngle: newAngle,
          vertexId: null,
          directionId: null,
        }));
      } else if (protractorDragModeRef.current === 'arm') {
        const newValue = protractorValueFromWorld(
          wx,
          wy,
          center,
          protractorAngleRef.current,
          angleInput.rotationOffset,
          angleInput.isMirrored
        );
        setAngleInput(prev => ({
          ...prev,
          visible: true,
          value: newValue,
          customVertex: center,
          baseAngle: protractorAngleRef.current,
          vertexId: null,
          directionId: null,
        }));
      } else if (protractorDragStartRef.current) {
        const start = protractorDragStartRef.current;
        const rawCenter = {
          x: start.centerX + (wx - start.mouseX),
          y: start.centerY + (wy - start.mouseY),
        };

        const snapped = snapPlacedProtractor(
          rawCenter.x,
          rawCenter.y,
          protractorAngleRef.current,
          30
        );
        const nextCenter = snapped.center;
        const nextAngle = snapped.baseAngle;

        protractorCenterRef.current = nextCenter;
        protractorAngleRef.current = nextAngle;
        setAngleInput(prev => ({
          ...prev,
          visible: true,
          customVertex: nextCenter,
          baseAngle: nextAngle,
          vertexId: null,
          directionId: null,
        }));
      }
      syncAngleArmHelperPoint();
      return;
    }

    // Angle / perpendicular: hover nad čárou (sdílená geometrie s getLineHoverAtWorld)
    if (activeTool === 'angle' || activeTool === 'perpendicular') {
      if (activeTool === 'angle' && protractorCenterRef.current) {
        if (hoveredShape) setHoveredShape(null);
      } else {
        anglePerpLineHoverFromMoveRef.current = true;
        setHoveredShape(getLineHoverAtWorld(wx, wy));
      }
    } else {
        if (hoveredShape) setHoveredShape(null);
    }

    // Hover logic for points
    // For segment 2nd point selection, snap to other points only in a smaller radius,
    // and to the first point (A) in an even smaller radius (so it doesn't feel "sticky").
    const segmentFirstPointIdForHover = activeTool === 'segment' && selectedPointId ? selectedPointId : null;
    const segmentAOnlySnapPxHover = isTabletMode ? 14 : 10;
    const segmentOtherSnapPxHover = isTabletMode ? 18 : 12;
    const snapped =
      segmentFirstPointIdForHover
        ? (() => {
            const snappedOther = getSnappingPoint(
              wx,
              wy,
              segmentOtherSnapPxHover,
              segmentFirstPointIdForHover,
              activeTool === 'move',
            );
            const snappedA = getSnappingPoint(
              wx,
              wy,
              segmentAOnlySnapPxHover,
              undefined,
              activeTool === 'move',
            );
            return snappedA?.id === segmentFirstPointIdForHover ? snappedA : snappedOther;
          })()
        : getSnappingPoint(wx, wy, SNAP_PX, undefined, activeTool === 'move');
    // For point tool: don't highlight existing points — snap to lines/intersections instead
    setHoveredPointId(activeTool === 'point' ? null : (snapped ? snapped.id : null));
    mousePosRef.current = { x: wx, y: wy };

    // Snap indicators
    if (activeTool === 'point') {
      // Point tool: snap to lines and intersections, NOT to existing labeled points.
      // Intersection always takes priority — if one exists in range, never show line snap.
      const intSnap = findNearestIntersection(wx, wy);
      if (intSnap) {
        nearestIntersectionRef.current = intSnap;
        nearestLineSnapRef.current = null;
      } else {
        nearestIntersectionRef.current = null;
        nearestLineSnapRef.current = snapToNearestShape(wx, wy);
      }
    } else if (['circle', 'segment', 'line', 'lineDashed', 'angle', 'perpendicular', 'ray', 'bisector'].includes(activeTool)) {
      // Intersection snap indicator — show even when a point is nearby (distance-based priority)
      const intSnap = findNearestIntersection(wx, wy);
      if (intSnap && snapped) {
        const dInt = Math.sqrt((intSnap.x - wx) ** 2 + (intSnap.y - wy) ** 2);
        const dPoint = Math.sqrt((snapped.x - wx) ** 2 + (snapped.y - wy) ** 2);
        nearestIntersectionRef.current = dInt < dPoint ? intSnap : null;
      } else {
        nearestIntersectionRef.current = intSnap;
      }
      nearestLineSnapRef.current = null;
    } else {
      nearestIntersectionRef.current = null;
      nearestLineSnapRef.current = null;
    }

    // Shape hover pro nástroj Výběr a Guma (detekce tvaru pod kurzorem)
    if (activeTool === 'eraser') {
      // Eraser always detects shapes regardless of nearby points
      setHoveredShapeForMove(getHoveredShapeAtPoint(wx, wy));
    } else if (activeTool === 'move' && !draggedPointId && !groupDragRef.current && !marqueeRef.current) {
      const hovered = snapped ? null : getHoveredShapeAtPoint(wx, wy);
      setHoveredShapeForMove(hovered);
    } else if (activeTool !== 'move') {
      if (hoveredShapeForMove) setHoveredShapeForMove(null);
    }

    // Group drag — přesouvání všech bodů vybraných tvarů (s magnetickým snapem)
    if (activeTool === 'move' && groupDragRef.current) {
      const gd = groupDragRef.current;
      let dx = wx - gd.startWx;
      let dy = wy - gd.startWy;
      if (dx !== 0 || dy !== 0) didDragSinceSuppressRef.current = true;
      const excludeIds = new Set(gd.pointSnapshots.map(s => s.id));
      const snapped = getGroupDragSnapOffset(dx, dy, gd.pointSnapshots, excludeIds, selectedShapeIds, wx, wy);
      dx = snapped.dx;
      dy = snapped.dy;
      dragSnapPreviewRef.current = snapped.snapPoint;
      const snapMap = new Map(gd.pointSnapshots.map(s => [s.id, s]));
      const liveMap = new Map<string, { x: number; y: number }>();
      setPoints(prev => prev.map(p => {
        const snap = snapMap.get(p.id);
        if (!snap) return p;
        if (p.locked) return p;
        const next = { ...p, x: snap.x + dx, y: snap.y + dy };
        liveMap.set(p.id, { x: next.x, y: next.y });
        return next;
      }));
      groupDragLiveRef.current = liveMap;
      return;
    }

    // Drag logic (single point) — magnetický snap na body, průsečíky i tvary
    // Use ref to avoid stale closure — draggedPointIdRef is always current
    const currentDragId = draggedPointIdRef.current;
    if (activeTool === 'move' && currentDragId) {
      if (isPointLocked(currentDragId)) {
        dragSnapPreviewRef.current = null;
        draggedPointPosRef.current = null;
        draggedPointIdRef.current = null;
        setDraggedPointId(null);
        toast.message('Objekt je zamčený.');
        return;
      }
      const excludeIds = new Set([currentDragId]);
      const snapPos = getDragSnapPosition(wx, wy, excludeIds);
      dragSnapPreviewRef.current = snapPos;
      draggedPointPosRef.current = snapPos ?? { x: wx, y: wy };
      didDragSinceSuppressRef.current = true;
      // Throttle setPoints to one per animation frame to avoid dropped frames
      if (!dragUpdateRafRef.current) {
        dragUpdateRafRef.current = requestAnimationFrame(() => {
          dragUpdateRafRef.current = null;
          const pos = draggedPointPosRef.current;
          const id = draggedPointIdRef.current;
          if (pos && id) {
            setPoints(prev => prev.map(p => {
              if (p.id !== id) return p;
              if (p.locked) return p;
              return { ...p, x: pos.x, y: pos.y };
            }));
          }
        });
      }
    } else {
      dragSnapPreviewRef.current = null;
      draggedPointPosRef.current = null;
    }

    // Marquee rectangle selection (move tool drag on empty space)
    if (activeTool === 'move' && marqueeRef.current) {
      marqueeRef.current = { ...marqueeRef.current, endX: wx, endY: wy };
    }

    // Drawing logic
    if ((activeTool === 'freehand' || activeTool === 'highlighter') && currentPathRef.current) {
       currentPathRef.current.push({ x: wx, y: wy });
    }
    
    // Tablet mód - positioning kolmice (with point snapping)
    if (activeTool === 'perpendicular' && isTabletMode && perpTabletState.step === 'positioning') {
      if (perpTabletState.selectedLineId && hoveredShape && hoveredShape.id === perpTabletState.selectedLineId) {
        let pos = hoveredShape.proj;
        const snapPerp = getSnapPositionPreferPoint(hoveredShape.proj.x, hoveredShape.proj.y, 25, undefined, true);
        if (snapPerp) {
          pos = snapPerp;
        }
        setPerpTabletState(prev => ({
          ...prev,
          currentPos: pos
        }));
      }
    }
    
    // Tablet mód - positioning úhloměru (with point + intersection snapping)
    if (activeTool === 'angle' && isTabletMode && angleTabletState.step === 'positioning') {
      if (angleTabletState.selectedLineId && hoveredShape && hoveredShape.id === angleTabletState.selectedLineId) {
        let pos = hoveredShape.proj;
        let angle = hoveredShape.angle;
        const snapAngle = getSnapPosition(hoveredShape.proj.x, hoveredShape.proj.y, 25);
        if (snapAngle) {
          pos = snapAngle;
        }
        setAngleTabletState(prev => ({
          ...prev,
          currentPos: pos,
          baseAngle: angle
        }));
      }
    }
    
    // Compass mode - dragging handle or center (live ref → plynulé otáčení/posun)
    if (circleInput.visible && circleInput.center) {
      if (circleInput.isDraggingHandle) {
        const base = circleLiveRef.current ?? {
          center: circleInput.center,
          radius: circleInput.radius,
          handleAngle: circleInput.handleAngle,
        };
        const snapPoint = getSnapPositionPreferPoint(wx, wy, 25);
        const snapShape = snapPoint ? null : snapToNearestShape(wx, wy, 25);
        const target = snapPoint ?? snapShape ?? { x: wx, y: wy };

        const dx = target.x - base.center.x;
        const dy = target.y - base.center.y;
        const handleAngle = Math.atan2(dy, dx);
        if (circleInput.fixedRadius) {
          circleLiveRef.current = { ...base, handleAngle };
        } else {
          const newRadiusCm = Math.max(0.1, Math.hypot(dx, dy) / PIXELS_PER_CM);
          const rounded = Math.round(newRadiusCm * 10) / 10;
          circleLiveRef.current = { ...base, radius: rounded, handleAngle };
        }
        return;
      }
      if (circleInput.isDraggingCenter) {
        const base = circleLiveRef.current ?? {
          center: circleInput.center,
          radius: circleInput.radius,
          handleAngle: circleInput.handleAngle,
        };
        const snapPoint = getSnapPositionPreferPoint(wx, wy, 25);
        const snapShape = snapPoint ? null : snapToNearestShape(wx, wy, 25);
        const target = snapPoint ?? snapShape ?? { x: wx, y: wy };
        circleLiveRef.current = { ...base, center: { x: target.x, y: target.y } };
        return;
      }
    }

    // Tablet mód - drag handle kružnice
    if (activeTool === 'circle' && isTabletMode && circleTabletState.active && circleTabletState.isDraggingHandle && circleTabletState.center) {
      const dx = wx - circleTabletState.center.x;
      const dy = wy - circleTabletState.center.y;
      const newRadius = Math.sqrt(dx * dx + dy * dy);
      const clampedRadius = Math.max(25, newRadius); // Min 0.5 cm
      circleTabletRadiusRef.current = clampedRadius; // ✨ Update ref pro real-time rendering
      circleTabletHandlePosRef.current = { x: wx, y: wy }; // ✨ Update ref pro real-time rendering
      setCircleTabletState(prev => ({
        ...prev,
        radius: clampedRadius,
        handlePos: { x: wx, y: wy }
      }));
    }
  };

  // Mouse move handler - bez throttlingu pro spolehlivé přichytávání na body a průsečíky
  const handleMouseMoveWrapper = (e: React.MouseEvent) => {
    handleMouseMove(e);
  };

  const handleMouseUp = () => {
    // Group drag — ukončit (historie se uloží automaticky přes useEffect)
    if (groupDragRef.current) {
      groupDragRef.current = null;
      groupDragLiveRef.current = null;
      dragSnapPreviewRef.current = null;
    }
    
    // Compass mode - end dragging (commit live pozice)
    if (circleInput.isDraggingHandle || circleInput.isDraggingCenter) {
      const live = circleLiveRef.current;
      if (live) {
        setCircleInput(prev => ({
          ...prev,
          center: live.center,
          radius: live.radius,
          handleAngle: live.handleAngle,
          isDraggingHandle: false,
          isDraggingCenter: false,
        }));
        circleLiveRef.current = null;
        return;
      }
      setCircleInput(prev => ({ ...prev, isDraggingHandle: false, isDraggingCenter: false }));
    }

    if (
      circleArcDrawRef.current &&
      circleInput.center &&
      !circleInput.fixedRadius &&
      circleInput.freeDrawMode === 'pickArc'
    ) {
      const { startAngle, endAngle } = circleArcDrawRef.current;
      circleArcDrawRef.current = null;
      finishFreeCircleArcDraw(startAngle, endAngle, circleInput.center, circleInput.radius);
      setCircleInput(prev => ({
        ...prev,
        freeDrawMode: 'idle',
        arcDraw: null,
        arcCrosshair: null,
      }));
    }

    if (rulerDraggingRef.current) {
      rulerDraggingRef.current = false;
      rulerDragModeRef.current = null;
      rulerDragStartRef.current = null;
      rulerRotateStartRef.current = null;
      setRulerToolState(prev => ({ ...prev, isDragging: false }));
    }

    if (protractorDraggingRef.current) {
      protractorDraggingRef.current = false;
      protractorDragModeRef.current = null;
      protractorDragStartRef.current = null;
      protractorRotateStartRef.current = null;
    }

    if (rulerLineDrawRef.current) {
      const draw = rulerLineDrawRef.current;
      const pivot = rulerPivotRef.current ?? rulerToolState.pivot;
      if (pivot) {
        finishRulerLineDraw(
          draw.start,
          draw.end,
          draw.edge,
          pivot,
          rulerAngleRef.current,
          rulerToolState.drawKind ?? 'line'
        );
      }
      rulerLineDrawRef.current = null;
      setRulerToolState(prev => ({
        ...prev,
        drawMode: 'idle',
        drawKind: null,
        crosshair: null,
        lineDraw: null,
      }));
    }
    
    // Cancel any pending drag RAF
    if (dragUpdateRafRef.current) {
      cancelAnimationFrame(dragUpdateRafRef.current);
      dragUpdateRafRef.current = null;
    }
    // On release: snap to preview position or commit final drag position
    const releasedId = draggedPointIdRef.current;
    const finalPos = dragSnapPreviewRef.current ?? draggedPointPosRef.current;
    if (releasedId && finalPos) {
      setPoints(prev => prev.map(p =>
        p.id === releasedId ? { ...p, x: finalPos.x, y: finalPos.y } : p
      ));
    }
    dragSnapPreviewRef.current = null;
    draggedPointPosRef.current = null;
    draggedPointIdRef.current = null;
    setDraggedPointId(null);
    if (readOnlyCanvas || activeTool === 'pan') {
        isPanning.current = false;
    }
    
    // Tablet mód - ukončení draggingu handle kružnice
    if (activeTool === 'circle' && isTabletMode && circleTabletState.isDraggingHandle) {
      setCircleTabletState(prev => ({
        ...prev,
        isDraggingHandle: false
      }));
    }
    
    if ((activeTool === 'freehand' || activeTool === 'highlighter') && currentPathRef.current) {
        if (currentPathRef.current.length >= 1) {
            const isHL = activeTool === 'highlighter';
            setFreehandPaths(prev => [...prev, {
                id: crypto.randomUUID(),
                points: currentPathRef.current!,
                color: isHL ? highlightColorRgbaRef.current : '#3b82f6',
                width: isHL ? 20 : 2,
                isHighlight: isHL || undefined,
            }]);
            clearSelectionAfterPlacement();
            // Save last point for shift+click straight lines
            if (isHL) {
              const pts = currentPathRef.current!;
              lastHighlightPointRef.current = pts[pts.length - 1];
            }
        }
        currentPathRef.current = null;
    }

    // Marquee rectangle selection - evaluate selection on mouse up
    if (activeTool === 'move' && marqueeRef.current) {
      const m = marqueeRef.current;
      const minX = Math.min(m.startX, m.endX);
      const maxX = Math.max(m.startX, m.endX);
      const minY = Math.min(m.startY, m.endY);
      const maxY = Math.max(m.startY, m.endY);
      const rectW = maxX - minX;
      const rectH = maxY - minY;
      
      // Only evaluate if the user actually dragged (not just a click)
      if (rectW > 5 && rectH > 5) {
        const foundShapeIds: string[] = [];
        const foundPointIds: string[] = [];
        
        const pointInRect = (px: number, py: number) => px >= minX && px <= maxX && py >= minY && py <= maxY;
        
        // Select shapes whose defining points are inside the rectangle
        shapes.forEach(shape => {
          const p1 = points.find(p => p.id === shape.definition.p1Id);
          const p2 = points.find(p => p.id === shape.definition.p2Id);
          if (!p1 || !p2) return;
          
          if (shape.type === 'circle' || shape.type === 'circleArc') {
            if (pointInRect(p1.x, p1.y)) {
              foundShapeIds.push(shape.id);
            }
          } else {
            if (pointInRect(p1.x, p1.y) && pointInRect(p2.x, p2.y)) {
              foundShapeIds.push(shape.id);
            }
          }
        });
        
        // Select standalone visible points inside the rectangle
        points.forEach(p => {
          if (!p.hidden && pointInRect(p.x, p.y)) {
            foundPointIds.push(p.id);
          }
        });
        
        // Select freehand paths whose any point falls inside the marquee
        const foundFreehandIds: string[] = [];
        freehandPaths.forEach(path => {
          if (path.points.some(p => pointInRect(p.x, p.y))) {
            foundFreehandIds.push(path.id);
          }
        });

        setSelectedShapeIds(foundShapeIds);
        setSelectedFreehandIds(foundFreehandIds);
        if (foundPointIds.length > 0 && foundShapeIds.length === 0) {
          setSelection(foundPointIds[0]);
        }
      }
      
      marqueeRef.current = null;
    }

    // Commit one undo step for the whole drag (friendlier undo than pixel-steps)
    if (suppressHistoryRef.current) {
      suppressHistoryRef.current = false;
      const didDrag = didDragSinceSuppressRef.current;
      didDragSinceSuppressRef.current = false;
      if (didDrag) commitHistorySnapshot();
    }
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    // Prevent default vzdy pro vsechny nastroje aby se zabranilo mouse eventum
    e.preventDefault();
    
    // Zavřít otevřené submenu při dotyku na canvas
    setActiveGroup(null);
    
    // Two-finger gesture: pinch-to-zoom & pan
    if (e.touches.length === 2) {
      const t1 = e.touches[0];
      const t2 = e.touches[1];
      const dist = Math.sqrt(Math.pow(t2.clientX - t1.clientX, 2) + Math.pow(t2.clientY - t1.clientY, 2));
      const cx = (t1.clientX + t2.clientX) / 2;
      const cy = (t1.clientY + t2.clientY) / 2;
      pinchRef.current = { active: true, lastDist: dist, lastCenter: { x: cx, y: cy } };
      // Cancel any single-finger action in progress
      if (draggedPointId) { draggedPointIdRef.current = null; setDraggedPointId(null); }
      if (isPanning.current) isPanning.current = false;
      if (groupDragRef.current) {
        groupDragRef.current = null;
        groupDragLiveRef.current = null;
      }
      if (marqueeRef.current) marqueeRef.current = null;
      lastTouchTimeRef.current = Date.now();
      return;
    }
    
    if (e.touches.length === 1 && !pinchRef.current.active) {
      const touch = e.touches[0];
      const rect = canvasRef.current?.getBoundingClientRect();
      if (rect) {
        const wx = (touch.clientX - rect.left - offset.x) / scale;
        const wy = (touch.clientY - rect.top - offset.y) / scale;
        mousePosRef.current = { x: wx, y: wy };
      }
      // Mezi ťuknutími na tabletu neproběhne mousemove — zůstane starý hover nad bodem a náhled
      // (ghost) by jeden snímek spojil nový kotvový bod s tím starým „pod kurzorem“.
      setHoveredPointId(null);
      nearestIntersectionRef.current = null;
      nearestLineSnapRef.current = null;
      if (
        isTabletMode &&
        ((activeTool === 'angle' && angleTabletState.step === 'selectLine') ||
          (activeTool === 'perpendicular' && perpTabletState.step === 'selectLine'))
      ) {
        anglePerpLineHoverFromMoveRef.current = false;
        setHoveredShape(null);
      }
      const fakeEvent = {
        clientX: touch.clientX,
        clientY: touch.clientY,
        target: e.target,
        ctrlKey: false,
        metaKey: false,
        preventDefault: () => {},
        stopPropagation: () => {},
        __fromTouchBridge: true,
      } as unknown as React.MouseEvent;
      handleMouseDown(fakeEvent);
      lastTouchTimeRef.current = Date.now();
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    // Prevent default to stop scrolling
    e.preventDefault(); 
    
    // Two-finger gesture: pinch-to-zoom & pan
    if (e.touches.length === 2 && pinchRef.current.active) {
      const t1 = e.touches[0];
      const t2 = e.touches[1];
      const dist = Math.sqrt(Math.pow(t2.clientX - t1.clientX, 2) + Math.pow(t2.clientY - t1.clientY, 2));
      const cx = (t1.clientX + t2.clientX) / 2;
      const cy = (t1.clientY + t2.clientY) / 2;
      
      const rect = canvasRef.current?.getBoundingClientRect();
      if (rect) {
        // Pinch zoom towards the center of the two fingers
        const scaleRatio = dist / pinchRef.current.lastDist;
        const newScale = Math.min(Math.max(0.1, scale * scaleRatio), 5);
        
        const centerX = cx - rect.left;
        const centerY = cy - rect.top;
        const worldX = (centerX - offset.x) / scale;
        const worldY = (centerY - offset.y) / scale;
        const newOffsetX = centerX - worldX * newScale;
        const newOffsetY = centerY - worldY * newScale;
        
        // Two-finger pan (movement of the center point)
        const panDx = cx - pinchRef.current.lastCenter.x;
        const panDy = cy - pinchRef.current.lastCenter.y;
        
        setScale(newScale);
        setOffset({ x: newOffsetX + panDx, y: newOffsetY + panDy });
      }
      
      pinchRef.current.lastDist = dist;
      pinchRef.current.lastCenter = { x: cx, y: cy };
      return;
    }
    
    if (e.touches.length === 1 && !pinchRef.current.active) {
      const touch = e.touches[0];
      const fakeEvent = {
        clientX: touch.clientX,
        clientY: touch.clientY,
        target: e.target,
        preventDefault: () => {},
        stopPropagation: () => {},
        __fromTouchBridge: true,
      } as unknown as React.MouseEvent;
      // Pouzit wrapper s podminenym throttlingem
      handleMouseMoveWrapper(fakeEvent);
    }
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
      // If pinch gesture was active and fingers are lifted
      if (pinchRef.current.active) {
        if (e.touches.length < 2) {
          pinchRef.current.active = false;
        }
        // Don't trigger mouseUp during/after pinch
        if (e.touches.length === 0) return;
        return;
      }
      if (
        e.touches.length === 0 &&
        isTabletMode &&
        ((activeTool === 'angle' && angleTabletState.step === 'selectLine') ||
          (activeTool === 'perpendicular' && perpTabletState.step === 'selectLine'))
      ) {
        anglePerpLineHoverFromMoveRef.current = false;
        setHoveredShape(null);
      }
      handleMouseUp();
  };

  // --- ANIMACE ---
  const startConstructionAnimation = (
    type: 'segment' | 'line' | 'lineDashed' | 'lineDashDot' | 'circle' | 'circleArc' | 'ray',
    p1: { x: number; y: number; id: string },
    p2: { x: number; y: number; id: string },
    arcSpanRad?: number
  ) => {
    // Uložit vizualizaci pro přehrávání
    const angle = Math.atan2(p2.y - p1.y, p2.x - p1.x);
    const radius = Math.sqrt((p2.x - p1.x) ** 2 + (p2.y - p1.y) ** 2);

    if (type === 'segment' || type === 'line' || type === 'lineDashed' || type === 'lineDashDot' || type === 'ray') {
      pendingToolVisualizationRef.current = {
        type: 'ruler',
        p1: { x: p1.x, y: p1.y },
        p2: { x: p2.x, y: p2.y },
        angle
      };
    } else if (type === 'circle' || type === 'circleArc') {
      pendingToolVisualizationRef.current = {
        type: 'compass',
        p1: { x: p1.x, y: p1.y },
        p2: { x: p2.x, y: p2.y },
        angle,
        radius
      };
    }

    setAnimState({
      isActive: true,
      type,
      startTime: performance.now(),
      p1,
      p2,
      progress: 0,
      arcSpan: type === 'circleArc' ? (arcSpanRad ?? COMPASS_ARC_SPAN_RAD) : undefined
    });
  };

  // Hlavn   smy ka animace - optimalizov no pro star  tablety
  useEffect(() => {
    const animate = (time: number) => {
      // 1. Clean up old effects - na pomal ch za zen ch ast ji a s krat   trv n m
      if (!isLowPerformance || Math.random() < 0.3) { // Na pomal ch za zen ch jen kadrepol ct  fram
        setVisualEffects(prev => {
          const now = performance.now();
          const maxDuration = isLowPerformance ? 600 : 1000; // Krat   efekty na pomal ch za zen ch
          const active = prev.filter(e => now - e.startTime < maxDuration);
          if (active.length !== prev.length) return active;
          return prev;
        });
      }

      if (animState.isActive && animState.p1 && animState.p2) {
        // Rychlost animace - rychlej   na pomal ch za zen ch pro lep   responsivitu
        const duration = constructionAnimMs.total;
        const elapsed = time - animState.startTime;
        const rawProgress = Math.min(elapsed / duration, 1);
        
        setAnimState(prev => ({ ...prev, progress: rawProgress }));

        if (rawProgress >= 1) {
          // Konec animace -> Vytvořit trvalý tvar
          // POZOR: Při přehrávání NEPŘIDÁVAT tvary (detekce: p1 nemá .id)
          const isPlayback = !animState.p1 || !(animState.p1 as any).id;
          
          if (!isPlayback) {
            if (keepCompassToolAfterAnimRef.current) {
              keepCompassToolAfterAnimRef.current = false;
              setActiveTool('circle');
            } else if (keepRulerToolAfterAnimRef.current) {
              keepRulerToolAfterAnimRef.current = false;
              setActiveTool('triangleRuler');
            } else {
              setActiveTool('move');
            }
            clearSelectionAfterPlacement();
          }
          
          let newShape: GeoShape | null = null;
          
          // Pouze pokud NENÍ přehrávání, vytvoříme tvary
          if (!isPlayback && animState.type === 'angle') {
            // Speciální případ pro úhel - musíme vytvořit body a úsečku
            // Lokální helper pro labely, protože setPoints je asynchronní
            const usedLabels = points.map(p => p.label);
            const getFreeLabel = () => {
               const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
               for (const char of alphabet) {
                   if (!usedLabels.includes(char)) {
                       usedLabels.push(char);
                       return char;
                   }
               }
               return 'P' + (usedLabels.length + 1);
            };

            let p1Id = (animState.p1 as any).id;
            const newPointsToAdd: GeoPoint[] = [];
            const animP2 = animState.p2 as GeoPoint;
            const helperId = angleArmHelperPointIdRef.current;
            const useHelperAsP2 = !!helperId && animP2.id === helperId;

            // Pokud p1 je dočasný (z customVertex) nebo neexistuje, vytvoříme ho
            const p1Exists = points.some(p => p.id === p1Id);
            if (!p1Exists || p1Id === 'temp-vertex' || p1Id === 'temp-angle-point') {
                const realP1Id = crypto.randomUUID();
                const newP1: GeoPoint = {
                    id: realP1Id,
                    x: animState.p1.x,
                    y: animState.p1.y,
                    label: '',
                    hidden: true
                };
                newPointsToAdd.push(newP1);
                p1Id = realP1Id;
            }

            let p2Id: string;
            if (useHelperAsP2) {
              angleArmHelperPointIdRef.current = null;
              p2Id = helperId!;
            } else {
              p2Id = crypto.randomUUID();
              const newP2: GeoPoint = {
                id: p2Id,
                x: animP2.x,
                y: animP2.y,
                label: '',
                hidden: true
              };
              newPointsToAdd.push(newP2);
            }

            setPoints(prev => {
              let next = [...prev, ...newPointsToAdd];
              if (useHelperAsP2) {
                next = next.map(p =>
                  p.id === helperId
                    ? { ...p, x: animP2.x, y: animP2.y, hidden: true, locked: false, label: '' }
                    : p
                );
              }
              return next;
            });

            // Vytvoříme polopřímku (ray) - dlouhá čára bez koncového bodu
            newShape = {
              id: crypto.randomUUID(),
              type: 'ray',
              label: getNextShapeLabel('ray'),
              points: [p1Id, p2Id],
              definition: {
                p1Id: p1Id,
                p2Id: p2Id
              }
            };

          } else if (!isPlayback) {
            // Pravítko — volná čára bez zápisu do konstrukce
            if (
              rulerPendingDrawKindRef.current === 'stroke' &&
              animState.p1 &&
              animState.p2 &&
              (animState.type === 'segment' || animState.type === 'line')
            ) {
              const p1data = animState.p1 as GeoPoint;
              const p2data = animState.p2 as GeoPoint;
              rulerPendingDrawKindRef.current = null;
              setPoints(prev => prev.filter(p => p.id !== p1data.id && p.id !== p2data.id));
              setFreehandPaths(prev => [
                ...prev,
                {
                  id: crypto.randomUUID(),
                  points: [
                    { x: p1data.x, y: p1data.y },
                    { x: p2data.x, y: p2data.y },
                  ],
                  color: darkMode ? '#c0caf5' : '#1e293b',
                  width: 2,
                },
              ]);
              triggerEffect((p1data.x + p2data.x) / 2, (p1data.y + p2data.y) / 2, '#3b82f6');
            } else if (animState.type === 'circleArc') {
              newShape = {
                id: crypto.randomUUID(),
                type: 'circleArc',
                label: getNextShapeLabel('circleArc'),
                points: [(animState.p1 as any).id, (animState.p2 as any).id],
                definition: {
                  p1Id: (animState.p1 as any).id,
                  p2Id: (animState.p2 as any).id,
                  arcSpan: animState.arcSpan ?? COMPASS_ARC_SPAN_RAD
                }
              };
            } else {
              newShape = {
                id: crypto.randomUUID(),
                type: animState.type as any,
                label: getNextShapeLabel(animState.type as any),
                points: [(animState.p1 as any).id, (animState.p2 as any).id],
                definition: {
                  p1Id: (animState.p1 as any).id,
                  p2Id: (animState.p2 as any).id
                }
              };
            }
          }
          
          if (newShape && !isPlayback) {
            rulerPendingDrawKindRef.current = null;
            setShapes(prev => [...prev, newShape!]);
            // Trigger effect at end point (not for arc — p2 is only a direction helper, not on the arc)
            if (animState.p2 && newShape.type !== 'circleArc') {
               triggerEffect(animState.p2.x, animState.p2.y, '#10b981'); // Green pulse for success
            }
            // Zápis konstrukce
            const p1data = animState.p1 as any;
            const p2data = animState.p2 as any;
            // For circles: reposition radius point to 45° (down-right) from center,
            // but ONLY if the point is not used by any other shape — moving a shared
            // point would cause other shapes (lines, perpendiculars, circles) to jump.
            // Use shapesStateRef (always current) instead of `shapes` (stale closure).
            // For full circles: reposition radius point to 45° (down-right) from center.
            // circleArc must keep p2 direction — it defines where the arc sits on the circle.
            if (newShape.type === 'circle') {
              // Only auto-reposition the radius handle when it is an unlabeled helper point created for the circle.
              // If the user picked an existing labeled point (e.g. A lying on a line), moving it would break constraints.
              const isUnlabeledRadiusHandle = !String(p2data.label ?? '').trim();
              if (!isUnlabeledRadiusHandle) {
                // keep the point exactly where it is
              } else {
              const currentShapes = shapesStateRef.current;
              const usedByOtherShape = currentShapes.some(s => {
                // Shapes store dependencies in `points` and `definition`.
                // We must treat any dependency as "shared" (even hidden/unlabeled points).
                if (s.points?.includes(p2data.id)) return true;
                if (s.definition?.p1Id === p2data.id) return true;
                if (s.definition?.p2Id === p2data.id) return true;
                return false;
              });
              if (!usedByOtherShape) {
                const r = Math.sqrt((p2data.x - p1data.x) ** 2 + (p2data.y - p1data.y) ** 2);
                setPoints(prev => prev.map(pt =>
                  pt.id === p2data.id
                    ? { ...pt, x: p1data.x + Math.cos(Math.PI / 4) * r, y: p1data.y + Math.sin(Math.PI / 4) * r }
                    : pt
                ));
              }
              }
            }
            if (newShape.type === 'segment') {
              const lA = getPointLabel(p1data.id);
              const lB = getPointLabel(p2data.id);
              const d = distanceCm(p1data.x, p1data.y, p2data.x, p2data.y);
              addConstructionStep(
                'segment',
                `${lA}${lB}; |${lA}${lB}| = ${d} cm`,
                `${lA}${lB} \\;;\\; |${lA}${lB}| = ${decimalForLatex(d)} \\text{ cm}`,
                `Úsečka ${lA}${lB} o délce ${d} cm`,
                [newShape.id],
                `\\text{Úsečka } ${latexIt(lA)}${latexIt(lB)} \\text{ o délce } ${decimalForLatex(d)} \\text{ cm}`
              );
            } else if (newShape.type === 'line') {
              const lA = getPointLabel(p1data.id);
              const lB = getPointLabel(p2data.id);
              const hasLabels = lA !== '?' && lB !== '?' && lA !== '' && lB !== '';
              const notation = hasLabels ? `${newShape.label} = ${lA}${lB}` : `přímka ${newShape.label}`;
              const latex = hasLabels ? `${newShape.label} = ${lA}${lB}` : `\\text{přímka } ${newShape.label}`;
              const desc = hasLabels ? `Přímka ${newShape.label} procházející body ${lA}, ${lB}` : `Přímka ${newShape.label}`;
              const descLatex = hasLabels ? descLatexLine(newShape.label, lA, lB, false) : descLatexLineShort(newShape.label, false);
              addConstructionStep('line', notation, latex, desc, [newShape.id], descLatex);
            } else if (newShape.type === 'lineDashed') {
              const lA = getPointLabel(p1data.id);
              const lB = getPointLabel(p2data.id);
              const hasLabels = lA !== '?' && lB !== '?' && lA !== '' && lB !== '';
              const notation = hasLabels ? `${newShape.label} = ${lA}${lB}` : `čárkovaná přímka ${newShape.label}`;
              const latex = hasLabels ? `${newShape.label} = ${lA}${lB}` : `\\text{čárkovaná přímka } ${newShape.label}`;
              const desc = hasLabels ? `Čárkovaná přímka ${newShape.label} procházející body ${lA}, ${lB}` : `Čárkovaná přímka ${newShape.label}`;
              const descLatexD = hasLabels ? descLatexLine(newShape.label, lA, lB, true) : descLatexLineShort(newShape.label, true);
              addConstructionStep('lineDashed', notation, latex, desc, [newShape.id], descLatexD);
            } else if (newShape.type === 'lineDashDot') {
              const lA = getPointLabel(p1data.id);
              const lB = getPointLabel(p2data.id);
              const hasLabels = lA !== '?' && lB !== '?' && lA !== '' && lB !== '';
              const notation = hasLabels ? `${newShape.label} = ${lA}${lB}` : `čerchovaná přímka ${newShape.label}`;
              const latex = hasLabels ? `${newShape.label} = ${lA}${lB}` : `\\text{čerchovaná přímka } ${newShape.label}`;
              const desc = hasLabels ? `Čerchovaná přímka ${newShape.label} procházející body ${lA}, ${lB}` : `Čerchovaná přímka ${newShape.label}`;
              const descLatexDD = hasLabels ? descLatexLine(newShape.label, lA, lB, false) : descLatexLineShort(newShape.label, false);
              addConstructionStep('line', notation, latex, desc, [newShape.id], descLatexDD);
            } else if (newShape.type === 'circle') {
              const lS = getPointLabel(p1data.id);
              const r = distanceCm(p1data.x, p1data.y, p2data.x, p2data.y);
              addConstructionStep(
                'circle',
                `${newShape.label}(${lS}; ${r} cm)`,
                `${newShape.label}(${lS};\\, ${decimalForLatex(r)} \\text{ cm})`,
                `Kružnice ${newShape.label} se středem ${lS} a poloměrem ${r} cm`,
                [newShape.id],
                `\\text{Kružnice } ${latexIt(newShape.label)} \\text{ se středem } ${latexIt(lS)} \\text{ a poloměrem } ${decimalForLatex(r)} \\text{ cm}`
              );
            } else if (newShape.type === 'circleArc') {
              const lS = getPointLabel(p1data.id);
              const r = distanceCm(p1data.x, p1data.y, p2data.x, p2data.y);
              addConstructionStep(
                'circle',
                `${newShape.label}(${lS}; výsek ${r} cm)`,
                `${newShape.label}(${lS};\\, \\text{výsek } ${decimalForLatex(r)} \\text{ cm})`,
                `Výsek kružnice ${newShape.label} se středem ${lS}, poloměrem ${r} cm`,
                [newShape.id],
                `\\text{Výsek kružnice } ${latexIt(newShape.label)} \\text{ se středem } ${latexIt(lS)} \\text{, } poloměrem ${decimalForLatex(r)} \\text{ cm}`
              );
            } else if (newShape.type === 'ray') {
              const lA = getPointLabel(p1data.id);
              const lB = getPointLabel(p2data.id);
              const hasB = lB !== '?' && lB !== '';
              const notation = hasB ? `${newShape.label} = ${lA}${lB}` : `polopřímka ${newShape.label}`;
              const latex = hasB
                ? `${newShape.label} = \\overrightarrow{${lA}${lB}}`
                : `\\text{polopřímka } ${newShape.label}`;
              const desc = hasB
                ? `Polopřímka ${newShape.label} z bodu ${lA} procházející bodem ${lB}`
                : `Polopřímka ${newShape.label} z bodu ${lA}`;
              const descLatex = hasB
                ? `\\text{Polopřímka } ${latexIt(newShape.label)} \\text{ z bodu } ${latexIt(lA)} \\text{ procházející bodem } ${latexIt(lB)}`
                : `\\text{Polopřímka } ${latexIt(newShape.label)} \\text{ z bodu } ${latexIt(lA)}`;
              addConstructionStep(
                'ray',
                notation,
                latex,
                desc,
                [newShape.id],
                descLatex
              );
            }
          }
          
          // Reset animace
          setAnimState({
            isActive: false,
            type: null,
            startTime: 0,
            p1: null,
            p2: null,
            progress: 0,
            arcSpan: undefined
          });
        }
      }
      
      try {
        // Intro animace pravítka — ručička ho krátce pohne dokola
        if (
          activeTool === 'triangleRuler' &&
          rulerIntroRef.current.active &&
          rulerIntroRef.current.basePivot &&
          !rulerDraggingRef.current
        ) {
          const intro = rulerIntroRef.current;
          const base = intro.basePivot!;
          const duration = 2200;
          const elapsed = time - intro.startTime;
          const t = Math.min(elapsed / duration, 1);
          // Amplitude: náběh → plný pohyb → doznění
          const envelope =
            t < 0.12 ? t / 0.12 : t > 0.75 ? Math.max(0, (1 - t) / 0.25) : 1;
          const amp = (36 / Math.max(scale, 0.35)) * envelope;
          // Lissajous-like dráha „dokola“ — jen posun, bez rotace
          const ox = Math.sin(t * Math.PI * 2) * amp;
          const oy = Math.sin(t * Math.PI * 2 + Math.PI / 2) * amp * 0.72;
          const pivot = { x: base.x + ox, y: base.y + oy };
          rulerPivotRef.current = pivot;
          rulerAngleRef.current = intro.baseAngle;
          intro.handPos = {
            x: pivot.x + Math.cos(intro.baseAngle) * (18 / scale),
            y: pivot.y + Math.sin(intro.baseAngle) * (18 / scale),
          };
          if (t >= 1) {
            stopRulerIntroAnimation(false);
          }
        }

        if (
          activeTool === 'triangleRuler' &&
          rulerToolState.active &&
          rulerToolState.drawMode !== 'pickEdge'
        ) {
          let rotateHover = rulerDragModeRef.current === 'rotate';
          let moveHover = rulerDragModeRef.current === 'move';
          if (!rulerDraggingRef.current && mousePosRef.current) {
            const pivot = rulerPivotRef.current ?? rulerToolState.pivot;
            if (pivot) {
              const hit = hitTestPlacedRuler(
                mousePosRef.current.x,
                mousePosRef.current.y,
                pivot,
                rulerAngleRef.current,
                scale,
                isTabletMode
              );
              rotateHover = hit.type === 'rotate';
              moveHover = hit.type === 'body';
            }
          }
          if (rotateHover !== rulerRotateHoverRef.current) {
            rulerRotateHoverRef.current = rotateHover;
            setRulerRotateHover(rotateHover);
          }
          if (moveHover !== rulerMoveHoverRef.current) {
            rulerMoveHoverRef.current = moveHover;
            setRulerMoveHover(moveHover);
          }
        } else {
          if (rulerRotateHoverRef.current) {
            rulerRotateHoverRef.current = false;
            rulerRotateCornerRef.current = null;
            setRulerRotateHover(false);
          }
          if (rulerMoveHoverRef.current) {
            rulerMoveHoverRef.current = false;
            setRulerMoveHover(false);
          }
        }

        if (activeTool === 'angle' && protractorCenterRef.current) {
          let moveHover = protractorDragModeRef.current === 'move';
          let armHover = protractorDragModeRef.current === 'arm';
          if (!protractorDraggingRef.current && mousePosRef.current) {
            const center = protractorCenterRef.current;
            const hit = hitTestPlacedProtractor(
              mousePosRef.current.x,
              mousePosRef.current.y,
              center,
              protractorAngleRef.current,
              scale,
              angleInput.value,
              angleInput.rotationOffset,
              angleInput.isMirrored
            );
            moveHover = hit.type === 'move';
            armHover = hit.type === 'arm';
          }
          if (moveHover !== protractorMoveHoverRef.current) {
            protractorMoveHoverRef.current = moveHover;
            setProtractorMoveHover(moveHover);
          }
          if (armHover !== protractorArmHoverRef.current) {
            protractorArmHoverRef.current = armHover;
            setProtractorArmHover(armHover);
          }
        } else {
          if (protractorMoveHoverRef.current) {
            protractorMoveHoverRef.current = false;
            setProtractorMoveHover(false);
          }
          if (protractorArmHoverRef.current) {
            protractorArmHoverRef.current = false;
            setProtractorArmHover(false);
          }
        }

        renderProjectionBackground();
        renderCanvas();
      } catch (e) {
        // Prevent rendering errors from killing the animation loop
        console.warn('Canvas render error:', e);
      }
      animationFrameRef.current = requestAnimationFrame(animate);
    };

    animationFrameRef.current = requestAnimationFrame(animate);
    return () => {
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    };
  }, [
    animState,
    points,
    shapes,
    freehandPaths,
    scale,
    offset,
    canvasSize,
    darkMode,
    selectedPointId,
    hoveredPointId,
    hoveredShape,
    activeTool,
    visualEffects,
    angleInput,
    circleInput,
    rulerToolState,
    recordingState.showPlayer,
    showMeasurements,
    showGrid,
    perpTabletState,
    circleTabletState,
    isTabletMode,
    angleTabletState,
    selectedShapeIds,
    hoveredShapeForMove,
    selectedFreehandIds,
    draggedPointId,
    constructionAnimMs,
    effectiveProjectionEnabled,
    effectiveProjectionSrc,
    effectiveProjectionOpacity,
    overlaySnapshot,
  ]);


  // --- RENDEROVÁNÍ ---
  const renderProjectionBackground = () => {
    const bg = bgCanvasRef.current;
    if (!bg) return;
    const ctx = bg.getContext('2d');
    if (!ctx) return;

    const dpr = isLowPerformance ? 1 : (window.devicePixelRatio || 1);
    if (bg.width !== canvasSize.width * dpr || bg.height !== canvasSize.height * dpr) {
      bg.width = canvasSize.width * dpr;
      bg.height = canvasSize.height * dpr;
    }

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, bg.width, bg.height);

    if (!effectiveProjectionEnabled || !effectiveProjectionSrc) return;

    // Ensure image element exists / is loading
    if (!projectionImgRef.current || projectionImgRef.current.src !== effectiveProjectionSrc) {
      const img = new Image();
      const entry = { src: effectiveProjectionSrc, img, loaded: false };
      projectionImgRef.current = entry;
      img.onload = () => {
        entry.loaded = true;
      };
      img.onerror = () => {
        entry.loaded = false;
      };
      img.src = effectiveProjectionSrc;
    }

    const entry = projectionImgRef.current;
    if (!entry?.loaded) return;

    // Compute world rect once per src / resize / initial enable to match "contain" at that moment.
    const prevRect = projectionWorldRectRef.current;
    const needsRect = !prevRect || prevRect.src !== effectiveProjectionSrc;
    if (needsRect) {
      const iw = entry.img.naturalWidth || 1;
      const ih = entry.img.naturalHeight || 1;
      const w = canvasSize.width;
      const h = canvasSize.height;
      // Make projected template slightly smaller than full "contain",
      // so it doesn't visually fill the whole canvas by default.
      const s = Math.min(w / iw, h / ih) * 0.7;
      const dw = iw * s;
      const dh = ih * s;
      const dx = (w - dw) / 2;
      const dy = (h - dh) / 2;
      // Screen(px) → world
      const wx = (dx - offset.x) / scale;
      const wy = (dy - offset.y) / scale;
      projectionWorldRectRef.current = { src: effectiveProjectionSrc, x: wx, y: wy, w: dw / scale, h: dh / scale };
    }

    const rect = projectionWorldRectRef.current;
    if (!rect) return;

    ctx.save();
    ctx.scale(dpr, dpr);
    ctx.globalAlpha = Math.max(0, Math.min(1, effectiveProjectionOpacity));
    ctx.translate(offset.x, offset.y);
    ctx.scale(scale, scale);
    ctx.drawImage(entry.img, rect.x, rect.y, rect.w, rect.h);
    ctx.restore();
  };

  useEffect(() => {
    if (!autoDetectRequestId) return;
    if (autoDetectRequestId === lastHandledAutoDetectIdRef.current) return;
    lastHandledAutoDetectIdRef.current = autoDetectRequestId;
    if (!autoDetectImageSrc?.trim()) return;
    if (autoDetectRunningRef.current) return;
    const src = autoDetectImageSrc.trim();
    const requestKey = `${autoDetectRequestId}:${src}`;
    if (!markAutoDetectHandled(requestKey)) return;
    autoDetectRunningRef.current = true;
    let cancelled = false;
    (async () => {
      if (readOnlyCanvas) {
        toast.error('Plátno je jen pro čtení.');
        return;
      }
      const w = canvasSize.width;
      const h = canvasSize.height;
      if (w <= 0 || h <= 0) {
        toast.error('Plátno není připravené.');
        return;
      }
      toast.message('Detekuji geometrické objekty…', { duration: 1200 });

      const img = new Image();
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error('Nepodařilo se načíst obrázek.'));
        img.src = src;
      });
      if (cancelled) return;

      const maxSide = 640;
      const scaleTo = Math.min(1, maxSide / Math.max(img.naturalWidth || 1, img.naturalHeight || 1));
      const ow = Math.max(1, Math.round((img.naturalWidth || 1) * scaleTo));
      const oh = Math.max(1, Math.round((img.naturalHeight || 1) * scaleTo));

      const off = document.createElement('canvas');
      off.width = ow;
      off.height = oh;
      const offCtx = off.getContext('2d');
      if (!offCtx) throw new Error('Canvas není dostupný.');
      offCtx.drawImage(img, 0, 0, ow, oh);

      const data = offCtx.getImageData(0, 0, ow, oh).data;
      const gray = new Uint8ClampedArray(ow * oh);
      for (let i = 0, p = 0; i < data.length; i += 4, p++) {
        const r = data[i], g = data[i + 1], b = data[i + 2];
        gray[p] = (0.299 * r + 0.587 * g + 0.114 * b) | 0;
      }

      const mag = sobelEdgesGray(gray, ow, oh);
      let maxMag = 0;
      for (let i = 0; i < mag.length; i++) if (mag[i] > maxMag) maxMag = mag[i];
      const thr = Math.max(50, Math.round(maxMag * 0.23));

      const edgeBinary = new Uint8Array(ow * oh);
      let edgeCount = 0;
      for (let i = 0; i < mag.length; i++) {
        if (mag[i] > thr) { edgeBinary[i] = 1; edgeCount++; }
      }
      if (edgeCount < 200) {
        toast.error('V obrázku je málo hran pro detekci.');
        return;
      }

      const allPaths = traceEdgePaths(edgeBinary, ow, oh, 500);
      const imgDiag = Math.hypot(ow, oh);
      const minPathPx = imgDiag * 0.12;
      const longPaths = allPaths.filter(path => {
        let len = 0;
        for (let i = 1; i < path.length; i++) {
          len += Math.hypot(path[i].x - path[i - 1].x, path[i].y - path[i - 1].y);
        }
        return len >= minPathPx;
      });

      const filteredPts: TracePoint[] = [];
      for (const path of longPaths) for (const p of path) filteredPts.push(p);

      if (filteredPts.length < 100) {
        toast.error('V obrázku nejsou dostatečně dlouhé hrany pro detekci.');
        return;
      }

      const maxPts = 6000;
      const step = Math.max(1, Math.floor(filteredPts.length / maxPts));
      const pts = filteredPts.filter((_, i) => i % step === 0);

      const lineDistThr = 3.0;
      const circleDistThr = 4.0;

      const remaining: TracePoint[] = [...pts];
      const pickedLines: { model: LineModel; inliers: TracePoint[] }[] = [];
      const pickedCircles: { model: CircleModel; inliers: TracePoint[] }[] = [];

      const randInt = (n: number) => Math.floor(Math.random() * n);

      const minLineSpanPx = imgDiag * 0.25;
      const maxLines = 8;
      const maxCircles = 3;

      const lineSpanPx = (model: LineModel, inliers: TracePoint[]) => {
        const dx = -model.b;
        const dy = model.a;
        let tMin = Infinity;
        let tMax = -Infinity;
        for (const p of inliers) {
          const t = p.x * dx + p.y * dy;
          if (t < tMin) tMin = t;
          if (t > tMax) tMax = t;
        }
        return tMax - tMin;
      };

      const circleCoverageRad = (model: CircleModel, inliers: TracePoint[]) => {
        const angles: number[] = [];
        for (const p of inliers) angles.push(Math.atan2(p.y - model.cy, p.x - model.cx));
        angles.sort((a, b) => a - b);
        if (angles.length < 10) return 0;
        let maxGap = 0;
        for (let i = 1; i < angles.length; i++) maxGap = Math.max(maxGap, angles[i] - angles[i - 1]);
        maxGap = Math.max(maxGap, angles[0] + Math.PI * 2 - angles[angles.length - 1]);
        return Math.PI * 2 - maxGap;
      };

      for (let iterObj = 0; iterObj < maxLines; iterObj++) {
        let best: { model: LineModel; inliers: TracePoint[] } | null = null;
        const iters = 400;
        for (let it = 0; it < iters; it++) {
          if (remaining.length < 60) break;
          const p1 = remaining[randInt(remaining.length)];
          const p2 = remaining[randInt(remaining.length)];
          const model = lineFrom2Points(p1, p2);
          if (!model) continue;
          const inliers: TracePoint[] = [];
          for (const p of remaining) if (distPointLine(p, model) <= lineDistThr) inliers.push(p);
          if (inliers.length < 150) continue;
          if (lineSpanPx(model, inliers) < minLineSpanPx) continue;
          if (!best || inliers.length > best.inliers.length) best = { model, inliers };
        }
        if (!best || best.inliers.length < 150) break;
        pickedLines.push(best);
        const inlierSet = new Set(best.inliers.map(p => `${p.x},${p.y}`));
        for (let i = remaining.length - 1; i >= 0; i--) {
          if (inlierSet.has(`${remaining[i].x},${remaining[i].y}`)) remaining.splice(i, 1);
        }
      }

      // Merge near-parallel close lines (two edges of a thick stroke → one line)
      const mergeAngleTol = Math.cos((6 * Math.PI) / 180);
      const mergeDistPx = 20;

      const normLine = (l: LineModel): LineModel => {
        const n = Math.hypot(l.a, l.b) || 1;
        let a = l.a / n, b = l.b / n, c = l.c / n;
        if (a < 0 || (Math.abs(a) < 1e-9 && b < 0)) { a = -a; b = -b; c = -c; }
        return { a, b, c };
      };

      const mergedLines: { model: LineModel; inliers: TracePoint[] }[] = [];
      const lineUsed = new Uint8Array(pickedLines.length);
      for (let i = 0; i < pickedLines.length; i++) {
        if (lineUsed[i]) continue;
        const ni = normLine(pickedLines[i].model);
        const group = [i];
        for (let j = i + 1; j < pickedLines.length; j++) {
          if (lineUsed[j]) continue;
          const nj = normLine(pickedLines[j].model);
          const dot = Math.abs(ni.a * nj.a + ni.b * nj.b);
          if (dot < mergeAngleTol) continue;
          if (Math.abs(ni.c - nj.c) > mergeDistPx) continue;
          group.push(j);
        }
        let sa = 0, sb = 0, sc = 0;
        const allInliers: TracePoint[] = [];
        for (const idx of group) {
          lineUsed[idx] = 1;
          const nm = normLine(pickedLines[idx].model);
          sa += nm.a; sb += nm.b; sc += nm.c;
          allInliers.push(...pickedLines[idx].inliers);
        }
        const n = Math.hypot(sa, sb) || 1;
        mergedLines.push({ model: { a: sa / n, b: sb / n, c: sc / group.length }, inliers: allInliers });
      }

      pickedLines.length = 0;
      for (const ml of mergedLines) pickedLines.push(ml);

      for (let iterObj = 0; iterObj < maxCircles; iterObj++) {
        let best: { model: CircleModel; inliers: TracePoint[] } | null = null;
        const iters = 340;
        for (let it = 0; it < iters; it++) {
          if (remaining.length < 120) break;
          const p1 = remaining[randInt(remaining.length)];
          const p2 = remaining[randInt(remaining.length)];
          const p3 = remaining[randInt(remaining.length)];
          const model = circleFrom3Points(p1, p2, p3);
          if (!model) continue;
          if (model.r < 10 || model.r > Math.max(ow, oh) * 0.9) continue;
          const inliers: TracePoint[] = [];
          for (const p of remaining) if (distPointCircle(p, model) <= circleDistThr) inliers.push(p);
          if (inliers.length < 240) continue;
          if (circleCoverageRad(model, inliers) < (140 * Math.PI) / 180) continue;
          if (!best || inliers.length > best.inliers.length) best = { model, inliers };
        }
        if (!best || best.inliers.length < 240) break;
        pickedCircles.push(best);
        const inlierSet = new Set(best.inliers.map(p => `${p.x},${p.y}`));
        for (let i = remaining.length - 1; i >= 0; i--) {
          if (inlierSet.has(`${remaining[i].x},${remaining[i].y}`)) remaining.splice(i, 1);
        }
      }

      // Merge near-duplicate circles (inner/outer edge of thick stroke → one circle)
      const mergeCenterPx = 20;
      const mergeRadiusPx = 20;
      const mergedCircles: { model: CircleModel; inliers: TracePoint[] }[] = [];
      const circleUsed = new Uint8Array(pickedCircles.length);
      for (let i = 0; i < pickedCircles.length; i++) {
        if (circleUsed[i]) continue;
        const ci = pickedCircles[i].model;
        const group = [i];
        for (let j = i + 1; j < pickedCircles.length; j++) {
          if (circleUsed[j]) continue;
          const cj = pickedCircles[j].model;
          if (Math.hypot(ci.cx - cj.cx, ci.cy - cj.cy) > mergeCenterPx) continue;
          if (Math.abs(ci.r - cj.r) > mergeRadiusPx) continue;
          group.push(j);
        }
        let scx = 0, scy = 0, sr = 0;
        const allInliers: TracePoint[] = [];
        for (const idx of group) {
          circleUsed[idx] = 1;
          const m = pickedCircles[idx].model;
          scx += m.cx; scy += m.cy; sr += m.r;
          allInliers.push(...pickedCircles[idx].inliers);
        }
        const k = group.length;
        mergedCircles.push({ model: { cx: scx / k, cy: scy / k, r: sr / k }, inliers: allInliers });
      }
      pickedCircles.length = 0;
      for (const mc of mergedCircles) pickedCircles.push(mc);

      // Remove "lines" whose inliers mostly lie on a detected circle (arc misdetected as line)
      if (pickedCircles.length > 0 && pickedLines.length > 0) {
        const circleOverlapThr = circleDistThr * 3;
        const filteredLines = pickedLines.filter(line => {
          let nearCircle = 0;
          for (const p of line.inliers) {
            for (const circ of pickedCircles) {
              if (distPointCircle(p, circ.model) <= circleOverlapThr) { nearCircle++; break; }
            }
          }
          return nearCircle / line.inliers.length < 0.4;
        });
        pickedLines.length = 0;
        for (const fl of filteredLines) pickedLines.push(fl);
      }

      if (pickedLines.length === 0 && pickedCircles.length === 0) {
        toast.error('Nepodařilo se detekovat přímky ani kružnice.');
        return;
      }

      const iw = img.naturalWidth || 1;
      const ih = img.naturalHeight || 1;
      const sContain = Math.min(w / iw, h / ih);
      const dw = iw * sContain;
      const dh = ih * sContain;
      const dx = (w - dw) / 2;
      const dy = (h - dh) / 2;
      const toWorld = (px: number, py: number) => {
        const sx = dx + (px / ow) * dw;
        const sy = dy + (py / oh) * dh;
        return { x: (sx - offset.x) / scale, y: (sy - offset.y) / scale };
      };

      const wx0 = (0 - offset.x) / scale;
      const wy0 = (0 - offset.y) / scale;
      const wx1 = (w - offset.x) / scale;
      const wy1 = (h - offset.y) / scale;

      const existingPoints = pointsStateRef.current;
      const existingShapes = shapesStateRef.current;
      const usedPointLabels = new Set(existingPoints.map(p => p.label).filter(Boolean));
      const usedCircleLabels = new Set(existingShapes.filter(s => s.type === 'circle' || s.type === 'circleArc').map(s => s.label).filter(Boolean));
      const usedLineLabels = new Set(existingShapes.filter(s => s.type !== 'circle' && s.type !== 'circleArc').map(s => s.label).filter(Boolean));

      const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
      const nextPointLabel = () => {
        for (const ch of alphabet) if (!usedPointLabels.has(ch)) { usedPointLabels.add(ch); return ch; }
        const fallback = 'A' + (usedPointLabels.size + 1);
        usedPointLabels.add(fallback);
        return fallback;
      };
      const nextCircleLabel = () => {
        const labels = ['k', 'l', 'm', 'n', 'o'];
        for (const ch of labels) if (!usedCircleLabels.has(ch)) { usedCircleLabels.add(ch); return ch; }
        const fallback = 'k' + (usedCircleLabels.size + 1);
        usedCircleLabels.add(fallback);
        return fallback;
      };
      const nextLineLabel = () => {
        const labels = ['p', 'q', 'r', 's', 't', 'u', 'v'];
        for (const ch of labels) if (!usedLineLabels.has(ch)) { usedLineLabels.add(ch); return ch; }
        const fallback = 'p' + (usedLineLabels.size + 1);
        usedLineLabels.add(fallback);
        return fallback;
      };

      const newPoints: GeoPoint[] = [];
      const newShapes: GeoShape[] = [];

      const addPoint = (x: number, y: number, hidden = false) => {
        const id = crypto.randomUUID();
        const label = hidden ? '' : nextPointLabel();
        const p: GeoPoint = { id, x, y, label, hidden };
        newPoints.push(p);
        return p;
      };

      // --- Dedup helpers (avoid near-identical detections) ---
      const worldW = Math.abs(wx1 - wx0) || 1;
      const worldH = Math.abs(wy1 - wy0) || 1;
      const lineAngleTol = Math.cos((2.5 * Math.PI) / 180); // ~2.5°
      const lineDistTol = Math.max(worldW, worldH) * 0.008; // ~0.8% of viewport
      const circleCenterTol = Math.max(worldW, worldH) * 0.012;
      const circleRadiusTol = Math.max(worldW, worldH) * 0.008;

      const normalizeLine = (l: LineModel): LineModel => {
        // Ensure a^2 + b^2 == 1; fix sign for stable comparisons
        const n = Math.hypot(l.a, l.b) || 1;
        let a = l.a / n;
        let b = l.b / n;
        let c = l.c / n;
        if (a < 0 || (Math.abs(a) < 1e-9 && b < 0)) {
          a = -a; b = -b; c = -c;
        }
        return { a, b, c };
      };

      const similarLine = (l1: LineModel, l2: LineModel) => {
        const n1 = normalizeLine(l1);
        const n2 = normalizeLine(l2);
        const dot = Math.abs(n1.a * n2.a + n1.b * n2.b);
        if (dot < lineAngleTol) return false;
        return Math.abs(n1.c - n2.c) <= lineDistTol;
      };

      const similarCircle = (c1: CircleModel, c2: CircleModel) => {
        const dc = Math.hypot(c1.cx - c2.cx, c1.cy - c2.cy);
        if (dc > circleCenterTol) return false;
        return Math.abs(c1.r - c2.r) <= circleRadiusTol;
      };

      const existingPointById = new Map(existingPoints.map(p => [p.id, p]));
      const existingLineModels: LineModel[] = [];
      const existingCircleModels: CircleModel[] = [];
      for (const s of existingShapes) {
        if (s.type === 'line' || s.type === 'lineDashed' || s.type === 'segment' || s.type === 'ray') {
          const p1 = existingPointById.get(s.definition.p1Id);
          const p2 = s.definition.p2Id ? existingPointById.get(s.definition.p2Id) : null;
          if (p1 && p2) {
            const lm = lineFrom2Points({ x: p1.x, y: p1.y }, { x: p2.x, y: p2.y });
            if (lm) existingLineModels.push(lm);
          }
        } else if (s.type === 'circle' || s.type === 'circleArc') {
          const p1 = existingPointById.get(s.definition.p1Id);
          const p2 = s.definition.p2Id ? existingPointById.get(s.definition.p2Id) : null;
          if (p1 && p2) {
            const r = Math.hypot(p2.x - p1.x, p2.y - p1.y);
            existingCircleModels.push({ cx: p1.x, cy: p1.y, r });
          }
        }
      }

      const acceptedLineModels: LineModel[] = [];
      const acceptedCircleModels: CircleModel[] = [];

      for (const l of pickedLines) {
        const m = l.model;
        let imgPtA: TracePoint, imgPtB: TracePoint;
        if (Math.abs(m.b) >= Math.abs(m.a)) {
          imgPtA = { x: 0, y: -(m.a * 0 + m.c) / m.b };
          imgPtB = { x: ow, y: -(m.a * ow + m.c) / m.b };
        } else {
          imgPtA = { x: -(m.b * 0 + m.c) / m.a, y: 0 };
          imgPtB = { x: -(m.b * oh + m.c) / m.a, y: oh };
        }
        const pA = toWorld(imgPtA.x, imgPtA.y);
        const pB = toWorld(imgPtB.x, imgPtB.y);
        const lm = lineFrom2Points(pA, pB);
        if (!lm) continue;
        if (acceptedLineModels.some(m => similarLine(m, lm)) || existingLineModels.some(m => similarLine(m, lm))) {
          continue;
        }

        const candidates: TracePoint[] = [];
        const addIfFinite = (x: number, y: number) => {
          if (Number.isFinite(x) && Number.isFinite(y) && x >= Math.min(wx0, wx1) - 1 && x <= Math.max(wx0, wx1) + 1 && y >= Math.min(wy0, wy1) - 1 && y <= Math.max(wy0, wy1) + 1) {
            candidates.push({ x, y });
          }
        };
        const a = lm.a, b = lm.b, c = lm.c;
        if (Math.abs(b) > 1e-6) {
          addIfFinite(wx0, -(a * wx0 + c) / b);
          addIfFinite(wx1, -(a * wx1 + c) / b);
        }
        if (Math.abs(a) > 1e-6) {
          addIfFinite(-(b * wy0 + c) / a, wy0);
          addIfFinite(-(b * wy1 + c) / a, wy1);
        }
        if (candidates.length < 2) continue;
        const p1 = candidates[0];
        const p2 = candidates[candidates.length - 1];

        const gp1 = addPoint(p1.x, p1.y, true);
        const gp2 = addPoint(p2.x, p2.y, true);
        acceptedLineModels.push(lm);
        newShapes.push({
          id: crypto.randomUUID(),
          type: 'line',
          label: nextLineLabel(),
          points: [gp1.id, gp2.id],
          definition: { p1Id: gp1.id, p2Id: gp2.id },
        });
      }

      for (const c0 of pickedCircles) {
        const centerW = toWorld(c0.model.cx, c0.model.cy);
        const edgeW = toWorld(c0.model.cx + c0.model.r, c0.model.cy);
        const rW = Math.hypot(edgeW.x - centerW.x, edgeW.y - centerW.y);
        if (!Number.isFinite(rW) || rW < 1e-3) continue;
        const cm: CircleModel = { cx: centerW.x, cy: centerW.y, r: rW };
        if (acceptedCircleModels.some(m => similarCircle(m, cm)) || existingCircleModels.some(m => similarCircle(m, cm))) {
          continue;
        }
        const centerP = addPoint(centerW.x, centerW.y);
        const radiusP = addPoint(centerW.x + rW, centerW.y, true);
        acceptedCircleModels.push(cm);
        newShapes.push({
          id: crypto.randomUUID(),
          type: 'circle',
          label: nextCircleLabel(),
          points: [centerP.id, radiusP.id],
          definition: { p1Id: centerP.id, p2Id: radiusP.id },
        });
      }

      // --- Detect point labels via connected-component analysis on text-only edges ---
      const lineProxPx = 6;
      const textEdge = new Uint8Array(ow * oh);
      for (let y = 0; y < oh; y++) {
        for (let x = 0; x < ow; x++) {
          if (!edgeBinary[y * ow + x]) continue;
          let nearLine = false;
          for (const pl of pickedLines) {
            if (distPointLine({ x, y }, pl.model) <= lineProxPx) { nearLine = true; break; }
          }
          for (const pc of pickedCircles) {
            if (!nearLine && distPointCircle({ x, y }, pc.model) <= lineProxPx) { nearLine = true; break; }
          }
          if (!nearLine) textEdge[y * ow + x] = 1;
        }
      }

      const ccVisited = new Uint8Array(ow * oh);
      const ccBoxes: { minX: number; maxX: number; minY: number; maxY: number; count: number }[] = [];
      for (let sy = 0; sy < oh; sy++) {
        for (let sx = 0; sx < ow; sx++) {
          const si = sy * ow + sx;
          if (!textEdge[si] || ccVisited[si]) continue;
          let bMinX = sx, bMaxX = sx, bMinY = sy, bMaxY = sy, cnt = 0;
          const stack = [si];
          ccVisited[si] = 1;
          while (stack.length > 0) {
            const ci = stack.pop()!;
            const cx = ci % ow, cy = (ci / ow) | 0;
            cnt++;
            if (cx < bMinX) bMinX = cx;
            if (cx > bMaxX) bMaxX = cx;
            if (cy < bMinY) bMinY = cy;
            if (cy > bMaxY) bMaxY = cy;
            for (let dy = -1; dy <= 1; dy++) {
              for (let dx = -1; dx <= 1; dx++) {
                if (dx === 0 && dy === 0) continue;
                const nx = cx + dx, ny = cy + dy;
                if (nx < 0 || nx >= ow || ny < 0 || ny >= oh) continue;
                const ni = ny * ow + nx;
                if (textEdge[ni] && !ccVisited[ni]) { ccVisited[ni] = 1; stack.push(ni); }
              }
            }
          }
          if (cnt >= 3) ccBoxes.push({ minX: bMinX, maxX: bMaxX, minY: bMinY, maxY: bMaxY, count: cnt });
        }
      }

      // Cluster nearby components into character groups
      const ccParent = Array.from({ length: ccBoxes.length }, (_, i) => i);
      const ccFind = (x: number): number => ccParent[x] === x ? x : (ccParent[x] = ccFind(ccParent[x]));
      const ccUnite = (a: number, b: number) => { ccParent[ccFind(a)] = ccFind(b); };
      const ccGap = 10;
      for (let i = 0; i < ccBoxes.length; i++) {
        for (let j = i + 1; j < ccBoxes.length; j++) {
          const gx = Math.max(0, Math.max(ccBoxes[i].minX, ccBoxes[j].minX) - Math.min(ccBoxes[i].maxX, ccBoxes[j].maxX));
          const gy = Math.max(0, Math.max(ccBoxes[i].minY, ccBoxes[j].minY) - Math.min(ccBoxes[i].maxY, ccBoxes[j].maxY));
          if (Math.hypot(gx, gy) <= ccGap) ccUnite(i, j);
        }
      }

      const charGroups = new Map<number, number[]>();
      for (let i = 0; i < ccBoxes.length; i++) {
        const r = ccFind(i);
        if (!charGroups.has(r)) charGroups.set(r, []);
        charGroups.get(r)!.push(i);
      }

      type CharCluster = { minX: number; maxX: number; minY: number; maxY: number; h: number; w: number; pixels: number };
      const charClusters: CharCluster[] = [];
      for (const indices of charGroups.values()) {
        let gMinX = Infinity, gMaxX = -Infinity, gMinY = Infinity, gMaxY = -Infinity, px = 0;
        for (const idx of indices) {
          const b = ccBoxes[idx];
          if (b.minX < gMinX) gMinX = b.minX;
          if (b.maxX > gMaxX) gMaxX = b.maxX;
          if (b.minY < gMinY) gMinY = b.minY;
          if (b.maxY > gMaxY) gMaxY = b.maxY;
          px += b.count;
        }
        const h = gMaxY - gMinY;
        const w = gMaxX - gMinX;
        const margin = Math.max(ow, oh) * 0.06;
        const nearBorder = gMinX < margin || gMinY < margin || gMaxX > ow - margin || gMaxY > oh - margin;
        if (h >= 6 && h <= 60 && w >= 3 && w <= 60 && px >= 8 && !nearBorder) {
          charClusters.push({ minX: gMinX, maxX: gMaxX, minY: gMinY, maxY: gMaxY, h, w, pixels: px });
        }
      }

      if (charClusters.length >= 2) {
        const heights = charClusters.map(c => c.h).sort((a, b) => a - b);
        const medianH = heights[Math.floor(heights.length / 2)];
        const upperThr = Math.max(medianH * 1.3, 12);

        for (const c of charClusters) {
          if (c.h > upperThr) {
            const px = (c.minX + c.maxX) / 2;
            const py = (c.minY + c.maxY) / 2;
            const wp = toWorld(px, py);
            addPoint(wp.x, wp.y);
          }
        }
      } else if (charClusters.length === 1 && charClusters[0].h >= 12) {
        const c = charClusters[0];
        const px = (c.minX + c.maxX) / 2;
        const py = (c.minY + c.maxY) / 2;
        const wp = toWorld(px, py);
        addPoint(wp.x, wp.y);
      }

      if (newShapes.length === 0 && newPoints.length === 0) {
        toast.error('Detekce našla hrany, ale nepodařilo se je převést na objekty.');
        return;
      }

      setPoints(prev => [...prev, ...newPoints]);
      setShapes(prev => [...prev, ...newShapes]);
      const parts: string[] = [];
      if (newShapes.length > 0) parts.push(`${newShapes.length} tvarů`);
      if (newPoints.filter(p => !p.hidden).length > 0) parts.push(`${newPoints.filter(p => !p.hidden).length} bodů`);
      toast.success(`Detekováno: ${parts.join(', ')}.`);
    })().catch((e) => {
      console.error(e);
      toast.error(e instanceof Error ? e.message : 'Detekce se nepovedla.');
    }).finally(() => {
      autoDetectRunningRef.current = false;
    });

    return () => {
      cancelled = true;
    };
  }, [autoDetectRequestId, autoDetectImageSrc, canvasSize.width, canvasSize.height, offset.x, offset.y, scale, readOnlyCanvas]);

  const renderCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // During drag, use ref position for the dragged point (avoids stale React state)
    const getLivePoint = (p: GeoPoint): GeoPoint => {
      const groupLive = groupDragLiveRef.current?.get(p.id);
      if (groupLive) {
        return { ...p, x: groupLive.x, y: groupLive.y };
      }
      if (draggedPointIdRef.current === p.id && draggedPointPosRef.current) {
        return { ...p, x: draggedPointPosRef.current.x, y: draggedPointPosRef.current.y };
      }
      return p;
    };

    /** UI prvky (táhla, šipky) v px obrazovky → světové jednotky; po ctx.scale(zoom) stejná velikost jako u bodů */
    const sx = (screenPx: number) => screenPx / scale;
    const hideToolOverlays = suppressDrawingToolsForExportRef.current;

    // Reset - optimalizace pro star  za zen  (sn en  DPR)
    const dpr = isLowPerformance ? 1 : (window.devicePixelRatio || 1);
    if (canvas.width !== canvasSize.width * dpr || canvas.height !== canvasSize.height * dpr) {
      canvas.width = canvasSize.width * dpr;
      canvas.height = canvasSize.height * dpr;
    }
    
    // Reset transform to identity before clearing (prevents corruption from previous frame errors)
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    ctx.save();
    ctx.scale(dpr, dpr);

    // Grid (mřížka)
    if (showGrid) drawGrid(ctx, offset, scale);

    ctx.translate(offset.x, offset.y);
    ctx.scale(scale, scale);

    // 0a. Zvýrazňovač (highlighter) - pod vším ostatním
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    
    freehandPaths.forEach(path => {
        if (!path.isHighlight || path.points.length < 2) return;
        // Selection outline
        if (selectedFreehandIds.includes(path.id)) {
          ctx.beginPath();
          ctx.strokeStyle = '#3b82f6';
          ctx.lineWidth = (path.width + 6) / scale;
          ctx.globalAlpha = 0.5;
          ctx.moveTo(path.points[0].x, path.points[0].y);
          for (let i = 1; i < path.points.length; i++) ctx.lineTo(path.points[i].x, path.points[i].y);
          ctx.stroke();
          ctx.globalAlpha = 1;
        }
        ctx.beginPath();
        ctx.strokeStyle = path.color;
        ctx.lineWidth = path.width / scale;
        ctx.moveTo(path.points[0].x, path.points[0].y);
        for (let i = 1; i < path.points.length; i++) {
            ctx.lineTo(path.points[i].x, path.points[i].y);
        }
        ctx.stroke();
    });

    // Aktivní zvýrazňovač (kreslení)
    if (activeTool === 'highlighter' && currentPathRef.current && currentPathRef.current.length >= 1) {
        const path = currentPathRef.current;
        ctx.beginPath();
        ctx.strokeStyle = highlightColorRgbaRef.current;
        ctx.lineWidth = 20 / scale;
        if (path.length === 1) {
            ctx.fillStyle = highlightColorRgbaRef.current;
            ctx.arc(path[0].x, path[0].y, 10/scale, 0, Math.PI * 2);
            ctx.fill();
        } else {
            ctx.moveTo(path[0].x, path[0].y);
            for (let i = 1; i < path.length; i++) {
                ctx.lineTo(path[i].x, path[i].y);
            }
            ctx.stroke();
        }
    }

    // Náhled: zvýraznění podle pravítka (úsečka od kotvy ke kurzoru)
    if (
      activeTool === 'highlighterStraight' &&
      lastHighlightPointRef.current &&
      mousePosRef.current
    ) {
      const a = lastHighlightPointRef.current;
      const b = mousePosRef.current;
      ctx.save();
      ctx.globalAlpha = 0.45;
      ctx.beginPath();
      ctx.strokeStyle = highlightColorRgbaRef.current;
      ctx.lineWidth = 20 / scale;
      ctx.setLineDash([6 / scale, 5 / scale]);
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
    }

    // 0b. Volné pero (freehand) - pod tvary ale nad zvýrazňovačem
    freehandPaths.forEach(path => {
        if (path.isHighlight || path.points.length < 2) return;
        // Selection outline
        if (selectedFreehandIds.includes(path.id)) {
          ctx.beginPath();
          ctx.strokeStyle = '#3b82f6';
          ctx.lineWidth = (path.width + 6) / scale;
          ctx.globalAlpha = 0.5;
          ctx.moveTo(path.points[0].x, path.points[0].y);
          for (let i = 1; i < path.points.length; i++) ctx.lineTo(path.points[i].x, path.points[i].y);
          ctx.stroke();
          ctx.globalAlpha = 1;
        }
        ctx.beginPath();
        ctx.strokeStyle = path.color;
        ctx.lineWidth = path.width / scale;
        ctx.moveTo(path.points[0].x, path.points[0].y);
        for (let i = 1; i < path.points.length; i++) {
            ctx.lineTo(path.points[i].x, path.points[i].y);
        }
        ctx.stroke();
    });

    // Aktivní pero (kreslení)
    if (activeTool === 'freehand' && currentPathRef.current && currentPathRef.current.length >= 1) {
        const path = currentPathRef.current;
        ctx.beginPath();
        ctx.strokeStyle = darkMode ? '#7dcfff' : '#3b82f6';
        ctx.lineWidth = 2 / scale;
        if (path.length === 1) {
             ctx.fillStyle = darkMode ? '#7dcfff' : '#3b82f6';
             ctx.arc(path[0].x, path[0].y, 1/scale, 0, Math.PI * 2);
             ctx.fill();
        } else {
            ctx.moveTo(path[0].x, path[0].y);
            for (let i = 1; i < path.length; i++) {
                ctx.lineTo(path[i].x, path[i].y);
            }
            ctx.stroke();
        }
    }

    // 1. Vykreslení hotových tvarů — jemné „uhýbání“: jen druhá strana kolmo k čáře, bez skoků podél přímky
    const labelClearR = 14 / scale;

    const shapeLabelObstruction = (c: { x: number; y: number }, excludeId: string): number => {
      let bad = 0;
      for (const s of shapes) {
        if (s.id === excludeId) continue;
        const o1 = points.find(pt => pt.id === s.definition.p1Id);
        const o2 = points.find(pt => pt.id === s.definition.p2Id);
        if (!o1 || !o2) continue;
        const q1 = getLivePoint(o1);
        const q2 = getLivePoint(o2);
        let d = Infinity;
        if (s.type === 'segment') d = distToSegment(c, q1, q2).dist;
        else if (s.type === 'line' || s.type === 'lineDashed') d = distPointToLine(c, q1, q2);
        else if (s.type === 'ray') d = distPointToRay(c, q1, q2);
        else if (s.type === 'circle' || s.type === 'circleArc') {
          const rr = Math.hypot(q2.x - q1.x, q2.y - q1.y);
          const dc = Math.hypot(c.x - q1.x, c.y - q1.y);
          d = Math.abs(dc - rr);
        }
        if (d < labelClearR) bad += labelClearR - d;
      }
      return bad;
    };

    /** Jedna kotva podél přímky, volba jen +pad / −pad kolmo (žádné skákání po t). */
    const pickLineShapeLabelWorld = (
      shapeId: string,
      p1: { x: number; y: number },
      p2: { x: number; y: number },
      lineAng: number,
      t: number,
      pad: number
    ): { x: number; y: number } => {
      const dx = p2.x - p1.x;
      const dy = p2.y - p1.y;
      const ax = p1.x + t * dx;
      const ay = p1.y + t * dy;
      const nx = -Math.sin(lineAng);
      const ny = Math.cos(lineAng);
      const pos = { x: ax + nx * pad, y: ay + ny * pad };
      const neg = { x: ax - nx * pad, y: ay - ny * pad };
      const oPos = shapeLabelObstruction(pos, shapeId);
      const oNeg = shapeLabelObstruction(neg, shapeId);
      if (oNeg < oPos - 1e-6) return neg;
      return pos;
    };

    /**
     * Popisek kružnice: výchozí naproti táhlu, ale zkusíme úhly kolem dokola na (r+pad),
     * aby se text nepoložil na jinou přímku/úsečku. Při špatném skóre ještě větší poloměr.
     */
    const pickCircleShapeLabelWorld = (
      shapeId: string,
      center: { x: number; y: number },
      r: number,
      pad: number,
      handleAngle: number
    ): { x: number; y: number } => {
      const α0 = handleAngle + Math.PI;
      const radial = r + pad;
      const angleSteps = [0, 0.45, -0.45, 0.9, -0.9, 1.35, -1.35, 1.8, -1.8];
      let best = { x: center.x + Math.cos(α0) * radial, y: center.y + Math.sin(α0) * radial };
      let bestScore = Infinity;

      const scoreAt = (a: number, rad: number): number => {
        const c = {
          x: center.x + Math.cos(a) * rad,
          y: center.y + Math.sin(a) * rad
        };
        let s = shapeLabelObstruction(c, shapeId);
        s += 0.12 * angleDist(a, α0);
        return s;
      };

      for (const d of angleSteps) {
        const a = α0 + d;
        const s = scoreAt(a, radial);
        if (s < bestScore - 1e-9) {
          bestScore = s;
          best = { x: center.x + Math.cos(a) * radial, y: center.y + Math.sin(a) * radial };
        }
      }

      if (bestScore > 0.35) {
        const outer = r + pad + 10 / scale;
        for (const d of angleSteps) {
          const a = α0 + d;
          const s = scoreAt(a, outer);
          if (s < bestScore - 1e-9) {
            bestScore = s;
            best = { x: center.x + Math.cos(a) * outer, y: center.y + Math.sin(a) * outer };
          }
        }
      }
      return best;
    };

    shapes.forEach(shape => {
      const p1raw = points.find(p => p.id === shape.definition.p1Id);
      const p2raw = points.find(p => p.id === shape.definition.p2Id);
      
      if (!p1raw || !p2raw) return;
      const p1 = getLivePoint(p1raw);
      const p2 = getLivePoint(p2raw);

      const defaultStroke = darkMode ? '#e5e7eb' : '#1f2937';
      const emphasisStrokeClr = darkMode ? '#fbbf24' : '#ea580c';
      const strokeClr = shape.emphasisStroke ? emphasisStrokeClr : defaultStroke;
      const strokeW = shape.thinStroke ? SHAPE_THIN_STROKE_WORLD : 2;

      if (shape.type === 'segment') {
        drawSegment(ctx, p1, p2, 1, strokeClr, strokeW);
        
        if (showMeasurements) {
            const dist = Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2));
            const cm = (dist / PIXELS_PER_CM).toFixed(1).replace('.', ',');
            const segAngle = Math.atan2(p2.y - p1.y, p2.x - p1.x);
            const perpOff = 15 / scale;
            drawMeasurement(ctx, (p1.x + p2.x)/2 + (-Math.sin(segAngle) * perpOff), (p1.y + p2.y)/2 + (Math.cos(segAngle) * perpOff), `${cm} cm`, segAngle);
        }
      } else if (shape.type === 'line') {
        drawLine(ctx, p1, p2, 1, strokeClr, strokeW);
        {
          const lineAng = Math.atan2(p2.y - p1.y, p2.x - p1.x);
          const pad = SHAPE_LABEL_PAD_SCREEN_PX / scale;
          const target = pickLineShapeLabelWorld(shape.id, p1, p2, lineAng, 1.1, pad);
          const pos = getShapeLabelDrawPosition(shape.id, target);
          drawLabel(ctx, pos, shape.label, darkMode ? '#9ca3af' : '#6b7280', 0, 0);
        }
      } else if (shape.type === 'lineDashed') {
        drawLine(ctx, p1, p2, 1, strokeClr, strokeW, true);
        {
          const lineAng = Math.atan2(p2.y - p1.y, p2.x - p1.x);
          const pad = SHAPE_LABEL_PAD_SCREEN_PX / scale;
          const target = pickLineShapeLabelWorld(shape.id, p1, p2, lineAng, 1.1, pad);
          const pos = getShapeLabelDrawPosition(shape.id, target);
          drawLabel(ctx, pos, shape.label, darkMode ? '#9ca3af' : '#6b7280', 0, 0);
        }
      } else if (shape.type === 'lineDashDot') {
        drawLine(ctx, p1, p2, 1, strokeClr, strokeW, false, true);
        {
          const lineAng = Math.atan2(p2.y - p1.y, p2.x - p1.x);
          const pad = SHAPE_LABEL_PAD_SCREEN_PX / scale;
          const target = pickLineShapeLabelWorld(shape.id, p1, p2, lineAng, 1.1, pad);
          const pos = getShapeLabelDrawPosition(shape.id, target);
          drawLabel(ctx, pos, shape.label, darkMode ? '#9ca3af' : '#6b7280', 0, 0);
        }
      } else if (shape.type === 'ray') {
        drawRay(ctx, p1, p2, 1, strokeClr, strokeW);
        {
          const lineAng = Math.atan2(p2.y - p1.y, p2.x - p1.x);
          const pad = SHAPE_LABEL_PAD_SCREEN_PX / scale;
          const target = pickLineShapeLabelWorld(shape.id, p1, p2, lineAng, 0.55, pad);
          const pos = getShapeLabelDrawPosition(shape.id, target);
          drawLabel(ctx, pos, shape.label, darkMode ? '#9ca3af' : '#6b7280', 0, 0);
        }
      } else if (shape.type === 'circle') {
        const r = Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2));
        drawCircle(ctx, p1, r, 1, strokeClr, strokeW);
        {
          const θ = Math.atan2(p2.y - p1.y, p2.x - p1.x);
          const pad = SHAPE_LABEL_PAD_SCREEN_PX / scale;
          const target = pickCircleShapeLabelWorld(shape.id, p1, r, pad, θ);
          const pos = getShapeLabelDrawPosition(shape.id, target);
          drawLabel(ctx, pos, shape.label, darkMode ? '#9ca3af' : '#6b7280', 0, 0);
        }
        
        // Malý kontrolní bod (handle) na obvodu pro změnu velikosti:
        // zobrazit jen když je kružnice aktivní (vybraná).
        const isCircleActive = activeTool === 'move' && selectedShapeIds.includes(shape.id);
        if (isCircleActive && !hideToolOverlays) {
          const isHandleHovered = p2.id === hoveredPointId;
          const isHandleDragged = p2.id === draggedPointId;
          ctx.save();

          // Glow efekt při hoveru
          if (isHandleHovered || isHandleDragged) {
            ctx.beginPath();
            ctx.arc(p2.x, p2.y, sx(12), 0, Math.PI * 2);
            ctx.fillStyle = darkMode ? 'rgba(122, 162, 247, 0.2)' : 'rgba(59, 130, 246, 0.2)';
            ctx.fill();
          }

          ctx.beginPath();
          ctx.arc(p2.x, p2.y, sx(isHandleHovered || isHandleDragged ? 7 : 6), 0, Math.PI * 2);
          ctx.fillStyle = darkMode ? '#7aa2f7' : '#3b82f6';
          ctx.fill();
          ctx.strokeStyle = darkMode ? '#c0caf5' : '#ffffff';
          ctx.lineWidth = sx(2);
          ctx.stroke();
          ctx.restore();
        }
        
        if (showMeasurements) {
             const cm = (r / PIXELS_PER_CM).toFixed(1).replace('.', ',');
             // circle radius label
              drawRadiusMeasurement(ctx, p1, p2, `r = ${cm} cm`);
             
             
             
        }
      } else if (shape.type === 'circleArc') {
        const arcSpan = shape.definition.arcSpan ?? COMPASS_ARC_SPAN_RAD;
        const r = Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2));
        const { start, end } = circleArcAngles(p1, p2, arcSpan);
        ctx.beginPath();
        ctx.arc(p1.x, p1.y, r, start, end);
        ctx.strokeStyle = strokeClr;
        ctx.lineWidth = strokeW;
        ctx.stroke();
        const arcHandlePos = circleArcRadiusHandlePos(p1, p2, arcSpan);
        {
          const midA = (start + end) / 2;
          const pad = SHAPE_LABEL_PAD_SCREEN_PX / scale;
          const handleAng = Math.atan2(arcHandlePos.y - p1.y, arcHandlePos.x - p1.x);
          const base = {
            x: p1.x + Math.cos(midA) * (r + pad),
            y: p1.y + Math.sin(midA) * (r + pad)
          };
          let target = base;
          let bestS = shapeLabelObstruction(base, shape.id);
          const dhBase = Math.hypot(base.x - arcHandlePos.x, base.y - arcHandlePos.y);
          if (dhBase < 24 / scale) bestS += 2;
          for (const d of [0.3, -0.3] as const) {
            const a = midA + d;
            const c = {
              x: p1.x + Math.cos(a) * (r + pad),
              y: p1.y + Math.sin(a) * (r + pad)
            };
            let s = shapeLabelObstruction(c, shape.id);
            const dh = Math.hypot(c.x - arcHandlePos.x, c.y - arcHandlePos.y);
            if (dh < 24 / scale) s += 2;
            if (angleDist(a, handleAng) < 0.35) s += 1;
            if (s < bestS) {
              bestS = s;
              target = c;
            }
          }
          const pos = getShapeLabelDrawPosition(shape.id, target);
          drawLabel(ctx, pos, shape.label, darkMode ? '#9ca3af' : '#6b7280', 0, 0);
        }
        const isArcActive = activeTool === 'move' && selectedShapeIds.includes(shape.id);
        if (isArcActive) {
          const isHandleHovered = p2.id === hoveredPointId;
          const isHandleDragged = p2.id === draggedPointId;
          ctx.save();
          if (isHandleHovered || isHandleDragged) {
            ctx.beginPath();
            ctx.arc(arcHandlePos.x, arcHandlePos.y, sx(12), 0, Math.PI * 2);
            ctx.fillStyle = darkMode ? 'rgba(122, 162, 247, 0.2)' : 'rgba(59, 130, 246, 0.2)';
            ctx.fill();
          }
          ctx.beginPath();
          ctx.arc(arcHandlePos.x, arcHandlePos.y, sx(isHandleHovered || isHandleDragged ? 7 : 6), 0, Math.PI * 2);
          ctx.fillStyle = darkMode ? '#7aa2f7' : '#3b82f6';
          ctx.fill();
          ctx.strokeStyle = darkMode ? '#c0caf5' : '#ffffff';
          ctx.lineWidth = sx(2);
          ctx.stroke();
          ctx.restore();
        }

        if (showMeasurements) {
          const cm = (r / PIXELS_PER_CM).toFixed(1).replace('.', ',');
          drawRadiusMeasurement(ctx, p1, p2, `r = ${cm} cm`);
        }
      }
    });

    // 1b. Zvýraznění vybraných tvarů (selectedShapeIds)
    if (selectedShapeIds.length > 0 && !hideToolOverlays) {
      selectedShapeIds.forEach(shapeId => {
        const shape = shapes.find(s => s.id === shapeId);
        if (!shape) return;
        const sp1 = points.find(p => p.id === shape.definition.p1Id);
        const sp2 = points.find(p => p.id === shape.definition.p2Id);
        if (!sp1 || !sp2) return;

        ctx.save();
        const selColor = darkMode ? '#7aa2f7' : '#3b82f6';
        const selGlow = darkMode ? 'rgba(122, 162, 247, 0.52)' : 'rgba(59, 130, 246, 0.44)';
        
        // Glow vrstva - výraznější
        ctx.globalAlpha = 0.68;
        ctx.shadowColor = selColor;
        ctx.shadowBlur = 13;
        if (shape.type === 'circle') {
          const r = Math.sqrt(Math.pow(sp2.x - sp1.x, 2) + Math.pow(sp2.y - sp1.y, 2));
          ctx.beginPath();
          ctx.arc(sp1.x, sp1.y, r, 0, Math.PI * 2);
          ctx.strokeStyle = selGlow;
          ctx.lineWidth = SELECTION_GLOW_STROKE_WORLD;
          ctx.stroke();
        } else if (shape.type === 'circleArc') {
          const arcSpan = shape.definition.arcSpan ?? COMPASS_ARC_SPAN_RAD;
          const r = Math.sqrt(Math.pow(sp2.x - sp1.x, 2) + Math.pow(sp2.y - sp1.y, 2));
          const { start, end } = circleArcAngles(sp1, sp2, arcSpan);
          ctx.beginPath();
          ctx.arc(sp1.x, sp1.y, r, start, end);
          ctx.strokeStyle = selGlow;
          ctx.lineWidth = SELECTION_GLOW_STROKE_WORLD;
          ctx.stroke();
        } else if (shape.type === 'segment') {
          ctx.beginPath();
          ctx.moveTo(sp1.x, sp1.y);
          ctx.lineTo(sp2.x, sp2.y);
          ctx.strokeStyle = selGlow;
          ctx.lineWidth = SELECTION_GLOW_STROKE_WORLD;
          ctx.stroke();
        } else if (shape.type === 'line' || shape.type === 'lineDashed' || shape.type === 'lineDashDot') {
          const dx = sp2.x - sp1.x, dy = sp2.y - sp1.y;
          const len = Math.sqrt(dx*dx+dy*dy) || 1;
          const EXT = 100000;
          if (shape.type === 'lineDashed') applyLineStyle(ctx, 'dashed');
          else if (shape.type === 'lineDashDot') applyLineStyle(ctx, 'dashdot');
          ctx.beginPath();
          ctx.moveTo(sp1.x - dx/len*EXT, sp1.y - dy/len*EXT);
          ctx.lineTo(sp1.x + dx/len*EXT, sp1.y + dy/len*EXT);
          ctx.strokeStyle = selGlow;
          ctx.lineWidth = SELECTION_GLOW_STROKE_WORLD;
          ctx.stroke();
          if (shape.type === 'lineDashed' || shape.type === 'lineDashDot') applyLineStyle(ctx, 'solid');
        } else if (shape.type === 'ray') {
          const dx = sp2.x - sp1.x, dy = sp2.y - sp1.y;
          const len = Math.sqrt(dx*dx+dy*dy) || 1;
          const EXT = 100000;
          ctx.beginPath();
          ctx.moveTo(sp1.x, sp1.y);
          ctx.lineTo(sp1.x + dx/len*EXT, sp1.y + dy/len*EXT);
          ctx.strokeStyle = selGlow;
          ctx.lineWidth = SELECTION_GLOW_STROKE_WORLD;
          ctx.stroke();
        }
        ctx.shadowBlur = 0;

        // Obrys výběru — u tenké čáry bez čárkování (jinak výběr vypadá jako přerušovaná linka).
        ctx.globalAlpha = 1;
        if (shape.thinStroke) {
          ctx.setLineDash([]);
          ctx.lineDashOffset = 0;
        } else {
          ctx.setLineDash([6, 4]);
        }
        if (shape.type === 'circle') {
          const r = Math.sqrt(Math.pow(sp2.x - sp1.x, 2) + Math.pow(sp2.y - sp1.y, 2));
          ctx.beginPath();
          ctx.arc(sp1.x, sp1.y, r, 0, Math.PI * 2);
          ctx.strokeStyle = selColor;
          ctx.lineWidth = SELECTION_OUTLINE_STROKE_WORLD;
          ctx.stroke();
        } else if (shape.type === 'circleArc') {
          const arcSpan = shape.definition.arcSpan ?? COMPASS_ARC_SPAN_RAD;
          const r = Math.sqrt(Math.pow(sp2.x - sp1.x, 2) + Math.pow(sp2.y - sp1.y, 2));
          const { start, end } = circleArcAngles(sp1, sp2, arcSpan);
          ctx.beginPath();
          ctx.arc(sp1.x, sp1.y, r, start, end);
          ctx.strokeStyle = selColor;
          ctx.lineWidth = SELECTION_OUTLINE_STROKE_WORLD;
          ctx.stroke();
        } else if (shape.type === 'segment') {
          ctx.beginPath();
          ctx.moveTo(sp1.x, sp1.y);
          ctx.lineTo(sp2.x, sp2.y);
          ctx.strokeStyle = selColor;
          ctx.lineWidth = SELECTION_OUTLINE_STROKE_WORLD;
          ctx.stroke();
        } else if (shape.type === 'line' || shape.type === 'lineDashed' || shape.type === 'lineDashDot') {
          const dx = sp2.x - sp1.x, dy = sp2.y - sp1.y;
          const len = Math.sqrt(dx*dx+dy*dy) || 1;
          const EXT = 100000;
          ctx.beginPath();
          ctx.moveTo(sp1.x - dx/len*EXT, sp1.y - dy/len*EXT);
          ctx.lineTo(sp1.x + dx/len*EXT, sp1.y + dy/len*EXT);
          ctx.strokeStyle = selColor;
          ctx.lineWidth = SELECTION_OUTLINE_STROKE_WORLD;
          ctx.stroke();
        } else if (shape.type === 'ray') {
          const dx = sp2.x - sp1.x, dy = sp2.y - sp1.y;
          const len = Math.sqrt(dx*dx+dy*dy) || 1;
          const EXT = 100000;
          ctx.beginPath();
          ctx.moveTo(sp1.x, sp1.y);
          ctx.lineTo(sp1.x + dx/len*EXT, sp1.y + dy/len*EXT);
          ctx.strokeStyle = selColor;
          ctx.lineWidth = SELECTION_OUTLINE_STROKE_WORLD;
          ctx.stroke();
        }
        ctx.setLineDash([]);

        ctx.restore();
      });

      ctx.save();
      applyLineStyle(ctx, 'solid');
      ctx.lineDashOffset = 0;
      ctx.shadowBlur = 0;
      ctx.shadowColor = 'transparent';
      ctx.globalAlpha = 1;
      selectedShapeIds.forEach(shapeId => {
        const shape = shapes.find(s => s.id === shapeId);
        if (!shape) return;
        const sp1 = points.find(p => p.id === shape.definition.p1Id);
        const sp2 = points.find(p => p.id === shape.definition.p2Id);
        if (!sp1 || !sp2) return;
        const topDefault = darkMode ? '#e5e7eb' : '#1f2937';
        const topEmphasis = darkMode ? '#fbbf24' : '#ea580c';
        const topStrokeClr = shape.emphasisStroke ? topEmphasis : topDefault;
        const topStrokeW = shape.thinStroke ? SHAPE_THIN_STROKE_WORLD : 2;
        const lp1 = getLivePoint(sp1);
        const lp2 = getLivePoint(sp2);
        if (shape.type === 'segment') {
          drawSegment(ctx, lp1, lp2, 1, topStrokeClr, topStrokeW);
        } else if (shape.type === 'line') {
          drawLine(ctx, lp1, lp2, 1, topStrokeClr, topStrokeW);
        } else if (shape.type === 'lineDashed') {
          drawLine(ctx, lp1, lp2, 1, topStrokeClr, topStrokeW, true);
        } else if (shape.type === 'lineDashDot') {
          drawLine(ctx, lp1, lp2, 1, topStrokeClr, topStrokeW, false, true);
        } else if (shape.type === 'ray') {
          drawRay(ctx, lp1, lp2, 1, topStrokeClr, topStrokeW);
        } else if (shape.type === 'circle') {
          const r = Math.sqrt(Math.pow(lp2.x - lp1.x, 2) + Math.pow(lp2.y - lp1.y, 2));
          drawCircle(ctx, lp1, r, 1, topStrokeClr, topStrokeW);
        } else if (shape.type === 'circleArc') {
          const arcSpan = shape.definition.arcSpan ?? COMPASS_ARC_SPAN_RAD;
          const r = Math.sqrt(Math.pow(lp2.x - lp1.x, 2) + Math.pow(lp2.y - lp1.y, 2));
          const { start, end } = circleArcAngles(lp1, lp2, arcSpan);
          ctx.setLineDash([]);
          ctx.lineDashOffset = 0;
          ctx.beginPath();
          ctx.arc(lp1.x, lp1.y, r, start, end);
          ctx.strokeStyle = topStrokeClr;
          ctx.lineWidth = topStrokeW;
          ctx.lineCap = 'round';
          ctx.stroke();
        }
      });
      ctx.restore();
    }

    // 1c. Zvýraznění hoveru tvaru pro move tool
    if (hoveredShapeForMove && !hideToolOverlays && (activeTool === 'move' || activeTool === 'eraser') && !selectedShapeIds.includes(hoveredShapeForMove)) {
      const shape = shapes.find(s => s.id === hoveredShapeForMove);
      if (shape) {
        const sp1 = points.find(p => p.id === shape.definition.p1Id);
        const sp2 = points.find(p => p.id === shape.definition.p2Id);
        if (sp1 && sp2) {
          ctx.save();
          const hoverColor = activeTool === 'eraser' ? '#ef4444' : (darkMode ? '#7dcfff' : '#0ea5e9');
          ctx.globalAlpha = 0.6;
          ctx.shadowColor = hoverColor;
          ctx.shadowBlur = 14;
          if (shape.type === 'circle') {
            const r = Math.sqrt(Math.pow(sp2.x - sp1.x, 2) + Math.pow(sp2.y - sp1.y, 2));
            ctx.beginPath();
            ctx.arc(sp1.x, sp1.y, r, 0, Math.PI * 2);
            ctx.strokeStyle = hoverColor;
            ctx.lineWidth = 8;
            ctx.stroke();
          } else if (shape.type === 'circleArc') {
            const arcSpan = shape.definition.arcSpan ?? COMPASS_ARC_SPAN_RAD;
            const r = Math.sqrt(Math.pow(sp2.x - sp1.x, 2) + Math.pow(sp2.y - sp1.y, 2));
            const { start: a0, end: a1 } = circleArcAngles(sp1, sp2, arcSpan);
            ctx.beginPath();
            ctx.arc(sp1.x, sp1.y, r, a0, a1);
            ctx.strokeStyle = hoverColor;
            ctx.lineWidth = 8;
            ctx.stroke();
          } else {
            let start = sp1, end = sp2;
            if (shape.type === 'line' || shape.type === 'lineDashed' || shape.type === 'lineDashDot' || shape.type === 'ray') {
              const dx = sp2.x - sp1.x, dy = sp2.y - sp1.y;
              const len = Math.sqrt(dx*dx+dy*dy) || 1;
              const EXT = 100000;
              if (shape.type === 'line' || shape.type === 'lineDashed' || shape.type === 'lineDashDot') start = { ...sp1, x: sp1.x - dx/len*EXT, y: sp1.y - dy/len*EXT };
              end = { ...sp1, x: sp1.x + dx/len*EXT, y: sp1.y + dy/len*EXT };
            }
            ctx.beginPath();
            ctx.moveTo(start.x, start.y);
            ctx.lineTo(end.x, end.y);
            ctx.strokeStyle = hoverColor;
            ctx.lineWidth = 8;
            if (shape.type === 'lineDashed') applyLineStyle(ctx, 'dashed');
            else if (shape.type === 'lineDashDot') applyLineStyle(ctx, 'dashdot');
            ctx.stroke();
            if (shape.type === 'lineDashed' || shape.type === 'lineDashDot') applyLineStyle(ctx, 'solid');
          }
          ctx.restore();
        }
      }
    }

    // 2. Vykreslení animovaného tvaru (právě rýsovaného)
    if (animState.isActive && animState.p1 && animState.p2) {
      const { p1, p2, progress, type, angle, arcSpan } = animState;
      const { pIn, pDrawEnd } = animPhase;

      const drawProg = getDrawProgress(progress);
      const activeColor = '#f97316'; // Neon Orange
      const activeWidth = 4;
      const skipAnimRuler = keepRulerToolAfterAnimRef.current || hideToolOverlays;

      if (type === 'segment') {
        if (!skipAnimRuler) {
          drawRuler(ctx, p1, p2, progress);
        }
        drawSegment(ctx, p1, p2, progress, activeColor, activeWidth);
        
        if (showMeasurements) {
            const dist = Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2));
            const cm = (dist / PIXELS_PER_CM).toFixed(1).replace('.', ',');
            const sA2 = Math.atan2(p2.y - p1.y, p2.x - p1.x);
            drawMeasurement(ctx, (p1.x + p2.x)/2 + (-Math.sin(sA2) * (20 / scale)), (p1.y + p2.y)/2 + (Math.cos(sA2) * (20 / scale)), `${cm} cm`, sA2);
        }
        
        if (progress > pIn && progress < pDrawEnd) {
             const cx = p1.x + (p2.x - p1.x) * drawProg;
             const cy = p1.y + (p2.y - p1.y) * drawProg;
             drawPenTip(ctx, cx, cy, activeColor);
        }
      } else if (type === 'line') {
        const dx = p2.x - p1.x;
        const dy = p2.y - p1.y;
        const len = Math.sqrt(dx*dx + dy*dy);
        const extend = 1000; 
        const start = { x: p1.x - dx/len * extend, y: p1.y - dy/len * extend };
        const end = { x: p2.x + dx/len * extend, y: p2.y + dy/len * extend };
        
        // Pro kolmice (krátké definiční body ≤200px): centrovat pravítko na p1 (průsečík)
        if (!skipAnimRuler) {
          if (len <= 200) {
            const nx = dx / len;
            const ny = dy / len;
            const rStart = { x: p1.x - nx * 360, y: p1.y - ny * 360 };
            const rEnd = { x: p1.x + nx * 440, y: p1.y + ny * 440 };
            drawRuler(ctx, rStart, rEnd, progress);
          } else {
            drawRuler(ctx, p1, p2, progress);
          }
        }
        drawLine(ctx, p1, p2, progress, activeColor, activeWidth);

        if (progress > pIn && progress < pDrawEnd) {
             const cx = start.x + (end.x - start.x) * drawProg;
             const cy = start.y + (end.y - start.y) * drawProg;
             drawPenTip(ctx, cx, cy, activeColor);
        }
      } else if (type === 'lineDashed') {
        const dx = p2.x - p1.x;
        const dy = p2.y - p1.y;
        const len = Math.sqrt(dx*dx + dy*dy);
        const extend = 1000; 
        const start = { x: p1.x - dx/len * extend, y: p1.y - dy/len * extend };
        const end = { x: p2.x + dx/len * extend, y: p2.y + dy/len * extend };
        
        if (!skipAnimRuler) {
          if (len <= 200) {
            const nx = dx / len;
            const ny = dy / len;
            const rStart = { x: p1.x - nx * 360, y: p1.y - ny * 360 };
            const rEnd = { x: p1.x + nx * 440, y: p1.y + ny * 440 };
            drawRuler(ctx, rStart, rEnd, progress);
          } else {
            drawRuler(ctx, p1, p2, progress);
          }
        }
        drawLine(ctx, p1, p2, progress, activeColor, activeWidth, true);

        if (progress > pIn && progress < pDrawEnd) {
             const cx = start.x + (end.x - start.x) * drawProg;
             const cy = start.y + (end.y - start.y) * drawProg;
             drawPenTip(ctx, cx, cy, activeColor);
        }
      } else if (type === 'lineDashDot') {
        const dx = p2.x - p1.x;
        const dy = p2.y - p1.y;
        const len = Math.sqrt(dx*dx + dy*dy);
        const extend = 1000;
        const start = { x: p1.x - dx/len * extend, y: p1.y - dy/len * extend };
        const end = { x: p2.x + dx/len * extend, y: p2.y + dy/len * extend };

        if (!skipAnimRuler) {
          if (len <= 200) {
            const nx = dx / len;
            const ny = dy / len;
            const rStart = { x: p1.x - nx * 360, y: p1.y - ny * 360 };
            const rEnd = { x: p1.x + nx * 440, y: p1.y + ny * 440 };
            drawRuler(ctx, rStart, rEnd, progress);
          } else {
            drawRuler(ctx, p1, p2, progress);
          }
        }
        drawLine(ctx, p1, p2, progress, activeColor, activeWidth, false, true);

        if (progress > pIn && progress < pDrawEnd) {
          const cx = start.x + (end.x - start.x) * drawProg;
          const cy = start.y + (end.y - start.y) * drawProg;
          drawPenTip(ctx, cx, cy, activeColor);
        }
      } else if (type === 'ray') {
         drawRuler(ctx, p1, p2, progress);
         drawRay(ctx, p1, p2, progress, activeColor, activeWidth);
         
         if (progress > pIn && progress < pDrawEnd) {
             const dx = p2.x - p1.x;
             const dy = p2.y - p1.y;
             const len = Math.sqrt(dx*dx + dy*dy);
             const extend = 2000;
             const endRay = { x: p1.x + dx/len * extend, y: p1.y + dy/len * extend };
             const cx = p1.x + (endRay.x - p1.x) * drawProg;
             const cy = p1.y + (endRay.y - p1.y) * drawProg;
             drawPenTip(ctx, cx, cy, activeColor);
         }
      } else if (type === 'angle') {
        // Animace úhlu: 1. Vyplnění, 2. Narýsování
        
        let baseAngle = (animState as any).baseAngle;
        if (baseAngle === undefined) {
             const targetAngle = Math.atan2(p2.y - p1.y, p2.x - p1.x);
             const inputAngleRad = (angle || 0) * Math.PI / 180;
             baseAngle = targetAngle - inputAngleRad;
        }

        if (progress < 0.5) {
          // Fáze 1: Vyplňování úhlu (0-50%)
          const fillProgress = progress / 0.5;
          drawProtractor(
            ctx,
            p1,
            baseAngle,
            200,
            '#f97316',
            undefined,
            (animState as any).rotationOffset ?? 0,
            (animState as any).isMirrored ?? false
          );
          
          const targetAngleDeg = angle || 45;
          const currentAngleRad = (targetAngleDeg * fillProgress) * Math.PI / 180;
          
          /* ODSTRANĚNO NA PŘÁNÍ UŽIVATELE - Indikátor načítání úhlu
          ctx.beginPath();
          ctx.moveTo(p1.x, p1.y);
          ctx.arc(p1.x, p1.y, 198, baseAngle, baseAngle + currentAngleRad);
          ctx.lineTo(p1.x, p1.y);
          ctx.fillStyle = 'rgba(249, 115, 22, 0.4)';
          ctx.fill();
          */
          
        } else {
          // Fáze 2: Rýsování ramene (50-100%)
          const lineProgress = (progress - 0.5) / 0.5;
          if (!isTabletMode) {
            drawRuler(ctx, p1, p2, lineProgress);
          }
          drawRay(ctx, p1, p2, lineProgress, activeColor, activeWidth);
          
          if (lineProgress > pIn && lineProgress < pDrawEnd) {
              const subDrawProg = getDrawProgress(lineProgress);
              const dx = p2.x - p1.x;
              const dy = p2.y - p1.y;
              const len = Math.sqrt(dx*dx + dy*dy);
              const extend = 2000;
              const endRay = { x: p1.x + dx/len * extend, y: p1.y + dy/len * extend };
              
              const cx = p1.x + (endRay.x - p1.x) * subDrawProg;
              const cy = p1.y + (endRay.y - p1.y) * subDrawProg;
              drawPenTip(ctx, cx, cy, activeColor);
          }
        }
        
      } else if (type === 'circle') {
        const r = Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2));
        if (!hideToolOverlays) {
          drawCompass(ctx, p1, r, progress);
        }
        drawCircle(ctx, p1, r, progress, activeColor, activeWidth);

        if (showMeasurements) {
             const cm = (r / PIXELS_PER_CM).toFixed(1).replace('.', ',');
             drawRadiusMeasurement(ctx, p1, p2, `r = ${cm} cm`);
        }
        
        if (progress > pIn && progress < pDrawEnd) {
           const endAngle = Math.PI * 2 * drawProg;
           const cx = p1.x + r * Math.cos(endAngle);
           const cy = p1.y + r * Math.sin(endAngle);
           drawPenTip(ctx, cx, cy, activeColor);
        }
      } else if (type === 'circleArc') {
        const r = Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2));
        const as = arcSpan ?? COMPASS_ARC_SPAN_RAD;
        const { start, end } = circleArcAngles(p1, p2, as);
        let mapP = progress;
        if (animState.isActive) {
          if (progress < pIn) mapP = 0;
          else if (progress > pDrawEnd) mapP = 1;
          else mapP = (progress - pIn) / (pDrawEnd - pIn);
        }
        const curEnd = start + (end - start) * mapP;
        const pencilPos = {
          x: p1.x + r * Math.cos(curEnd),
          y: p1.y + r * Math.sin(curEnd),
        };
        if (!hideToolOverlays) {
          drawCompass(ctx, p1, r, progress, pencilPos);
        }
        ctx.beginPath();
        ctx.arc(p1.x, p1.y, r, start, curEnd);
        ctx.strokeStyle = activeColor;
        ctx.lineWidth = activeWidth;
        ctx.stroke();

        if (showMeasurements) {
          const cm = (r / PIXELS_PER_CM).toFixed(1).replace('.', ',');
          drawRadiusMeasurement(ctx, p1, p2, `r = ${cm} cm`);
        }
      }
    }

    // 3. Vykreslení bodů (vždy nahoře)
    points.forEach(pRaw => {
      const p = getLivePoint(pRaw);
      if (p.id === angleArmHelperPointIdRef.current) {
        drawPenTip(ctx, p.x, p.y, '#f97316');
        return;
      }
      if (p.hidden) return; // Skip hidden points

      // Pomocný bod poloměru během animace — nekrýtovat jako viditelný bod
      if (
        !p.label &&
        animState.isActive &&
        (animState.type === 'circle' || animState.type === 'circleArc') &&
        (animState.p2 as GeoPoint | undefined)?.id === p.id
      ) {
        return;
      }
      
      // Handle pro změnu poloměru kružnice:
      // zobrazit jen když je daná kružnice vybraná nástrojem Výběr (move).
      const circleShapeForHandle = shapes.find(
        s => (s.type === 'circle' || s.type === 'circleArc') && s.definition.p2Id === p.id
      );
      const isCircleRadiusPoint = !!circleShapeForHandle;
      if (isCircleRadiusPoint) {
        const usedByOtherShape = shapes.some(
          s => s.type !== 'circle' && s.type !== 'circleArc' && s.points.includes(p.id)
        );
        // Hide ONLY unlabeled helper radius points. If the user picked an existing labeled point
        // on the circle, keep it visible as a normal point.
        const isHelperRadiusHandle = !p.label && !usedByOtherShape;
        if (isHelperRadiusHandle) {
          const showCircleHandle =
            !hideToolOverlays &&
            activeTool === 'move' &&
            selectedShapeIds.includes(circleShapeForHandle!.id);
          if (!showCircleHandle) return;
          // Vykreslit jako táhlo (handle) — NE jako bod
          const center = points.find(pt => pt.id === circleShapeForHandle!.definition.p1Id);
          if (center) {
            const centerL = getLivePoint(center);
            const handleXY =
              circleShapeForHandle!.type === 'circleArc'
                ? circleArcRadiusHandlePos(
                    centerL,
                    p,
                    circleShapeForHandle!.definition.arcSpan ?? COMPASS_ARC_SPAN_RAD
                  )
                : { x: p.x, y: p.y };
            const radialAngle = Math.atan2(handleXY.y - centerL.y, handleXY.x - centerL.x);
            const isHoveredHandle = p.id === hoveredPointId || p.id === draggedPointId;
            ctx.save();
            ctx.setLineDash([]);
            // Glow ring pouze při hoveru/drag
            if (isHoveredHandle) {
              ctx.beginPath();
              ctx.arc(handleXY.x, handleXY.y, sx(22), 0, Math.PI * 2);
              ctx.fillStyle = darkMode ? 'rgba(122, 162, 247, 0.18)' : 'rgba(59, 130, 246, 0.12)';
              ctx.fill();
            }
            // Bílý (ne modrý) kruh s barevným outline — jasně táhlo, ne bod
            ctx.beginPath();
            ctx.arc(handleXY.x, handleXY.y, sx(12), 0, Math.PI * 2);
            ctx.fillStyle = darkMode ? '#1e2030' : '#ffffff';
            ctx.fill();
            ctx.strokeStyle = isHoveredHandle
              ? (darkMode ? '#7aa2f7' : '#2563eb')
              : (darkMode ? '#565f89' : '#94a3b8');
            ctx.lineWidth = sx(2);
            ctx.stroke();
            // Dvojšipka podél poloměru — tmavá barva na světlém pozadí
            ctx.save();
            ctx.translate(handleXY.x, handleXY.y);
            ctx.rotate(radialAngle);
            const aLen = sx(7), hLen = sx(3.5), hAng = Math.PI / 5;
            ctx.strokeStyle = isHoveredHandle
              ? (darkMode ? '#7aa2f7' : '#2563eb')
              : (darkMode ? '#a9b1d6' : '#475569');
            ctx.lineWidth = sx(2);
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            ctx.beginPath();
            ctx.moveTo(-aLen, 0); ctx.lineTo(aLen, 0);
            ctx.moveTo(-aLen + hLen * Math.cos(hAng), -hLen * Math.sin(hAng)); ctx.lineTo(-aLen, 0); ctx.lineTo(-aLen + hLen * Math.cos(hAng), hLen * Math.sin(hAng));
            ctx.moveTo(aLen - hLen * Math.cos(hAng), -hLen * Math.sin(hAng)); ctx.lineTo(aLen, 0); ctx.lineTo(aLen - hLen * Math.cos(hAng), hLen * Math.sin(hAng));
            ctx.stroke();
            ctx.restore();
            ctx.restore();
          }
          return;
        }
      }

      const isHovered = p.id === hoveredPointId;
      const isSelected = p.id === selectedPointId;
      const isDragging = p.id === draggedPointId;
      const isActiveSelection = p.id === selection;
      
      // Styl čárky — velikost v px obrazovky / scale, aby při zoomu zůstala stejná (jako u snap indikátorů)
      let tickColor = darkMode ? '#e5e7eb' : '#1f2937'; // Default
      let tickPx = 10;
      let tickWxPx = 3;
      if (isSelected) {
        tickColor = '#3b82f6'; // Blue
        tickPx = 16;
        tickWxPx = 3.5;
      } else if (isHovered || isDragging) {
        tickColor = '#f59e0b'; // Amber
        tickPx = 16;
        tickWxPx = 3.5;
      }
      const tickLenWorld = tickPx / scale;
      const tickWidthWorld = tickWxPx / scale;

      // Zjistit, jestli je bod součástí nebo leží na nějaké přímce/úsečce/paprsku
      const lineShape = shapes.find(s => {
        if (!['segment', 'line', 'lineDashed', 'lineDashDot', 'ray'].includes(s.type)) return false;
        if (s.definition.p1Id === p.id || s.definition.p2Id === p.id) return true; // definiční bod
        // Zkontrolovat, zda bod leží na přímce (vzdálenost < 3px)
        const sp1 = points.find(pt => pt.id === s.definition.p1Id);
        const sp2 = s.definition.p2Id ? points.find(pt => pt.id === s.definition.p2Id) : null;
        if (!sp1 || !sp2) return false;
        const dx = sp2.x - sp1.x, dy = sp2.y - sp1.y;
        const lenSq = dx * dx + dy * dy;
        if (lenSq < 0.0001) return false;
        const dist = Math.abs(dy * p.x - dx * p.y + sp2.x * sp1.y - sp2.y * sp1.x) / Math.sqrt(lenSq);
        return dist * scale < 4;
      });
      
      let lineAngle = 0; // Úhel přímky v radiánech
      if (lineShape) {
        const lp1 = points.find(pt => pt.id === lineShape.definition.p1Id);
        const lp2 = points.find(pt => pt.id === lineShape.definition.p2Id);
        if (lp1 && lp2) {
          lineAngle = Math.atan2(lp2.y - lp1.y, lp2.x - lp1.x);
        }
      }

      // Bod na obvodu kružnice (střed zůstává křížkem)
      let circleRadialAngle = 0;
      const circleShape = !lineShape
        ? shapes.find(s => {
            if (s.type !== 'circle' && s.type !== 'circleArc') return false;
            if (s.definition.p1Id === p.id) return false;
            const centerRaw = points.find(pt => pt.id === s.definition.p1Id);
            const rimRaw = s.definition.p2Id ? points.find(pt => pt.id === s.definition.p2Id) : null;
            if (!centerRaw || !rimRaw) return false;
            const center = getLivePoint(centerRaw);
            const rim = getLivePoint(rimRaw);
            if (s.definition.p2Id === p.id) return true;
            const r = Math.hypot(rim.x - center.x, rim.y - center.y);
            if (r < 0.0001) return false;
            const dist = Math.abs(Math.hypot(p.x - center.x, p.y - center.y) - r);
            return dist * scale < 4;
          })
        : undefined;
      if (circleShape) {
        const centerRaw = points.find(pt => pt.id === circleShape.definition.p1Id);
        if (centerRaw) {
          const center = getLivePoint(centerRaw);
          circleRadialAngle = Math.atan2(p.y - center.y, p.x - center.x);
        }
      }

      // Výběr pro smazání (dashed ring)
      if (isActiveSelection) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, 22 / scale, 0, Math.PI * 2);
        ctx.strokeStyle = darkMode ? '#f7768e' : '#ef4444'; // Tokyo Night Red or normal red
        ctx.lineWidth = 2 / scale;
        ctx.setLineDash([4 / scale, 4 / scale]);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      
      if (isHovered || isSelected) {
        // Vnější glow ring
        ctx.save();
        ctx.beginPath();
        ctx.arc(p.x, p.y, 20 / scale, 0, Math.PI * 2);
        ctx.fillStyle = darkMode ? 'rgba(125, 207, 255, 0.18)' : 'rgba(59, 130, 246, 0.1)';
        ctx.fill();
        ctx.restore();
        // Vnitřní highlight
        ctx.beginPath();
        ctx.arc(p.x, p.y, 14 / scale, 0, Math.PI * 2);
        ctx.fillStyle = darkMode ? 'rgba(125, 207, 255, 0.45)' : 'rgba(59, 130, 246, 0.25)';
        ctx.fill();
        // Glow ring obrys
        ctx.beginPath();
        ctx.arc(p.x, p.y, 20 / scale, 0, Math.PI * 2);
        ctx.strokeStyle = isSelected 
          ? (darkMode ? 'rgba(122, 162, 247, 0.7)' : 'rgba(59, 130, 246, 0.5)') 
          : (darkMode ? 'rgba(125, 207, 255, 0.5)' : 'rgba(59, 130, 246, 0.3)');
        ctx.lineWidth = 1.5 / scale;
        ctx.stroke();
      }

      if (lineShape || circleShape) {
        // Na přímce: čárka kolmá na přímku. Na kružnici: čárka kolmá na oblouk (podél poloměru).
        const tickAngle = lineShape ? lineAngle + Math.PI / 2 : circleRadialAngle;
        const dx = Math.cos(tickAngle) * tickLenWorld / 2;
        const dy = Math.sin(tickAngle) * tickLenWorld / 2;

        ctx.beginPath();
        ctx.moveTo(p.x - dx, p.y - dy);
        ctx.lineTo(p.x + dx, p.y + dy);
        ctx.strokeStyle = tickColor;
        ctx.lineWidth = tickWidthWorld;
        ctx.stroke();
      } else {
        // Samostatný bod - nakreslit křížek
        ctx.beginPath();
        ctx.moveTo(p.x, p.y - tickLenWorld / 2);
        ctx.lineTo(p.x, p.y + tickLenWorld / 2);
        ctx.strokeStyle = tickColor;
        ctx.lineWidth = tickWidthWorld;
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(p.x - tickLenWorld / 2, p.y);
        ctx.lineTo(p.x + tickLenWorld / 2, p.y);
        ctx.strokeStyle = tickColor;
        ctx.lineWidth = tickWidthWorld;
        ctx.stroke();
      }

      // Popisek bodu — jako v zápisu konstrukce: kurzíva, bez kolečka, tmavý text (na tmavém plátně světlý)
      if (p.label) {
        const { x: labelX, y: labelY } = getPointLabelDrawPosition(p);
        ctx.font = `italic ${24 / scale}px Georgia, "Times New Roman", "STIX Two Text", serif`;
        ctx.fillStyle = darkMode ? '#e5e7eb' : '#111827';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(p.label, labelX, labelY);
      }
    });

    if (overlaySnapshot) {
      drawSolutionOverlay(ctx, overlaySnapshot, scale, darkMode ? '#fbbf24' : '#c2410c');
    }

    if (!hideToolOverlays) {
    // 3b. Intersection snap indicator (active only — when cursor is near)
    if (!animState.isActive) {

      // Draw active intersection marker only (when cursor is near)
      const activeIntX = nearestIntersectionRef.current?.x;
      const activeIntY = nearestIntersectionRef.current?.y;
      if (activeIntX !== undefined && activeIntY !== undefined) {
        ctx.save();
        ctx.setLineDash([]);
        const sz = 8 / scale;
        ctx.lineWidth = 2 / scale;
        ctx.strokeStyle = '#f59e0b';

        ctx.beginPath();
        ctx.moveTo(activeIntX - sz, activeIntY);
        ctx.lineTo(activeIntX + sz, activeIntY);
        ctx.moveTo(activeIntX, activeIntY - sz);
        ctx.lineTo(activeIntX, activeIntY + sz);
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(activeIntX, activeIntY, 9 / scale, 0, Math.PI * 2);
        ctx.lineWidth = 1.5 / scale;
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(activeIntX, activeIntY, 2.5 / scale, 0, Math.PI * 2);
        ctx.fillStyle = '#f59e0b';
        ctx.fill();
        ctx.restore();
      }

      // Draw line snap indicator for point tool — same style as intersection indicator
      const lineSnapDraw = nearestLineSnapRef.current;
      if (lineSnapDraw) {
        ctx.save();
        ctx.setLineDash([]);
        const sz = 8 / scale;
        ctx.lineWidth = 2 / scale;
        ctx.strokeStyle = '#f59e0b';

        ctx.beginPath();
        ctx.moveTo(lineSnapDraw.x - sz, lineSnapDraw.y);
        ctx.lineTo(lineSnapDraw.x + sz, lineSnapDraw.y);
        ctx.moveTo(lineSnapDraw.x, lineSnapDraw.y - sz);
        ctx.lineTo(lineSnapDraw.x, lineSnapDraw.y + sz);
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(lineSnapDraw.x, lineSnapDraw.y, 9 / scale, 0, Math.PI * 2);
        ctx.lineWidth = 1.5 / scale;
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(lineSnapDraw.x, lineSnapDraw.y, 2.5 / scale, 0, Math.PI * 2);
        ctx.fillStyle = '#f59e0b';
        ctx.fill();
        ctx.restore();
      }
    }

    // 4a. TABLET: circle ghost rendering (independent of mousePosRef - touch devices don't have continuous mouse position)
    if (isTabletMode && activeTool === 'circle' && circleTabletState.active && circleTabletState.center && selectedPointId && !animState.isActive && !circleInput.visible) {
      const p1 = points.find(p => p.id === selectedPointId);
      if (p1) {
        const ghostColor = darkMode ? 'rgba(255, 255, 255, 0.65)' : 'rgba(0, 0, 0, 0.55)';
        const liveHandlePos = circleTabletHandlePosRef.current;
        const liveRadius = circleTabletRadiusRef.current;
        const actualP2 = liveHandlePos 
          ? liveHandlePos 
          : { x: circleTabletState.center.x + liveRadius, y: circleTabletState.center.y };
        
        const r = Math.sqrt(Math.pow(actualP2.x - p1.x, 2) + Math.pow(actualP2.y - p1.y, 2));
        
        ctx.save();
        ctx.globalAlpha = 0.6;
        
        drawCompass(ctx, p1, r, 0.5, actualP2);
        drawCircle(ctx, p1, r, 1, ghostColor, 2.5, true);

        // Střed — modrý bobánek
        ctx.globalAlpha = 1;
        drawHandleBobble(ctx, p1.x, p1.y, sx(10), scale, { darkMode });
        ctx.save();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = sx(2);
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(p1.x - sx(4), p1.y);
        ctx.lineTo(p1.x + sx(4), p1.y);
        ctx.moveTo(p1.x, p1.y - sx(4));
        ctx.lineTo(p1.x, p1.y + sx(4));
        ctx.stroke();
        ctx.restore();

        // Radius measurement
        if (showMeasurements && r > 10) {
          const ghostCm = (r / PIXELS_PER_CM).toFixed(1).replace('.', ',');
          const ghostRadAngle = Math.atan2(actualP2.y - p1.y, actualP2.x - p1.x);
          const ghostMidX = p1.x + (actualP2.x - p1.x) / 2;
          const ghostMidY = p1.y + (actualP2.y - p1.y) / 2;
          const ghostPerpOff = 18 / scale;
          const ghostOx = -Math.sin(ghostRadAngle) * ghostPerpOff;
          const ghostOy = Math.cos(ghostRadAngle) * ghostPerpOff;
          drawMeasurement(ctx, ghostMidX + ghostOx, ghostMidY + ghostOy, `r = ${ghostCm} cm`, ghostRadAngle);
        }
        
        // Handle na obvodu — modrý bobánek + RotateCw
        const isHandleDragged = circleTabletState.isDraggingHandle;
        const pulse = (Math.sin(Date.now() * 0.004) + 1) / 2;
        const dragPulse = isHandleDragged ? 1 : pulse;
        const mainRadius = sx(isHandleDragged ? 13 : 12);
        drawHandleBobble(ctx, actualP2.x, actualP2.y, mainRadius, scale, {
          glow: sx(10 + dragPulse * 8),
          darkMode,
        });
        ctx.save();
        ctx.translate(actualP2.x, actualP2.y);
        strokeLucideRotateCw(ctx, sx(14), 'rgba(255, 255, 255, 0.98)', 2.4);
        ctx.restore();
        
        ctx.restore();
      }
    }

    // 4b. Náhled při tvorbě (ghost line) — mousePosRef se na tabletu nastaví i v handleTouchStart před mousedown
    if (selectedPointId && !animState.isActive && mousePosRef.current && !circleInput.visible) {
      const p1 = points.find(p => p.id === selectedPointId);
      // Pokud hoverujeme nad bodem, použijeme ten bod jako cíl (snapping), jinak mousePos
      // Pokud je v blízkosti průsečík dvou čar, snap ghost ke průsečíku
      let p2: {x: number, y: number} = mousePosRef.current;
      const snappedPoint = points.find(p => p.id === hoveredPointId);
      if (snappedPoint) {
          p2 = { x: snappedPoint.x, y: snappedPoint.y };
      } else if (nearestIntersectionRef.current) {
          p2 = nearestIntersectionRef.current;
      }

      if (p1 && (p1.x !== p2.x || p1.y !== p2.y)) {
         const ghostColor = darkMode ? 'rgba(255, 255, 255, 0.65)' : 'rgba(0, 0, 0, 0.55)';
         const ghostColorFull = darkMode ? 'rgba(255, 255, 255, 0.85)' : 'rgba(0, 0, 0, 0.75)';
          const ghostLW = 2.5;
         
         ctx.save();
         // Ghost preview
          
          
         ctx.globalAlpha = 0.6;

         if (activeTool === 'segment') {
             // Pokud je fixní délka, omezit p2 na přesnou vzdálenost
             let segP2 = p2;
             if (segmentInput.active && segmentInput.mode === 'fixed') {
               const angle = Math.atan2(p2.y - p1.y, p2.x - p1.x);
               const fixedDist = segmentInput.length * PIXELS_PER_CM;
               segP2 = { x: p1.x + Math.cos(angle) * fixedDist, y: p1.y + Math.sin(angle) * fixedDist };
             }
             if (!isTabletMode) {
               drawRuler(ctx, p1, segP2, 0.5);
             }
             drawSegment(ctx, p1, segP2, 1, ghostColor, ghostLW);

             if (showMeasurements) {
                  const dist = Math.sqrt(Math.pow(segP2.x - p1.x, 2) + Math.pow(segP2.y - p1.y, 2));
                  const cm = (dist / PIXELS_PER_CM).toFixed(1).replace('.', ',');
                  drawLineMeasurement(ctx, p1, segP2, `${cm} cm`);
             }
         } else if (activeTool === 'line') {
             if (!isTabletMode) {
               drawRuler(ctx, p1, p2, 0.5);
               // Ghost line nekonečná
               const dx = p2.x - p1.x;
               const dy = p2.y - p1.y;
               const len = Math.sqrt(dx*dx + dy*dy);
               const extend = 1000;
               const start = { x: p1.x - dx/len * extend, y: p1.y - dy/len * extend };
               const end = { x: p2.x + dx/len * extend, y: p2.y + dy/len * extend };

               ctx.beginPath();
               ctx.moveTo(start.x, start.y);
               ctx.lineTo(end.x, end.y);
               ctx.strokeStyle = ghostColor;
               ctx.lineWidth = ghostLW;
               ctx.stroke();
             }

         } else if (activeTool === 'lineDashed') {
             if (!isTabletMode) {
               drawRuler(ctx, p1, p2, 0.5);
               const dx = p2.x - p1.x;
               const dy = p2.y - p1.y;
               const len = Math.sqrt(dx*dx + dy*dy);
               const extend = 1000;
               const start = { x: p1.x - dx/len * extend, y: p1.y - dy/len * extend };
               const end = { x: p2.x + dx/len * extend, y: p2.y + dy/len * extend };
               ctx.save();
               ctx.setLineDash([10, 7]);
               ctx.beginPath();
               ctx.moveTo(start.x, start.y);
               ctx.lineTo(end.x, end.y);
               ctx.strokeStyle = ghostColor;
               ctx.lineWidth = ghostLW;
               ctx.stroke();
               ctx.restore();
             }

         } else if (activeTool === 'lineDashDot') {
             if (!isTabletMode) {
               drawRuler(ctx, p1, p2, 0.5);
               const dx = p2.x - p1.x;
               const dy = p2.y - p1.y;
               const len = Math.sqrt(dx*dx + dy*dy);
               const extend = 1000;
               const start = { x: p1.x - dx/len * extend, y: p1.y - dy/len * extend };
               const end = { x: p2.x + dx/len * extend, y: p2.y + dy/len * extend };
               ctx.save();
               applyLineStyle(ctx, 'dashdot');
               ctx.beginPath();
               ctx.moveTo(start.x, start.y);
               ctx.lineTo(end.x, end.y);
               ctx.strokeStyle = ghostColor;
               ctx.lineWidth = ghostLW;
               ctx.stroke();
               ctx.restore();
             }

         } else if (activeTool === 'ray') {
             if (!isTabletMode) {
               drawRuler(ctx, p1, p2, 0.5);
               // Ghost ray
               const dx = p2.x - p1.x;
               const dy = p2.y - p1.y;
               const len = Math.sqrt(dx*dx + dy*dy);
               const extend = 2000;
               const endRay = { x: p1.x + dx/len * extend, y: p1.y + dy/len * extend };

               drawRay(ctx, p1, endRay, 1, ghostColor, 2.5);
             }
         } else if (activeTool === 'circle') {
             // Tablet circle rendering is handled in section 4a above (independent of mousePosRef)
             if (isTabletMode && circleTabletState.active) {
               // Already rendered above, skip
             } else {
             const actualP2 = p2;
             const r = Math.sqrt(Math.pow(actualP2.x - p1.x, 2) + Math.pow(actualP2.y - p1.y, 2));
             
             drawCompass(ctx, p1, r, 0.5, actualP2);
             drawCircle(ctx, p1, r, 1, ghostColor, 2.5, true);

              // Ghost circle radius measurement
              if (showMeasurements && r > 10) {
                   const ghostCm = (r / PIXELS_PER_CM).toFixed(1).replace('.', ',');
                   const ghostRadAngle = Math.atan2(actualP2.y - p1.y, actualP2.x - p1.x);
                   const ghostMidX = p1.x + (actualP2.x - p1.x) / 2;
                   const ghostMidY = p1.y + (actualP2.y - p1.y) / 2;
                   const ghostPerpOff = 18 / scale;
                   const ghostOx = -Math.sin(ghostRadAngle) * ghostPerpOff;
                   const ghostOy = Math.cos(ghostRadAngle) * ghostPerpOff;
                   drawMeasurement(ctx, ghostMidX + ghostOx, ghostMidY + ghostOy, `r = ${ghostCm} cm`, ghostRadAngle);
              }
             }

         } else if (activeTool === 'angle') {
             // Pro úhel ukážeme kulatý úhloměr natočený ve směru myši
             const angle = Math.atan2(p2.y - p1.y, p2.x - p1.x);
             drawProtractor(ctx, p1, angle, 200, '#f97316');
             
             // Ghost arm
              drawSegment(ctx, p1, p2, 1, ghostColor, ghostLW);
         }

         ctx.restore();
      }
    }

    // 4b-tablet: dočasné body (bez písmen) při výběru druhého bodu u přímky / čárk. přímky / polopřímky
    if (
      isTabletMode &&
      selectedPointId &&
      !animState.isActive &&
      !circleInput.visible &&
      mousePosRef.current &&
      ['line', 'lineDashed', 'lineDashDot', 'ray'].includes(activeTool)
    ) {
      const p1draft = points.find(p => p.id === selectedPointId);
      const p2draft = mousePosRef.current;
      if (p1draft) {
        const dotR = sx(5);
        const drawConstructionDot = (x: number, y: number) => {
          ctx.beginPath();
          ctx.arc(x, y, dotR, 0, Math.PI * 2);
          ctx.fillStyle = darkMode ? 'rgba(122, 162, 247, 0.95)' : 'rgba(37, 99, 235, 0.95)';
          ctx.fill();
          ctx.strokeStyle = darkMode ? '#c0caf5' : '#ffffff';
          ctx.lineWidth = sx(1.5);
          ctx.stroke();
        };
        ctx.save();
        const showFirstDot = p1draft.hidden || !String(p1draft.label ?? '').trim();
        if (showFirstDot) {
          drawConstructionDot(p1draft.x, p1draft.y);
          drawConstructionDot(p2draft.x, p2draft.y);
        }
        ctx.restore();
      }
    }

    // Tablet ve fázi „vyber linku“: nevykresluj náhled/hover ze zastaralého hoveredShape, dokud neproběhne touchmove
    const suppressStaleAnglePerpLineHoverVisual =
      isTabletMode &&
      ((activeTool === 'angle' && angleTabletState.step === 'selectLine') ||
        (activeTool === 'perpendicular' && perpTabletState.step === 'selectLine')) &&
      !anglePerpLineHoverFromMoveRef.current;

    // 4b-pre. Zvýraznění vybrané linky v angle/perp tablet positioning (i bez hoveru)
    const tabletSelectedLineId = 
      (activeTool === 'angle' && isTabletMode && angleTabletState.step === 'positioning' && angleTabletState.selectedLineId) ? angleTabletState.selectedLineId
      : (activeTool === 'perpendicular' && isTabletMode && perpTabletState.step === 'positioning' && perpTabletState.selectedLineId) ? perpTabletState.selectedLineId
      : null;
    if (tabletSelectedLineId) {
       const selectedShape = shapes.find(s => s.id === tabletSelectedLineId);
       if (selectedShape) {
           const sp1 = points.find(p => p.id === selectedShape.definition.p1Id);
           const sp2 = points.find(p => p.id === selectedShape.definition.p2Id);
           if (sp1 && sp2) {
               const hlColor = activeTool === 'angle' ? '#f97316' : '#3b82f6';
               // Glow vrstva
               ctx.save();
               ctx.globalAlpha = 0.7;
               ctx.shadowColor = hlColor;
               ctx.shadowBlur = 18;
               const glowWidth = 16;
               if (selectedShape.type === 'segment') {
                  drawSegment(ctx, sp1, sp2, 1, hlColor, glowWidth);
               } else if (selectedShape.type === 'line') {
                  drawLine(ctx, sp1, sp2, 1, hlColor, glowWidth);
               } else if (selectedShape.type === 'lineDashed') {
                  drawLine(ctx, sp1, sp2, 1, hlColor, glowWidth, true);
               } else if (selectedShape.type === 'ray') {
                  drawRay(ctx, sp1, sp2, 1, hlColor, glowWidth);
               }
               ctx.restore();
               // Dashed obrys
               ctx.save();
               ctx.globalAlpha = 0.9;
               ctx.setLineDash([8, 4]);
               if (selectedShape.type === 'segment') {
                  drawSegment(ctx, sp1, sp2, 1, hlColor, 3);
               } else if (selectedShape.type === 'line') {
                  drawLine(ctx, sp1, sp2, 1, hlColor, 3);
               } else if (selectedShape.type === 'lineDashed') {
                  drawLine(ctx, sp1, sp2, 1, hlColor, 3, true);
               } else if (selectedShape.type === 'ray') {
                  drawRay(ctx, sp1, sp2, 1, hlColor, 3);
               }
               ctx.setLineDash([]);
               ctx.restore();
           }
       }
    }
    
    // 4b. Zvýraznění hoveredShape (čára pod myší pro úhel nebo kolmici)
    if (
      hoveredShape &&
      (activeTool === 'angle' || activeTool === 'perpendicular') &&
      !(activeTool === 'angle' && protractorCenterRef.current) &&
      !suppressStaleAnglePerpLineHoverVisual
    ) {
       const shape = shapes.find(s => s.id === hoveredShape.id);
       if (shape) {
           const p1 = points.find(p => p.id === shape.definition.p1Id);
           const p2 = points.find(p => p.id === shape.definition.p2Id);
           if (p1 && p2) {
               const hoverHlColor = activeTool === 'angle' ? '#f97316' : '#3b82f6';
               // Glow vrstva
               ctx.save();
               ctx.globalAlpha = 0.6;
               ctx.shadowColor = hoverHlColor;
               ctx.shadowBlur = 14;
               const hoverGlowWidth = 12;
               
               if (shape.type === 'segment') {
                  drawSegment(ctx, p1, p2, 1, hoverHlColor, hoverGlowWidth);
               } else if (shape.type === 'line') {
                  drawLine(ctx, p1, p2, 1, hoverHlColor, hoverGlowWidth);
               } else if (shape.type === 'lineDashed') {
                  drawLine(ctx, p1, p2, 1, hoverHlColor, hoverGlowWidth, true);
               } else if (shape.type === 'ray') {
                  drawRay(ctx, p1, p2, 1, hoverHlColor, hoverGlowWidth);
               }
               ctx.restore();
           }
       }
    }

    // 4c. Náhled kolmice (Perpendicular Tool)
    if (activeTool === 'perpendicular' && mousePosRef.current) {
        const inPositioningMode = isTabletMode && perpTabletState.step === 'positioning' && perpTabletState.selectedLineId;
        
        // V positioning módu zobrazit pouze pokud existuje currentPos (po kliknutí), jinak zobrazit při hoveru (ale ne v tablet módu)
        if ((inPositioningMode && perpTabletState.currentPos) || (hoveredShape && !isTabletMode)) {
            const baseShape = inPositioningMode 
                ? shapes.find(s => s.id === perpTabletState.selectedLineId)
                : shapes.find(s => s.id === hoveredShape.id);
            if (baseShape) {
                const bp1 = points.find(p => p.id === baseShape.definition.p1Id);
                const bp2 = baseShape.definition.p2Id ? points.find(p => p.id === baseShape.definition.p2Id) : null;
                
                let dx = 1, dy = 0;
                if (bp1 && bp2) {
                    dx = bp2.x - bp1.x;
                    dy = bp2.y - bp1.y;
                } else if (baseShape.definition.angle !== undefined) {
                    const rad = -baseShape.definition.angle * Math.PI / 180;
                    dx = Math.cos(rad);
                    dy = Math.sin(rad);
                }

                const perpDx = -dy;
                const perpDy = dx;
                const len = Math.sqrt(perpDx*perpDx + perpDy*perpDy) || 1;
                
                const useTabletPos = isTabletMode && perpTabletState.step === 'positioning' && perpTabletState.currentPos;
                const mx = useTabletPos ? perpTabletState.currentPos.x : mousePosRef.current.x;
                const my = useTabletPos ? perpTabletState.currentPos.y : mousePosRef.current.y;
                
                // Vypočítat projekci myši na základní linku (pro přesné umístění pravítka)
                let projX = mx, projY = my;
                if (bp1) {
                    const baseDx = dx / len;
                    const baseDy = dy / len;
                    const toMouseX = mx - bp1.x;
                    const toMouseY = my - bp1.y;
                    const dot = toMouseX * baseDx + toMouseY * baseDy;
                    projX = bp1.x + dot * baseDx;
                    projY = bp1.y + dot * baseDy;
                }
                
                const extend = 1000;
                const start = { x: projX - perpDx/len * extend, y: projY - perpDy/len * extend };
                const end = { x: projX + perpDx/len * extend, y: projY + perpDy/len * extend };
                
                ctx.save();
                ctx.beginPath();
                ctx.moveTo(start.x, start.y);
                ctx.lineTo(end.x, end.y);
                ctx.strokeStyle = darkMode ? 'rgba(255, 255, 255, 0.5)' : 'rgba(0, 0, 0, 0.5)';
                ctx.lineWidth = 2;
                ctx.setLineDash([5, 5]);
                ctx.stroke();
                
                // Pravítko kolmé na základnu procházející projekcí
                const nx = perpDx / len;
                const ny = perpDy / len;
                
                // Pravítko je dlouhé 800px s image offset -40, takže střed obrázku je v local x=360
                // Posuneme anchor tak, aby střed pravítka seděl přesně na projekci (průsečíku s linkou)
                const rStart = { x: projX - nx * 360, y: projY - ny * 360 };
                const rEnd = { x: projX + nx * 440, y: projY + ny * 440 };
                
                // V tablet módu positioning VŽDY zobrazit pravítko, jinak jen když NENÍ tablet mód
                if (useTabletPos || !isTabletMode) {
                  drawRuler(ctx, rStart, rEnd, 0.5);
                }
                
                // Kontrastní bod v místě projekce (střed kolmice)
                if (useTabletPos || hoveredShape) {
                  ctx.beginPath();
                  ctx.arc(projX, projY, 10, 0, Math.PI * 2);
                  ctx.fillStyle = darkMode ? '#ffffff' : '#1e1b4b';
                  ctx.fill();
                  ctx.lineWidth = 3;
                  ctx.strokeStyle = '#3b82f6';
                  ctx.stroke();
                  ctx.beginPath();
                  ctx.arc(projX, projY, 4, 0, Math.PI * 2);
                  ctx.fillStyle = '#3b82f6';
                  ctx.fill();
                }

                ctx.restore();
            }
        } else {
             // Floating pravítko (vodorovně) když není hover
             const mx = mousePosRef.current.x;
             const my = mousePosRef.current.y;
             const rStart = { x: mx - 400, y: my };
             const rEnd = { x: mx + 400, y: my };
             
             ctx.save();
             if (!isTabletMode) {
               drawRuler(ctx, rStart, rEnd, 0.3); // Mírně průhledné
             }
             ctx.restore();
        }
    }

    // Náhled úhloměru před kliknutím (Angle Tool Hover) — jen bez umístěného úhloměru
    if (
        activeTool === 'angle' &&
        !protractorCenterRef.current &&
        !animState.isActive &&
        !selectedPointId &&
        !angleInput.visible &&
        !suppressAngleHoverPreviewRef.current
    ) {
        const inAnglePositioning = isTabletMode && angleTabletState.step === 'positioning' && angleTabletState.currentPos;
        
        if (inAnglePositioning) {
            // Tablet positioning: zobraz úhloměr na fixní pozici
            drawProtractor(ctx, angleTabletState.currentPos, angleTabletState.baseAngle, 200, '#f97316');
            
            // Highlight bodu dotyku - kontrastní invertovaný bod
            ctx.save();
            ctx.beginPath();
            ctx.arc(angleTabletState.currentPos.x, angleTabletState.currentPos.y, 10, 0, Math.PI * 2);
            ctx.fillStyle = darkMode ? '#ffffff' : '#1e1b4b';
            ctx.fill();
            ctx.lineWidth = 3;
            ctx.strokeStyle = darkMode ? '#f97316' : '#f97316';
            ctx.stroke();
            ctx.beginPath();
            ctx.arc(angleTabletState.currentPos.x, angleTabletState.currentPos.y, 4, 0, Math.PI * 2);
            ctx.fillStyle = '#f97316';
            ctx.fill();
            ctx.restore();
        } else if (hoveredShape && mousePosRef.current && !suppressStaleAnglePerpLineHoverVisual) {
            // Přichycený k čáře
            drawProtractor(ctx, hoveredShape.proj, hoveredShape.angle, 200, '#f97316');
            
            // Highlight bodu dotyku - kontrastní invertovaný bod
            ctx.save();
            ctx.beginPath();
            ctx.arc(hoveredShape.proj.x, hoveredShape.proj.y, 10, 0, Math.PI * 2);
            ctx.fillStyle = darkMode ? '#ffffff' : '#1e1b4b';
            ctx.fill();
            ctx.lineWidth = 3;
            ctx.strokeStyle = '#f97316';
            ctx.stroke();
            ctx.beginPath();
            ctx.arc(hoveredShape.proj.x, hoveredShape.proj.y, 4, 0, Math.PI * 2);
            ctx.fillStyle = '#f97316';
            ctx.fill();
            ctx.restore();
        } else if (mousePosRef.current && !isTabletMode) {
            // "Floating" ghost - navádí uživatele (pouze PC mód)
            drawProtractor(ctx, mousePosRef.current, 0, 200, 'rgba(249, 115, 22, 0.3)');
        }
    }

    // 4a2. Umístěný úhloměr (nástroj Úhloměr — jako pravítko)
    if (
      activeTool === 'angle' &&
      protractorCenterRef.current &&
      !animState.isActive &&
      !suppressAngleHoverPreviewRef.current
    ) {
      const center = protractorCenterRef.current;
      const baseAngle = protractorAngleRef.current;
      drawProtractor(
        ctx,
        center,
        baseAngle,
        200,
        '#f97316',
        angleInput.value,
        angleInput.rotationOffset,
        angleInput.isMirrored,
      );
      drawPenTip(ctx, center.x, center.y, '#f97316');
    }

    // 4a. Aktivní úhloměr při zadávání (Angle Input) — režim „2 body“
    // Pozn.: suppressAngleHoverPreviewRef používáme i jako "hard kill switch" pro vykreslení úhloměru
    // v okamžiku potvrzení, aby neproběhl žádný mezisnímek s uskočeným náhledem.
    if (
      angleInput.visible &&
      !suppressAngleHoverPreviewRef.current &&
      !(activeTool === 'angle' && protractorCenterRef.current)
    ) {
      let center: { x: number; y: number } | null = null;
      let baseAngle = 0;

      if (angleInput.vertexId && angleInput.directionId) {
        const p1 = points.find(p => p.id === angleInput.vertexId);
        const pDir = points.find(p => p.id === angleInput.directionId);
        if (p1 && pDir) {
          center = { x: p1.x, y: p1.y };
          baseAngle = Math.atan2(pDir.y - p1.y, pDir.x - p1.x);
        }
      }

      if (center) {
        drawProtractor(
          ctx,
          center,
          baseAngle,
          200,
          '#f97316',
          angleInput.value,
          angleInput.rotationOffset,
          angleInput.isMirrored,
        );

        // Střed
        drawPenTip(ctx, center.x, center.y, '#f97316');
      }
    }

    // Režim kružítko–rozměr: před výběrem středu — náhled místa kliknutí (žádná kružnice)
    if (circleInput.visible && !circleInput.center && mousePosRef.current && !animState.isActive) {
      const mx = mousePosRef.current.x;
      const my = mousePosRef.current.y;
      const snap = getSnapPositionPreferPoint(mx, my, 30);
      const px = snap ? snap.x : mx;
      const py = snap ? snap.y : my;
      ctx.save();
      ctx.globalAlpha = darkMode ? 0.92 : 0.88;
      drawPenTip(ctx, px, py, darkMode ? '#7aa2f7' : '#3b82f6');
      ctx.restore();
    }

    // 4b. COMPASS MODE — náhled podle režimu; poloměr i „Narýsovat“ vždy ve směru handle (stejný úhel všude)
    // Během animace rýsování už kreslíme samostatné „tool viz“ (kružítko/kružnici),
    // takže tento náhled potlačíme, aby se kružítko nezdvojovalo.
    if (
      circleInput.visible &&
      (activeTool === 'circle' || circleInput.fixedRadius) &&
      circleInput.center &&
      !animState.isActive
    ) {
         const live = circleLiveRef.current;
         const cc = live?.center ?? circleInput.center;
         const radiusCm = live?.radius ?? circleInput.radius;
         const r = radiusCm * PIXELS_PER_CM;
         const ha = live?.handleAngle ?? circleInput.handleAngle;
         const hx = cc.x + Math.cos(ha) * r;
         const hy = cc.y + Math.sin(ha) * r;
         const mode = circleInput.mode;

         ctx.save();

         if (!circleInput.fixedRadius && circleInput.freeDrawMode === 'pickArc') {
           drawCircle(
             ctx,
             cc,
             r,
             1,
             darkMode ? 'rgba(200, 200, 255, 0.7)' : 'rgba(30, 27, 75, 0.6)',
             2.5,
             true
           );
           if (circleInput.arcDraw) {
             const sweep = circleInput.arcDraw.endAngle - circleInput.arcDraw.startAngle;
             if (Math.abs(sweep) > 0.01) {
               ctx.beginPath();
               ctx.setLineDash([]);
               if (sweep >= 0) {
                 ctx.arc(
                   cc.x,
                   cc.y,
                   r,
                   circleInput.arcDraw.startAngle,
                   circleInput.arcDraw.endAngle
                 );
               } else {
                 ctx.arc(
                   cc.x,
                   cc.y,
                   r,
                   circleInput.arcDraw.startAngle,
                   circleInput.arcDraw.endAngle,
                   true
                 );
               }
               ctx.strokeStyle = darkMode ? 'rgba(125, 207, 255, 0.95)' : 'rgba(59, 130, 246, 0.9)';
               ctx.lineWidth = 2.5;
               ctx.stroke();
             }
           }
           drawHandleBobble(ctx, cc.x, cc.y, sx(10), scale, { darkMode });
           ctx.save();
           ctx.strokeStyle = '#ffffff';
           ctx.lineWidth = sx(2);
           ctx.lineCap = 'round';
           ctx.beginPath();
           ctx.moveTo(cc.x - sx(4), cc.y);
           ctx.lineTo(cc.x + sx(4), cc.y);
           ctx.moveTo(cc.x, cc.y - sx(4));
           ctx.lineTo(cc.x, cc.y + sx(4));
           ctx.stroke();
           ctx.restore();
           if (circleInput.arcCrosshair) {
             drawRulerCrosshair(ctx, circleInput.arcCrosshair.x, circleInput.arcCrosshair.y);
           }
           ctx.restore();
         } else {

         if (mode === 'circle') {
           drawCircle(ctx, cc, r, 1, darkMode ? 'rgba(200, 200, 255, 0.7)' : 'rgba(30, 27, 75, 0.6)', 2.5, true);
           drawCompass(ctx, cc, r, 0.5, { x: hx, y: hy });
         } else if (mode === 'arc') {
           const { start, end } = circleArcAngles(cc, { x: hx, y: hy }, COMPASS_ARC_SPAN_RAD);
           ctx.beginPath();
           ctx.arc(cc.x, cc.y, r, start, end);
           ctx.strokeStyle = darkMode ? 'rgba(200, 200, 255, 0.88)' : 'rgba(30, 27, 75, 0.78)';
           ctx.lineWidth = 2.5;
           ctx.stroke();
           drawCompass(ctx, cc, r, 0.5, { x: hx, y: hy });
         } else if (mode === 'point') {
           drawCompass(ctx, cc, r, 0.5, { x: hx, y: hy });
         }

         // Střed — modrý bobánek
         drawHandleBobble(ctx, cc.x, cc.y, sx(10), scale, { darkMode });
         ctx.save();
         ctx.strokeStyle = '#ffffff';
         ctx.lineWidth = sx(2);
         ctx.lineCap = 'round';
         ctx.beginPath();
         ctx.moveTo(cc.x - sx(4), cc.y);
         ctx.lineTo(cc.x + sx(4), cc.y);
         ctx.moveTo(cc.x, cc.y - sx(4));
         ctx.lineTo(cc.x, cc.y + sx(4));
         ctx.stroke();
         ctx.restore();

         // Radiální čára ke konci poloměru
         ctx.beginPath();
         ctx.setLineDash([sx(6), sx(4)]);
         ctx.moveTo(cc.x, cc.y);
         ctx.lineTo(hx, hy);
         ctx.strokeStyle = darkMode ? 'rgba(122, 162, 247, 0.6)' : 'rgba(59, 130, 246, 0.5)';
         ctx.lineWidth = sx(1.5);
         ctx.stroke();
         ctx.setLineDash([]);

         if (mode === 'point') {
           drawHandleBobble(ctx, hx, hy, sx(6), scale, { darkMode });
         }
         
         // Handle na obvodu — modrý bobánek + RotateCw
         const pulse = (Math.sin(Date.now() * 0.004) + 1) / 2;
         const isDragging = circleInput.isDraggingHandle;
         const dragPulse = isDragging ? 1 : pulse;
         const handleR = sx(isDragging ? 14 : 12);
         drawHandleBobble(ctx, hx, hy, handleR, scale, {
           glow: sx(8 + dragPulse * 8),
           darkMode,
         });
         
         ctx.save();
         ctx.translate(hx, hy);
         strokeLucideRotateCw(ctx, sx(14), 'rgba(255, 255, 255, 0.98)', 2.4);
         ctx.restore();
         
         // Měření podél poloměru (stejný úhel jako handle)
         const cm = radiusCm.toFixed(1).replace('.', ',');
         const midX = cc.x + Math.cos(ha) * r / 2;
         const midY = cc.y + Math.sin(ha) * r / 2;
         const perpOff = 18 / scale;
         const ox = -Math.sin(ha) * perpOff;
         const oy = Math.cos(ha) * perpOff;
         drawMeasurement(ctx, midX + ox, midY + oy, `r = ${cm} cm`, ha);
         
         }

         ctx.restore();
    }

    // 4b2. Nástroj Pravítko — volně posunutelné trojúhelníkové pravítko
    const rulerPivot = rulerPivotRef.current ?? rulerToolState.pivot;
    const showPlacedRulerDuringAnim = keepRulerToolAfterAnimRef.current;
    if (
      activeTool === 'triangleRuler' &&
      rulerPivot &&
      (!animState.isActive || showPlacedRulerDuringAnim)
    ) {
      ctx.save();
      drawPlacedRuler(
        ctx,
        rulerPivot,
        rulerAngleRef.current,
        rulerDraggingRef.current ? 0.92 : 0.82
      );
      if (rulerToolState.drawMode === 'pickEdge') {
        if (rulerToolState.lineDraw) {
          const { start, end } = rulerToolState.lineDraw;
          ctx.save();
          ctx.strokeStyle = '#f97316';
          ctx.lineWidth = 3 / scale;
          ctx.setLineDash([10 / scale, 6 / scale]);
          ctx.beginPath();
          ctx.moveTo(start.x, start.y);
          ctx.lineTo(end.x, end.y);
          ctx.stroke();
          ctx.restore();
        }
        const crossPos = getRulerDrawCrosshairPos(rulerPivot, rulerAngleRef.current);
        if (crossPos) {
          drawRulerCrosshair(ctx, crossPos.x, crossPos.y);
        }
      }
      // Jedno rotační kolečko uprostřed pravítka
      if (rulerToolState.drawMode !== 'pickEdge') {
        const emphasized =
          rulerDragModeRef.current === 'rotate' || rulerRotateHoverRef.current;
        drawRulerRotateWheel(
          ctx,
          rulerPivot,
          rulerAngleRef.current,
          emphasized ? 1 : 0.92
        );
      }
      if (rulerIntroRef.current.active && rulerIntroRef.current.handPos) {
        drawHandCursor(
          ctx,
          rulerIntroRef.current.handPos.x,
          rulerIntroRef.current.handPos.y
        );
      }
      ctx.restore();
    }

    } // hideToolOverlays

    // 5a. Marquee rectangle selection
    const currentMarquee = marqueeRef.current;
    if (currentMarquee && !hideToolOverlays) {
      const mx = Math.min(currentMarquee.startX, currentMarquee.endX);
      const my = Math.min(currentMarquee.startY, currentMarquee.endY);
      const mw = Math.abs(currentMarquee.endX - currentMarquee.startX);
      const mh = Math.abs(currentMarquee.endY - currentMarquee.startY);
      
      if (mw > 2 && mh > 2) {
        ctx.save();
        // Fill
        ctx.fillStyle = darkMode ? 'rgba(122, 162, 247, 0.1)' : 'rgba(59, 130, 246, 0.08)';
        ctx.fillRect(mx, my, mw, mh);
        
        // Dashed border
        ctx.setLineDash([6, 4]);
        ctx.strokeStyle = darkMode ? '#7aa2f7' : '#3b82f6';
        ctx.lineWidth = 1.5 / scale;
        ctx.globalAlpha = 0.9;
        ctx.strokeRect(mx, my, mw, mh);
        ctx.setLineDash([]);
        ctx.restore();
      }
    }

    // 5. Visual Effects (Pulses) - optimalizov no pro star  za zen 
    if (!isLowPerformance || visualEffects.length < 3) {
      visualEffects.forEach(effect => {
        const age = performance.now() - effect.startTime;
        const duration = isLowPerformance ? 600 : 1000; // Krat   efekty na pomal ch za zen ch
        if (age > duration) return;
        
        const progress = age / duration;
        const easeOut = 1 - Math.pow(1 - progress, 3); // Cubic ease out
        const radius = 10 + easeOut * 40; // Expand from 10 to 50
        const opacity = 1 - progress;

        ctx.beginPath();
        ctx.arc(effect.x, effect.y, radius, 0, Math.PI * 2);
        ctx.strokeStyle = effect.color;
        ctx.lineWidth = isLowPerformance ? 2 : 3; // Tenčí čáry na pomalých zařízeních
        ctx.globalAlpha = opacity;
        ctx.stroke();
        ctx.globalAlpha = 1;
      });
    }

    ctx.restore();
  };
  renderCanvasRef.current = renderCanvas;
  useEffect(() => {
    // When toggling / switching image / resizing, recompute base placement to "contain" at that moment.
    if (!effectiveProjectionEnabled || !effectiveProjectionSrc) {
      projectionWorldRectRef.current = null;
      return;
    }
    // Force recompute on enable / resize
    projectionWorldRectRef.current = null;
  }, [effectiveProjectionEnabled, effectiveProjectionSrc, canvasSize.width, canvasSize.height]);

  // --- HELPER DRAW FUNCTIONS ---
  
  const drawMeasurement = (ctx: CanvasRenderingContext2D, x: number, y: number, text: string, angle?: number) => {
    ctx.save();
    try {
      const pad = 5 / scale;
      const height = 18 / scale;
      const cornerR = 4 / scale;
      ctx.font = `bold ${14 / scale}px sans-serif`;
      const metrics = ctx.measureText(text);
      const width = metrics.width + pad * 2;
      
      // Rotace kolem stredu popisku
      if (angle !== undefined) {
        ctx.translate(x, y);
        let drawAngle = angle;
        if (drawAngle > Math.PI / 2) drawAngle -= Math.PI;
        if (drawAngle < -Math.PI / 2) drawAngle += Math.PI;
        ctx.rotate(drawAngle);
        ctx.translate(-x, -y);
      }
      
      // Background pill (compatible with older Safari - no roundRect)
      const rx = x - width/2;
      const ry = y - height/2;
      const r = cornerR;
      ctx.beginPath();
      ctx.moveTo(rx + r, ry);
      ctx.lineTo(rx + width - r, ry);
      ctx.arcTo(rx + width, ry, rx + width, ry + r, r);
      ctx.lineTo(rx + width, ry + height - r);
      ctx.arcTo(rx + width, ry + height, rx + width - r, ry + height, r);
      ctx.lineTo(rx + r, ry + height);
      ctx.arcTo(rx, ry + height, rx, ry + height - r, r);
      ctx.lineTo(rx, ry + r);
      ctx.arcTo(rx, ry, rx + r, ry, r);
      ctx.closePath();
      ctx.fillStyle = darkMode ? 'rgba(36, 40, 59, 0.95)' : 'rgba(255, 255, 255, 0.9)';
      ctx.fill();
      ctx.strokeStyle = darkMode ? '#7d6bc2' : '#d1d5db';
      ctx.lineWidth = 1 / scale;
      ctx.stroke();

      // Text
      ctx.fillStyle = darkMode ? '#c0caf5' : '#111827';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(text, x, y);
    } finally {
      ctx.restore();
    }
  };

  // Helper: nakloeny popisek mery mezi dvema body s kolmym odsazenim (perpOffset v px obrazovky)
  const drawLineMeasurement = (ctx: CanvasRenderingContext2D, p1: {x:number,y:number}, p2: {x:number,y:number}, text: string, perpOffsetScreen = 20) => {
    const a = Math.atan2(p2.y - p1.y, p2.x - p1.x);
    const off = perpOffsetScreen / scale;
    const mx = (p1.x + p2.x) / 2 + (-Math.sin(a) * off);
    const my = (p1.y + p2.y) / 2 + (Math.cos(a) * off);
    drawMeasurement(ctx, mx, my, text, a);
  };

  // Helper: nakloeny popisek polomerove mery (perpOffset v px obrazovky)
  const drawRadiusMeasurement = (ctx: CanvasRenderingContext2D, center: {x:number,y:number}, handle: {x:number,y:number}, text: string, perpOffsetScreen = 15) => {
    const a = Math.atan2(handle.y - center.y, handle.x - center.x);
    const off = perpOffsetScreen / scale;
    const mx = center.x + (handle.x - center.x) / 2 + (-Math.sin(a) * off);
    const my = center.y + (handle.y - center.y) / 2 + (Math.cos(a) * off);
    drawMeasurement(ctx, mx, my, text, a);
  };

  const drawGrid = (ctx: CanvasRenderingContext2D, offset: {x:number, y:number}, scale: number) => {
    // 50px base grid, ensure minimum ~35px visual spacing at any zoom
    let gridSize = 50 * scale;
    while (gridSize < 35) gridSize *= 2;
    ctx.strokeStyle = darkMode ? 'rgba(125, 107, 194, 0.15)' : 'rgba(229, 231, 235, 0.8)';
    ctx.lineWidth = 1;

    const startX = offset.x % gridSize;
    const startY = offset.y % gridSize;

    for (let x = startX; x <= canvasSize.width; x += gridSize) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, canvasSize.height);
      ctx.stroke();
    }
    for (let y = startY; y <= canvasSize.height; y += gridSize) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(canvasSize.width, y);
      ctx.stroke();
    }
  };

  const drawSegment = (ctx: CanvasRenderingContext2D, p1: {x:number, y:number}, p2: {x:number, y:number}, progress: number, color: string, width = 2, dashed = false, dashDot = false) => {
    if (progress <= 0) return;
    
    // Logic from TriangleConstruction
    let drawProgress = progress;
    // Mapování progressu na animaci rýsování (když je aktivní pravítko)
    if (animState.isActive) {
       const { pIn, pDrawEnd } = animPhase;
       if (progress < pIn) drawProgress = 0;
       else if (progress > pDrawEnd) drawProgress = 1;
       else drawProgress = (progress - pIn) / (pDrawEnd - pIn);
    }

    const currentP2 = {
      x: p1.x + (p2.x - p1.x) * drawProgress,
      y: p1.y + (p2.y - p1.y) * drawProgress
    };

    if (dashed || dashDot) ctx.save();
    if (dashed) applyLineStyle(ctx, 'dashed');
    else if (dashDot) applyLineStyle(ctx, 'dashdot');
    if (!dashed && !dashDot) {
      ctx.setLineDash([]);
      ctx.lineDashOffset = 0;
    }

    ctx.beginPath();
    ctx.moveTo(p1.x, p1.y);
    ctx.lineTo(currentP2.x, currentP2.y);
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.lineCap = 'round';
    ctx.stroke();

    if (dashed || dashDot) ctx.restore();
  };

  const drawLine = (ctx: CanvasRenderingContext2D, p1: {x:number, y:number}, p2: {x:number, y:number}, progress: number, color: string, width = 2, dashed = false, dashDot = false) => {
    // Přímka přesahuje body
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const len = Math.sqrt(dx*dx + dy*dy);
    if (len === 0) return;

    const EXTEND = 100000; // Hodně daleko
    
    const start = {
      x: p1.x - dx/len * EXTEND,
      y: p1.y - dy/len * EXTEND
    };
    const end = {
      x: p1.x + dx/len * EXTEND,
      y: p1.y + dy/len * EXTEND
    };

    drawSegment(ctx, start, end, progress, color, width, dashed, dashDot);
  };

  const drawRay = (ctx: CanvasRenderingContext2D, p1: {x:number, y:number}, p2: {x:number, y:number}, progress: number, color: string, width = 2) => {
    // Polopřímka - začíná v p1, jde přes p2 do nekonečna
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const len = Math.sqrt(dx*dx + dy*dy);
    if (len === 0) return;

    const EXTEND = 100000;
    const end = {
      x: p1.x + dx/len * EXTEND,
      y: p1.y + dy/len * EXTEND
    };
    
    drawSegment(ctx, p1, end, progress, color, width);
  };

  const drawCircle = (ctx: CanvasRenderingContext2D, center: {x:number, y:number}, radius: number, progress: number, color: string, width = 2, dashed = false) => {
    if (progress <= 0) return;

    let drawProgress = progress;
    if (animState.isActive) {
        const { pIn, pDrawEnd } = animPhase;
        if (progress < pIn) drawProgress = 0;
        else if (progress > pDrawEnd) drawProgress = 1;
        else drawProgress = (progress - pIn) / (pDrawEnd - pIn);
    }

    const endAngle = Math.PI * 2 * drawProgress;

    ctx.beginPath();
    if (dashed) applyLineStyle(ctx, 'dashed', scale);
    else {
      ctx.setLineDash([]);
      ctx.lineDashOffset = 0;
    }
    ctx.arc(center.x, center.y, radius, 0, endAngle);
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.stroke();
    if (dashed) {
      ctx.setLineDash([]);
      ctx.lineDashOffset = 0;
    }
  };

  const drawLabel = (
    ctx: CanvasRenderingContext2D,
    center: { x: number; y: number },
    text: string,
    color: string,
    _oxScreen = 0,
    _oyScreen = 0
  ) => {
    ctx.save();
    ctx.font = `italic ${18 / scale}px "Times New Roman", "Computer Modern", Georgia, serif`;
    ctx.fillStyle = color;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, center.x, center.y);
    ctx.restore();
  };

  const getRulerEndpoints = (center: { x: number; y: number }, angle: number) => ({
    p1: {
      x: center.x - Math.cos(angle) * RULER_HALF_LENGTH,
      y: center.y - Math.sin(angle) * RULER_HALF_LENGTH,
    },
    p2: {
      x: center.x + Math.cos(angle) * RULER_HALF_LENGTH,
      y: center.y + Math.sin(angle) * RULER_HALF_LENGTH,
    },
  });

  const getRulerEdgeWorld = (
    edge: 'base' | 'left' | 'right',
    pivot: { x: number; y: number },
    angle: number
  ) => {
    const { a, b } = RULER_EDGES_LOCAL[edge];
    return {
      a: localToRulerWorld(a.x, a.y, pivot, angle),
      b: localToRulerWorld(b.x, b.y, pivot, angle),
    };
  };

  // Krajní body stupnice na kratší straně (bereme konce přímého úseku hrany).
  // Pozn.: SVG má zaoblené rohy; používáme stejné koncové body jako pro rýsovatelnou hranu,
  // aby snap fungoval i u „krajů stupnice“.
  const RULER_SCALE_ENDPOINTS_RAW_LOCAL = [RULER_EDGES_LOCAL.right.a, RULER_EDGES_LOCAL.right.b] as const;

  const getRulerScaleEndpointsLocal = () => {
    // Posun v souřadnicích pravítka (nezávislé na zoomu), aby body byly vůči pravítku pořád stejně.
    // Chceme posun v pixelech na obrázku pravítka (před škálováním pravítka).
    const moveLocalUpper = 10 / RULER_PLACED_SCALE;
    const moveLocalLower = 26 / RULER_PLACED_SCALE;
    const a = RULER_SCALE_ENDPOINTS_RAW_LOCAL[0];
    const b = RULER_SCALE_ENDPOINTS_RAW_LOCAL[1];
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    const adjust = (p: { x: number; y: number }, moveLocal: number) => {
      const vx = mid.x - p.x;
      const vy = mid.y - p.y;
      const len = Math.hypot(vx, vy) || 1;
      return { x: p.x + (vx / len) * moveLocal, y: p.y + (vy / len) * moveLocal };
    };
    const upperFirst = a.y < b.y;
    const upper = upperFirst ? a : b;
    const lower = upperFirst ? b : a;
    const adjUpper = adjust(upper, moveLocalUpper);
    const adjLower = adjust(lower, moveLocalLower);
    return (upperFirst ? [adjUpper, adjLower] : [adjLower, adjUpper]) as const;
  };

  const getRulerSnapEndpointsForEdgeLocal = (
    edge: 'base' | 'left' | 'right',
    screenScale: number
  ) => {
    // Pouze „pravá“ krátká strana má speciální snap body (stupnice).
    // Ostatní hrany vrací své geometrické konce.
    if (edge === 'right') return getRulerScaleEndpointsLocal();
    const { a, b } = RULER_EDGES_LOCAL[edge];
    return [a, b] as const;
  };

  const snapRulerPivotByHandles = (
    rawPivot: { x: number; y: number },
    angle: number,
    thresholdPx = 25
  ) => {
    // Stejné snapování jako pro pivot: bod → průsečík/bod → čára.
    // Jen to zkusíme pro více "handle" bodů pravítka a vybereme nejlepší.
    const handlesLocal: { x: number; y: number }[] = [
      RULER_ROTATION_PIVOT_LOCAL,
      ...getRulerScaleEndpointsLocal(),
    ];

    let bestPivot = rawPivot;
    let bestShift = 0;
    let bestAnchor: RulerRotationAnchor = null;

    for (const h of handlesLocal) {
      const hw = localToRulerWorld(h.x, h.y, rawPivot, angle);
      const snapped = snapToPointsAndShapes(hw.x, hw.y, thresholdPx);
      const dx = snapped.x - hw.x;
      const dy = snapped.y - hw.y;
      const shift = Math.hypot(dx, dy);
      if (shift < 1e-6) continue; // no snap
      if (bestShift === 0 || shift < bestShift) {
        bestShift = shift;
        bestPivot = { x: rawPivot.x + dx, y: rawPivot.y + dy };
        bestAnchor = { local: { x: h.x, y: h.y }, world: { x: snapped.x, y: snapped.y } };
      }
    }

    return { pivot: bestPivot, anchor: bestAnchor };
  };

  const snapToRulerEdge = (
    wx: number,
    wy: number,
    pivot: { x: number; y: number },
    angle: number,
    screenScale: number
  ): { edge: 'base' | 'left' | 'right'; point: { x: number; y: number } } => {
    const localMouse = worldToRulerLocal(wx, wy, pivot, angle);

    // Snap na bod ve středu nejdelší strany (pivot) — když jsme poblíž, preferuj ho.
    const pivotThresholdWorld = (RULER_EDGE_HIT_PX + 22) / screenScale;
    if (Math.hypot(wx - pivot.x, wy - pivot.y) <= pivotThresholdWorld) {
      return { edge: 'base', point: { x: pivot.x, y: pivot.y } };
    }

    // Preferuj snap na krajní body stupnice (na krátké straně), pokud jsme dost blízko.
    // Threshold držíme v px na obrazovce (robustní vůči zoomu); měříme ve world prostoru.
    const endpointThresholdWorld = (RULER_EDGE_HIT_PX + 22) / screenScale;
    let bestEndpointWorld: { point: { x: number; y: number }; distWorld: number } | null = null;
    for (const p of getRulerScaleEndpointsLocal()) {
      const pw = localToRulerWorld(p.x, p.y, pivot, angle);
      const d = Math.hypot(wx - pw.x, wy - pw.y);
      if (!bestEndpointWorld || d < bestEndpointWorld.distWorld) {
        bestEndpointWorld = { point: pw, distWorld: d };
      }
    }
    if (bestEndpointWorld && bestEndpointWorld.distWorld <= endpointThresholdWorld) {
      return { edge: 'right', point: bestEndpointWorld.point };
    }

    const edges = ['base', 'left', 'right'] as const;
    let best: { edge: (typeof edges)[number]; point: { x: number; y: number }; dist: number } | null = null;
    for (const edge of edges) {
      const { a, b } = RULER_EDGES_LOCAL[edge];
      const localPoint = projectOntoSegment(localMouse.x, localMouse.y, a.x, a.y, b.x, b.y);
      const dist = Math.hypot(localMouse.x - localPoint.x, localMouse.y - localPoint.y);
      if (!best || dist < best.dist) {
        best = {
          edge,
          point: localToRulerWorld(localPoint.x, localPoint.y, pivot, angle),
          dist,
        };
      }
    }
    return best!;
  };

  const getRulerDrawSnapInput = (
    wx: number,
    wy: number,
    pivot: { x: number; y: number },
  ) => {
    // Pivot je "snap bod" pravítka samotného, ne geometrie na plátně.
    // Proto ho kontrolujeme proti syrové pozici myši (ne proti snapToPointsAndShapes),
    // aby nás snap na geometrii "neodtlačil" pryč.
    const pivotThresholdWorld = (RULER_EDGE_HIT_PX + 22) / scale;
    if (Math.hypot(wx - pivot.x, wy - pivot.y) <= pivotThresholdWorld) {
      return { x: pivot.x, y: pivot.y };
    }
    return snapToPointsAndShapes(wx, wy, 25);
  };

  const getRulerDrawCrosshairPos = (
    pivot: { x: number; y: number },
    angle: number
  ): { x: number; y: number } | null => {
    const raw = rulerToolState.lineDraw?.end ?? mousePosRef.current ?? rulerToolState.crosshair;
    if (!raw) return null;
    return snapToRulerEdge(raw.x, raw.y, pivot, angle, scale).point;
  };

  const finishFreeCircleArcDraw = (
    startAngle: number,
    endAngle: number,
    center: { x: number; y: number },
    radiusCm: number
  ) => {
    const r = radiusCm * PIXELS_PER_CM;
    if (r < 5) return;
    const sweep = endAngle - startAngle;
    const minSweep = Math.max(0.08, 8 / r);
    if (Math.abs(sweep) < minSweep) return;

    const midAngle = startAngle + sweep / 2;
    const targetX = center.x + Math.cos(midAngle) * r;
    const targetY = center.y + Math.sin(midAngle) * r;

    const snappedCenter = points.find(
      p => p.label && Math.hypot(p.x - center.x, p.y - center.y) * scale < 10
    );

    const centerId = snappedCenter ? snappedCenter.id : crypto.randomUUID();
    const centerLabel = snappedCenter ? snappedCenter.label : getNextPointLabel();
    const centerPoint: GeoPoint =
      snappedCenter ?? { id: centerId, x: center.x, y: center.y, label: centerLabel, hidden: false };
    const radiusId = crypto.randomUUID();
    const radiusPoint: GeoPoint = { id: radiusId, x: targetX, y: targetY, label: '', hidden: false };
    setPoints(prev => (snappedCenter ? [...prev, radiusPoint] : [...prev, centerPoint, radiusPoint]));
    pendingCircleCenterRef.current = null;
    keepCompassToolAfterAnimRef.current = true;
    startConstructionAnimation('circleArc', centerPoint, radiusPoint, Math.abs(sweep));
  };

  const finishRulerLineDraw = (
    start: { x: number; y: number },
    end: { x: number; y: number },
    edge: 'base' | 'left' | 'right',
    pivot: { x: number; y: number },
    angle: number,
    kind: 'line' | 'segment' | 'stroke'
  ) => {
    const { a, b } = getRulerEdgeWorld(edge, pivot, angle);
    const edx = b.x - a.x;
    const edy = b.y - a.y;
    const edgeLen = Math.hypot(edx, edy);
    if (edgeLen < 1e-6) return;
    const ux = edx / edgeLen;
    const uy = edy / edgeLen;
    const dragLen = Math.hypot(end.x - start.x, end.y - start.y);
    const minLen = 8 / scale;
    let p1x: number;
    let p1y: number;
    let p2x: number;
    let p2y: number;
    if (dragLen < minLen) {
      const half = 100;
      p1x = start.x - ux * half;
      p1y = start.y - uy * half;
      p2x = start.x + ux * half;
      p2y = start.y + uy * half;
    } else {
      p1x = start.x;
      p1y = start.y;
      p2x = end.x;
      p2y = end.y;
    }

    rulerPendingDrawKindRef.current = kind;
    keepRulerToolAfterAnimRef.current = true;

    if (kind === 'stroke') {
      const p1: GeoPoint = { id: crypto.randomUUID(), x: p1x, y: p1y, label: '', hidden: true };
      const p2: GeoPoint = { id: crypto.randomUUID(), x: p2x, y: p2y, label: '', hidden: true };
      setPoints(prev => [...prev, p1, p2]);
      startConstructionAnimation('segment', p1, p2);
      triggerEffect((p1x + p2x) / 2, (p1y + p2y) / 2, '#3b82f6');
      return;
    }

    if (kind === 'segment') {
      const reservedLabels = new Set<string>();
      const r1 = resolveSegmentEndpointAt(p1x, p1y, reservedLabels, undefined, false);
      const r2 = resolveSegmentEndpointAt(p2x, p2y, reservedLabels, r1.point.id, true);
      if (r1.point.id === r2.point.id) return;

      const newPoints: GeoPoint[] = [];
      if (r1.isNew) newPoints.push(r1.point);
      if (r2.isNew) newPoints.push(r2.point);
      if (newPoints.length > 0) {
        setPoints(prev => [...prev, ...newPoints]);
      }
      startConstructionAnimation('segment', r1.point, r2.point);
      triggerEffect((r1.point.x + r2.point.x) / 2, (r1.point.y + r2.point.y) / 2, '#3b82f6');
      return;
    }

    const p1: GeoPoint = { id: crypto.randomUUID(), x: p1x, y: p1y, label: '', hidden: true };
    const p2: GeoPoint = { id: crypto.randomUUID(), x: p2x, y: p2y, label: '', hidden: true };
    setPoints(prev => [...prev, p1, p2]);
    startConstructionAnimation('line', p1, p2);
    triggerEffect((p1x + p2x) / 2, (p1y + p2y) / 2, '#3b82f6');
  };

  const drawRulerCrosshair = (ctx: CanvasRenderingContext2D, x: number, y: number) => {
    const arm = 14 / scale;
    const gap = 2 / scale;
    ctx.save();
    ctx.strokeStyle = '#111827';
    ctx.lineWidth = 1.25 / scale;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x - arm, y);
    ctx.lineTo(x - gap, y);
    ctx.moveTo(x + gap, y);
    ctx.lineTo(x + arm, y);
    ctx.moveTo(x, y - arm);
    ctx.lineTo(x, y - gap);
    ctx.moveTo(x, y + gap);
    ctx.lineTo(x, y + arm);
    ctx.stroke();
    ctx.restore();
  };

  /** Otočení uprostřed pravítka — klasická reload ikona (Lucide RotateCw, jako redo v toolbaru). */
  const drawRulerRotateWheel = (
    ctx: CanvasRenderingContext2D,
    pivot: { x: number; y: number },
    angle: number,
    opacity: number = 1
  ) => {
    const world = localToRulerWorld(
      RULER_ROTATE_WHEEL_LOCAL.x,
      RULER_ROTATE_WHEEL_LOCAL.y,
      pivot,
      angle
    );
    const s = Math.max(scale, 0.25);
    const r = RULER_ROTATE_WHEEL_VISUAL_PX / s;
    const active =
      rulerDragModeRef.current === 'rotate' || rulerRotateHoverRef.current;
    const accent = active ? '#2563eb' : '#4b5563';

    ctx.save();
    ctx.globalAlpha = opacity;
    ctx.translate(world.x, world.y);
    // Ikona zůstává vzpřímená na obrazovce — neotáčí se s pravítkem
    ctx.rotate(-angle);

    // Světlý podklad
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.98, 0, Math.PI * 2);
    ctx.fillStyle = active ? 'rgba(239,246,255,0.96)' : 'rgba(255,255,255,0.94)';
    ctx.fill();
    ctx.strokeStyle = active ? 'rgba(37,99,235,0.4)' : 'rgba(75,85,99,0.2)';
    ctx.lineWidth = 1.2 / s;
    ctx.stroke();

    strokeLucideRotateCw(ctx, (RULER_ROTATE_WHEEL_VISUAL_PX * 1.15) / s, accent, 2);

    ctx.restore();
  };

  /** Volně umístěné pravítko — bez překlápění; pivot = průsečík nejdelší strany a středové rysky. */
  const drawPlacedRuler = (
    ctx: CanvasRenderingContext2D,
    pivot: { x: number; y: number },
    angle: number,
    opacity: number
  ) => {
    if (!rulerImageRef.current) return;
    ctx.save();
    const s = RULER_PLACED_SCALE;
    ctx.translate(pivot.x, pivot.y);
    ctx.rotate(angle);
    ctx.translate(-RULER_ROTATION_PIVOT_LOCAL.x * s, -RULER_ROTATION_PIVOT_LOCAL.y * s);
    ctx.globalAlpha = opacity;
    ctx.drawImage(
      rulerImageRef.current,
      RULER_IMG_OFFSET_X * s,
      RULER_IMG_OFFSET_Y * s,
      RULER_IMG_WIDTH * s,
      RULER_IMG_HEIGHT * s
    );
    ctx.restore();
  };

  /** macOS open-hand kurzor pro intro animaci pravítka — screen-space velikost. */
  const drawHandCursor = (
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number
  ) => {
    const img = rulerHandCursorImageRef.current;
    if (!img) return;
    const size = RULER_HAND_CURSOR_PX / Math.max(scale, 0.25);
    // Hotspot systémového open-hand je u středu dlaně / kořene prstů
    ctx.drawImage(img, x - size * 0.42, y - size * 0.28, size, size);
  };

  const drawRuler = (ctx: CanvasRenderingContext2D, p1: {x:number, y:number}, p2: {x:number, y:number}, progress: number) => {
    if (!rulerImageRef.current) return;
    
    const { pIn, pDrawEnd } = animPhase;
    let opacity = 1;
    if (progress < pIn) opacity = progress / pIn;
    else if (progress > pDrawEnd) opacity = (1 - progress) / (1 - pDrawEnd);
    
    const angle = Math.atan2(p2.y - p1.y, p2.x - p1.x);

    // --- Jednoduchá Flip logika ---
    // Zjistíme, jestli "horní" okraj pravítka nevyjíždí z obrazovky.
    // Pravítko je vysoké 400px a kreslí se "nad" čarou (y: -400..0).
    // Testujeme bod uprostřed délky pravítka (x=400) na jeho horním okraji (y=-400).
    
    const testX = 400; // Střed délky pravítka
    const testY = -380; // Horní okraj (s malou rezervou)

    // Transformace do Screen Space
    // WorldX = p1.x + (testX * cos - testY * sin)
    // WorldY = p1.y + (testX * sin + testY * cos)
    const wx = p1.x + testX * Math.cos(angle) - testY * Math.sin(angle);
    const wy = p1.y + testX * Math.sin(angle) + testY * Math.cos(angle);
    
    const screenY = offset.y + wy * scale;

    // Pokud je horní okraj mimo obrazovku (nebo příliš blízko horní liště), flipneme dolů
    const flip = screenY < 80; 

    ctx.save();
    ctx.translate(p1.x, p1.y);
    ctx.rotate(angle);
    ctx.globalAlpha = opacity;
    
    // Vykreslení: Kotva je v p1 (0,0).
    // Obrázek posouváme o -40 v X (aby stupnice začínala v p1) 
    // a o -400 v Y (aby hrana pravítka seděla na čáře).
    if (flip) {
        ctx.scale(1, -1);
        ctx.drawImage(rulerImageRef.current, -40, -400 + 2, 800, 400);
    } else {
        ctx.drawImage(rulerImageRef.current, -40, -400 + 2, 800, 400); 
    }
    
    ctx.restore();
  };

  const drawCompass = (ctx: CanvasRenderingContext2D, center: {x:number, y:number}, radius: number, progress: number, p2?: {x:number, y:number}) => {
    if (!compassImageRef.current) return;

    const { pIn, pDrawEnd } = animPhase;
    let opacity = 0;
    if (progress < pIn) opacity = progress / pIn;
    else if (progress > pDrawEnd) opacity = (1 - progress) / (1 - pDrawEnd);
    else opacity = 1;

    if (opacity <= 0) return;

    // Kružítko se točí buď s kreslením, nebo směrem k p2 (pokud je zadán)
    let rotation = 0;
    if (p2) {
        // Pokud máme p2, natočíme kružítko směrem k němu
        rotation = Math.atan2(p2.y - center.y, p2.x - center.x);
    } else if (progress >= pIn && progress <= pDrawEnd) {
        // Jinak se točí s animací kreslení
        rotation = (progress - pIn) / (pDrawEnd - pIn) * Math.PI * 2;
    }

    ctx.save();
    ctx.translate(center.x, center.y);
    ctx.rotate(rotation);
    ctx.globalAlpha = opacity;
    // Vykreslit kružítko tak, aby hrot byl v [0,0] a tužka v [radius, 0]
    // Toto SVG kružítka je asi statické, musíme ho naškálovat? 
    // V jiných komponentách se kreslí: ctx.drawImage(compass, 0, -compassHeight, compassWidth, compassHeight);
    // Kde compassWidth odpovídá rádiusu.
    ctx.drawImage(compassImageRef.current, 0, -radius, radius, radius); 
    ctx.restore();
  };

  const drawProtractor = (
    ctx: CanvasRenderingContext2D,
    center: {x:number, y:number},
    baseAngle: number,
    radius: number = 200,
    color: string = '#FF4500',
    highlightAngle?: number,
    rotationOffset: number = 0,
    isMirrored: boolean = false
  ) => {
    // Udrž velikosti čar/textu čitelné při zoomu (konstantní px na obrazovce).
    const lwMain = 3 / scale;
    const lwMinor = 1 / scale;
    const tickBaseW = 1 / scale;
    const tickTenW = 2 / scale;
    const tickMajorW = 3 / scale;
    const fontMajor = 18 / scale;
    const fontTen = 12 / scale;

    ctx.save();
    ctx.translate(center.x, center.y);
    // Aplikace základního úhlu a offsetu (flip)
    // rotationOffset je ve stupních (0 nebo 180)
    ctx.rotate(baseAngle + (rotationOffset * Math.PI / 180));

    // Zrcadlení
    if (isMirrored) {
      ctx.scale(1, -1);
    }

    // 1. Hlavní obrys - půlkruh (horní polovina)
    ctx.strokeStyle = color;
    ctx.lineWidth = lwMain;
    ctx.beginPath();
    // Kreslíme oblouk od 0 do PI proti směru hodinových ručiček (horní polovina)
    ctx.arc(0, 0, radius, 0, Math.PI, true);
    ctx.closePath(); // Spojí konce, vytvoří rovnou základnu
    ctx.stroke();
    
    // 2. Vnitřní oblouk pro stupnici
    ctx.strokeStyle = color;
    ctx.lineWidth = lwMinor;
    ctx.beginPath();
    ctx.arc(0, 0, radius - 35, 0, Math.PI, true);
    ctx.stroke();

    // 3. Značky a čísla
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    for (let deg = 0; deg <= 180; deg++) {
       // Hlavní úhly: násobky 45 (0, 45, 90, 135, 180)
       const isMajor = deg % 45 === 0;
       // Vedlejší úhly: násobky 10
       const isTen = deg % 10 === 0;
       // Jemné dělení: násobky 5
       const isFive = deg % 5 === 0;

       if (!isFive && !isMajor) continue; 

       // Převod stupňů na radiány (negativní pro horní polovinu canvasu)
       const rad = -(deg * Math.PI) / 180;
       const cos = Math.cos(rad);
       const sin = Math.sin(rad);

       // Nastavení stylu rysky
       let len = 6;
       let width = tickBaseW;

       if (isMajor) {
           len = 35; 
           width = tickMajorW;
       } else if (isTen) {
           len = 15;
           width = tickTenW;
       } else {
           // isFive
           len = 8;
           width = tickBaseW;
       }
       
       // Vykreslení rysky
       const innerR = radius - len;
       ctx.beginPath();
       ctx.moveTo(cos * radius, sin * radius);
       ctx.lineTo(cos * innerR, sin * innerR);
       ctx.strokeStyle = color; 
       ctx.lineWidth = width;
       ctx.stroke();

       // Vykreslení čísla
       if (isMajor || isTen) {
           const fontSize = isMajor ? fontMajor : fontTen;
           ctx.font = `bold ${fontSize}px sans-serif`;
           ctx.fillStyle = color; 

           const textOffset = isMajor ? 55 : 26; 
           const textRadius = radius - textOffset; 
           const tx = cos * textRadius;
           const ty = sin * textRadius;
           
           ctx.save();
           ctx.translate(tx, ty);
           
           if (isMirrored) {
              // Kompenzace pro mirrored text
              ctx.rotate(rad - Math.PI / 2);
              ctx.scale(1, -1);
           } else {
              ctx.rotate(rad + Math.PI / 2);
           }

           ctx.fillText(deg.toString(), 0, 0);
           ctx.restore();
       }
    }

    // 4. Highlight Angle (Indikátor)
    if (highlightAngle !== undefined) {
         // Ošetření rozsahu 0-180
         const clampedAngle = Math.max(0, Math.min(180, highlightAngle));
         const hRad = -(clampedAngle * Math.PI) / 180;
         
         // Čára od středu
         ctx.beginPath();
         ctx.moveTo(0, 0);
         ctx.lineTo(Math.cos(hRad) * radius, Math.sin(hRad) * radius);
         ctx.strokeStyle = color; 
         ctx.lineWidth = 4; 
         ctx.stroke();

         // Kolečko na průsečíku s úhloměrem
         ctx.beginPath();
         ctx.arc(Math.cos(hRad) * radius, Math.sin(hRad) * radius, 6, 0, Math.PI*2);
         ctx.fillStyle = color; // Plná výplň
         ctx.fill();
         ctx.lineWidth = 2;
         ctx.strokeStyle = '#fff'; // Bílý obrys pro kontrast
         ctx.stroke();

         // Text hodnoty u středu?
         // Volitelně můžeme vykreslit i text u bodu A (střed), jak je na obrázku "A"
         // Ale to už tam asi je z popisků bodů.
    }
    
    ctx.restore();
  };


  // --- UI ---
  // tools definition removed (replaced by toolGroups)

  // Reset stavů při změně nástroje
  useEffect(() => {
    setPerpBaseId(null);
    setSelectedPointId(null);
    setAngleInput(prev => ({ ...prev, visible: false }));
    // Pokud uživatel přepne nástroj během animace úhlu, okamžitě zruš „tool viz“ úhloměru,
    // aby na plátně nezůstal „duch“ půlkruhu.
    if (activeTool !== 'angle' && animState.isActive && animState.type === 'angle') {
      setAnimState({
        isActive: false,
        type: null,
        startTime: 0,
        p1: null,
        p2: null,
        progress: 0,
        arcSpan: undefined,
      });
      pendingToolVisualizationRef.current = undefined;
      suppressAngleHoverPreviewRef.current = false;
    }
    // Straight highlighter should always start with an explicit click (never inherit the last point
    // from a previous free highlight stroke).
    if (activeTool === 'highlighterStraight' && prevActiveToolRef.current !== 'highlighterStraight') {
      lastHighlightPointRef.current = null;
    }
    if (activeTool !== 'highlighter' && activeTool !== 'highlighterStraight') {
      lastHighlightPointRef.current = null;
    }
    // Angle tablet mode: inicializace při přepnutí na úhloměr v tablet módu
    if (activeTool === 'angle' && isTabletMode) {
      setAngleTabletState({ step: 'selectLine', selectedLineId: null, currentPos: null, baseAngle: 0 });
    } else {
      setAngleTabletState({ step: 'idle', selectedLineId: null, currentPos: null, baseAngle: 0 });
    }
    // Kolmice (tablet): stejný vzor jako úhloměr — při přepnutí nástroje vždy čistý stav (ne positioning z minula)
    if (activeTool === 'perpendicular' && isTabletMode) {
      setPerpTabletState({ step: 'selectLine', selectedLineId: null, currentPos: null });
    } else {
      setPerpTabletState({ step: 'idle', selectedLineId: null, currentPos: null });
    }
    anglePerpLineHoverFromMoveRef.current = false;
    setHoveredShape(null);
    prevActiveToolRef.current = activeTool;
  }, [activeTool]);

  const getContainerCursor = (): string => {
    if (readOnlyCanvas) return 'grab';
    if (activeTool === 'pan') return 'grab';
    if (activeTool === 'move') {
      if (hoveredShapeForMove) return selectedShapeIds.includes(hoveredShapeForMove) ? 'move' : 'pointer';
      return hoveredPointId ? 'move' : 'default';
    }
    if (activeTool === 'eraser') return hoveredShapeForMove ? 'cell' : 'default';
    if (activeTool === 'circle' && circleInput.visible && circleInput.freeDrawMode === 'pickArc') return 'none';
    if (circleInput.visible && circleInput.center && circleInput.freeDrawMode !== 'pickArc') {
      if (circleInput.isDraggingHandle || circleHandleHoverRef.current) return 'grabbing';
      if (circleInput.isDraggingCenter) return 'grabbing';
      if (circleCenterHover) return 'grab';
    }
    if (activeTool === 'triangleRuler' && rulerToolState.active) {
      if (rulerToolState.drawMode === 'pickEdge') return 'none';
      if (rulerDragModeRef.current === 'rotate' || rulerRotateHover) {
        return rulerDragModeRef.current === 'rotate' ? 'grabbing' : 'grab';
      }
      if (rulerMoveHover || rulerDraggingRef.current) {
        return rulerDraggingRef.current ? 'grabbing' : 'grab';
      }
      return 'default';
    }
    if (activeTool === 'angle' && protractorCenterRef.current) {
      if (protractorDragModeRef.current === 'rotate') return 'default';
      if (
        protractorArmHover ||
        protractorDragModeRef.current === 'arm'
      ) {
        return protractorDraggingRef.current ? 'grabbing' : 'pointer';
      }
      if (
        protractorMoveHover ||
        (protractorDraggingRef.current && protractorDragModeRef.current === 'move')
      ) {
        return protractorDraggingRef.current ? 'grabbing' : 'grab';
      }
      return 'crosshair';
    }
    return 'crosshair';
  };

  const clearAll = () => {
    if (embedInAssignment && initialCanvasSnapshot) {
      if (
        confirm(
          'Smazat všechny tvoje úpravy? Výchozí obsah ze zadání (sdílené plátno) zůstane.',
        )
      ) {
        const snap = JSON.parse(JSON.stringify(initialCanvasSnapshot)) as GeometrySubmissionSnapshot;
        setPoints(snap.points);
        setShapes(snap.shapes);
        setFreehandPaths(snap.freehandPaths ?? []);
        setSelectedPointId(null);
        setSelection(null);
        setSelectedShapeIds([]);
        setSelectedFreehandIds([]);
        clearConstructionSteps();
      }
      return;
    }
    if (confirm('Opravdu chceš smazat celé plátno?')) {
      setPoints([]);
      setShapes([]);
      setFreehandPaths([]);
      setSelectedPointId(null);
      setSelection(null);
      setSelectedShapeIds([]);
      setSelectedFreehandIds([]);
      clearConstructionSteps();
    }
  };

  const handleBackClick = () => {
    // Zkontroluj, zda je něco nakreslené
    const hasContent = points.length > 0 || shapes.length > 0 || freehandPaths.length > 0;
    
    if (hasContent) {
      // Zobrazit potvrzovací dialog
      if (confirm('Opravdu chceš odejít? Přijdeš o vše nakreslené.')) {
        onBack();
      }
    } else {
      // Nic nakreslené není, můžeme odejít bez potvrzení
      onBack();
    }
  };

  const drawPenTip = (ctx: CanvasRenderingContext2D, x: number, y: number, color: string) => {
    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, 5, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = 15;
    ctx.fill();
    ctx.restore();
  };
  
  const getDrawProgress = (progress: number) => {
     const { pIn, pDrawEnd } = animPhase;
     if (progress < pIn) return 0;
     if (progress > pDrawEnd) return 1;
     return (progress - pIn) / (pDrawEnd - pIn);
  };

  const topZoomCluster = (
    <>
      <button
        type="button"
        onClick={() => zoomToCenter(scale - 0.1)}
        className="flex h-10 w-10 items-center justify-center rounded-xl text-black transition-all duration-300 hover:bg-gray-200"
      >
        <ZoomOut className="h-5 w-5" />
      </button>

      <div className="w-24 px-2">
        <Slider
          value={[scale * 100]}
          onValueChange={(vals) => zoomToCenter(vals[0] / 100)}
          min={10}
          max={300}
          step={5}
        />
      </div>

      <button
        type="button"
        onClick={() => zoomToCenter(scale + 0.1)}
        className="flex h-10 w-10 items-center justify-center rounded-xl text-black transition-all duration-300 hover:bg-gray-200"
      >
        <ZoomIn className="h-5 w-5" />
      </button>

      <div className="h-6 w-px bg-gray-300" />
      <button
        type="button"
        onClick={() => onDarkModeChange(!darkMode)}
        className="flex h-10 w-10 items-center justify-center rounded-xl text-black transition-all duration-300 hover:bg-gray-200"
        title={darkMode ? 'Světlý režim' : 'Tmavý režim'}
      >
        {darkMode ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
      </button>

      <div className="h-6 w-px bg-gray-300" />
      <button
        type="button"
        onClick={() => setShowMeasurements(!showMeasurements)}
        onTouchEnd={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setShowMeasurements(!showMeasurements);
        }}
        className={`flex h-10 w-10 items-center justify-center rounded-xl transition-all duration-300 ${
          showMeasurements ? 'bg-[#1e1b4b] text-white' : 'text-black hover:bg-gray-200'
        }`}
        title={showMeasurements ? 'Skrýt míry' : 'Zobrazit míry'}
      >
        <span className="text-[10px] font-bold">cm</span>
      </button>

      <div className="h-6 w-px bg-gray-300" />
      <button
        type="button"
        onClick={() => setShowGrid(!showGrid)}
        onTouchEnd={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setShowGrid(!showGrid);
        }}
        className={`flex h-10 w-10 items-center justify-center rounded-xl transition-all duration-300 ${
          showGrid ? 'bg-[#1e1b4b] text-white' : 'text-black hover:bg-gray-200'
        }`}
        title={showGrid ? 'Skrýt mřížku' : 'Zobrazit mřížku'}
      >
        <Grid2X2 className="h-5 w-5" />
      </button>

      <div className="h-6 w-px bg-gray-300" />
      <button
        type="button"
        onClick={() => {
          console.log('🔄 Přepínám režim:', !isTabletMode ? 'TABULE' : 'PC');
          setIsTabletMode(!isTabletMode);
        }}
        className={`rounded-xl px-3 py-1.5 text-xs font-medium transition-all duration-300 ${
          isTabletMode ? 'bg-[#1e1b4b] text-white' : 'text-black hover:bg-gray-200'
        }`}
        title={isTabletMode ? 'Klasický režim' : 'Režim pro tabule a tablety'}
      >
        {isTabletMode ? '📱 Tablet' : '🖥️ PC'}
      </button>
    </>
  );

  return (
    <>
    <div
      className={`relative overflow-hidden select-none ${darkMode ? 'bg-[#1a1b26]' : 'bg-white'}`}
      style={{ position: 'relative', width: '100%', height: '100%', minHeight: 0 }}
    >
      
              
              {/* Computer mode */}
      {/* CANVAS */}
      <div 
        ref={containerRef} 
        className="touch-none z-0"
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          cursor: getContainerCursor(),
        }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMoveWrapper}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onWheel={handleWheel}
      >
        <canvas
          ref={bgCanvasRef}
          className="absolute inset-0 z-0 block pointer-events-none"
          style={{ width: '100%', height: '100%' }}
          aria-hidden
        />
        <canvas 
          ref={canvasRef} 
          className="relative z-10 block" 
          style={{ width: '100%', height: '100%' }}
        />
      </div>

      {/* TOP RIGHT: Undo/Redo (+ vedle „Zadání“ v úkolu), jinak + Record / protokol */}
      {!recordingState.showPlayer && !readOnlyCanvas && (
      embedInAssignment ? (
        <div
          className="absolute top-4 z-30"
          style={{ right: `${assignmentToolbarRightOffsetPx ?? 16}px` }}
        >
          <div
            style={{
              transform: `scale(${topAssignmentToolbarScale})`,
              transformOrigin: 'top right',
            }}
          >
            <div
              ref={topAssignmentToolbarRef}
              className="flex items-center gap-2"
              onTouchStart={(e) => e.stopPropagation()}
            >
          <div className="flex items-center gap-0 rounded-full border border-gray-200/90 bg-[#F2F2F2] p-1.5 shadow-sm">
            <button
              type="button"
              onClick={handleUndo}
              disabled={historyIndex < 0}
              className={`flex size-11 items-center justify-center rounded-full transition-all duration-300 ${
                historyIndex < 0
                  ? 'cursor-not-allowed text-gray-400'
                  : 'text-violet-900/70 hover:bg-white/90'
              }`}
              title="Zpět (Ctrl+Z)"
            >
              <Undo className="size-[22px]" strokeWidth={2} />
            </button>
            <div className="mx-0.5 h-8 w-px shrink-0 bg-gray-300" aria-hidden />
            <button
              type="button"
              onClick={handleRedo}
              disabled={historyIndex >= history.length - 1}
              className={`flex size-11 items-center justify-center rounded-full transition-all duration-300 ${
                historyIndex >= history.length - 1
                  ? 'cursor-not-allowed text-gray-400'
                  : 'text-violet-900/70 hover:bg-white/90'
              }`}
              title="Vpřed (Ctrl+Y)"
            >
              <RotateCw className="size-[22px]" strokeWidth={2} />
            </button>
          </div>
          {assignmentToolbarSlot}
            </div>
          </div>
        </div>
      ) : (
      <div
        className="absolute top-4 left-3 right-3 z-30 pointer-events-none"
        style={{ paddingLeft: 'max(12px, env(safe-area-inset-left))', paddingRight: 'max(12px, env(safe-area-inset-right))' }}
      >
        <div
          className="w-full"
          style={{
            transform: `scale(${topStandaloneToolbarScale})`,
            transformOrigin: 'top center',
          }}
        >
        <div
          ref={topStandaloneToolbarRef}
          className="flex min-h-0 w-full items-center gap-2 sm:gap-3"
        >
        {/* Zoom + režim: vycentrované v levé části řádku, pravý cluster má fixní šířku — bez překryvu na tabletu */}
        <div className="pointer-events-none min-w-0 flex-1 flex justify-center">
          <div
            className="pointer-events-auto flex max-w-full items-center gap-1 overflow-x-auto rounded-full bg-[#F2F2F2] p-2 shadow-sm [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
            onTouchStart={(e) => e.stopPropagation()}
          >
            {topZoomCluster}
          </div>
        </div>
      <div className="pointer-events-auto shrink-0 bg-[#F2F2F2] rounded-full p-2 flex items-center gap-1 shadow-sm" onTouchStart={(e) => e.stopPropagation()}>
        {/* Undo */}
        <button
          onClick={handleUndo}
          disabled={historyIndex < 0}
          className={`w-12 h-12 flex items-center justify-center rounded-xl transition-all duration-300 ${
            historyIndex < 0 
              ? 'text-gray-400 cursor-not-allowed'
              : 'text-black hover:bg-gray-200'
          }`}
          title="Zpět (Ctrl+Z)"
        >
          <Undo className="w-6 h-6" />
        </button>
        {/* Redo */}
        <button
          onClick={handleRedo}
          disabled={historyIndex >= history.length - 1}
          className={`w-12 h-12 flex items-center justify-center rounded-xl transition-all duration-300 ${
            historyIndex >= history.length - 1
              ? 'text-gray-400 cursor-not-allowed'
              : 'text-black hover:bg-gray-200'
          }`}
          title="Vpřed (Ctrl+Y)"
        >
          <RotateCw className="w-6 h-6" />
        </button>
        {!embedInAssignment && !canvasExportRef ? (
          <>
            {/* Sdílet plátno */}
            <button
              onClick={shareCanvasSnapshot}
              className="w-12 h-12 flex items-center justify-center rounded-xl transition-all duration-300 text-black hover:bg-gray-200"
              title="Sdílet plátno"
            >
              <Share2 className="w-6 h-6" />
            </button>
            {/* Obrázek na pozadí (stejná předloha jako v úkolu) */}
            <button
              type="button"
              onClick={openBackgroundImageDialog}
              className={`w-12 h-12 flex items-center justify-center rounded-xl transition-all duration-300 relative group/bgimg ${
                !embedInAssignment && effectiveProjectionEnabled && effectiveProjectionSrc
                  ? 'bg-[#1e1b4b] text-white hover:bg-[#2d2a5e]'
                  : 'text-black hover:bg-gray-200'
              }`}
              title="Obrázek na pozadí plátna"
            >
              <ImagePlus className="w-6 h-6" />
              {!embedInAssignment && effectiveProjectionSrc && !effectiveProjectionEnabled ? (
                <span className="absolute -top-0.5 -right-0.5 size-2 rounded-full bg-amber-400 ring-2 ring-[#F2F2F2]" aria-hidden />
              ) : null}
            </button>
            {/* Record */}
            <button
              onClick={toggleRecording}
              className={`w-12 h-12 flex items-center justify-center rounded-xl transition-all duration-300 relative group/record ${
                recordingState.isRecording 
                  ? 'bg-red-500 hover:bg-red-600 text-white animate-pulse' 
                  : 'text-black hover:bg-gray-200'
              }`}
              title={recordingState.isRecording ? 'Zastavit nahrávání' : 'Začít nahrávání'}
            >
              {recordingState.isRecording ? (
                <>
                  <div className="w-6 h-6 bg-white rounded-sm" />
                  <span className="absolute -top-1 -right-1 flex h-3 w-3">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500"></span>
                  </span>
                </>
              ) : (
                <>
                  <div className="w-6 h-6 rounded-full border-2 border-current flex items-center justify-center">
                    <div className="w-3 h-3 rounded-full bg-current" />
                  </div>
                  {/* Tooltip */}
                  <div className="absolute right-0 top-full mt-2 px-3 py-1.5 bg-black/80 text-white text-xs rounded-lg whitespace-nowrap opacity-0 group-hover/record:opacity-100 transition-opacity pointer-events-none">
                    Nahrávat postup
                  </div>
                </>
              )}
            </button>
            {/* Zápis konstrukce */}
            <button
              onClick={() => setShowConstructionPanel(!showConstructionPanel)}
              className={`w-12 h-12 flex items-center justify-center rounded-xl transition-all duration-300 relative group/protocol ${
                showConstructionPanel
                  ? 'bg-[#1e1b4b] text-white'
                  : 'text-black hover:bg-gray-200'
              }`}
              title="Zápis konstrukce"
            >
              <FileText className="w-6 h-6" />
              {constructionSteps.length > 0 && !showConstructionPanel && (
                <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] flex items-center justify-center rounded-full text-[10px] font-bold px-1 bg-[#1e1b4b] text-white">
                  {constructionSteps.length}
                </span>
              )}
              {/* Tooltip */}
              {!showConstructionPanel && (
                <div className="absolute right-0 top-full mt-2 px-3 py-1.5 bg-black/80 text-white text-xs rounded-lg whitespace-nowrap opacity-0 group-hover/protocol:opacity-100 transition-opacity pointer-events-none">
                  Zápis konstrukce
                </div>
              )}
            </button>
          </>
        ) : null}
      </div>
        </div>
        </div>
      </div>
      )
      )}

      {/* TOOLBAR - LEFT SIDE (NEW DESIGN) */}
      {!recordingState.showPlayer && !readOnlyCanvas && !(circleInput.visible && circleInput.fixedRadius) && !angleInput.visible && !segmentInput.visible && (
      <div
        className="absolute left-4 top-0 bottom-0 z-30 flex flex-col justify-center pointer-events-none py-2"
        style={{ touchAction: 'auto' }}
      >
        <div
          className="pointer-events-auto"
          style={{
            touchAction: 'auto',
            transform: `scale(${toolbarPanelScale})`,
            transformOrigin: 'center center',
          }}
          onTouchStart={(e) => e.stopPropagation()}
        >
         <div ref={toolbarPanelRef} className="bg-[#F2F2F2] rounded-full p-2 flex flex-col items-center shadow-sm w-[72px] py-8">
            {!embedInAssignment ? (
              <>
                {/* Tlačítko Zpět */}
                <button
                  onClick={handleBackClick}
                  className="w-12 h-12 flex items-center justify-center rounded-xl text-black hover:bg-gray-200 transition-all duration-300 mb-2 group/back relative"
                  title="Zpět do menu"
                >
                  <ArrowLeft className="w-6 h-6" />
                  {/* Tooltip */}
                  <div className="absolute left-full ml-3 px-3 py-1.5 bg-black/80 text-white text-xs rounded-lg whitespace-nowrap opacity-0 group-hover/back:opacity-100 transition-opacity pointer-events-none">
                    Zpět
                  </div>
                </button>

                {/* Separator */}
                <div className="w-8 h-px bg-gray-300 mb-2"></div>
              </>
            ) : null}

            {/* Top: Move & Pan (Standard Icons) */}
            <div className="flex flex-col gap-2">
            {toolGroups.slice(0, 2).map(group => {
                const isActive = group.tools.some(t => t.id === activeTool);
                // Zobrazit ikonu aktuálně aktivního nástroje ve skupině
                const activeToolInGroup = group.tools.find(t => t.id === activeTool);
                const DisplayIcon = activeToolInGroup ? activeToolInGroup.icon : group.icon;
                
                return (
                    <div key={group.id} className="relative group/tool">
                        <button
                            onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
                            onClick={(e) => {
                                e.stopPropagation();
                                if (group.tools.length === 1) {
                                    const nextTool = group.tools[0].id;
                                    if (nextTool !== 'move') clearSelectionAfterPlacement();
                                    selectSidebarTool(nextTool);
                                } else {
                                    openToolSubmenu(group.id, activeGroup === group.id);
                                }
                            }}
                            onTouchEnd={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                if (group.tools.length === 1) {
                                    const nextTool = group.tools[0].id;
                                    if (nextTool !== 'move') clearSelectionAfterPlacement();
                                    selectSidebarTool(nextTool);
                                } else {
                                    openToolSubmenu(group.id, activeGroup === group.id);
                                }
                            }}
                            className={`w-12 h-12 flex items-center justify-center rounded-xl transition-all duration-300 relative ${
                                isActive ? 'bg-[#1e1b4b] text-white' : 'text-black hover:bg-gray-200'
                            }`}
                            title={group.label}
                        >
                            <DisplayIcon className="w-6 h-6" />
                            {group.tools.length > 1 && (
                                <div className={`absolute bottom-1 right-1 w-0 h-0 border-l-[3px] border-l-transparent border-b-[4px] border-r-[3px] border-r-transparent ${
                                    isActive ? 'border-b-white/60' : 'border-b-gray-400'
                                }`} />
                            )}
                        </button>
                        {/* Submenu - čistě stavové, bez group-hover */}
                        {group.tools.length > 1 && activeGroup === group.id && (
                            <div 
                              className="absolute left-full top-1/2 -translate-y-1/2 ml-2 bg-white rounded-2xl shadow-[0_4px_20px_rgba(0,0,0,0.15)] p-2 flex flex-col gap-1 min-w-[160px] z-50 border border-gray-100"
                              style={{ touchAction: 'auto' }}
                              onTouchStart={(e) => e.stopPropagation()}
                            >
                                <div className="text-[10px] font-bold px-3 py-1 text-gray-400 uppercase tracking-wider">{group.label}</div>
                                {group.tools.map(tool => {
                                    const ToolIcon = getIcon(tool.icon);
                                    return (
                                        <button
                                            key={tool.id}
                                            onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                const nextTool = tool.id;
                                                if (nextTool !== 'move') clearSelectionAfterPlacement();
                                                selectSidebarTool(nextTool);
                                            }}
                                            onTouchEnd={(e) => {
                                                e.preventDefault();
                                                e.stopPropagation();
                                                const nextTool = tool.id;
                                                if (nextTool !== 'move') clearSelectionAfterPlacement();
                                                selectSidebarTool(nextTool);
                                            }}
                                            className={`flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium transition-colors ${
                                                activeTool === tool.id ? 'bg-blue-50 text-blue-600' : 'text-gray-600 hover:bg-gray-50'
                                            }`}
                                        >
                                            {ToolIcon && <ToolIcon className="w-4 h-4" />}
                                            <span>{tool.label}</span>
                                        </button>
                                    );
                                })}
                            </div>
                        )}
                        {/* Tooltip (jen pro skupiny s 1 nástrojem)
                            - u "Výběr" by překážel kontextovým tlačítkům (název/zámek/barva) */}
                        {group.tools.length === 1 && group.id !== 'group_move' && (
                            <div className="absolute left-full ml-3 top-1/2 -translate-y-1/2 px-3 py-1.5 bg-black/80 text-white text-xs rounded-lg whitespace-nowrap opacity-0 group-hover/tool:opacity-100 transition-opacity pointer-events-none">
                                {group.label}
                            </div>
                        )}
                    </div>
                );
            })}
            </div>

            {/* Separator */}
            <div className="h-8"></div>

            {/* Custom Tools (Pero, Pravitko, etc.) */}
            <div className="flex flex-col gap-7">
            {toolGroups.slice(2).map(group => {
                const isMenuOpen = activeGroup === group.id;
                const IconComponent = getIcon(group.icon);

                // Adjust positioning for specific icons
                let iconStyle = "w-[120px] absolute left-[-20px]";
                if (group.id === 'group_point') iconStyle = "w-[123px] absolute left-[-31px] top-0";
                if (group.id === 'group_construct') iconStyle = "w-[120px] absolute left-[-25px] top-[-10px] scale-[1.2]";
                if (group.id === 'group_circles') iconStyle = "w-[65px] absolute left-[-37px] top-[-5px] scale-75"; 
                if (group.id === 'group_angles') iconStyle = "w-[90px] absolute left-[-10px] top-0 -rotate-[19deg]";
                if (group.id === 'group_paper') iconStyle = "w-[49px] absolute left-0 top-0 rotate-[50deg]";

                if (group.id === 'group_paper') {
                     return null;
                }

                return (
                    <div key={group.id} className="relative w-full flex justify-center transition-all duration-300">
                         <button
                            onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
                            onClick={(e) => {
                                e.stopPropagation();
                                // Switching away from selection mode: clear current selection immediately,
                                // even if we only open a submenu (e.g. "pero" group).
                                clearSelectionAfterPlacement();
                                if (group.tools.length === 1) {
                                    if (group.tools[0].id !== 'move') clearSelectionAfterPlacement();
                                    selectSidebarTool(group.tools[0].id);
                                } else {
                                    openToolSubmenu(group.id, isMenuOpen);
                                }
                            }}
                            onTouchEnd={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                clearSelectionAfterPlacement();
                                if (group.tools.length === 1) {
                                    if (group.tools[0].id !== 'move') clearSelectionAfterPlacement();
                                    selectSidebarTool(group.tools[0].id);
                                } else {
                                    openToolSubmenu(group.id, isMenuOpen);
                                }
                            }}
                            className="w-14 h-14 relative flex items-center justify-center overflow-visible z-10"
                         >
                            <div className="pointer-events-auto relative w-full h-full">
                                <div className={iconStyle}>
                                    {IconComponent && <IconComponent />}
                                </div>
                            </div>
                         </button>

                         {/* Submenu - čistě stavové, bez group-hover */}
                         {group.tools.length > 1 && isMenuOpen && (
                         <div 
                           className={`absolute left-[80%] top-1/2 -translate-y-1/2 ml-2 bg-white rounded-2xl shadow-[0_4px_20px_rgba(0,0,0,0.15)] p-2 flex flex-col gap-0.5 z-50 border border-gray-100 ${
                             group.id === 'group_construct'
                               ? 'min-w-[300px]'
                               : group.id === 'group_point'
                                 ? 'min-w-[220px] gap-1'
                                 : 'min-w-[160px] gap-1'
                           }`}
                           style={{ touchAction: 'auto' }}
                           onTouchStart={(e) => e.stopPropagation()}
                         >
                             <div className="text-[10px] font-bold px-3 py-1 text-gray-400 uppercase tracking-wider">{group.label}</div>
                             {group.tools.map(tool => {
                                 const ToolIcon = getIcon(tool.icon);
                                 const constructMenu = group.id === 'group_construct';
                                 const pointDrawingMenu = group.id === 'group_point';
                                 const isMovableRulerTool = tool.id === 'triangleRuler';
                                 const largerNotationIcon =
                                   tool.id === 'segment' ||
                                   tool.id === 'ray' ||
                                   tool.id === '__popup__segment_fixed';
                                 return (
                                 <div key={tool.id}>
                                 <button
                                    onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        if (tool.id !== 'move') clearSelectionAfterPlacement();
                                        selectSidebarTool(tool.id);
                                    }}
                                    onTouchEnd={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        if (tool.id !== 'move') clearSelectionAfterPlacement();
                                        selectSidebarTool(tool.id);
                                    }}
                                    className={`flex rounded-xl text-sm font-medium transition-colors ${
                                      constructMenu
                                        ? 'w-full justify-start text-left px-3 py-2.5 items-center gap-2.5'
                                        : pointDrawingMenu
                                          ? 'w-full justify-start text-left items-start gap-3 px-3 py-2'
                                          : 'items-center gap-3 px-3 py-2'
                                    } ${
                                        activeTool === tool.id ? 'bg-blue-50 text-blue-600' : 'text-gray-600 hover:bg-gray-50'
                                    }`}
                                 >
                                    {ToolIcon && (
                                      <ToolIcon
                                        className={`${largerNotationIcon ? 'w-[21px] h-[21px]' : 'w-4 h-4'} shrink-0 ${pointDrawingMenu ? 'mt-0.5' : ''} ${constructMenu ? 'opacity-80' : ''}`}
                                      />
                                    )}
                                    <span
                                      className={
                                        constructMenu
                                          ? 'text-left leading-snug block flex-1 min-w-0 whitespace-nowrap'
                                          : pointDrawingMenu
                                            ? 'text-left leading-snug flex-1 min-w-0'
                                            : ''
                                      }
                                    >
                                      {tool.label}
                                    </span>
                                 </button>
                                 {isMovableRulerTool && (
                                   <div className="mx-3 my-1.5 border-t border-gray-100" aria-hidden />
                                 )}
                                 </div>
                                 );
                             })}
                         </div>
                         )}
                    </div>
                );
            })}
            </div>

             {/* Separator */}
             <div className="h-8"></div>

             {/* Eraser tool button */}
             <button
               onClick={() => selectSidebarTool(activeTool === 'eraser' ? 'move' : 'eraser')}
               onTouchEnd={(e) => { e.preventDefault(); e.stopPropagation(); selectSidebarTool(activeTool === 'eraser' ? 'move' : 'eraser'); }}
               className={`w-12 h-12 flex items-center justify-center rounded-xl transition-all duration-300 relative group/eraser ${
                 activeTool === 'eraser'
                   ? 'bg-[#1e1b4b] text-white'
                   : 'text-black hover:bg-gray-200'
               }`}
             >
               <Eraser className="w-5 h-5" />
               <div className="absolute left-full ml-3 px-3 py-1.5 bg-black/80 text-white text-xs rounded-lg whitespace-nowrap opacity-0 group-hover/eraser:opacity-100 transition-opacity pointer-events-none">
                 Guma — klikni na tvar pro smazání
               </div>
             </button>

             {/* Trash / Delete selection */}
             {(selection || selectedShapeIds.length > 0 || selectedFreehandIds.length > 0) ? (
             <button
                 onClick={() => deleteGeometrySelectionRunnerRef.current?.()}
                 onTouchEnd={(e) => {
                   e.preventDefault();
                   e.stopPropagation();
                   deleteGeometrySelectionRunnerRef.current?.();
                 }}
                 className="w-12 h-12 shrink-0 flex items-center justify-center rounded-xl bg-red-50 text-red-500 hover:bg-red-100 transition-colors group/trash relative"
             >
                 <Trash2 className="w-5 h-5" />
             </button>
             ) : (
             <button
                 onClick={clearAll}
                 onTouchEnd={(e) => { e.preventDefault(); e.stopPropagation(); clearAll(); }}
                 className="w-12 h-12 flex items-center justify-center rounded-xl text-black hover:bg-red-50 hover:text-red-500 transition-colors group/trash relative"
             >
                 <Trash2 className="w-6 h-6" />
                 {/* Tooltip */}
                 <div className="absolute left-full ml-3 px-3 py-1.5 bg-black/80 text-white text-xs rounded-lg whitespace-nowrap opacity-0 group-hover/trash:opacity-100 transition-opacity pointer-events-none">
                   Vymazat
                 </div>
             </button>
             )}

         </div>
        </div>
      </div>
      )}

      {/* Perpendicular tablet mode - Narýsovat button */}
      {!recordingState.showPlayer && activeTool === 'perpendicular' && isTabletMode && perpTabletState.step === 'positioning' && perpTabletState.currentPos && (
        <button
          onClick={() => {
            const baseShape = shapes.find(s => s.id === perpTabletState.selectedLineId);
            if (baseShape && perpTabletState.currentPos) {
              const bp1 = points.find(p => p.id === baseShape.definition.p1Id);
              const bp2 = baseShape.definition.p2Id ? points.find(p => p.id === baseShape.definition.p2Id) : null;
              
              let dx = 1, dy = 0;
              if (bp1 && bp2) {
                dx = bp2.x - bp1.x;
                dy = bp2.y - bp1.y;
              } else if (baseShape.definition.angle !== undefined) {
                const rad = -baseShape.definition.angle * Math.PI / 180;
                dx = Math.cos(rad);
                dy = Math.sin(rad);
              }

              const perpDx = -dy;
              const perpDy = dx;
              const len = Math.sqrt(perpDx*perpDx + perpDy*perpDy) || 1;
              
              const pX = perpTabletState.currentPos.x;
              const pY = perpTabletState.currentPos.y;
              
              const newP1Id = crypto.randomUUID();
              const newP2Id = crypto.randomUUID();
              
              const newP1: GeoPoint = {
                  id: newP1Id,
                  x: pX,
                  y: pY,
                  label: '',
                  hidden: true
              };
              
              const newP2: GeoPoint = {
                  id: newP2Id,
                  x: pX + (perpDx / len) * 100,
                  y: pY + (perpDy / len) * 100,
                  label: '',
                  hidden: true
              };
              
              setPoints(prev => [...prev, newP1, newP2]);
              
              const newLine: GeoShape = {
                  id: crypto.randomUUID(),
                  type: 'line', 
                  label: getNextShapeLabel('line'),
                  points: [newP1Id, newP2Id],
                  definition: {
                      p1Id: newP1Id,
                      p2Id: newP2Id
                  }
              };
              
              setShapes(prev => [...prev, newLine]);
              triggerEffect(pX, pY, '#3b82f6');
              // Zápis konstrukce - kolmice (tablet)
              {
                const perpTexts = getPerpendicularConstructionTexts(newLine.label, baseShape);
                addConstructionStep(
                  'perpendicular',
                  perpTexts.notation,
                  perpTexts.latex,
                  perpTexts.description,
                  [newLine.id],
                  perpTexts.descriptionLatex
                );
              }
              
              setPerpTabletState({ step: 'idle', selectedLineId: null, currentPos: null });
              setActiveTool('move');
              clearSelectionAfterPlacement();
            }
          }}
          className="absolute left-1/2 -translate-x-1/2 z-10 px-6 py-3 rounded-full text-sm font-bold bg-blue-600 text-white shadow-lg flex items-center gap-2 transition-all hover:scale-105 active:scale-95"
          style={{ bottom: 'calc(80px + env(safe-area-inset-bottom, 0px))' }}
        >
          <Check className="size-5" />
          Narýsovat
        </button>
      )}
      
      {/* Angle tablet mode - Umístit úhloměr button */}
      {!recordingState.showPlayer && activeTool === 'angle' && isTabletMode && angleTabletState.step === 'positioning' && angleTabletState.currentPos && !angleInput.visible && (
        <button
          onClick={() => {
            // Otevřít popup úhloměru s pozicí z tablet positioningu
            setAngleInput({
              visible: true,
              value: 45,
              vertexId: null,
              directionId: null,
              customVertex: angleTabletState.currentPos!,
              baseAngle: angleTabletState.baseAngle,
              rotationOffset: 0,
              isMirrored: false
            });
          }}
          className="absolute left-1/2 -translate-x-1/2 z-10 px-6 py-3 rounded-full text-sm font-bold bg-orange-500 text-white shadow-lg flex items-center gap-2 transition-all hover:scale-105 active:scale-95"
          style={{ bottom: 'calc(80px + env(safe-area-inset-bottom, 0px))' }}
        >
          <Check className="size-5" />
          Umístit úhloměr
        </button>
      )}
      
      {/* Circle tablet mode - Narýsovat button (hidden when compass mode is active) */}
      {!recordingState.showPlayer && activeTool === 'circle' && isTabletMode && circleTabletState.active && circleTabletState.center && circleTabletState.centerId && !circleInput.visible && (
        <button
          onClick={() => {
            const centerPoint = points.find(p => p.id === circleTabletState.centerId);
            if (!centerPoint) return;
            const effectiveRadius = circleTabletState.radius;
            // Radius handle always stored at 45° (down-right)
            const radiusPoint: GeoPoint = {
              id: crypto.randomUUID(),
              x: centerPoint.x + Math.cos(Math.PI / 4) * effectiveRadius,
              y: centerPoint.y + Math.sin(Math.PI / 4) * effectiveRadius,
              label: '',
              hidden: false
            };
            setPoints(prev => [...prev, radiusPoint]);
            pendingCircleCenterRef.current = null;
            startConstructionAnimation('circle', centerPoint, radiusPoint);
            setSelectedPointId(null);
            setCircleTabletState({ active: false, centerId: null, center: null, radius: 150, isDraggingHandle: false, handlePos: null });
          }}
          onTouchEnd={(e) => {
            e.preventDefault();
            e.stopPropagation();
            const centerPoint = points.find(p => p.id === circleTabletState.centerId);
            if (!centerPoint) return;
            const effectiveRadius = circleTabletState.radius;
            // Radius handle always stored at 45° (down-right)
            const radiusPoint: GeoPoint = {
              id: crypto.randomUUID(),
              x: centerPoint.x + Math.cos(Math.PI / 4) * effectiveRadius,
              y: centerPoint.y + Math.sin(Math.PI / 4) * effectiveRadius,
              label: '',
              hidden: false
            };
            setPoints(prev => [...prev, radiusPoint]);
            pendingCircleCenterRef.current = null;
            startConstructionAnimation('circle', centerPoint, radiusPoint);
            setSelectedPointId(null);
            setCircleTabletState({ active: false, centerId: null, center: null, radius: 150, isDraggingHandle: false, handlePos: null });
          }}
          className="absolute left-1/2 -translate-x-1/2 z-50 px-6 py-3 rounded-full text-sm font-bold bg-blue-600 text-white shadow-lg flex items-center gap-2 transition-all hover:scale-105 active:scale-95"
          style={{ bottom: 'calc(80px + env(safe-area-inset-bottom, 0px))' }}
        >
          <Check className="size-5" />
          {`Narýsovat (${(circleTabletState.radius / PIXELS_PER_CM).toFixed(1)} cm)`
          }
        </button>
      )}
      
      {/* INFO PANEL (Bottom) */}
      {!recordingState.showPlayer && (() => {
        // Skrýt instrukční lištu, když je viditelné tlačítko "Narýsovat"/"Umístit" (positioning step)
        const perpPositioningActive = activeTool === 'perpendicular' && perpTabletState.step === 'positioning' && perpTabletState.currentPos;
        const freeCompassActive = activeTool === 'circle' && circleInput.visible && !circleInput.fixedRadius && circleInput.center;
        const circleDrawButtonsActive =
          freeCompassActive && circleInput.freeDrawMode === 'idle' && !animState.isActive;
        const circleDrawActive = activeTool === 'circle' && circleTabletState.active && circleTabletState.center && circleTabletState.centerId;
        const anglePositioningActive = activeTool === 'angle' && angleTabletState.step === 'positioning' && angleTabletState.currentPos;
        const rulerDrawButtonsActive =
          activeTool === 'triangleRuler' && rulerToolState.active && !animState.isActive && rulerToolState.drawMode === 'idle';
        if (isTabletMode && (perpPositioningActive || circleDrawActive || anglePositioningActive)) return null;
        if (circleDrawButtonsActive || (circleInput.visible && circleInput.fixedRadius && circleInput.center) || rulerDrawButtonsActive) return null;

        // Determine content
        let content: React.ReactNode = null;

        if (canvasWarning) {
          content = (
            <span className="flex items-center gap-2">
              <span className="size-2 rounded-full bg-orange-400"></span>
              {canvasWarning}
            </span>
          );
        } else if (animState.isActive) {
          content = (
            <span className="flex items-center gap-2 animate-pulse">
              <span className="size-2 rounded-full bg-blue-500"></span>
              Rýsuji...
            </span>
          );
        } else if (circleInput.visible && circleInput.fixedRadius && !circleInput.center) {
          content = <span>Klikni na plátno – výběr středu kružnice</span>;
        } else if (activeTool === 'circle' && circleInput.visible && !circleInput.fixedRadius) {
          content =
            circleInput.freeDrawMode === 'pickArc' ? (
              <span>Táhni křížkem po obvodu kružnice — vznikne výsek</span>
            ) : (
              <span>Táhni střed nebo handle kružítka — poloměr určíš tažením</span>
            );
        } else if (activeTool === 'triangleRuler') {
          content =
            rulerToolState.drawMode === 'pickEdge' ? (
              <span>
                {rulerToolState.drawKind === 'segment'
                  ? 'Táhni křížkem podél strany pravítka — vznikne úsečka s krajními body'
                  : rulerToolState.drawKind === 'stroke'
                    ? 'Táhni křížkem podél strany pravítka — narýsuje se jen čára'
                    : 'Táhni křížkem podél strany pravítka — vznikne přímka'}
              </span>
            ) : (
              <span>Chyť roh pro otočení, táhni tělo pro posun</span>
            );
        } else if (isTabletMode && (activeTool === 'perpendicular' || activeTool === 'circle' || activeTool === 'angle')) {
          let tabletText = '';
          if (activeTool === 'perpendicular') {
            tabletText = perpTabletState.step === 'selectLine' 
              ? 'Klikni na linku, od které chceš táhnout kolmici' 
              : perpTabletState.step === 'positioning'
                ? 'Posunuj pravítko po lince a klikni "Narýsovat"'
                : 'Vyber odkud chceš táhnout kolmici';
          } else if (activeTool === 'circle') {
            tabletText = circleTabletState.active
              ? 'Táhni modrý bod pro změnu velikosti, pak klikni „Narýsovat"'
              : 'Klikni pro umístění středu kružnice';
          } else if (activeTool === 'angle') {
            tabletText = angleTabletState.step === 'selectLine'
              ? 'Klikni na linku, kam chceš umístit úhloměr'
              : angleTabletState.step === 'positioning'
                ? 'Posunuj úhloměr po lince a klikni "Umístit úhloměr"'
                : 'Vyber kam chceš umístit úhloměr';
          }
          content = <span>{tabletText}</span>;
        } else {
          // Only show hints when actively drawing (selectedPointId set = mid-construction)
          let text = '';
          if (activeTool === 'segment' && selectedPointId) text = segmentInput.active ? `Vyber směr (fixní délka ${segmentInput.length} cm)` : 'Vyber druhý bod úsečky';
          else if (activeTool === 'line' && selectedPointId) text = 'Vyber druhý bod přímky';
          else if (activeTool === 'lineDashed' && selectedPointId) text = 'Vyber druhý bod čárkované přímky';
          else if (activeTool === 'lineDashDot' && selectedPointId) text = 'Vyber druhý bod čerchované přímky';
          else if (activeTool === 'ray' && selectedPointId) text = 'Vyber druhý bod polopřímky';
          else if (activeTool === 'circle' && !isTabletMode && selectedPointId) text = 'Vyber bod na obvodu (poloměr)';
          else if (activeTool === 'angle' && !isTabletMode && selectedPointId) text = 'Vyber bod na rameni úhlu';
          if (text) content = <span>{text}</span>;
        }

        if (!content) return null;

        return (
      <div className={`absolute left-1/2 -translate-x-1/2 z-10 rounded-2xl font-medium transition-all duration-300 px-5 py-2.5 text-sm border ${
        darkMode ? 'bg-[#24283b]/95 text-[#c0caf5] border-[#565f89] shadow-lg' : 'bg-white/95 text-gray-600 shadow-lg border-gray-200 backdrop-blur-sm'
      }`} style={{ bottom: `calc(${bottomChromeOffsetPx}px + env(safe-area-inset-bottom, 0px))` }}>
        {content}
      </div>
        );
      })()}

      {/* ZOOM + CONTROLS — v úkolu centrováno v oblasti nad plátnem (bez standalone: zoom je v horním řádku vedle Undo/…) */}
      {!recordingState.showPlayer && embedInAssignment && (
          <div
            className="pointer-events-none absolute top-4 z-10 flex justify-center"
            style={{ left: 0, right: `${assignmentToolbarRightOffsetPx ?? 16}px` }}
          >
            <div
              style={{
                transform: `scale(${topAssignmentZoomScale})`,
                transformOrigin: 'top center',
              }}
            >
            <div
              ref={topAssignmentZoomRef}
              className="pointer-events-auto flex items-center gap-1 rounded-full bg-[#F2F2F2] p-2 shadow-sm"
              onTouchStart={(e) => e.stopPropagation()}
            >
              {topZoomCluster}
            </div>
            </div>
          </div>
        )}

      {/* CIRCLE INPUT PANEL — pevný poloměr (submenu „Rozměr“) */}
      {circleInput.visible && circleInput.fixedRadius && (
        <>
          <div
            className="absolute left-4 top-1/2 z-50 animate-in slide-in-from-left-4 fade-in duration-300"
            style={{
              transform: `translateY(-50%) scale(${circleFixedPopupScale})`,
              transformOrigin: 'center center',
            }}
          >
          <div
            ref={circleFixedPopupRef}
            className={`relative p-4 rounded-2xl shadow-2xl w-52 border backdrop-blur-md ${
            darkMode ? 'bg-[#24283b]/95 border-[#565f89]' : 'bg-white/95 border-gray-200'
          }`}>
              {/* Velký křížek pro zavření */}
              <button
                onClick={() => setCircleInput(prev => ({ ...prev, visible: false, fixedRadius: false, center: null, isDraggingCenter: false, isDraggingHandle: false }))}
                onTouchEnd={(e) => { e.preventDefault(); e.stopPropagation(); setCircleInput(prev => ({ ...prev, visible: false, fixedRadius: false, center: null, isDraggingCenter: false, isDraggingHandle: false })); }}
                className={`absolute -top-14 left-1/2 -translate-x-1/2 p-3 rounded-full transition-all hover:scale-110 ${
                  darkMode ? 'bg-gray-700/90 hover:bg-gray-600' : 'bg-gray-300 hover:bg-gray-400'
                } shadow-lg`}
                title="Zavřít"
              >
                <X className={`size-6 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`} />
              </button>
              
              {/* Header */}
              <div className="mb-4">
                   <h3 className={`text-xs font-bold uppercase tracking-wider ${darkMode ? 'text-[#7aa2f7]' : 'text-gray-500'}`}>
                     Kružítko - Rozměr
                   </h3>
                   <p className={`text-[10px] mt-1 ${darkMode ? 'text-[#565f89]' : 'text-gray-400'}`}>
                     Nastav poloměr, pak táhni střed nebo handle na plátně.
                   </p>
              </div>
            
            {/* Value Input */}
            <div className="mb-4 relative">
                <label className={`text-xs font-medium mb-1.5 block ${darkMode ? 'text-[#7aa2f7]' : 'text-gray-500'}`}>
                    Poloměr (cm)
                </label>
                <div className="relative">
                    <input 
                        type="text"
                        inputMode="decimal"
                        value={circleRadiusDraft}
                        onChange={(e) => {
                          const raw = e.target.value;
                          setCircleRadiusDraft(raw);
                          const parsed = parseCmInput(raw);
                          if (parsed == null) return;
                          if (Number.isNaN(parsed)) return;
                          const clamped = Math.min(50, Math.max(0.5, parsed));
                          setCircleInput(prev => ({ ...prev, radius: clamped }));
                        }}
                        onBlur={() => {
                          const parsed = parseCmInput(circleRadiusDraft);
                          if (parsed == null) return; // keep empty
                          if (Number.isNaN(parsed)) {
                            setCircleRadiusDraft(formatCmInput(circleInput.radius));
                            return;
                          }
                          const clamped = Math.min(50, Math.max(0.5, parsed));
                          setCircleInput(prev => ({ ...prev, radius: clamped }));
                          setCircleRadiusDraft(formatCmInput(clamped));
                        }}
                        className={`w-full p-3 text-center text-3xl font-bold rounded-xl border-2 transition-all outline-none ${
                        darkMode 
                            ? 'bg-[#414868] border-[#565f89] text-[#c0caf5] focus:border-[#7aa2f7]' 
                            : 'bg-white border-gray-200 text-gray-900 focus:border-blue-500'
                        }`}
                    />
                    <span className={`absolute right-3 top-1/2 -translate-y-1/2 text-xl font-bold ${darkMode ? 'text-[#565f89]' : 'text-gray-400'}`}>cm</span>
                </div>
            </div>

            {/* Slider */}
            <div className="mb-4 px-1">
                <Slider
                    value={[circleInput.radius]}
                    onValueChange={(vals) => {
                      const v = vals[0];
                      setCircleInput(prev => ({ ...prev, radius: v }));
                      setCircleRadiusDraft(formatCmInput(v));
                    }}
                    min={0.5}
                    max={20}
                    step={0.5}
                />
                <div className="flex justify-between mt-3 gap-1">
                    {[1, 3, 5, 10, 15].map((val) => (
                        <button 
                            key={val} 
                            onClick={() => {
                              setCircleInput(prev => ({ ...prev, radius: val }));
                              setCircleRadiusDraft(formatCmInput(val));
                            }}
                            onTouchEnd={(e) => {
                              e.preventDefault(); e.stopPropagation();
                              setCircleInput(prev => ({ ...prev, radius: val }));
                              setCircleRadiusDraft(formatCmInput(val));
                            }}
                            className={`flex flex-col items-center gap-1 px-2 py-1.5 rounded-lg transition-all ${
                                Math.abs(circleInput.radius - val) <= 0.5
                                    ? 'bg-blue-600 text-white scale-105' 
                                    : darkMode 
                                        ? 'bg-[#414868] hover:bg-[#565f89] text-[#7aa2f7]' 
                                        : 'bg-gray-100 hover:bg-gray-200 text-gray-600'
                            }`}
                        >
                            <div className={`w-2 h-2 rounded-full ${
                                Math.abs(circleInput.radius - val) <= 0.5
                                    ? 'bg-white' 
                                    : 'bg-blue-500'
                            }`} />
                            <span className="text-[10px] font-bold">
                                {val}
                            </span>
                        </button>
                    ))}
                </div>
            </div>

            {/* Přepínač: Bod / Kružnice / Výsek */}
            <div className="mt-4">
                <label className={`text-xs font-medium mb-2 block ${darkMode ? 'text-[#7aa2f7]' : 'text-gray-500'}`}>
                    Narýsovat
                </label>
                <div className="flex flex-col gap-2">
                    <button
                        onClick={() => setCircleInput(prev => ({ ...prev, mode: 'point' }))}
                        onTouchEnd={(e) => { e.preventDefault(); e.stopPropagation(); setCircleInput(prev => ({ ...prev, mode: 'point' })); }}
                        className={`w-full py-2.5 rounded-lg font-medium text-sm transition-all ${
                            circleInput.mode === 'point'
                                ? 'bg-blue-600 text-white shadow-lg'
                                : darkMode
                                    ? 'bg-[#414868] hover:bg-[#565f89] text-[#7aa2f7]'
                                    : 'bg-gray-100 hover:bg-gray-200 text-gray-600'
                        }`}
                    >
                        Bod
                    </button>
                    <button
                        onClick={() => setCircleInput(prev => ({ ...prev, mode: 'circle' }))}
                        onTouchEnd={(e) => { e.preventDefault(); e.stopPropagation(); setCircleInput(prev => ({ ...prev, mode: 'circle' })); }}
                        className={`w-full py-2.5 rounded-lg font-medium text-sm transition-all ${
                            circleInput.mode === 'circle'
                                ? 'bg-blue-600 text-white shadow-lg'
                                : darkMode
                                    ? 'bg-[#414868] hover:bg-[#565f89] text-[#7aa2f7]'
                                    : 'bg-gray-100 hover:bg-gray-200 text-gray-600'
                        }`}
                    >
                        Kružnice
                    </button>
                    <button
                        onClick={() => setCircleInput(prev => ({ ...prev, mode: 'arc' }))}
                        onTouchEnd={(e) => { e.preventDefault(); e.stopPropagation(); setCircleInput(prev => ({ ...prev, mode: 'arc' })); }}
                        className={`w-full py-2.5 rounded-lg font-medium text-sm transition-all ${
                            circleInput.mode === 'arc'
                                ? 'bg-blue-600 text-white shadow-lg'
                                : darkMode
                                    ? 'bg-[#414868] hover:bg-[#565f89] text-[#7aa2f7]'
                                    : 'bg-gray-100 hover:bg-gray-200 text-gray-600'
                        }`}
                    >
                        Výsek kružnice
                    </button>
                </div>
            </div>
          </div>
          </div>

          {/* Pevný poloměr: Narýsovat */}
          {circleInput.center && (() => {
            const doCompassDraw = () => {
              if (!circleInput.center) return;
              const r = circleInput.radius * PIXELS_PER_CM;
              const ang = circleInput.handleAngle;
              const targetX = circleInput.center.x + Math.cos(ang) * r;
              const targetY = circleInput.center.y + Math.sin(ang) * r;

              const snappedCenter = points.find(p =>
                p.label && Math.sqrt((p.x - circleInput.center!.x) ** 2 + (p.y - circleInput.center!.y) ** 2) * scale < 10
              );

              if (circleInput.mode === 'point') {
                const centerId = snappedCenter ? snappedCenter.id : crypto.randomUUID();
                const centerLabel = snappedCenter ? snappedCenter.label : getNextPointLabel();
                const centerPoint: GeoPoint = snappedCenter ?? { id: centerId, x: circleInput.center.x, y: circleInput.center.y, label: centerLabel, hidden: false };
                const pointId = crypto.randomUUID();
                const pointLabel = getNextPointLabel();
                const newPoint: GeoPoint = { id: pointId, x: targetX, y: targetY, label: pointLabel, hidden: false };
                setPoints(prev => snappedCenter ? [...prev, newPoint] : [...prev, centerPoint, newPoint]);
                triggerEffect(targetX, targetY, '#3b82f6');
              } else {
                const centerId = snappedCenter ? snappedCenter.id : crypto.randomUUID();
                const centerLabel = snappedCenter ? snappedCenter.label : getNextPointLabel();
                const centerPoint: GeoPoint = snappedCenter ?? { id: centerId, x: circleInput.center.x, y: circleInput.center.y, label: centerLabel, hidden: false };
                const radiusId = crypto.randomUUID();
                const radiusPoint: GeoPoint = { id: radiusId, x: targetX, y: targetY, label: '', hidden: false };
                setPoints(prev => snappedCenter ? [...prev, radiusPoint] : [...prev, centerPoint, radiusPoint]);
                pendingCircleCenterRef.current = null;
                if (circleInput.mode === 'arc') {
                  const arcShape: GeoShape = {
                    id: crypto.randomUUID(),
                    type: 'circleArc',
                    label: getNextShapeLabel('circleArc'),
                    points: [centerPoint.id, radiusPoint.id],
                    definition: {
                      p1Id: centerPoint.id,
                      p2Id: radiusPoint.id,
                      arcSpan: COMPASS_ARC_SPAN_RAD
                    }
                  };
                  setShapes(prev => [...prev, arcShape]);
                  const rCm = distanceCm(centerPoint.x, centerPoint.y, radiusPoint.x, radiusPoint.y);
                  const lS = centerPoint.label || '?';
                  addConstructionStep(
                    'circle',
                    `${arcShape.label}(${lS}; výsek ${rCm} cm)`,
                    `${arcShape.label}(${lS};\\, \\text{výsek } ${decimalForLatex(rCm)} \\text{ cm})`,
                    `Výsek kružnice ${arcShape.label} se středem ${lS}, poloměrem ${rCm} cm`,
                    [arcShape.id],
                    `\\text{Výsek kružnice } ${latexIt(arcShape.label)} \\text{ se středem } ${latexIt(lS)} \\text{, } poloměrem ${decimalForLatex(rCm)} \\text{ cm}`
                  );
                  triggerEffect(radiusPoint.x, radiusPoint.y, '#10b981');
                } else {
                  startConstructionAnimation('circle', centerPoint, radiusPoint);
                }
              }
              pendingCircleCenterRef.current = null;
              setCircleInput(prev => ({ ...prev, visible: false, fixedRadius: false, center: null, isDraggingCenter: false, isDraggingHandle: false }));
            };
            return (
            <button
              onClick={doCompassDraw}
              onTouchEnd={(e) => { e.preventDefault(); e.stopPropagation(); doCompassDraw(); }}
              className="absolute left-1/2 -translate-x-1/2 z-50 px-8 py-4 rounded-full text-base font-bold bg-blue-600 text-white shadow-lg shadow-blue-500/30 flex items-center gap-2 transition-all hover:scale-105 active:scale-95"
              style={{ bottom: 'calc(80px + env(safe-area-inset-bottom, 0px))' }}
            >
              Narýsovat {circleInput.mode === 'point' ? 'bod' : circleInput.mode === 'arc' ? 'výsek' : 'kružnici'} ({circleInput.radius.toFixed(1).replace('.', ',')} cm)
            </button>
            );
          })()}
        </>
      )}

      {/* Kontext výběru — šedý blok dole na středu (název / zámek / tenká / zvýraznění) */}
      {showBottomSelectionBar && (
        <div
          className="absolute left-1/2 z-50 pointer-events-none"
          style={{
            bottom: 'calc(20px + env(safe-area-inset-bottom, 0px))',
            transform: 'translateX(-50%)',
          }}
        >
          <div
            className="pointer-events-auto flex items-center gap-1 rounded-full bg-[#F2F2F2] p-2 shadow-sm"
            onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
            onTouchStart={(e) => e.stopPropagation()}
          >
            {(activeTool === 'highlighter' || activeTool === 'highlighterStraight') && (
              <>
                <div className="relative">
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); setShowHighlightPalette(v => !v); }}
                    onTouchEnd={(e) => { e.preventDefault(); e.stopPropagation(); setShowHighlightPalette(v => !v); }}
                    className="flex min-w-[3.25rem] flex-col items-center justify-center rounded-xl px-2.5 py-1.5 text-gray-700 transition-colors hover:bg-white/80"
                    title="Barva zvýraznění"
                  >
                    <Palette className="h-5 w-5" />
                    <span className="mt-0.5 text-[11.7px] font-bold leading-tight">barva</span>
                  </button>
                  {showHighlightPalette && (
                    <div
                      className="absolute bottom-full left-1/2 mb-2 z-50 -translate-x-1/2 rounded-2xl border border-gray-100 bg-white p-2 shadow-[0_10px_30px_rgba(0,0,0,0.15)]"
                      onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
                      onTouchStart={(e) => e.stopPropagation()}
                    >
                      <div className="flex items-center gap-2 px-1 py-1">
                        {HIGHLIGHT_COLORS.map(c => (
                          <button
                            key={c.id}
                            type="button"
                            onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
                            onClick={(e) => {
                              e.stopPropagation();
                              highlightColorRgbaRef.current = c.rgba;
                              setHighlightColorId(c.id);
                              setShowHighlightPalette(false);
                            }}
                            onTouchEnd={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              setHighlightColorId(c.id);
                              setShowHighlightPalette(false);
                            }}
                            className={`h-8 w-8 rounded-full border transition-all ${
                              c.id === highlightColorId
                                ? 'border-gray-900 ring-2 ring-gray-900/10'
                                : 'border-gray-200 hover:border-gray-400'
                            }`}
                            style={{ background: c.swatch }}
                            title={c.label}
                          />
                        ))}
                      </div>
                    </div>
                  )}
                </div>
                {(selection || selectedShapeIds.length > 0) && !selectedFreehandIds.length && (
                  <div className="mx-0.5 h-8 w-px shrink-0 bg-gray-300" aria-hidden />
                )}
              </>
            )}

            {(selection || selectedShapeIds.length > 0) && !selectedFreehandIds.length && (
              <>
                <button
                  type="button"
                  onClick={() => setShowRenameModal(true)}
                  onTouchEnd={(e) => { e.preventDefault(); e.stopPropagation(); setShowRenameModal(true); }}
                  className="flex min-w-[3.25rem] flex-col items-center justify-center rounded-xl px-2.5 py-1.5 text-gray-700 transition-colors hover:bg-white/80"
                  title="Název"
                >
                  <Pencil className="h-5 w-5" />
                  <span className="mt-0.5 text-[11.7px] font-bold leading-tight">název</span>
                </button>

                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); toggleLockSelection(); }}
                  onTouchEnd={(e) => { e.preventDefault(); e.stopPropagation(); toggleLockSelection(); }}
                  className="flex min-w-[3.25rem] flex-col items-center justify-center rounded-xl px-2.5 py-1.5 text-gray-700 transition-colors hover:bg-white/80"
                  title={getSelectionLockState() === 'locked' ? 'Odemknout' : 'Zamknout'}
                >
                  {getSelectionLockState() === 'locked' ? (
                    <Lock className="h-5 w-5" />
                  ) : (
                    <Unlock className="h-5 w-5" />
                  )}
                  <span className="mt-0.5 text-[11.7px] font-bold leading-tight">zámek</span>
                </button>

                {selectedShapeIds.length > 0 && (
                  <>
                    <div className="mx-0.5 h-8 w-px shrink-0 bg-gray-300" aria-hidden />
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); toggleThinStrokeOnSelection(); }}
                      onTouchEnd={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        toggleThinStrokeOnSelection();
                      }}
                      className={`flex min-w-[3.25rem] flex-col items-center justify-center rounded-xl px-2.5 py-1.5 transition-colors ${
                        (() => {
                          const st = getSelectionThinStrokeState();
                          return st === 'allThin' || st === 'mixed'
                            ? 'bg-white text-amber-900'
                            : 'text-gray-700 hover:bg-white/80';
                        })()
                      }`}
                      title="Tenká — přepíná mezi tenkou a normální tloušťkou"
                    >
                      <Minus className="h-5 w-5 stroke-[3]" />
                      <span className="mt-0.5 text-[11.7px] font-bold leading-tight">tenká</span>
                    </button>
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); toggleEmphasisStrokeOnSelection(); }}
                      onTouchEnd={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        toggleEmphasisStrokeOnSelection();
                      }}
                      className={`flex min-w-[3.25rem] flex-col items-center justify-center rounded-xl px-2.5 py-1.5 transition-colors ${
                        (() => {
                          const st = getSelectionEmphasisStrokeState();
                          return st === 'allEmphasis' || st === 'mixed'
                            ? 'bg-white text-violet-900'
                            : 'text-gray-700 hover:bg-white/80';
                        })()
                      }`}
                      title="Zvýraznění — výraznější barva čáry"
                    >
                      <Sparkles className="h-5 w-5" />
                      <span className="mt-0.5 text-[11.7px] font-bold leading-tight">zvýraznění</span>
                    </button>
                  </>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* Volná kružnice — kružítko na plátně, poloměr tažením handle */}
      {circleInput.visible && !circleInput.fixedRadius && circleInput.center && !animState.isActive && (
        <div
          className="absolute left-1/2 z-50"
          style={{
            bottom: 'calc(80px + env(safe-area-inset-bottom, 0px))',
            transform: `translateX(-50%) scale(${freeCircleDrawButtonsScale})`,
            transformOrigin: 'center bottom',
          }}
        >
        <div
          ref={freeCircleDrawButtonsRef}
          className="flex flex-nowrap items-center justify-center gap-[0.45rem] px-2"
          style={{ maxWidth: 'min(98vw, 960px)' }}
        >
          {(
            [
              { mode: 'circle' as const, label: 'Narýsovat kružnici' },
              { mode: 'pickArc' as const, label: 'Narýsovat část kružnice' },
            ] as const
          ).map(({ mode, label }) => {
            const isActive = mode === 'pickArc' && circleInput.freeDrawMode === 'pickArc';
            const activateCircle = () => {
              if (!circleInput.center) return;
              const r = circleInput.radius * PIXELS_PER_CM;
              if (r < 5) return;
              const ang = circleInput.handleAngle;
              const targetX = circleInput.center.x + Math.cos(ang) * r;
              const targetY = circleInput.center.y + Math.sin(ang) * r;

              const snappedCenter = points.find(p =>
                p.label && Math.sqrt((p.x - circleInput.center!.x) ** 2 + (p.y - circleInput.center!.y) ** 2) * scale < 10
              );

              const centerId = snappedCenter ? snappedCenter.id : crypto.randomUUID();
              const centerLabel = snappedCenter ? snappedCenter.label : getNextPointLabel();
              const centerPoint: GeoPoint = snappedCenter ?? { id: centerId, x: circleInput.center.x, y: circleInput.center.y, label: centerLabel, hidden: false };
              const radiusId = crypto.randomUUID();
              const radiusPoint: GeoPoint = { id: radiusId, x: targetX, y: targetY, label: '', hidden: false };
              setPoints(prev => snappedCenter ? [...prev, radiusPoint] : [...prev, centerPoint, radiusPoint]);
              pendingCircleCenterRef.current = null;
              keepCompassToolAfterAnimRef.current = true;
              startConstructionAnimation('circle', centerPoint, radiusPoint);
              pendingCircleCenterRef.current = null;
              circleArcDrawRef.current = null;
              setCircleInput(prev => ({
                ...prev,
                freeDrawMode: 'idle',
                arcDraw: null,
                arcCrosshair: null,
                isDraggingCenter: false,
                isDraggingHandle: false,
              }));
            };
            const activatePickArc = () => {
              const togglingOff = circleInput.freeDrawMode === 'pickArc';
              let arcCrosshair: { x: number; y: number } | null = null;
              if (!togglingOff && circleInput.center) {
                const r = circleInput.radius * PIXELS_PER_CM;
                const raw = mousePosRef.current ?? circleInput.center;
                const snap = snapToCirclePerimeter(raw.x, raw.y, circleInput.center, r);
                arcCrosshair = { x: snap.x, y: snap.y };
              }
              circleArcDrawRef.current = null;
              setCircleInput(prev => ({
                ...prev,
                freeDrawMode: togglingOff ? 'idle' : 'pickArc',
                arcDraw: null,
                arcCrosshair,
                isDraggingHandle: false,
                isDraggingCenter: false,
              }));
            };
            const onActivate = mode === 'circle' ? activateCircle : activatePickArc;
            return (
              <button
                key={mode}
                onClick={onActivate}
                onTouchEnd={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onActivate();
                }}
                className={`px-[1.125rem] py-[0.675rem] rounded-full text-[0.7875rem] font-bold shadow-lg flex shrink-0 items-center gap-[0.45rem] whitespace-nowrap transition-all hover:scale-105 active:scale-95 ${
                  isActive
                    ? 'bg-gray-700 text-white shadow-gray-500/30'
                    : 'bg-blue-600 text-white shadow-blue-500/30'
                }`}
              >
                {isActive ? <X className="size-[0.9rem]" /> : <Check className="size-[0.9rem]" />}
                {isActive ? 'Zrušit' : label}
              </button>
            );
          })}
          <button
            type="button"
            title="Zavřít kružítko"
            aria-label="Zavřít kružítko"
            onClick={() => {
              setCircleInput(prev => ({
                ...prev,
                visible: false,
                fixedRadius: false,
                center: null,
                isDraggingCenter: false,
                isDraggingHandle: false,
                freeDrawMode: 'idle',
                arcDraw: null,
                arcCrosshair: null,
              }));
              selectSidebarTool('move');
            }}
            onTouchEnd={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setCircleInput(prev => ({
                ...prev,
                visible: false,
                fixedRadius: false,
                center: null,
                isDraggingCenter: false,
                isDraggingHandle: false,
                freeDrawMode: 'idle',
                arcDraw: null,
                arcCrosshair: null,
              }));
              selectSidebarTool('move');
            }}
            className="ml-[0.15rem] w-[2.35rem] h-[2.35rem] shrink-0 rounded-full bg-red-500 text-white shadow-lg shadow-red-500/30 flex items-center justify-center transition-all hover:scale-105 hover:bg-red-600 active:scale-95"
          >
            <X className="size-[1.05rem]" strokeWidth={2.5} />
          </button>
        </div>
        </div>
      )}

      {/* Pravítko — tři režimy rýsování */}
      {!recordingState.showPlayer &&
        activeTool === 'triangleRuler' &&
        rulerToolState.active &&
        !animState.isActive && (
        <div
          className="absolute left-1/2 z-50"
          style={{
            bottom: 'calc(80px + env(safe-area-inset-bottom, 0px))',
            transform: `translateX(-50%) scale(${rulerDrawButtonsScale})`,
            transformOrigin: 'center bottom',
          }}
        >
        <div
          ref={rulerDrawButtonsRef}
          className="flex flex-nowrap items-center justify-center gap-[0.45rem] px-2"
          style={{ maxWidth: 'min(98vw, 960px)' }}
        >
          {(
            [
              { kind: 'line' as const, label: 'Narýsovat přímku' },
              { kind: 'segment' as const, label: 'Narýsovat úsečku' },
              { kind: 'stroke' as const, label: 'Narýsovat čáru' },
            ] as const
          ).map(({ kind, label }) => {
            const isActive = rulerToolState.drawMode === 'pickEdge' && rulerToolState.drawKind === kind;
            const activate = () => {
              const togglingOff = isActive;
              const pivot = rulerPivotRef.current ?? rulerToolState.pivot;
              const angle = rulerAngleRef.current;
              let crosshair: { x: number; y: number } | null = null;
              if (!togglingOff && pivot) {
                const raw = mousePosRef.current ?? pivot;
                crosshair = snapToRulerEdge(raw.x, raw.y, pivot, angle, scale).point;
              }
              rulerLineDrawRef.current = null;
              setRulerToolState(prev => ({
                ...prev,
                drawMode: togglingOff ? 'idle' : 'pickEdge',
                drawKind: togglingOff ? null : kind,
                crosshair: togglingOff ? null : crosshair,
                lineDraw: null,
              }));
            };
            return (
              <button
                key={kind}
                onClick={activate}
                onTouchEnd={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  activate();
                }}
                className={`px-[1.125rem] py-[0.675rem] rounded-full text-[0.7875rem] font-bold shadow-lg flex shrink-0 items-center gap-[0.45rem] whitespace-nowrap transition-all hover:scale-105 active:scale-95 ${
                  isActive
                    ? 'bg-gray-700 text-white shadow-gray-500/30'
                    : 'bg-blue-600 text-white shadow-blue-500/30'
                }`}
              >
                {isActive ? <X className="size-[0.9rem]" /> : <Check className="size-[0.9rem]" />}
                {isActive ? 'Zrušit' : label}
              </button>
            );
          })}
          <button
            type="button"
            title="Zavřít pravítko"
            aria-label="Zavřít pravítko"
            onClick={() => selectSidebarTool('move')}
            onTouchEnd={(e) => {
              e.preventDefault();
              e.stopPropagation();
              selectSidebarTool('move');
            }}
            className="ml-[0.15rem] w-[2.35rem] h-[2.35rem] shrink-0 rounded-full bg-red-500 text-white shadow-lg shadow-red-500/30 flex items-center justify-center transition-all hover:scale-105 hover:bg-red-600 active:scale-95"
          >
            <X className="size-[1.05rem]" strokeWidth={2.5} />
          </button>
        </div>
        </div>
      )}

      {/* SEGMENT LENGTH INPUT PANEL */}
      {segmentInput.visible && (
        <>
          <div
            className="absolute left-4 top-1/2 z-50 animate-in slide-in-from-left-4 fade-in duration-300"
            style={{
              transform: `translateY(-50%) scale(${segmentPopupScale})`,
              transformOrigin: 'center center',
            }}
          >
          <div
            ref={segmentPopupRef}
            className={`relative p-4 rounded-2xl shadow-2xl w-52 border backdrop-blur-md ${
            darkMode ? 'bg-[#24283b]/95 border-[#565f89]' : 'bg-white/95 border-gray-200'
          }`}>
              {/* Velký křížek pro zavření - nad popupem */}
              <button
                onClick={() => setSegmentInput(prev => ({ ...prev, visible: false }))}
                className={`absolute -top-14 left-1/2 -translate-x-1/2 p-3 rounded-full transition-all hover:scale-110 ${
                  darkMode ? 'bg-gray-700/90 hover:bg-gray-600' : 'bg-gray-300 hover:bg-gray-400'
                } shadow-lg`}
                title="Zavřít"
              >
                <X className={`size-6 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`} />
              </button>
              
              {/* Header */}
              <div className="mb-4">
                   <h3 className={`text-xs font-bold uppercase tracking-wider ${darkMode ? 'text-[#7aa2f7]' : 'text-gray-500'}`}>
                     Úsečka o rozměru
                   </h3>
              </div>
            
            {/* Value Input */}
            <div className="mb-4 relative">
                <label className={`text-xs font-medium mb-1.5 block ${darkMode ? 'text-[#7aa2f7]' : 'text-gray-500'}`}>
                    Délka (cm)
                </label>
                <div className="relative">
                    <input 
                        type="text"
                        inputMode="decimal"
                        value={segmentLengthDraft}
                        onChange={(e) => {
                          const raw = e.target.value;
                          setSegmentLengthDraft(raw);
                          const parsed = parseCmInput(raw);
                          if (parsed == null) return;
                          if (Number.isNaN(parsed)) return;
                          const clamped = Math.min(50, Math.max(0.5, parsed));
                          setSegmentInput(prev => ({ ...prev, length: clamped }));
                        }}
                        onBlur={() => {
                          const parsed = parseCmInput(segmentLengthDraft);
                          if (parsed == null) return; // keep empty
                          if (Number.isNaN(parsed)) {
                            setSegmentLengthDraft(formatCmInput(segmentInput.length));
                            return;
                          }
                          const clamped = Math.min(50, Math.max(0.5, parsed));
                          setSegmentInput(prev => ({ ...prev, length: clamped }));
                          setSegmentLengthDraft(formatCmInput(clamped));
                        }}
                        className={`w-full p-3 text-center text-3xl font-bold rounded-xl border-2 transition-all outline-none ${
                        darkMode 
                            ? 'bg-[#414868] border-[#565f89] text-[#c0caf5] focus:border-[#7aa2f7]' 
                            : 'bg-white border-gray-200 text-gray-900 focus:border-blue-500'
                        }`}
                    />
                    <span className={`absolute right-3 top-1/2 -translate-y-1/2 text-xl font-bold ${darkMode ? 'text-[#565f89]' : 'text-gray-400'}`}>cm</span>
                </div>
            </div>

            {/* Slider */}
            <div className="mb-6 px-1">
                <Slider
                    value={[segmentInput.length]}
                    onValueChange={(vals) => {
                      const v = vals[0];
                      setSegmentInput(prev => ({ ...prev, length: v }));
                      setSegmentLengthDraft(formatCmInput(v));
                    }}
                    min={0.5}
                    max={20}
                    step={0.5}
                />
                <div className="flex justify-between mt-3 gap-1">
                    {[1, 3, 5, 10, 15].map((val) => (
                        <button 
                            key={val} 
                            onClick={() => {
                              setSegmentInput(prev => ({ ...prev, length: val }));
                              setSegmentLengthDraft(formatCmInput(val));
                            }}
                            className={`flex flex-col items-center gap-1 px-2 py-1.5 rounded-lg transition-all ${
                                Math.abs(segmentInput.length - val) <= 0.5
                                    ? 'bg-blue-600 text-white scale-105' 
                                    : darkMode 
                                        ? 'bg-[#414868] hover:bg-[#565f89] text-[#7aa2f7]' 
                                        : 'bg-gray-100 hover:bg-gray-200 text-gray-600'
                            }`}
                        >
                            <div className={`w-2 h-2 rounded-full ${
                                Math.abs(segmentInput.length - val) <= 0.5
                                    ? 'bg-white' 
                                    : 'bg-blue-500'
                            }`} />
                            <span className="text-[10px] font-bold">
                                {val}
                            </span>
                        </button>
                    ))}
                </div>
            </div>

            {/* Action Button */}
            <button
                onClick={() => {
                  const parsed = parseCmInput(segmentLengthDraft);
                  if (parsed == null || Number.isNaN(parsed)) {
                    toast.error('Zadej délku úsečky.');
                    return;
                  }
                  const clamped = Math.min(50, Math.max(0.5, parsed));
                  setSegmentInput(prev => ({ ...prev, length: clamped, active: true, visible: false, mode: 'fixed' }));
                  setSegmentLengthDraft(formatCmInput(clamped));
                  setActiveTool('segment');
                }}
                className="w-full py-3 rounded-xl font-bold text-white bg-blue-600 hover:bg-blue-700 flex items-center justify-center gap-2 shadow-lg shadow-blue-500/30 transition-all active:scale-95 text-sm"
            >
                <Check className="size-5" />
                <span>Použít</span>
            </button>
          </div>
          </div>
        </>
      )}

      {/* ANGLE INPUT PANEL */}
      {angleInput.visible && (
        <>
          <div
            className="absolute left-4 top-1/2 z-50 animate-in slide-in-from-left-4 fade-in duration-300"
            style={{
              transform: `translateY(-50%) scale(${anglePopupScale})`,
              transformOrigin: 'center center',
            }}
          >
          <div
            ref={anglePopupRef}
            className={`relative p-4 rounded-2xl shadow-2xl w-52 border backdrop-blur-md ${
            darkMode ? 'bg-[#24283b]/95 border-[#565f89]' : 'bg-white/95 border-gray-200'
          }`}>
              {/* Velký křížek pro zavření - nad popupem */}
              <button
                onClick={() => {
                  setAngleInput(prev => ({ ...prev, visible: false }));
                  // Znovu „vyber přímku“ — idle by zablokovalo tablet workflow (mousedown očekává step === 'selectLine')
                  if (isTabletMode) {
                    setAngleTabletState({ step: 'selectLine', selectedLineId: null, currentPos: null, baseAngle: 0 });
                  }
                }}
                className={`absolute -top-14 left-1/2 -translate-x-1/2 p-3 rounded-full transition-all hover:scale-110 ${
                  darkMode ? 'bg-gray-700/90 hover:bg-gray-600' : 'bg-gray-300 hover:bg-gray-400'
                } shadow-lg`}
                title="Zavřít"
              >
                <X className={`size-6 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`} />
              </button>
              
              {/* Header */}
              <div className="mb-4">
                   <h3 className={`text-xs font-bold uppercase tracking-wider ${darkMode ? 'text-[#7aa2f7]' : 'text-gray-500'}`}>
                     Úhloměr
                   </h3>
              </div>
            
            {/* Value Input */}
            <div className="mb-4 relative">
                <label className={`text-xs font-medium mb-1.5 block ${darkMode ? 'text-[#7aa2f7]' : 'text-gray-500'}`}>
                    Velikost úhlu
                </label>
                <div className="flex items-center gap-2">
                    <input 
                        type="number"
                        min="0"
                        max="360"
                        value={angleInput.value}
                        onChange={(e) => setAngleInput(prev => ({ ...prev, value: Number(e.target.value) }))}
                        className={`w-full p-3 text-center text-3xl font-bold rounded-xl border-2 transition-all outline-none tabular-nums ${
                        darkMode 
                            ? 'bg-[#414868] border-[#565f89] text-[#c0caf5] focus:border-[#7aa2f7]' 
                            : 'bg-white border-gray-200 text-gray-900 focus:border-blue-500'
                        }`}
                    />
                    <span className={`text-3xl font-bold ${darkMode ? 'text-[#c0caf5]' : 'text-gray-900'}`}>°</span>
                </div>
            </div>

            {/* Controls (Rotate & Mirror) */}
            <div className="grid grid-cols-2 gap-2 mb-6">
                 <button 
                     onClick={() => setAngleInput(prev => ({ 
                         ...prev, 
                         rotationOffset: (prev.rotationOffset + 90) % 360 
                     }))}
                     className={`h-12 rounded-xl flex items-center justify-center border-2 transition-all ${
                         darkMode 
                             ? 'bg-gray-800 border-gray-700 hover:bg-gray-700 text-gray-300' 
                             : 'bg-white border-gray-200 hover:bg-gray-50 text-gray-600'
                     }`}
                     title="Otočit o 90°"
                 >
                     <RotateCw className="size-5" />
                 </button>

                 <button 
                     onClick={() => setAngleInput(prev => ({
                         ...prev,
                         isMirrored: !prev.isMirrored,
                         rotationOffset: (prev.rotationOffset + 180) % 360,
                     }))}
                     className={`h-12 rounded-xl flex items-center justify-center border-2 transition-all ${
                         angleInput.isMirrored
                            ? 'bg-blue-600 border-blue-600 text-white'
                            : darkMode 
                                ? 'bg-[#414868] border-[#565f89] hover:bg-[#565f89] text-[#c0caf5]' 
                                : 'bg-white border-gray-200 hover:bg-gray-50 text-gray-600'
                     }`}
                     title="Zrcadlit úhloměr a otočit o 180°"
                 >
                     <FlipVertical className="size-5 rotate-90" />
                 </button>
            </div>

            {/* Slider */}
            <div className="mb-6 px-1">
                <Slider
                    value={[angleInput.value]}
                    onValueChange={(vals) => setAngleInput(prev => ({ ...prev, value: vals[0] }))}
                    min={0}
                    max={180}
                    step={1}
                />
                <div className="flex justify-between mt-3 gap-1">
                    {[0, 45, 90, 135, 180].map((val) => (
                        <button 
                            key={val} 
                            onClick={() => setAngleInput(prev => ({ ...prev, value: val }))}
                            className={`flex flex-col items-center gap-1 px-2 py-1.5 rounded-lg transition-all ${
                                Math.abs(angleInput.value - val) <= 2
                                    ? 'bg-blue-600 text-white scale-105' 
                                    : darkMode 
                                        ? 'bg-[#414868] hover:bg-[#565f89] text-[#7aa2f7]' 
                                        : 'bg-gray-100 hover:bg-gray-200 text-gray-600'
                            }`}
                        >
                            <div className={`w-2 h-2 rounded-full ${
                                Math.abs(angleInput.value - val) <= 2
                                    ? 'bg-white' 
                                    : 'bg-blue-500'
                            }`} />
                            <span className="text-[10px] font-bold">
                                {val}
                            </span>
                        </button>
                    ))}
                </div>
            </div>

            {/* Action Button */}
            <button
                onClick={confirmAngle}
                className="w-full py-3 rounded-xl font-bold text-white bg-blue-600 hover:bg-blue-700 flex items-center justify-center gap-2 shadow-lg shadow-blue-500/30 transition-all active:scale-95 text-sm"
            >
                <Check className="size-5" />
                <span>Vytvořit</span>
            </button>
          </div>
          </div>
        </>
      )}

      {/* EDITOR KROKŮ - Po ukončení nahrávání */}
      {recordingState.showEditor && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
          <div className={`${darkMode ? 'bg-[#24283b]' : 'bg-white'} rounded-2xl p-8 shadow-2xl max-w-2xl w-full mx-4 max-h-[80vh] overflow-hidden flex flex-col relative`}>
            {/* X button to close editor */}
            <button
              onClick={() => setShowCloseConfirm(true)}
              className={`absolute top-4 right-4 p-2 rounded-full transition-all ${
                darkMode ? 'hover:bg-gray-700 text-gray-400' : 'hover:bg-gray-100 text-gray-400'
              }`}
              title="Zavřít"
            >
              <X className="size-5" />
            </button>
            <h2 className={`text-2xl font-bold mb-2 ${darkMode ? 'text-[#c0caf5]' : 'text-gray-900'}`}>
              Úprava kroků
            </h2>
            <p className={`mb-4 ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
              Nahráno {editableSteps.length} kroků. Můžete upravit zápis konstrukce i popis jednotlivých kroků.
            </p>

            {/* Recording name input */}
            <div className="mb-4">
              <label className={`block text-sm font-medium mb-1.5 ${darkMode ? 'text-[#9aa5ce]' : 'text-gray-700'}`}>
                Název konstrukce
              </label>
              <input
                type="text"
                value={recordingName}
                onChange={(e) => setRecordingName(e.target.value)}
                placeholder="Např. Konstrukce trojúhelníku ABC..."
                className={`w-full px-4 py-2.5 rounded-xl border ${
                  darkMode ? 'bg-[#414868] border-[#565f89] text-[#c0caf5] placeholder-[#565f89]' : 'bg-white border-gray-300 text-gray-900 placeholder-gray-400'
                } focus:outline-none focus:ring-2 focus:ring-blue-500`}
              />
            </div>

            <div className="flex-1 overflow-y-auto mb-6 space-y-3">
              {editableSteps.map((step, index) => (
                <div key={step.id} className={`p-4 rounded-lg ${darkMode ? 'bg-gray-800' : 'bg-gray-50'}`}>
                  <div className="flex items-center gap-3 mb-2">
                    <div className={`flex items-center justify-center w-8 h-8 rounded-full ${darkMode ? 'bg-gray-700 text-gray-300' : 'bg-gray-200 text-gray-700'} font-bold text-sm flex-shrink-0`}>
                      {index + 1}
                    </div>
                    <div className={`flex items-center justify-center w-8 h-8 rounded-full ${darkMode ? 'bg-blue-900/50 text-blue-400' : 'bg-blue-100 text-blue-600'} flex-shrink-0`}>
                      {getActionIcon(step.actionType)}
                    </div>
                    <div className="flex-1">
                      <label className={`block text-[11px] mb-0.5 ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>Zápis konstrukce (LaTeX)</label>
                      <input
                        type="text"
                        value={step.notation || ''}
                        onChange={(e) => {
                          const newSteps = [...editableSteps];
                          newSteps[index] = { ...newSteps[index], notation: e.target.value };
                          setEditableSteps(newSteps);
                        }}
                        placeholder="Např. |AB| = 5\,\text{cm}"
                        className={`w-full px-3 py-1.5 rounded-lg border text-sm font-mono ${
                          darkMode ? 'bg-[#414868] border-[#565f89] text-[#c0caf5] placeholder-[#565f89]' : 'bg-white border-gray-300 text-gray-900 placeholder-gray-300'
                        } focus:outline-none focus:ring-2 focus:ring-blue-500`}
                      />
                    </div>
                  </div>
                  <div className="ml-[72px]">
                    <label className={`block text-[11px] mb-0.5 ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>Popis kroku</label>
                    <input
                      type="text"
                      value={step.description}
                      onChange={(e) => {
                        const newSteps = [...editableSteps];
                        newSteps[index] = { ...newSteps[index], description: e.target.value };
                        setEditableSteps(newSteps);
                      }}
                      placeholder="Popis kroku..."
                      className={`w-full px-3 py-1.5 rounded-lg border text-sm ${
                        darkMode ? 'bg-[#414868] border-[#565f89] text-[#c0caf5] placeholder-[#565f89]' : 'bg-white border-gray-300 text-gray-900 placeholder-gray-300'
                      } focus:outline-none focus:ring-2 focus:ring-blue-500`}
                    />
                  </div>
                </div>
              ))}
            </div>
            
            <div className="flex gap-3">
              <button
                onClick={() => {
                  // Ulozit editace a vratit se do prehravace
                  setRecordingState(prev => ({ 
                    ...prev, 
                    steps: editableSteps,
                    showEditor: false, 
                    showPlayer: true,
                    currentStepIndex: -1
                  }));
                  // Vycistit canvas pro prehravani od zacatku
                  setPoints([]);
                  setShapes([]);
                  setFreehandPaths([]);
                }}
                className="flex-1 py-3 rounded-xl font-bold text-white bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-400 hover:to-blue-500 transition-all shadow-lg flex items-center justify-center gap-2"
              >
                <Check className="size-4" />
                Hotovo
              </button>
            </div>
          </div>
        </div>
      )}

      {/* PŘEHRÁVAČ KROKŮ */}
      {recordingState.showPlayer && (
        <div className="absolute inset-0 z-50 flex flex-col">
          {/* Canvas pro přehrávání */}
          <div className="flex-1" />
          
          {/* INTRO OBRAZOVKA - Před spuštěním kroků */}
          {recordingState.currentStepIndex === -1 && (
            <div className="absolute inset-0 z-40 flex items-center justify-center pointer-events-none">
              <div className="flex flex-col items-center gap-6 pointer-events-auto">
                {/* "Jak narýsovat:" bubble */}
                <div className={`px-5 py-2 rounded-full text-sm font-medium ${
                  darkMode ? 'bg-[#7aa2f7]/20 text-[#7aa2f7] border border-[#7aa2f7]/30' : 'bg-blue-50 text-blue-600 border border-blue-200'
                }`}>
                  Jak narýsovat:
                </div>
                
                {/* Název konstrukce */}
                <h1 className={`font-bold text-center max-w-4xl ${
                  darkMode ? 'text-[#8b9ec7]' : 'text-[#3b4a6b]'
                }`} style={{ fontSize: 'clamp(3.2rem, 9.6vw, 8rem)', lineHeight: '0.848' }}>
                  {recordingName || (sharedRecording ? sharedRecording.name : 'Konstrukce')}
                </h1>
                
                {/* Sdílet tlačítko */}
                {!sharedRecording && !shareLink && (
                  <button
                    onClick={async () => {
                      const name = recordingName.trim() || `Záznam ${new Date().toLocaleDateString('cs-CZ')}`;
                      await saveRecordingToServer(name, recordingState.steps);
                    }}
                    disabled={isSavingRecording}
                    className={`flex items-center gap-2 px-6 py-3 rounded-xl font-medium transition-all ${
                      isSavingRecording
                        ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                        : 'bg-blue-600 hover:bg-blue-500 text-white shadow-lg hover:shadow-xl'
                    }`}
                  >
                    {isSavingRecording ? <Loader2 className="size-5 animate-spin" /> : <Share2 className="size-5" />}
                    Sdílet
                  </button>
                )}
                
                {/* Upozornění pod sdílením */}
                {!sharedRecording && !shareLink && (
                  <p className={`text-sm text-center max-w-xs ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>
                    Uložte si odkaz na přehrávání.<br />Automaticky se neukládá.
                  </p>
                )}
                
                {/* Share link po sdílení */}
                {shareLink && (
                  <div className={`px-5 py-4 rounded-2xl shadow-lg ${
                    darkMode ? 'bg-gray-900 border border-gray-800' : 'bg-white border border-gray-200'
                  }`}>
                    <div className="flex items-center gap-2 mb-2">
                      <Link className={`size-4 ${darkMode ? 'text-[#7aa2f7]' : 'text-blue-600'}`} />
                      <span className={`text-sm font-medium ${darkMode ? 'text-[#7aa2f7]' : 'text-blue-700'}`}>Odkaz ke sdílení</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        readOnly
                        value={shareLink}
                        className={`w-72 px-3 py-2 rounded-lg text-sm font-mono ${
                          darkMode ? 'bg-[#414868] text-[#c0caf5] border-[#565f89]' : 'bg-gray-50 text-gray-900 border-gray-300'
                        } border`}
                        onClick={(e) => (e.target as HTMLInputElement).select()}
                      />
                      <button
                        onClick={() => {
                          const ta = document.createElement('textarea');
                          ta.value = shareLink;
                          ta.style.position = 'fixed';
                          ta.style.opacity = '0';
                          document.body.appendChild(ta);
                          ta.select();
                          try { document.execCommand('copy'); toast.success('Odkaz zkopírován!'); }
                          catch { toast.error('Nelze zkopírovat'); }
                          document.body.removeChild(ta);
                        }}
                        className={`p-2.5 rounded-lg transition-all ${
                          darkMode ? 'bg-[#7aa2f7] hover:bg-[#7aa2f7]/80 text-white' : 'bg-blue-600 hover:bg-blue-700 text-white'
                        }`}
                        title="Kopírovat odkaz"
                      >
                        <Copy className="size-4" />
                      </button>
                    </div>
                  </div>
                )}

                {/* Pokyn k začátku */}
                <div className={`text-sm mt-2 ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>
                  Klikněte na <span className="font-bold">Další</span> pro spuštění konstrukce
                </div>
              </div>
            </div>
          )}

          {/* Ovladaci panel prehravace */}
          <div className={`absolute left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 px-6 py-4 rounded-2xl shadow-2xl ${
            darkMode ? 'bg-gray-900 border border-gray-800' : 'bg-white'
          }`} style={{ bottom: 'calc(32px + env(safe-area-inset-bottom, 0px))' }}>
            {/* Reset */}
            <button
              onClick={() => {
                // Reset na začátek
                setRecordingState(prev => ({ 
                  ...prev, 
                  currentStepIndex: -1
                }));
                // Reset canvasu
                setPoints([]);
                setShapes([]);
                setFreehandPaths([]);
                // Zrušit animaci
                setAnimState({
                  isActive: false,
                  type: null,
                  startTime: 0,
                  p1: null,
                  p2: null,
                  progress: 0
                });
              }}
              className={`p-3 rounded-full transition-all ${
                darkMode ? 'hover:bg-gray-800' : 'hover:bg-gray-100'
              }`}
              title="Reset"
            >
              <RotateCw className="size-6" />
            </button>

            {/* Zpět */}
            <button
              onClick={() => {
                const prevIndex = Math.max(-1, recordingState.currentStepIndex - 1);
                setRecordingState(prev => ({ ...prev, currentStepIndex: prevIndex }));
                // Zrušit animaci
                setAnimState({
                  isActive: false,
                  type: null,
                  startTime: 0,
                  p1: null,
                  p2: null,
                  progress: 0
                });
                // Načíst snapshot předchozího kroku
                if (prevIndex >= 0) {
                  const step = recordingState.steps[prevIndex];
                  setPoints(step.snapshot.points);
                  setShapes(step.snapshot.shapes);
                  setFreehandPaths(step.snapshot.freehandPaths);
                } else {
                  setPoints([]);
                  setShapes([]);
                  setFreehandPaths([]);
                }
              }}
              disabled={recordingState.currentStepIndex < 0}
              className={`px-5 py-2.5 rounded-xl font-bold transition-all ${
                recordingState.currentStepIndex < 0
                  ? darkMode ? 'bg-gray-800 text-gray-600 cursor-not-allowed' : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                  : 'bg-blue-500 hover:bg-blue-400 text-white'
              }`}
            >
              <ArrowLeft className="size-5 inline mr-2" />
              Zpět
            </button>

            {/* Další */}
            <button
              onClick={() => {
                const nextIndex = Math.min(recordingState.steps.length - 1, recordingState.currentStepIndex + 1);
                setRecordingState(prev => ({ ...prev, currentStepIndex: nextIndex }));
                const step = recordingState.steps[nextIndex];
                
                // Nejdřív nastavit stav PŘED krokem (předchozí snapshot)
                const prevStep = nextIndex > 0 ? recordingState.steps[nextIndex - 1] : null;
                if (prevStep) {
                  setPoints(prevStep.snapshot.points);
                  setShapes(prevStep.snapshot.shapes);
                  setFreehandPaths(prevStep.snapshot.freehandPaths);
                } else {
                  setPoints([]);
                  setShapes([]);
                  setFreehandPaths([]);
                }
                
                // Pokud má krok vizualizaci nástroje, spustit animaci
                console.log('🔍 DEBUG PŘEHRÁVAČ: step.actionType:', step.actionType, 'toolVisualization:', step.toolVisualization);
                if (step.toolVisualization && step.toolVisualization.p1 && step.toolVisualization.p2) {
                  const viz = step.toolVisualization;
                  console.log('🔍 DEBUG: viz.type:', viz.type, 'viz.p1:', viz.p1, 'viz.p2:', viz.p2);
                  let animType: 'segment' | 'line' | 'lineDashed' | 'ray' | 'circle' | 'angle' | null = null;
                  
                  if (viz.type === 'ruler') {
                    if (step.actionType === 'create-segment') animType = 'segment';
                    else if (step.actionType === 'create-line') animType = 'line';
                    else if (step.actionType === 'create-line-dashed') animType = 'lineDashed';
                    else if (step.actionType === 'create-ray') animType = 'ray';
                    else if (step.actionType === 'create-point') {
                      // Pokud je ruler u create-point, je to pravděpodobně vytváření úsečky
                      // (body se vytváří jako vedlejší efekt)
                      animType = 'segment';
                    }
                    console.log('🔍 DEBUG: Detekován RULER, animType:', animType);
                  } else if (viz.type === 'compass') {
                    animType = 'circle';
                    console.log('🔍 DEBUG: Detekován COMPASS');
                  } else if (viz.type === 'protractor') {
                    animType = 'angle';
                    console.log('🔍 DEBUG: Detekován PROTRACTOR');
                  }
                  
                  if (animType) {
                    // Nastavit finální snapshot okamžitě (tvary jsou viditelné)
                    setPoints(step.snapshot.points);
                    setShapes(step.snapshot.shapes);
                    setFreehandPaths(step.snapshot.freehandPaths);
                    
                    // Spustit animaci nástroje (pravítko/kružítko overlay)
                    setAnimState({
                      isActive: true,
                      type: animType,
                      startTime: performance.now(),
                      p1: viz.p1,
                      p2: viz.p2,
                      angle: step.actionType === 'create-angle' ? 45 : undefined,
                      baseAngle: viz.angle,
                      progress: 0
                    });
                    
                    // Po 2 sekundách zrušit animaci (tvary zůstanou ze snapshot)
                    setTimeout(() => {
                      setAnimState({
                        isActive: false,
                        type: null,
                        startTime: 0,
                        p1: null,
                        p2: null,
                        progress: 0
                      });
                    }, constructionAnimMs.total);
                  } else {
                    console.log('⚠️ DEBUG: animType je NULL! Nebudu animovat.');
                    // Bez animace - rovnou nastavit snapshot
                    setPoints(step.snapshot.points);
                    setShapes(step.snapshot.shapes);
                    setFreehandPaths(step.snapshot.freehandPaths);
                  }
                } else {
                  console.log('⚠️ DEBUG: Krok nemá toolVisualization nebo chybí p1/p2!');
                  // Bez vizualizace - rovnou nastavit snapshot
                  setPoints(step.snapshot.points);
                  setShapes(step.snapshot.shapes);
                  setFreehandPaths(step.snapshot.freehandPaths);
                }
              }}
              disabled={recordingState.currentStepIndex >= recordingState.steps.length - 1}
              className={`px-5 py-2.5 rounded-xl font-bold transition-all ${
                recordingState.currentStepIndex >= recordingState.steps.length - 1
                  ? darkMode ? 'bg-gray-800 text-gray-600 cursor-not-allowed' : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                  : 'bg-blue-600 hover:bg-blue-500 text-white'
              }`}
            >
              Další
              <ArrowRight className="size-5 inline ml-2" />
            </button>

            {/* Separator - jen vizualni oddelovac */}
            <div className={`w-px h-8 ${darkMode ? 'bg-gray-700' : 'bg-gray-300'}`} />

            {/* Dark mode toggle */}
            <button
              onClick={() => onDarkModeChange(!darkMode)}
              className={`p-3 rounded-full transition-all ${
                darkMode ? 'hover:bg-gray-800' : 'hover:bg-gray-100'
              }`}
              title={darkMode ? 'Svetly rezim' : 'Tmavy rezim'}
            >
              {darkMode ? <Sun className="size-6" /> : <Moon className="size-6" />}
            </button>

            {/* Upravit - jen pro lokalni (ne sdilene) zaznamy a pred sdilenim */}
            {!sharedRecording && !shareLink && (
              <button
                onClick={() => {
                  setEditableSteps(recordingState.steps);
                  setRecordingState(prev => ({
                    ...prev,
                    showEditor: true,
                    showPlayer: false
                  }));
                }}
                className={`p-3 rounded-full transition-all ${
                  darkMode ? 'hover:bg-gray-800 text-[#bb9af7]' : 'hover:bg-gray-100 text-purple-600'
                }`}
                title="Upravit kroky a nazev"
              >
                <Pencil className="size-6" />
              </button>
            )}

            {/* Tisk - jen pro lokalni zaznamy a pred sdilenim */}
            {!sharedRecording && !shareLink && (
              <button
                onClick={handlePrint}
                className={`p-3 rounded-full transition-all ${
                  darkMode ? 'hover:bg-gray-800 text-[#9ece6a]' : 'hover:bg-gray-100 text-green-600'
                }`}
                title="Tisk konstrukce"
              >
                <Printer className="size-6" />
              </button>
            )}

            {/* Ulozit a sdilet - jen pro lokalni zaznamy a pred sdilenim */}
            {!sharedRecording && !shareLink && (
              <button
                onClick={async () => {
                  const name = recordingName.trim() || `Zaznam ${new Date().toLocaleDateString('cs-CZ')}`;
                  await saveRecordingToServer(name, recordingState.steps);
                }}
                disabled={isSavingRecording}
                className={`p-3 rounded-full transition-all ${
                  isSavingRecording
                    ? 'text-gray-500 cursor-not-allowed'
                    : darkMode ? 'hover:bg-gray-800 text-[#7dcfff]' : 'hover:bg-gray-100 text-teal-600'
                }`}
                title="Ulozit a sdilet"
              >
                {isSavingRecording ? <Loader2 className="size-6 animate-spin" /> : <Share2 className="size-6" />}
              </button>
            )}

            {/* Close/Exit player */}
            <button
              onClick={() => setShowCloseConfirm(true)}
              className={`p-3 rounded-full transition-all ${
                darkMode ? 'hover:bg-gray-800 text-red-400' : 'hover:bg-gray-100 text-red-500'
              }`}
              title="Zavřít přehrávač"
            >
              <X className="size-6" />
            </button>
          </div>

          {/* Share link display - po sdílení (viditelné i mimo intro) */}
          {shareLink && recordingState.currentStepIndex !== -1 && (
            <div className={`absolute left-1/2 -translate-x-1/2 z-50 px-5 py-4 rounded-2xl shadow-2xl ${
              darkMode ? 'bg-gray-900 border border-gray-800' : 'bg-white border border-gray-200'
            }`} style={{ bottom: 'calc(100px + env(safe-area-inset-bottom, 0px))' }}>
              <div className="flex items-center gap-2 mb-2">
                <Link className={`size-4 ${darkMode ? 'text-[#7aa2f7]' : 'text-blue-600'}`} />
                <span className={`text-sm font-medium ${darkMode ? 'text-[#7aa2f7]' : 'text-blue-700'}`}>Odkaz ke sdílení</span>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  readOnly
                  value={shareLink}
                  className={`w-72 px-3 py-2 rounded-lg text-sm font-mono ${
                    darkMode ? 'bg-[#414868] text-[#c0caf5] border-[#565f89]' : 'bg-gray-50 text-gray-900 border-gray-300'
                  } border`}
                  onClick={(e) => (e.target as HTMLInputElement).select()}
                />
                <button
                  onClick={() => {
                    const ta = document.createElement('textarea');
                    ta.value = shareLink;
                    ta.style.position = 'fixed';
                    ta.style.opacity = '0';
                    document.body.appendChild(ta);
                    ta.select();
                    try { document.execCommand('copy'); toast.success('Odkaz zkopírován!'); }
                    catch { toast.error('Nelze zkopírovat'); }
                    document.body.removeChild(ta);
                  }}
                  className={`p-2.5 rounded-lg transition-all ${
                    darkMode ? 'bg-[#7aa2f7] hover:bg-[#7aa2f7]/80 text-white' : 'bg-blue-600 hover:bg-blue-700 text-white'
                  }`}
                  title="Kopírovat odkaz"
                >
                  <Copy className="size-4" />
                </button>
              </div>
            </div>
          )}

          {/* Název aktuálního kroku — zápis konstrukce + popis */}
          {recordingState.currentStepIndex >= 0 && recordingState.currentStepIndex < recordingState.steps.length && (() => {
            const recStep = recordingState.steps[recordingState.currentStepIndex];
            return (
              <div className={`absolute top-8 left-1/2 -translate-x-1/2 px-6 py-3 rounded-xl shadow-lg max-w-lg ${
                darkMode ? 'bg-[#24283b] text-[#c0caf5] border border-[#565f89]' : 'bg-white text-gray-900'
              }`}>
                <div className={`text-sm mb-1 ${darkMode ? 'text-[#9aa5ce]' : 'text-gray-500'}`}>
                  Krok {recordingState.currentStepIndex + 1} / {recordingState.steps.length}
                </div>
                <div className="flex items-center gap-3">
                  <div className={`flex items-center justify-center w-10 h-10 rounded-full flex-shrink-0 ${darkMode ? 'bg-[#7aa2f7]/20 text-[#7aa2f7]' : 'bg-blue-100 text-blue-600'}`}>
                    {getActionIcon(recStep.actionType)}
                  </div>
                  <div>
                    {recStep.notation ? (
                      <div className="text-lg">
                        <span className={`mr-2 ${darkMode ? 'text-[#565f89]' : 'text-gray-400'}`}>{recordingState.currentStepIndex + 1}.</span>
                        <Latex math={recStep.notation} className={darkMode ? 'katex-dark' : ''} />
                      </div>
                    ) : null}
                    <div className={`text-sm ${recStep.notation ? (darkMode ? 'text-[#9aa5ce] mt-0.5' : 'text-gray-500 mt-0.5') : 'font-bold text-lg'}`}>
                      {recStep.description}
                    </div>
                  </div>
                </div>
              </div>
            );
          })()}
        </div>
      )}

      {/* PANEL: Zápis konstrukce */}
      <ConstructionProtocol
        steps={constructionSteps}
        visible={showConstructionPanel}
        onClose={() => setShowConstructionPanel(false)}
        onClear={clearConstructionSteps}
        darkMode={darkMode}
        tabletMode={isTabletMode}
        points={points}
        shapes={shapes}
        pixelsPerCm={PIXELS_PER_CM}
      />

      {/* PŘEJMENOVÁNÍ BODŮ A TVARŮ */}
      {showRenameModal && (
        <div 
          className="fixed inset-0 flex items-center justify-center bg-black/60 backdrop-blur-sm"
          style={{ zIndex: 9999, touchAction: 'auto' }}
          onTouchStart={(e) => e.stopPropagation()}
          onClick={() => setShowRenameModal(false)}
        >
          <div 
            className={`rounded-2xl p-6 shadow-2xl max-w-md w-full mx-4 max-h-[80vh] overflow-hidden flex flex-col ${
              darkMode ? 'bg-[#24283b] border border-[#565f89]' : 'bg-white'
            }`}
            style={{ touchAction: 'auto' }}
            onClick={(e) => e.stopPropagation()}
            onTouchStart={(e) => e.stopPropagation()}
          >
            <h3 className={`text-xl font-bold mb-4 ${darkMode ? 'text-[#c0caf5]' : 'text-gray-900'}`}>
              Přejmenovat
            </h3>

            <div className="flex-1 overflow-y-auto space-y-4 mb-4">
              {(renameDraft.pointIds.length === 0 && renameDraft.shapeIds.length === 0) ? (
                <div className={`text-sm ${darkMode ? 'text-[#9aa5ce]' : 'text-gray-600'}`}>
                  Vyber bod nebo tvar, který chceš přejmenovat.
                </div>
              ) : (
                <>
                  {/* Body */}
                  {renameDraft.pointIds.length > 0 && (
                    <div>
                      <div className={`text-xs font-medium mb-2 uppercase tracking-wider ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>Body</div>
                      <div className="space-y-2">
                        {renameDraft.pointIds.map(pid => {
                          const current = renameDraft.pointsById[pid] ?? '';
                          return (
                            <div key={pid} className="flex items-center gap-3">
                              <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                                darkMode ? 'bg-blue-900/50 text-blue-400' : 'bg-blue-100 text-blue-600'
                              } font-bold text-sm`}>
                                {current || '•'}
                              </div>
                              <input
                                type="text"
                                value={current}
                                placeholder="Název bodu"
                                onChange={(e) => {
                                  const next = e.target.value;
                                  setRenameDraft(prev => ({
                                    ...prev,
                                    pointsById: { ...prev.pointsById, [pid]: next },
                                  }));
                                }}
                                maxLength={3}
                                className={`flex-1 px-3 py-2 rounded-lg border text-center text-lg font-bold ${
                                  darkMode ? 'bg-[#414868] border-[#565f89] text-[#c0caf5]' : 'bg-white border-gray-300 text-gray-900'
                                } focus:outline-none focus:ring-2 focus:ring-blue-500`}
                              />
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Tvary (přímky, kružnice) - ne úsečky */}
                  {renameDraft.shapeIds.length > 0 && (
                    <div>
                      <div className={`text-xs font-medium mb-2 uppercase tracking-wider ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>Tvary</div>
                      <div className="space-y-2">
                        {renameDraft.shapeIds.map(sid => {
                          const shape = shapes.find(s => s.id === sid);
                          if (!shape || shape.type === 'segment') return null;
                          const typeLabel = shape.type === 'line' ? 'Přímka' : shape.type === 'lineDashed' ? 'Čárkovaná čára' : shape.type === 'lineDashDot' ? 'Čerchovaná čára' : shape.type === 'ray' ? 'Polopřímka' : shape.type === 'circle' ? 'Kružnice' : shape.type === 'circleArc' ? 'Výsek kružnice' : shape.type;
                          const current = renameDraft.shapesById[sid] ?? '';
                          return (
                            <div key={sid} className="flex items-center gap-3">
                              <div className={`px-2 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                                darkMode ? 'bg-purple-900/50 text-purple-400' : 'bg-purple-100 text-purple-600'
                              } font-medium text-xs`}>
                                {typeLabel}
                              </div>
                              <input
                                type="text"
                                value={current}
                                placeholder="Název tvaru"
                                onChange={(e) => {
                                  const next = e.target.value;
                                  setRenameDraft(prev => ({
                                    ...prev,
                                    shapesById: { ...prev.shapesById, [sid]: next },
                                  }));
                                }}
                                maxLength={5}
                                className={`flex-1 px-3 py-2 rounded-lg border text-center text-lg font-bold font-mono italic ${
                                  darkMode ? 'bg-[#414868] border-[#565f89] text-[#c0caf5]' : 'bg-white border-gray-300 text-gray-900'
                                } focus:outline-none focus:ring-2 focus:ring-blue-500`}
                              />
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>

            {(() => {
              const commitRename = () => {
                const pointEdits = renameDraft.pointIds.map(id => ({
                  id,
                  next: (renameDraft.pointsById[id] ?? '').trim(),
                }));
                const shapeEdits = renameDraft.shapeIds.map(id => ({
                  id,
                  next: (renameDraft.shapesById[id] ?? '').trim(),
                }));

                // Points must stay uniquely labeled (otherwise it looks like a point "disappeared").
                const existingPointLabels = new Set(
                  points
                    .filter(p => !p.hidden)
                    .filter(p => !pointEdits.some(e => e.id === p.id))
                    .map(p => p.label)
                    .filter(Boolean),
                );
                const nextPointLabels = new Set<string>();
                for (const e of pointEdits) {
                  if (!e.next) continue; // empty name is allowed => label disappears
                  if (existingPointLabels.has(e.next) || nextPointLabels.has(e.next)) {
                    toast.error(`Bod s názvem "${e.next}" už existuje.`);
                    return;
                  }
                  nextPointLabels.add(e.next);
                }

                const existingShapeLabels = new Set(
                  shapes
                    .filter(s => s.type !== 'segment')
                    .filter(s => !shapeEdits.some(e => e.id === s.id))
                    .map(s => s.label)
                    .filter(Boolean),
                );
                const nextShapeLabels = new Set<string>();
                for (const e of shapeEdits) {
                  if (!e.next) continue; // empty name is allowed => label disappears
                  if (existingShapeLabels.has(e.next) || nextShapeLabels.has(e.next)) {
                    toast.error(`Tvar s názvem "${e.next}" už existuje.`);
                    return;
                  }
                  nextShapeLabels.add(e.next);
                }

                setPoints(prev =>
                  prev.map(p => {
                    const upd = pointEdits.find(e => e.id === p.id);
                    return upd ? { ...p, hidden: false, label: upd.next } : p;
                  }),
                );
                setShapes(prev =>
                  prev.map(s => {
                    const upd = shapeEdits.find(e => e.id === s.id);
                    return upd ? { ...s, label: upd.next } : s;
                  }),
                );
                setShowRenameModal(false);
              };

              return (
                <button
                  onClick={commitRename}
                  onTouchEnd={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    commitRename();
                  }}
                  className="w-full py-3 rounded-xl font-bold text-white bg-blue-600 hover:bg-blue-500 transition-all"
                >
                  Hotovo
                </button>
              );
            })()}

          </div>
        </div>
      )}

      {/* Dialog: obrázek na pozadí (volný režim — stejná předloha jako při úkolu) */}
      {showBackgroundImageDialog && !embedInAssignment ? (
        <div
          className="fixed inset-0 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4"
          style={{ zIndex: 9998, touchAction: 'auto' }}
          onClick={() => setShowBackgroundImageDialog(false)}
          role="presentation"
        >
          <div
            className={`max-h-[min(92vh,720px)] w-full max-w-md overflow-y-auto rounded-2xl p-6 shadow-2xl ${
              darkMode ? 'border border-[#565f89] bg-[#24283b]' : 'bg-white'
            }`}
            style={{ touchAction: 'auto' }}
            onClick={e => e.stopPropagation()}
            onTouchStart={e => e.stopPropagation()}
          >
            <h3 className={`text-lg font-bold ${darkMode ? 'text-[#c0caf5]' : 'text-gray-900'}`}>
              Obrázek na pozadí plátna
            </h3>
            <p className={`mt-2 text-sm leading-relaxed ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
              Vyber obrázek z počítače (JPG, PNG, WebP…). Maximální velikost cca 1,5&nbsp;MB.
            </p>

            <input
              ref={backgroundImageInputRef}
              type="file"
              accept="image/*"
              className="sr-only"
              onChange={e => {
                onPickBackgroundFile(e.target.files?.[0]);
                e.target.value = '';
              }}
            />

            <div
              role="button"
              tabIndex={0}
              onKeyDown={e => {
                if (e.key === 'Enter' || e.key === ' ') backgroundImageInputRef.current?.click();
              }}
              onClick={() => backgroundImageInputRef.current?.click()}
              onDragOver={e => {
                e.preventDefault();
                e.stopPropagation();
              }}
              onDrop={e => {
                e.preventDefault();
                e.stopPropagation();
                onPickBackgroundFile(e.dataTransfer.files?.[0]);
              }}
              className={`mt-4 flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-4 py-8 text-center transition-colors ${
                darkMode
                  ? 'border-[#565f89] bg-[#1a1b26] hover:border-[#7aa2f7]/50'
                  : 'border-sky-200/80 bg-sky-50/40 hover:border-sky-300'
              }`}
            >
              <ImagePlus className={`size-10 stroke-[1.5] ${darkMode ? 'text-[#7aa2f7]' : 'text-sky-600'}`} aria-hidden />
              <span className={`text-sm font-medium ${darkMode ? 'text-[#c0caf5]' : 'text-slate-800'}`}>
                Klikni nebo přetáhni obrázek
              </span>
              <span className={`text-xs ${darkMode ? 'text-gray-500' : 'text-slate-500'}`}>max. 1,5&nbsp;MB</span>
            </div>

            {backgroundImageDraft ? (
              <div className="mt-4 space-y-3">
                <p className={`text-xs font-medium ${darkMode ? 'text-gray-400' : 'text-slate-600'}`}>Náhled</p>
                <div
                  className={`rounded-lg border p-2 ${darkMode ? 'border-[#565f89] bg-[#1a1b26]' : 'border-slate-200 bg-slate-200'}`}
                >
                  <img
                    src={backgroundImageDraft}
                    alt=""
                    className="max-h-48 w-full rounded-md object-contain"
                    style={{ opacity: backgroundImageDraftOpacity }}
                  />
                </div>
                <div
                  className="flex flex-wrap items-center gap-3"
                  onPointerDown={e => e.stopPropagation()}
                  onMouseDown={e => e.stopPropagation()}
                >
                  <span className={`text-xs font-medium ${darkMode ? 'text-gray-400' : 'text-slate-600'}`}>Průhlednost</span>
                  <input
                    type="range"
                    min={5}
                    max={90}
                    step={5}
                    value={(() => {
                      const raw = Math.round(backgroundImageDraftOpacity * 100);
                      return Math.min(90, Math.max(5, Math.round(raw / 5) * 5));
                    })()}
                    onInput={e => {
                      const v = Number((e.target as HTMLInputElement).value);
                      if (!Number.isFinite(v)) return;
                      setBackgroundImageDraftOpacity(v / 100);
                    }}
                    onChange={e => {
                      const v = Number(e.currentTarget.value);
                      if (!Number.isFinite(v)) return;
                      setBackgroundImageDraftOpacity(v / 100);
                    }}
                    className="min-h-9 min-w-[8rem] flex-1 text-slate-900"
                    style={{ touchAction: 'none' }}
                    aria-label="Průhlednost předlohy"
                  />
                  <span className="tabular-nums text-xs text-slate-500 dark:text-gray-400" aria-hidden>
                    {Math.round(backgroundImageDraftOpacity * 100)}&nbsp;%
                  </span>
                </div>
              </div>
            ) : null}

            <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:justify-end">
              <button
                type="button"
                onClick={() => setShowBackgroundImageDialog(false)}
                className={`rounded-xl px-4 py-3 text-sm font-medium ${
                  darkMode ? 'bg-gray-700 text-[#c0caf5] hover:bg-gray-600' : 'bg-gray-100 text-gray-800 hover:bg-gray-200'
                }`}
              >
                Zrušit
              </button>
              {freeProjection?.src ? (
                <>
                  <button
                    type="button"
                    onClick={hideFreeProjectionFromCanvas}
                    className={`rounded-xl px-4 py-3 text-sm font-medium ${
                      darkMode ? 'bg-[#414868] text-[#c0caf5] hover:bg-[#565f89]' : 'bg-slate-100 text-slate-800 hover:bg-slate-200'
                    }`}
                  >
                    Skrýt předlohu
                  </button>
                  <button
                    type="button"
                    onClick={removeFreeProjection}
                    className={`rounded-xl px-4 py-3 text-sm font-medium ${
                      darkMode ? 'bg-red-900/50 text-red-200 hover:bg-red-900/70' : 'bg-red-50 text-red-800 hover:bg-red-100'
                    }`}
                  >
                    Odstranit předlohu
                  </button>
                </>
              ) : null}
              <button
                type="button"
                disabled={!backgroundImageDraft}
                onClick={confirmBackgroundImage}
                className={`rounded-xl px-4 py-3 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50 ${
                  darkMode ? 'bg-[#7aa2f7] text-[#1a1b26] hover:bg-[#89b4fa]' : 'bg-[#1e1b4b] text-white hover:bg-[#2d2a5e]'
                }`}
              >
                Promítnout na plátno
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* POTVRZOVACÍ DIALOG - Zavření přehrávače/editoru */}
      {showCloseConfirm && (
        <div 
          className="fixed inset-0 flex items-center justify-center bg-black/60 backdrop-blur-sm"
          style={{ zIndex: 9999, touchAction: 'auto' }}
          onTouchStart={(e) => e.stopPropagation()}
          onTouchMove={(e) => e.stopPropagation()}
          onClick={() => setShowCloseConfirm(false)}
        >
          <div className={`rounded-2xl p-8 shadow-2xl max-w-sm w-full mx-4 ${
            darkMode ? 'bg-[#24283b] border border-[#565f89]' : 'bg-white'
          }`} style={{ touchAction: 'auto' }} onClick={(e) => e.stopPropagation()} onTouchStart={(e) => e.stopPropagation()}>
            <h3 className={`text-xl font-bold mb-3 ${darkMode ? 'text-[#c0caf5]' : 'text-gray-900'}`}>
              Určitě chcete zavřít?
            </h3>
            <p className={`mb-6 ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
              Uložili jste si odkaz na přehrávání?<br />Automaticky se neukládá.
            </p>
            <div className="flex gap-3">
              <button
                onTouchEnd={(e) => { e.preventDefault(); e.stopPropagation(); setShowCloseConfirm(false); }}
                onClick={() => setShowCloseConfirm(false)}
                className={`flex-1 py-3 rounded-xl font-medium transition-all ${
                  darkMode ? 'bg-gray-700 hover:bg-gray-600 text-[#c0caf5]' : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
                }`}
              >
                Zůstat
              </button>
              <button
                onTouchEnd={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setShowCloseConfirm(false);
                  if (sharedRecording) {
                    onBack();
                  } else {
                    const lastStep = recordingState.steps[recordingState.steps.length - 1];
                    if (lastStep) {
                      setPoints(lastStep.snapshot.points);
                      setShapes(lastStep.snapshot.shapes);
                      setFreehandPaths(lastStep.snapshot.freehandPaths);
                    }
                    setRecordingState(prev => ({
                      ...prev,
                      showEditor: false,
                      showPlayer: false,
                      currentStepIndex: -1
                    }));
                    setShareLink(null);
                    setRecordingName('');
                    setAnimState({ isActive: false, type: null, startTime: 0, p1: null, p2: null, progress: 0, arcSpan: undefined });
                  }
                }}
                onClick={() => {
                  setShowCloseConfirm(false);
                  if (sharedRecording) {
                    onBack();
                  } else {
                    const lastStep = recordingState.steps[recordingState.steps.length - 1];
                    if (lastStep) {
                      setPoints(lastStep.snapshot.points);
                      setShapes(lastStep.snapshot.shapes);
                      setFreehandPaths(lastStep.snapshot.freehandPaths);
                    }
                    setRecordingState(prev => ({
                      ...prev,
                      showEditor: false,
                      showPlayer: false,
                      currentStepIndex: -1
                    }));
                    setShareLink(null);
                    setRecordingName('');
                    setAnimState({ isActive: false, type: null, startTime: 0, p1: null, p2: null, progress: 0, arcSpan: undefined });
                  }
                }}
                className="flex-1 py-3 rounded-xl font-medium bg-red-500 hover:bg-red-400 text-white transition-all"
              >
                Zavřít
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
    </>
  );
}
