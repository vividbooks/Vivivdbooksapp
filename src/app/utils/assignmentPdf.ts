import type { GeometrySubmissionSnapshot } from '../../../rysovani/src/components/FreeGeometryEditor';
import {
  assignmentInstructionDisplay,
  type InstructionStepContent,
} from './instructionSteps';

export type AssignmentPdfSource = {
  id?: string;
  title?: string;
  instruction_text: string;
  instruction_image?: string | null;
  instruction_steps?: unknown;
  /** Aktuální plátna z otevřeného úkolu (po krocích). Přepíší výchozí náčrt zadání. */
  solutionSnapshots?: (GeometrySubmissionSnapshot | null)[];
  studentName?: string | null;
  studentNote?: string | null;
};

const PAGE_W = 1191;
const PAGE_H = 1684;
const MARGIN = 56;
const A4_PT_W = 595.28;
const A4_PT_H = 841.89;

type Pt = { id?: string; x: number; y: number; label?: string; hidden?: boolean };
type Sh = {
  type: string;
  label?: string;
  definition?: { p1Id?: string; p2Id?: string; arcSpan?: number };
};

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const paragraphs = text.replace(/\r\n/g, '\n').split('\n');
  const lines: string[] = [];
  for (const para of paragraphs) {
    if (!para.trim()) {
      lines.push('');
      continue;
    }
    const words = para.split(/\s+/);
    let cur = '';
    for (const word of words) {
      const next = cur ? `${cur} ${word}` : word;
      if (ctx.measureText(next).width <= maxWidth) {
        cur = next;
      } else {
        if (cur) lines.push(cur);
        cur = word;
      }
    }
    if (cur) lines.push(cur);
  }
  return lines;
}

function pointById(points: Pt[], id: string | undefined): Pt | undefined {
  if (!id) return undefined;
  return points.find(p => p.id === id);
}

function snapshotBounds(snap: GeometrySubmissionSnapshot): {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
} | null {
  const points = (snap.points ?? []) as Pt[];
  const shapes = (snap.shapes ?? []) as Sh[];
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let any = false;
  const add = (x: number, y: number) => {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    any = true;
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  };
  for (const p of points) {
    if (p.hidden) continue;
    add(p.x, p.y);
  }
  for (const path of snap.freehandPaths ?? []) {
    for (const q of path.points ?? []) add(q.x, q.y);
  }
  for (const s of shapes) {
    const p1 = pointById(points, s.definition?.p1Id);
    const p2 = pointById(points, s.definition?.p2Id);
    if ((s.type === 'circle' || s.type === 'circleArc') && p1 && p2) {
      const r = Math.hypot(p2.x - p1.x, p2.y - p1.y);
      if (r > 1) {
        add(p1.x - r, p1.y - r);
        add(p1.x + r, p1.y + r);
      }
    } else {
      if (p1) add(p1.x, p1.y);
      if (p2) add(p2.x, p2.y);
    }
  }
  if (!any) return null;
  const pad = Math.max(36, 0.12 * Math.max(maxX - minX, maxY - minY, 80));
  return { minX: minX - pad, minY: minY - pad, maxX: maxX + pad, maxY: maxY + pad };
}

/** Umístění názvu přímky / kružnice v souřadnicích PDF (už po `tx`/`ty`). */
function shapeLabelPdfPosition(
  type: string | undefined,
  a: { x: number; y: number },
  b: { x: number; y: number } | null,
): { x: number; y: number } {
  if ((type === 'circle' || type === 'circleArc') && b) {
    const r = Math.hypot(b.x - a.x, b.y - a.y);
    if (r > 1) {
      const th = Math.atan2(b.y - a.y, b.x - a.x);
      const pad = 18;
      return {
        x: a.x + Math.cos(th) * (r + pad),
        y: a.y + Math.sin(th) * (r + pad),
      };
    }
  }
  if (b) {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy) || 1;
    const t = type === 'ray' ? 0.55 : 0.5;
    const pad = 22;
    return {
      x: a.x + dx * t - (dy / len) * pad,
      y: a.y + dy * t + (dx / len) * pad,
    };
  }
  return { x: a.x + 16, y: a.y - 16 };
}

