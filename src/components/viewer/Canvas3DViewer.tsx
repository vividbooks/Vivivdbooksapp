import React, { useRef, useEffect, useState, useCallback } from 'react';
import {
  type Point3D,
  type FaceData,
  type WireframeDimension,
  rotateXGlobal,
  rotateYGlobal,
  DEFAULT_COLOR_PALETTE,
  vecLength,
  sub,
  MODEL_SCALE,
} from '../geometry/shared';

interface Props {
  computeFaces: (unfoldProgress: number) => FaceData[];
  unfoldProgress: number;
  isWireframe: boolean;
  colorPalette?: string[];
  /** Posun středu projekce doprava (px) */
  offsetCenterX?: number;
  /** Barva pozadí plátna (např. pro sladění s obalem) */
  backgroundColor?: string;
  /** U válce, kužele, koule, jehlanu: popisky r, v místo délek hran */
  wireframeDimensions?: WireframeDimension[];
}

export function Canvas3DViewer({
  computeFaces,
  unfoldProgress,
  isWireframe,
  colorPalette = DEFAULT_COLOR_PALETTE,
  offsetCenterX = 0,
  backgroundColor = '#EFF1F8',
  wireframeDimensions,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [rotation, setRotation] = useState({ x: 0.4, y: 0.6 });
  const [zoom, setZoom] = useState(1);
  const [isDragging, setIsDragging] = useState(false);
  const [lastMouse, setLastMouse] = useState({ x: 0, y: 0 });
  const isDraggingRef = useRef(false);
  const animationRef = useRef<number>();
  const [forceRedraw, setForceRedraw] = useState(0);

  // ── Drawing ──────────────────────────────────────────────

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const cw = canvas.width;
    const ch = canvas.height;

    ctx.fillStyle = backgroundColor;
    ctx.fillRect(0, 0, cw, ch);
    if (cw === 0 || ch === 0) return;

    // 1. Compute face geometries
    const facesData = computeFaces(unfoldProgress);

    // 2. Camera: lerp toward top-down
    const effRotX = rotation.x * (1 - unfoldProgress) + (-Math.PI / 2) * unfoldProgress;
    const effRotY = rotation.y * (1 - unfoldProgress);

    // 3. Apply camera
    const rotatedFaces = facesData.map((face) => ({
      colorIndex: face.colorIndex,
      verts: face.vertices.map((v) => rotateYGlobal(rotateXGlobal(v, effRotX), effRotY)),
    }));

    // 4. Centroid and fixed reference scale (so changing params visibly changes size)
    let cx3 = 0, cy3 = 0, cz3 = 0, count = 0;
    for (const f of facesData) for (const v of f.vertices) { cx3 += v.x; cy3 += v.y; cz3 += v.z; count++; }
    if (count === 0) return;
    cx3 /= count; cy3 /= count; cz3 /= count;

    // Základní měřítko (o 20 % menší než předchozí 0.28)
    const REF_RADIUS = 50;
    const baseScale = Math.min(cw, ch) * 0.224 / REF_RADIUS;
    const projScale = baseScale * zoom;

    // 5. Střed projekce (posun doprava kvůli levé liště)
    const centroid = rotateYGlobal(rotateXGlobal({ x: cx3, y: cy3, z: cz3 }, effRotX), effRotY);
    const centerX = cw / 2 + offsetCenterX;
    const centerY = ch / 2;
    const project = (p: Point3D) => ({
      x: centerX + (p.x - centroid.x) * projScale,
      y: centerY + (p.y - centroid.y) * projScale,
    });

    // 6. Sort by depth
    const sorted = rotatedFaces
      .map((f) => ({ ...f, avgZ: f.verts.reduce((s, v) => s + v.z, 0) / f.verts.length }))
      .sort((a, b) => b.avgZ - a.avgZ);

    // 7. Render
    for (const { verts, colorIndex } of sorted) {
      const proj = verts.map((v) => project(v));
      ctx.beginPath();
      ctx.moveTo(proj[0].x, proj[0].y);
      for (let i = 1; i < proj.length; i++) ctx.lineTo(proj[i].x, proj[i].y);
      ctx.closePath();

      if (!isWireframe) {
        ctx.fillStyle = colorPalette[colorIndex % colorPalette.length];
        ctx.fill();
      }
      ctx.strokeStyle = isWireframe ? '#475569' : '#334155';
      ctx.lineWidth = isWireframe ? 2 : 1.5;
      ctx.stroke();
    }

    // 8. Ve drátěném režimu: popisky délek hran (hranatá tělesa) nebo r, v (válec, kužel, koule, jehlan)
    if (isWireframe && facesData.length > 0) {
      ctx.font = '600 13px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const padH = 6;
      const padV = 3;
      const corner = 4;

      const drawLabel = (projMid: { x: number; y: number }, text: string) => {
        const tm = ctx.measureText(text);
        const boxW = tm.width + padH * 2;
        const textHeight =
          (typeof tm.actualBoundingBoxAscent === 'number' && typeof tm.actualBoundingBoxDescent === 'number')
            ? tm.actualBoundingBoxAscent + tm.actualBoundingBoxDescent
            : 16;
        const boxH = textHeight + padV * 2;
        const x = projMid.x - boxW / 2;
        const y = projMid.y - boxH / 2;
        ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
        ctx.strokeStyle = 'rgba(51, 65, 85, 0.4)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        if (typeof ctx.roundRect === 'function') {
          ctx.roundRect(x, y, boxW, boxH, corner);
        } else {
          ctx.rect(x, y, boxW, boxH);
        }
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = '#1e293b';
        ctx.fillText(text, projMid.x, projMid.y);
      };

      if (wireframeDimensions && wireframeDimensions.length > 0) {
        for (const dim of wireframeDimensions) {
          const rotated = rotateYGlobal(rotateXGlobal(dim.position, effRotX), effRotY);
          const projMid = project(rotated);
          const text = `${dim.label} = ${dim.value}`;
          drawLabel(projMid, text);
        }
      } else {
        const edgeKey = (a: Point3D, b: Point3D) => {
          const r = (p: Point3D) => `${p.x.toFixed(4)},${p.y.toFixed(4)},${p.z.toFixed(4)}`;
          const k1 = r(a) + '|' + r(b);
          const k2 = r(b) + '|' + r(a);
          return k1 < k2 ? k1 : k2;
        };
        const edgeMap = new Map<string, { mid: Point3D; length: number }>();
        for (const face of facesData) {
          const verts = face.vertices;
          for (let i = 0; i < verts.length; i++) {
            const a = verts[i];
            const b = verts[(i + 1) % verts.length];
            const key = edgeKey(a, b);
            if (edgeMap.has(key)) continue;
            const lengthCm = vecLength(sub(b, a)) / MODEL_SCALE;
            edgeMap.set(key, {
              mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: (a.z + b.z) / 2 },
              length: lengthCm,
            });
          }
        }
        for (const { mid, length } of edgeMap.values()) {
          if (length < 0.05) continue;
          const rotated = rotateYGlobal(rotateXGlobal(mid, effRotX), effRotY);
          const projMid = project(rotated);
          const label = length >= 10 ? `${Math.round(length)} cm` : `${length.toFixed(1)} cm`;
          drawLabel(projMid, label);
        }
      }
    }
  }, [computeFaces, unfoldProgress, rotation, zoom, isWireframe, colorPalette, offsetCenterX, backgroundColor, wireframeDimensions, forceRedraw]);

  // ── Mouse ────────────────────────────────────────────────

  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    setLastMouse({ x: e.clientX, y: e.clientY });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    setRotation((r) => ({
      x: r.x + (e.clientY - lastMouse.y) * 0.008,
      y: r.y + (e.clientX - lastMouse.x) * 0.008,
    }));
    setLastMouse({ x: e.clientX, y: e.clientY });
  };

  const handleMouseUp = () => setIsDragging(false);

  // Touch support - use native listeners with { passive: false } to prevent page scroll
  const touchLastRef = useRef({ x: 0, y: 0 });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 1) {
        e.preventDefault();
        isDraggingRef.current = true;
        setIsDragging(true);
        touchLastRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
        setLastMouse({ x: e.touches[0].clientX, y: e.touches[0].clientY });
      }
    };

    const onTouchMove = (e: TouchEvent) => {
      if (!isDraggingRef.current || e.touches.length !== 1) return;
      e.preventDefault();
      const touch = e.touches[0];
      const dx = touch.clientX - touchLastRef.current.x;
      const dy = touch.clientY - touchLastRef.current.y;
      touchLastRef.current = { x: touch.clientX, y: touch.clientY };
      setLastMouse({ x: touch.clientX, y: touch.clientY });
      setRotation((r) => ({
        x: r.x + dy * 0.008,
        y: r.y + dx * 0.008,
      }));
    };

    const onTouchEnd = () => {
      isDraggingRef.current = false;
      setIsDragging(false);
    };

    canvas.addEventListener('touchstart', onTouchStart, { passive: false });
    canvas.addEventListener('touchmove', onTouchMove, { passive: false });
    canvas.addEventListener('touchend', onTouchEnd);
    canvas.addEventListener('touchcancel', onTouchEnd);

    return () => {
      canvas.removeEventListener('touchstart', onTouchStart);
      canvas.removeEventListener('touchmove', onTouchMove);
      canvas.removeEventListener('touchend', onTouchEnd);
      canvas.removeEventListener('touchcancel', onTouchEnd);
    };
  }, []);

  // ── Effects ──────────────────────────────────────────────

  useEffect(() => { setForceRedraw((p) => p + 1); }, [computeFaces, unfoldProgress, isWireframe]);

  useEffect(() => {
    const animate = () => { draw(); animationRef.current = requestAnimationFrame(animate); };
    animate();
    return () => { if (animationRef.current) cancelAnimationFrame(animationRef.current); };
  }, [draw]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ro = new ResizeObserver(() => {
      const c = canvas.parentElement;
      if (c) { canvas.width = c.clientWidth; canvas.height = c.clientHeight; setForceRedraw((p) => p + 1); }
    });
    const c = canvas.parentElement;
    if (c) { ro.observe(c); canvas.width = c.clientWidth; canvas.height = c.clientHeight; }
    return () => ro.disconnect();
  }, []);

  // Wheel zoom (passive: false aby fungoval preventDefault)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const delta = e.deltaY > 0 ? -0.08 : 0.08;
      setZoom((z) => Math.min(2.5, Math.max(0.2, z + delta)));
    };
    canvas.addEventListener('wheel', onWheel, { passive: false });
    return () => canvas.removeEventListener('wheel', onWheel);
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="w-full h-full cursor-grab active:cursor-grabbing"
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      style={{ minHeight: '400px', backgroundColor, touchAction: 'none' }}
    />
  );
}