function drawSnapshot(
  ctx: CanvasRenderingContext2D,
  snap: GeometrySubmissionSnapshot,
  box: { x: number; y: number; w: number; h: number },
) {
  const bounds = snapshotBounds(snap);
  ctx.save();
  ctx.beginPath();
  ctx.rect(box.x, box.y, box.w, box.h);
  ctx.clip();
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(box.x, box.y, box.w, box.h);
  ctx.strokeStyle = '#cbd5e1';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(box.x + 0.75, box.y + 0.75, box.w - 1.5, box.h - 1.5);

  if (!bounds) {
    ctx.restore();
    return;
  }

  const bw = Math.max(1, bounds.maxX - bounds.minX);
  const bh = Math.max(1, bounds.maxY - bounds.minY);
  const inner = 18;
  const scale = Math.min((box.w - inner * 2) / bw, (box.h - inner * 2) / bh);
  const ox = box.x + (box.w - bw * scale) / 2;
  const oy = box.y + (box.h - bh * scale) / 2;
  const tx = (x: number) => ox + (x - bounds.minX) * scale;
  const ty = (y: number) => oy + (y - bounds.minY) * scale;

  const points = (snap.points ?? []) as Pt[];
  const shapes = (snap.shapes ?? []) as Sh[];
  const visible = (id?: string) => {
    const p = pointById(points, id);
    return p ? { x: tx(p.x), y: ty(p.y), label: p.label, hidden: p.hidden } : null;
  };

  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = '#111827';
  ctx.fillStyle = '#111827';

  for (const s of shapes) {
    const a = visible(s.definition?.p1Id);
    const b = visible(s.definition?.p2Id);
    if (!a) continue;
    const dashed = s.type === 'lineDashed' || s.type === 'lineDashDot';
    ctx.setLineDash(dashed ? [8, 6] : []);
    ctx.lineWidth = s.type === 'circle' || s.type === 'circleArc' ? 1.8 : 2;

    if (s.type === 'circle' && b) {
      const r = Math.hypot(b.x - a.x, b.y - a.y);
      if (r > 1) {
        ctx.beginPath();
        ctx.arc(a.x, a.y, r, 0, Math.PI * 2);
        ctx.stroke();
      }
    } else if (s.type === 'circleArc' && b) {
      const r = Math.hypot(b.x - a.x, b.y - a.y);
      const span = s.definition?.arcSpan ?? (2 * Math.PI) / 3;
      const th = Math.atan2(b.y - a.y, b.x - a.x);
      if (r > 1) {
        ctx.beginPath();
        ctx.arc(a.x, a.y, r, th - span / 2, th + span / 2);
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
      const k = 2000 / len;
      ctx.beginPath();
      ctx.moveTo(a.x - dx * k, a.y - dy * k);
      ctx.lineTo(a.x + dx * k, a.y + dy * k);
      ctx.stroke();
    } else if (s.type === 'ray' && b) {
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const len = Math.hypot(dx, dy) || 1;
      const k = 2000 / len;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(a.x + dx * k, a.y + dy * k);
      ctx.stroke();
    }

    if (s.label) {
      ctx.setLineDash([]);
      ctx.font = 'italic 18px Georgia, "Times New Roman", serif';
      ctx.fillStyle = '#111827';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const pos = shapeLabelPdfPosition(s.type, a, b);
      ctx.fillText(s.label, pos.x, pos.y);
    }
  }

  ctx.setLineDash([]);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const path of snap.freehandPaths ?? []) {
    const pts = path.points ?? [];
    if (pts.length < 2) continue;
    ctx.beginPath();
    ctx.moveTo(tx(pts[0]!.x), ty(pts[0]!.y));
    for (let i = 1; i < pts.length; i++) ctx.lineTo(tx(pts[i]!.x), ty(pts[i]!.y));
    ctx.strokeStyle = path.color || '#111827';
    ctx.lineWidth = Math.max(1.2, (path.width || 2) * 1.4);
    ctx.globalAlpha = path.isHighlight ? 0.45 : 1;
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  ctx.strokeStyle = '#111827';
  ctx.lineWidth = 2.4;
  ctx.lineCap = 'round';
  for (const p of points) {
    if (p.hidden) continue;
    const x = tx(p.x);
    const y = ty(p.y);
    const arm = 7;
    ctx.beginPath();
    ctx.moveTo(x, y - arm);
    ctx.lineTo(x, y + arm);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x - arm, y);
    ctx.lineTo(x + arm, y);
    ctx.stroke();
    if (p.label) {
      ctx.fillStyle = '#111827';
      ctx.font = 'italic 22px Georgia, "Times New Roman", serif';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'bottom';
      ctx.fillText(p.label, x + 8, y - 6);
    }
  }
  ctx.restore();
}

async function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise(resolve => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

function drawImageContain(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  box: { x: number; y: number; w: number; h: number },
) {
  const scale = Math.min(box.w / img.naturalWidth, box.h / img.naturalHeight);
  const w = img.naturalWidth * scale;
  const h = img.naturalHeight * scale;
  const x = box.x + (box.w - w) / 2;
  const y = box.y + (box.h - h) / 2;
  ctx.drawImage(img, x, y, w, h);
}

function canvasToJpegBytes(canvas: HTMLCanvasElement, quality = 0.88): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      async blob => {
        if (!blob) {
          reject(new Error('Export JPEG selhal'));
          return;
        }
        const buf = await blob.arrayBuffer();
        resolve(new Uint8Array(buf));
      },
      'image/jpeg',
      quality,
    );
  });
}

function jpegsToPdf(pages: Uint8Array[]): Blob {
  const enc = new TextEncoder();
  const chunks: Uint8Array[] = [];
  let pos = 0;
  const offsets: number[] = [0];
  const write = (data: string | Uint8Array) => {
    const u = typeof data === 'string' ? enc.encode(data) : data;
    chunks.push(u);
    pos += u.length;
  };
  const startObj = () => {
    offsets.push(pos);
  };

  write('%PDF-1.4\n');
  startObj();
  write('1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj\n');

  const pageIds: number[] = [];
  let nextId = 3;
  const pageRecords: { pageId: number; contentId: number; imageId: number; bytes: Uint8Array }[] =
    [];
  for (const bytes of pages) {
    const pageId = nextId++;
    const contentId = nextId++;
    const imageId = nextId++;
    pageIds.push(pageId);
    pageRecords.push({ pageId, contentId, imageId, bytes });
  }

  startObj();
  write(
    `2 0 obj << /Type /Pages /Count ${pageIds.length} /Kids [${pageIds.map(id => `${id} 0 R`).join(' ')}] >> endobj\n`,
  );

  for (const rec of pageRecords) {
    const content = `q ${A4_PT_W.toFixed(2)} 0 0 ${A4_PT_H.toFixed(2)} 0 0 cm /Im0 Do Q\n`;
    startObj();
    write(
      `${rec.pageId} 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 ${A4_PT_W.toFixed(2)} ${A4_PT_H.toFixed(2)}] /Resources << /XObject << /Im0 ${rec.imageId} 0 R >> >> /Contents ${rec.contentId} 0 R >> endobj\n`,
    );
    startObj();
    write(`${rec.contentId} 0 obj << /Length ${content.length} >> stream\n${content}endstream endobj\n`);
    startObj();
    write(
      `${rec.imageId} 0 obj << /Type /XObject /Subtype /Image /Width ${PAGE_W} /Height ${PAGE_H} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${rec.bytes.length} >> stream\n`,
    );
    write(rec.bytes);
    write('\nendstream endobj\n');
  }

  const xrefPos = pos;
  write(`xref\n0 ${nextId}\n`);
  write('0000000000 65535 f \n');
  for (let i = 1; i < nextId; i++) {
    write(`${String(offsets[i] ?? 0).padStart(10, '0')} 00000 n \n`);
  }
  write(`trailer << /Size ${nextId} /Root 1 0 R >>\nstartxref\n${xrefPos}\n%%EOF\n`);

  const total = chunks.reduce((n, c) => n + c.length, 0);
  const out = new Uint8Array(total);
  let o = 0;
  for (const c of chunks) {
    out.set(c, o);
    o += c.length;
  }
  return new Blob([out], { type: 'application/pdf' });
}

function filenameFromTitle(title: string): string {
  const base = title
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60);
  return `${base || 'ukol'}.pdf`;
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1500);
}

function snapshotIsEmpty(snap: GeometrySubmissionSnapshot): boolean {
  const pts = (snap.points ?? []).filter(p => !(p as Pt).hidden);
  return pts.length === 0 && (snap.shapes ?? []).length === 0 && (snap.freehandPaths ?? []).length === 0;
}

function stepsOf(row: AssignmentPdfSource): {
  title: string;
  fallbackImage: string | null;
  steps: InstructionStepContent[];
} {
  const title = row.title?.trim() || 'Úkol';
  const fallbackImage = row.instruction_image?.trim() || null;
  const view = assignmentInstructionDisplay({
    id: row.id,
    instruction_steps: row.instruction_steps,
    instruction_text: row.instruction_text,
  });
  const steps: InstructionStepContent[] =
    view.kind === 'steps'
      ? view.steps
      : [{ text: view.text, image: fallbackImage, canvasSnapshot: null }];
  const solutions = row.solutionSnapshots;
  if (solutions && solutions.length > 0) {
    const merged = steps.map((step, i) => ({
      ...step,
      canvasSnapshot: solutions[i] ?? solutions[solutions.length - 1] ?? step.canvasSnapshot,
    }));
    for (let i = merged.length; i < solutions.length; i++) {
      merged.push({
        text: '',
        image: null,
        canvasSnapshot: solutions[i] ?? null,
      });
    }
    return { title, fallbackImage, steps: merged };
  }
  return { title, fallbackImage, steps };
}

async function renderStepPage(opts: {
  title: string;
  step: InstructionStepContent;
  fallbackImage: string | null;
  headerLeft: string;
  headerRight: string;
  pageLabel: string;
  studentLine?: string;
  note?: string;
}): Promise<HTMLCanvasElement> {
  const canvas = document.createElement('canvas');
  canvas.width = PAGE_W;
  canvas.height = PAGE_H;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D není dostupný');

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, PAGE_W, PAGE_H);

  let y = MARGIN;
  ctx.fillStyle = '#64748b';
  ctx.font = '600 13px system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText(opts.headerLeft, MARGIN, y);
  ctx.textAlign = 'right';
  ctx.fillText(opts.headerRight, PAGE_W - MARGIN, y);
  y += 28;

  ctx.textAlign = 'left';
  ctx.fillStyle = '#0f172a';
  ctx.font = '700 28px system-ui, sans-serif';
  const titleLines = wrapText(ctx, opts.title || 'Úkol', PAGE_W - MARGIN * 2);
  for (const line of titleLines.slice(0, 3)) {
    ctx.fillText(line, MARGIN, y);
    y += 34;
  }
  if (opts.studentLine) {
    ctx.fillStyle = '#334155';
    ctx.font = '18px system-ui, sans-serif';
    ctx.fillText(opts.studentLine, MARGIN, y);
    y += 26;
  }
  y += 10;

  ctx.strokeStyle = '#e2e8f0';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(MARGIN, y);
  ctx.lineTo(PAGE_W - MARGIN, y);
  ctx.stroke();
  y += 22;

  if (opts.note) {
    ctx.fillStyle = '#475569';
    ctx.font = '16px system-ui, sans-serif';
    const noteLines = wrapText(ctx, `Poznámka: ${opts.note}`, PAGE_W - MARGIN * 2);
    for (const line of noteLines.slice(0, 5)) {
      ctx.fillText(line, MARGIN, y);
      y += 22;
    }
    y += 10;
  }

  const body = opts.step.text.trim();
  if (body) {
    ctx.fillStyle = '#1e293b';
    ctx.font = '20px system-ui, sans-serif';
    const lines = wrapText(ctx, body, PAGE_W - MARGIN * 2);
    for (const line of lines) {
      if (y > PAGE_H - MARGIN - 80) break;
      ctx.fillText(line || ' ', MARGIN, y);
      y += 28;
    }
    y += 16;
  }

  const figTop = y;
  const figH = Math.max(280, PAGE_H - MARGIN - 36 - figTop);
  const figBox = { x: MARGIN, y: figTop, w: PAGE_W - MARGIN * 2, h: figH };

  const imgSrc = opts.step.image || opts.fallbackImage;
  if (opts.step.canvasSnapshot && !snapshotIsEmpty(opts.step.canvasSnapshot)) {
    drawSnapshot(ctx, opts.step.canvasSnapshot, figBox);
  } else if (imgSrc) {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(figBox.x, figBox.y, figBox.w, figBox.h);
    ctx.strokeStyle = '#cbd5e1';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(figBox.x + 0.75, figBox.y + 0.75, figBox.w - 1.5, figBox.h - 1.5);
    const img = await loadImage(imgSrc);
    if (img) {
      drawImageContain(ctx, img, {
        ...figBox,
        x: figBox.x + 12,
        y: figBox.y + 12,
        w: figBox.w - 24,
        h: figBox.h - 24,
      });
    }
  } else {
    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(figBox.x, figBox.y, figBox.w, figBox.h);
    ctx.strokeStyle = '#cbd5e1';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([7, 6]);
    ctx.strokeRect(figBox.x + 0.75, figBox.y + 0.75, figBox.w - 1.5, figBox.h - 1.5);
    ctx.setLineDash([]);
    ctx.fillStyle = '#94a3b8';
    ctx.font = '16px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('Místo pro konstrukci', PAGE_W / 2, figBox.y + figBox.h / 2);
  }

  ctx.fillStyle = '#94a3b8';
  ctx.font = '12px system-ui, sans-serif';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'bottom';
  ctx.fillText(opts.pageLabel, PAGE_W - MARGIN, PAGE_H - 22);

  return canvas;
}

async function renderCoverPage(opts: {
  heading: string;
  subheading: string;
  titles: string[];
}): Promise<HTMLCanvasElement> {
  const canvas = document.createElement('canvas');
  canvas.width = PAGE_W;
  canvas.height = PAGE_H;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D není dostupný');

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, PAGE_W, PAGE_H);

  let y = MARGIN + 40;
  ctx.fillStyle = '#64748b';
  ctx.font = '600 14px system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText('Rýsování · pracovní listy', MARGIN, y);
  y += 48;

  ctx.fillStyle = '#0f172a';
  ctx.font = '700 36px system-ui, sans-serif';
  ctx.fillText(opts.heading, MARGIN, y);
  y += 48;
  ctx.fillStyle = '#334155';
  ctx.font = '22px system-ui, sans-serif';
  ctx.fillText(opts.subheading, MARGIN, y);
  y += 36;

  ctx.strokeStyle = '#e2e8f0';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(MARGIN, y);
  ctx.lineTo(PAGE_W - MARGIN, y);
  ctx.stroke();
  y += 28;

  ctx.font = '20px system-ui, sans-serif';
  const colW = (PAGE_W - MARGIN * 2 - 32) / 2;
  const colX = [MARGIN, MARGIN + colW + 32];
  const startY = y;
  const maxY = PAGE_H - MARGIN - 24;
  const lineH = 32;
  const perCol = Math.max(1, Math.floor((maxY - startY) / lineH));

  for (let i = 0; i < opts.titles.length; i++) {
    const col = Math.floor(i / perCol);
    if (col > 1) break;
    const row = i % perCol;
    const x = colX[col] ?? MARGIN;
    const ty = startY + row * lineH;
    ctx.fillStyle = '#64748b';
    ctx.font = '600 18px system-ui, sans-serif';
    ctx.fillText(`${i + 1}.`, x, ty);
    ctx.fillStyle = '#0f172a';
    ctx.font = '20px system-ui, sans-serif';
    const numW = ctx.measureText(`${i + 1}.  `).width;
    const title = opts.titles[i] ?? '';
    const lines = wrapText(ctx, title, colW - numW);
    ctx.fillText(lines[0] ?? title, x + 36, ty);
  }

  return canvas;
}

export async function buildAssignmentsPdfBlob(
  rows: AssignmentPdfSource[],
  collection?: { heading: string; subheading: string },
): Promise<Blob> {
  if (rows.length === 0) throw new Error('Žádné úkoly k exportu.');
  const pages: Uint8Array[] = [];
  if (collection) {
    const cover = await renderCoverPage({
      heading: collection.heading,
      subheading: collection.subheading,
      titles: rows.map(r => r.title?.trim() || 'Úkol'),
    });
    pages.push(await canvasToJpegBytes(cover));
  }

  for (let t = 0; t < rows.length; t++) {
    const row = rows[t]!;
    const { title, fallbackImage, steps } = stepsOf(row);
    for (let i = 0; i < steps.length; i++) {
      const canvas = await renderStepPage({
        title,
        step: steps[i]!,
        fallbackImage,
        headerLeft: collection?.heading
          ? `${collection.heading} · pracovní list`
          : row.studentName?.trim()
            ? `Odevzdání · ${row.studentName.trim()}`
            : row.solutionSnapshots?.length
              ? 'Rýsování · zadání s řešením'
              : 'Rýsování · pracovní list',
        headerRight:
          rows.length > 1
            ? `Úkol ${t + 1} / ${rows.length}${steps.length > 1 ? ` · krok ${i + 1}/${steps.length}` : ''}`
            : steps.length > 1
              ? `Krok ${i + 1} / ${steps.length}`
              : 'Úkol',
        pageLabel: String(pages.length + 1),
        studentLine: row.studentName?.trim() ? `Student: ${row.studentName.trim()}` : undefined,
        note: i === 0 ? row.studentNote?.trim() || undefined : undefined,
      });
      pages.push(await canvasToJpegBytes(canvas));
    }
  }
  return jpegsToPdf(pages);
}

export async function downloadAssignmentPdf(row: AssignmentPdfSource): Promise<void> {
  const title = row.title?.trim() || 'Úkol';
  const pdf = await buildAssignmentsPdfBlob([row]);
  const parts = [title];
  if (row.studentName?.trim()) parts.push(row.studentName.trim());
  if (row.solutionSnapshots?.length) parts.push('s-resenim');
  downloadBlob(pdf, filenameFromTitle(parts.join(' ')));
}

export async function downloadAssignmentsPdf(
  rows: AssignmentPdfSource[],
  filename: string,
  collection?: { heading: string; subheading: string },
): Promise<void> {
  const pdf = await buildAssignmentsPdfBlob(rows, collection);
  downloadBlob(pdf, filenameFromTitle(filename.replace(/\.pdf$/i, '')));
}
