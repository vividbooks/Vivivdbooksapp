import { useEffect, useRef, useState } from 'react';
import { 
  ArrowLeft,
  FileText
} from 'lucide-react';
import { useIsMobile } from './ui/use-mobile';
import { BigNumberInput } from './BigNumberInput';
import { ConstructionControlPanel } from './ConstructionControlPanel';
import { ConstructionStepLog, StepNotation } from './ConstructionStepLog';

interface Point {
  x: number;
  y: number;
}

interface AngleTriangleConstructionProps {
  onBack: () => void;
  darkMode: boolean;
  onDarkModeChange: (dark: boolean) => void;
}

export function AngleTriangleConstruction({ onBack, darkMode, onDarkModeChange }: AngleTriangleConstructionProps) {
  const isMobile = useIsMobile();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const bufferCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const animationFrameRef = useRef<number>();
  const [currentStep, setCurrentStep] = useState(0);
  const [scale, setScale] = useState(isMobile ? 0.2 : 0.4);
  const [offset, setOffset] = useState<Point>({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState<Point>({ x: 0, y: 0 });
  const [canvasSize, setCanvasSize] = useState({ width: 1920, height: 1080 });
  const [animProgress, setAnimProgress] = useState(0);
  const [isAnimating, setIsAnimating] = useState(true);
  const [showCaptions, setShowCaptions] = useState(true);
  const [showProtocol, setShowProtocol] = useState(false);
  
  const stepNotations: StepNotation[] = [
    {
      notation: 'AB',
      description: 'Narýsuj základnu AB',
      type: 'segment'
    },
    {
      notation: '∠α = ...°',
      description: 'Zadej úhel α při vrcholu A',
      type: 'angle'
    },
    {
      notation: 'paprsek z A',
      description: 'Narýsuj paprsek z bodu A pod úhlem α',
      type: 'line'
    },
    {
      notation: '∠β = ...°',
      description: 'Zadej úhel β při vrcholu B',
      type: 'angle'
    },
    {
      notation: 'paprsek z B',
      description: 'Narýsuj paprsek z bodu B pod úhlem β',
      type: 'line'
    },
    {
      notation: 'C = paprsek z A ∩ paprsek z B',
      description: 'Označ průsečík paprsků jako bod C',
      type: 'point'
    },
    {
      notation: 'AC, BC',
      description: 'Dorýsuj strany AC a BC',
      type: 'segment'
    },
    {
      notation: 'ABC',
      description: 'Opsat trojúhelník ABC',
      type: 'segment'
    }
  ];
  
  const rulerImageRef = useRef<HTMLImageElement | null>(null);
  const [rulerLoaded, setRulerLoaded] = useState(false);
  
  const [pointA, setPointA] = useState<Point>({ x: 860, y: 900 });
  const [pointB, setPointB] = useState<Point>({ x: 1460, y: 900 });
  const [pointC, setPointC] = useState<Point | null>(null);
  const [draggedPoint, setDraggedPoint] = useState<'A' | 'B' | 'C' | null>(null);
  const [hoveredPoint, setHoveredPoint] = useState<'A' | 'B' | 'C' | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);
  
  const [isPinching, setIsPinching] = useState(false);
  const [initialPinchDistance, setInitialPinchDistance] = useState(0);
  const [initialPinchScale, setInitialPinchScale] = useState(1);
  const [pinchCenter, setPinchCenter] = useState<Point>({ x: 0, y: 0 });

  // Interaktivní zadávání parametrů
  const [sideAB, setSideAB] = useState<number | null>(null);
  const [angleAlpha, setAngleAlpha] = useState<number | null>(null); // úhel při A
  const [angleBeta, setAngleBeta] = useState<number | null>(null);   // úhel při B
  const [inputError, setInputError] = useState('');
  const [waitingForInput, setWaitingForInput] = useState(true);
  const [initialSegmentLength, setInitialSegmentLength] = useState<number | null>(null); // Původní délka AB v pixelech
  const [initialSideAB, setInitialSideAB] = useState<number | null>(null); // Původní délka AB v cm

  // Vypočítat délku základny v pixelech
  const segmentLengthAB = Math.sqrt(
    Math.pow(pointB.x - pointA.x, 2) + Math.pow(pointB.y - pointA.y, 2)
  );

  // Vypočítat bod C z úhlů podle učebnice
  const calculatePointCFromAngles = (): Point | null => {
    if (!angleAlpha || !angleBeta || !sideAB) return null;
    
    // Zkontrolovat, zda úhly dávají smysl (součet < 180°)
    if (angleAlpha + angleBeta >= 180) return null;
    
    // Úhel směru AB (vůči horizontále)
    const baseAngle = Math.atan2(pointB.y - pointA.y, pointB.x - pointA.x);
    
    // Převod úhlů na radiány
    const alphaRad = (angleAlpha * Math.PI) / 180;
    const betaRad = (angleBeta * Math.PI) / 180;
    
    // PODLE UČEBNICE:
    // Úhel při vrcholu A (alpha) se měří od strany AB
    // Paprsek z A jde pod úhlem alpha NAHORU od AB (proti směru hodinových ručiček)
    const rayAAngle = baseAngle + alphaRad;
    
    // Úhel při vrcholu B (beta) se měří od strany BA (opačný směr než AB)
    // BA má směr baseAngle + 180°
    // Paprsek z B jde pod úhlem beta DOLŮ od BA (po směru hodinových ručiček)
    // Pro vnitřní úhel: od BA směru odečítáme beta
    const rayBAngle = baseAngle + Math.PI - betaRad;
    
    // Vypočítat průsečík pomocí parametrických rovnic (lepší než tangens)
    // Přímka z A: P = A + t * (cos(rayAAngle), sin(rayAAngle))
    // Přímka z B: P = B + s * (cos(rayBAngle), sin(rayBAngle))
    
    const dirAx = Math.cos(rayAAngle);
    const dirAy = Math.sin(rayAAngle);
    const dirBx = Math.cos(rayBAngle);
    const dirBy = Math.sin(rayBAngle);
    
    // Soustava rovnic:
    // pointA.x + t * dirAx = pointB.x + s * dirBx
    // pointA.y + t * dirAy = pointB.y + s * dirBy
    //
    // t * dirAx - s * dirBx = pointB.x - pointA.x
    // t * dirAy - s * dirBy = pointB.y - pointA.y
    
    const dx = pointB.x - pointA.x;
    const dy = pointB.y - pointA.y;
    
    // Determinant
    const det = dirAx * (-dirBy) - dirAy * (-dirBx);
    
    if (Math.abs(det) < 0.0001) return null; // Paprsky jsou rovnoběžné
    
    // Cramerovo pravidlo
    const t = (dx * (-dirBy) - dy * (-dirBx)) / det;
    
    const x = pointA.x + t * dirAx;
    const y = pointA.y + t * dirAy;
    
    return { x, y };
  };

  // Vypočítat úhly z pozic bodů
  const calculateAnglesFromPoints = (a: Point, b: Point, c: Point) => {
    const baseAngle = Math.atan2(b.y - a.y, b.x - a.x);
    
    // Úhel alpha (úhel při A)
    const angleToC = Math.atan2(c.y - a.y, c.x - a.x);
    let alphaRad = angleToC - baseAngle;
    
    // Normalizovat do rozsahu 0-2π
    while (alphaRad < 0) alphaRad += 2 * Math.PI;
    while (alphaRad > 2 * Math.PI) alphaRad -= 2 * Math.PI;
    
    // Chceme vnitřní úhel (menší než 180°)
    if (alphaRad > Math.PI) alphaRad = 2 * Math.PI - alphaRad;
    
    const alpha = Math.round((alphaRad * 180) / Math.PI);
    
    // Úhel beta (úhel při B)
    const angleToCFromB = Math.atan2(c.y - b.y, c.x - b.x);
    const angleBA = baseAngle + Math.PI;
    let betaRad = angleBA - angleToCFromB;
    
    // Normalizovat do rozsahu 0-2π
    while (betaRad < 0) betaRad += 2 * Math.PI;
    while (betaRad > 2 * Math.PI) betaRad -= 2 * Math.PI;
    
    // Chceme vnitřní úhel (menší než 180°)
    if (betaRad > Math.PI) betaRad = 2 * Math.PI - betaRad;
    
    const beta = Math.round((betaRad * 180) / Math.PI);
    
    return { alpha, beta };
  };

  // Uložit původní délku AB při prvním zadání
  useEffect(() => {
    if (sideAB && !initialSegmentLength && segmentLengthAB > 0) {
      setInitialSegmentLength(segmentLengthAB);
      setInitialSideAB(sideAB);
    }
  }, [sideAB, initialSegmentLength, segmentLengthAB]);

  // Přepočítat sideAB při změně pozice bodů A nebo B
  useEffect(() => {
    if (initialSegmentLength && initialSideAB && (draggedPoint === 'A' || draggedPoint === 'B')) {
      // Měřítko: kolik cm je 1 pixel (použít PŮVODNÍ hodnoty)
      const cmPerPixel = initialSideAB / initialSegmentLength;
      // Nová délka v cm podle aktuální pixelové vzdálenosti
      const newSideAB = Math.round(segmentLengthAB * cmPerPixel * 10) / 10;
      setSideAB(newSideAB);
    }
  }, [segmentLengthAB, draggedPoint, initialSegmentLength, initialSideAB]);

  // Pokud nemáme pointC v state a můžeme ho vypočítat z úhlů, použijeme to
  useEffect(() => {
    if (!pointC && currentStep >= 5 && angleAlpha && angleBeta && sideAB) {
      const calculatedC = calculatePointCFromAngles();
      if (calculatedC) {
        setPointC(calculatedC);
      }
    }
  }, [currentStep, angleAlpha, angleBeta, pointA, pointB, sideAB, pointC]);

  // Když se pohnou body A nebo B (ale ne C), přepočítáme bod C z úhlů
  useEffect(() => {
    if (pointC && draggedPoint !== 'C' && (draggedPoint === 'A' || draggedPoint === 'B') && angleAlpha && angleBeta && sideAB) {
      const calculatedC = calculatePointCFromAngles();
      if (calculatedC) {
        setPointC(calculatedC);
      }
    }
  }, [pointA, pointB, draggedPoint, angleAlpha, angleBeta, sideAB, pointC]);

  // Když se pohne bod C, přepočítáme úhly
  useEffect(() => {
    if (pointC && draggedPoint === 'C') {
      const angles = calculateAnglesFromPoints(pointA, pointB, pointC);
      if (angles.alpha > 0 && angles.alpha < 180 && angles.beta > 0 && angles.beta < 180) {
        setAngleAlpha(angles.alpha);
        setAngleBeta(angles.beta);
      }
    }
  }, [pointC, pointA, pointB, draggedPoint]);

  useEffect(() => {
    if (!bufferCanvasRef.current) {
      bufferCanvasRef.current = document.createElement('canvas');
    }
  }, []);

  useEffect(() => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      rulerImageRef.current = img;
      setRulerLoaded(true);
    };
    img.onerror = () => console.error('Failed to load ruler image');
    img.src = 'https://jjpiguuubvmiobmixwgh.supabase.co/storage/v1/object/public/Admin%20math/pravitko4.svg';
  }, []);

  const screenToWorld = (screenX: number, screenY: number): Point => {
    return {
      x: (screenX - offset.x) / scale,
      y: (screenY - offset.y) / scale
    };
  };

  const isPointHovered = (point: Point, mouseWorld: Point, threshold: number = 15): boolean => {
    const dx = point.x - mouseWorld.x;
    const dy = point.y - mouseWorld.y;
    return Math.sqrt(dx * dx + dy * dy) < threshold;
  };

  const isLabelHovered = (point: Point, mouseScreen: Point, labelOffset: { x: number, y: number }): boolean => {
    const screenX = point.x * scale + offset.x;
    const screenY = point.y * scale + offset.y;
    
    const labelX = screenX + labelOffset.x;
    const labelY = screenY + labelOffset.y;
    const labelRadius = 20;
    
    const dx = mouseScreen.x - labelX;
    const dy = mouseScreen.y - (labelY - 8);
    return Math.sqrt(dx * dx + dy * dy) < labelRadius;
  };

  const centerView = () => {
    if (!canvasSize.width || !canvasSize.height) return;
    
    const centerX = (pointA.x + pointB.x) / 2;
    const centerY = pointA.y;
    
    const canvasCenterX = canvasSize.width / 2;
    const canvasCenterY = canvasSize.height / 2;
    
    setOffset({
      x: canvasCenterX - centerX * scale,
      y: canvasCenterY - centerY * scale
    });
  };

  useEffect(() => {
    const handleResize = () => {
      if (containerRef.current) {
        setCanvasSize({
          width: containerRef.current.clientWidth,
          height: containerRef.current.clientHeight
        });
      }
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    if (canvasSize.width > 0 && canvasSize.height > 0) {
      centerView();
      if (!isInitialized) {
        setIsInitialized(true);
      }
    }
  }, [canvasSize.width, canvasSize.height, isInitialized]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const bufferCanvas = bufferCanvasRef.current;
    if (!canvas || !bufferCanvas) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = canvasSize.width * dpr;
    canvas.height = canvasSize.height * dpr;
    bufferCanvas.width = canvasSize.width * dpr;
    bufferCanvas.height = canvasSize.height * dpr;
  }, [canvasSize]);

  useEffect(() => {
    if (isAnimating && animProgress < 1 && !waitingForInput) {
      animationFrameRef.current = requestAnimationFrame(() => {
        setAnimProgress(prev => Math.min(prev + 0.008, 1));
      });
    } else if (animProgress >= 1) {
      setIsAnimating(false);
    }
    
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [isAnimating, animProgress, waitingForInput]);

  const handleInputSubmit = () => {
    setInputError('');
    
    if (currentStep === 0) {
      // Zadání délky AB
      if (sideAB === null || sideAB < 0) {
        setInputError('Zadej prosím platnou délku (0-99 cm)');
        return;
      }
      if (sideAB === 0) {
        setInputError('Délka základny musí být větší než 0 cm');
        return;
      }
      // Resetovat initialSegmentLength při novém zadání
      setInitialSegmentLength(null);
      setWaitingForInput(false);
    } else if (currentStep === 1) {
      // Zadání úhlu alpha
      if (!angleAlpha || angleAlpha <= 0) {
        setInputError('Zadej prosím úhel větší než 0°');
        return;
      }
      if (angleAlpha >= 180) {
        setInputError('Úhel musí být menší než 180°');
        return;
      }
      setWaitingForInput(false);
    } else if (currentStep === 3) {
      // Zadání úhlu beta
      if (!angleBeta || angleBeta <= 0) {
        setInputError('Zadej prosím úhel větší než 0°');
        return;
      }
      if (angleBeta >= 180) {
        setInputError('Úhel musí být menší než 180°');
        return;
      }
      if (angleAlpha && angleBeta + angleAlpha >= 180) {
        setInputError(`Součet úhlů musí být menší než 180°. (${angleAlpha}° + ${angleBeta}° = ${angleAlpha + angleBeta}°)`);
        return;
      }
      setWaitingForInput(false);
    }
  };

  const drawGrid = (ctx: CanvasRenderingContext2D) => {
    const gridSize = 50 * scale;
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

  const drawLabel = (
    ctx: CanvasRenderingContext2D,
    p: Point,
    label: string,
    _color: string = '#000',
    offsetX: number = 12,
    offsetY: number = -12,
    dpr: number = 1
  ) => {
    ctx.save();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    
    const screenX = p.x * scale + offset.x;
    const screenY = p.y * scale + offset.y;
    
    ctx.font = 'bold 16px Inter, system-ui, sans-serif';
    const metrics = ctx.measureText(label);
    const textWidth = metrics.width;
    const padding = 8;
    
    const bgX = screenX + offsetX + textWidth / 2;
    const bgY = screenY + offsetY - 8;
    const bgRadius = Math.max(textWidth, 16) / 2 + padding;
    
    ctx.fillStyle = '#3b82f6';
    ctx.beginPath();
    ctx.arc(bgX, bgY, bgRadius, 0, Math.PI * 2);
    ctx.fill();
    
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, bgX, bgY);
    
    ctx.restore();
  };

  const drawEndpointMark = (
    ctx: CanvasRenderingContext2D,
    p: Point,
    angle: number,
    color: string = '#000',
    isHovered: boolean = false
  ) => {
    const markLength = isHovered ? 24 : 20;
    const perpAngle = angle + Math.PI / 2;
    
    const p1 = {
      x: p.x + Math.cos(perpAngle) * markLength / 2,
      y: p.y + Math.sin(perpAngle) * markLength / 2
    };
    const p2 = {
      x: p.x - Math.cos(perpAngle) * markLength / 2,
      y: p.y - Math.sin(perpAngle) * markLength / 2
    };
    
    ctx.strokeStyle = color;
    ctx.lineWidth = 6;
    ctx.lineCap = 'butt';
    ctx.beginPath();
    ctx.moveTo(p1.x, p1.y);
    ctx.lineTo(p2.x, p2.y);
    ctx.stroke();
    
    if (isHovered) {
      ctx.fillStyle = darkMode ? 'rgba(96, 165, 250, 0.25)' : 'rgba(59, 130, 246, 0.15)';
      ctx.beginPath();
      ctx.arc(p.x, p.y, 18, 0, Math.PI * 2);
      ctx.fill();
    }
  };

  const drawPoint = (
    ctx: CanvasRenderingContext2D,
    p: Point,
    label: string,
    color: string = '#000'
  ) => {
    ctx.fillStyle = darkMode ? 'rgba(75, 85, 99, 0.4)' : 'rgba(200, 200, 200, 0.3)';
    ctx.beginPath();
    ctx.arc(p.x, p.y, 10, 0, Math.PI * 2);
    ctx.fill();
    
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 7, 0, Math.PI * 2);
    ctx.fill();
    
    ctx.strokeStyle = darkMode ? '#111827' : '#ffffff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 7, 0, Math.PI * 2);
    ctx.stroke();
  };

  const drawLengthLabel = (
    ctx: CanvasRenderingContext2D,
    p1: Point,
    p2: Point,
    length: number,
    dpr: number = 1
  ) => {
    const midX = (p1.x + p2.x) / 2;
    const midY = (p1.y + p2.y) / 2;
    
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const angle = Math.atan2(dy, dx);
    
    ctx.save();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    
    const screenX = midX * scale + offset.x;
    const screenY = midY * scale + offset.y;
    
    ctx.translate(screenX, screenY);
    ctx.rotate(angle);
    
    const text = `${length}cm`;
    ctx.font = '600 18px "Fenomen Sans", Arial, sans-serif';
    ctx.fillStyle = darkMode ? '#e5e7eb' : '#1f2937';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText(text, 0, -8);
    
    ctx.restore();
  };

  const drawRightAngleSymbol = (
    ctx: CanvasRenderingContext2D,
    center: Point,
    angle1: number,
    angle2: number,
    radius: number = 120,
    color: string = '#fbbf24'
  ) => {
    // České značení pravého úhlu - normální oblouk s tečkou uprostřed
    
    // Určit směr kreslení
    const clockwise = angle1 > angle2;
    
    // Žluté podsvícení oblouku
    ctx.strokeStyle = 'rgba(251, 191, 36, 0.3)';
    ctx.lineWidth = 16;
    ctx.beginPath();
    ctx.arc(center.x, center.y, radius, angle1, angle2, clockwise);
    ctx.stroke();
    
    // Hlavní oblouk
    ctx.strokeStyle = color;
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.arc(center.x, center.y, radius, angle1, angle2, clockwise);
    ctx.stroke();
    
    // Tečka uprostřed oblouku
    const midAngle = (angle1 + angle2) / 2;
    const dotX = center.x + Math.cos(midAngle) * radius * 0.5;
    const dotY = center.y + Math.sin(midAngle) * radius * 0.5;
    
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(dotX, dotY, 6, 0, Math.PI * 2);
    ctx.fill();
  };

  const drawSegment = (
    ctx: CanvasRenderingContext2D,
    p1: Point,
    p2: Point,
    color: string = '#000',
    width: number = 2,
    progress: number = 1
  ) => {
    let drawProgress = 0;
    if (progress <= 0.15) {
      drawProgress = 0;
    } else if (progress >= 0.85) {
      drawProgress = 1;
    } else {
      drawProgress = (progress - 0.15) / 0.7;
    }
    
    const currentP2 = {
      x: p1.x + (p2.x - p1.x) * drawProgress,
      y: p1.y + (p2.y - p1.y) * drawProgress
    };
    
    const isDrawing = drawProgress < 1;
    
    if (isDrawing && drawProgress > 0) {
      ctx.strokeStyle = 'rgba(251, 191, 36, 0.5)';
      ctx.lineWidth = width * 10;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(currentP2.x, currentP2.y);
      ctx.stroke();
    }
    
    if (drawProgress > 0) {
      ctx.strokeStyle = color;
      ctx.lineWidth = isDrawing ? width * 1.5 : width;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(currentP2.x, currentP2.y);
      ctx.stroke();
    }
  };

  const drawRay = (
    ctx: CanvasRenderingContext2D,
    start: Point,
    angle: number,
    length: number,
    color: string = '#93c5fd',
    width: number = 4,
    progress: number = 1
  ) => {
    let drawProgress = 0;
    if (progress <= 0.15) {
      drawProgress = 0;
    } else if (progress >= 0.85) {
      drawProgress = 1;
    } else {
      drawProgress = (progress - 0.15) / 0.7;
    }
    
    const end = {
      x: start.x + Math.cos(angle) * length * drawProgress,
      y: start.y + Math.sin(angle) * length * drawProgress
    };
    
    const isDrawing = drawProgress < 1;
    
    if (isDrawing && drawProgress > 0) {
      ctx.strokeStyle = 'rgba(251, 191, 36, 0.5)';
      ctx.lineWidth = width * 10;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(start.x, start.y);
      ctx.lineTo(end.x, end.y);
      ctx.stroke();
    }
    
    if (drawProgress > 0) {
      ctx.strokeStyle = color;
      ctx.lineWidth = isDrawing ? width * 1.5 : width;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(start.x, start.y);
      ctx.lineTo(end.x, end.y);
      ctx.stroke();
    }
  };

  const drawProtractor = (
    ctx: CanvasRenderingContext2D,
    center: Point,
    baseAngle: number,
    radius: number = 200,
    color: string = '#f97316',
    dpr: number = 1
  ) => {
    // Kruh úhloměru (oranžový)
    ctx.strokeStyle = color;
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.arc(center.x, center.y, radius, 0, Math.PI * 2);
    ctx.stroke();
    
    // Jemnější vnější kruh
    ctx.strokeStyle = `${color}60`;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(center.x, center.y, radius + 15, 0, Math.PI * 2);
    ctx.stroke();
    
    // Značky po 10 stupních
    for (let deg = 0; deg < 360; deg += 10) {
      const angle = (deg * Math.PI) / 180;
      const isMainMark = deg % 30 === 0;
      const markLength = isMainMark ? 20 : 10;
      const innerRadius = radius - markLength;
      
      const x1 = center.x + Math.cos(angle) * innerRadius;
      const y1 = center.y + Math.sin(angle) * innerRadius;
      const x2 = center.x + Math.cos(angle) * radius;
      const y2 = center.y + Math.sin(angle) * radius;
      
      ctx.strokeStyle = color;
      ctx.lineWidth = isMainMark ? 3 : 2;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
      
      // Čísla úhlů u hlavních značek (každých 30°)
      if (isMainMark) {
        const textRadius = radius + 35;
        const textX = center.x + Math.cos(angle) * textRadius;
        const textY = center.y + Math.sin(angle) * textRadius;
        
        ctx.save();
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        const screenX = textX * scale + offset.x;
        const screenY = textY * scale + offset.y;
        
        ctx.font = '400 12px "Fenomen Sans", Arial, sans-serif';
        ctx.fillStyle = color;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(`${deg}°`, screenX, screenY);
        ctx.restore();
      }
    }
  };

  const drawAngleArc = (
    ctx: CanvasRenderingContext2D,
    center: Point,
    startAngle: number,
    endAngle: number,
    radius: number = 120,
    color: string = '#fbbf24',
    withArrow: boolean = false
  ) => {
    // Určit směr kreslení - pokud startAngle > endAngle, kreslíme po směru hodinových ručiček
    const clockwise = startAngle > endAngle;
    
    // Žluté podsvícení (výraznější)
    ctx.strokeStyle = 'rgba(251, 191, 36, 0.3)';
    ctx.lineWidth = 16;
    ctx.beginPath();
    ctx.arc(center.x, center.y, radius, startAngle, endAngle, clockwise);
    ctx.stroke();
    
    // Hlavní oblouk (tlustší)
    ctx.strokeStyle = color;
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.arc(center.x, center.y, radius, startAngle, endAngle, clockwise);
    ctx.stroke();
    
    // Šipka na konci oblouku (pouze pokud withArrow === true)
    if (withArrow) {
      const arrowSize = 24;
      const arrowAngle = endAngle;
      const arrowBase = {
        x: center.x + Math.cos(arrowAngle) * radius,
        y: center.y + Math.sin(arrowAngle) * radius
      };
      
      // Směr šipky závisí na směru oblouku
      // Pro clockwise (po směru hodinových ručiček) chceme šipku směřující "doprava" po oblouku
      const arrowDirection = clockwise ? -1 : 1;
      
      // Stín šipky
      ctx.fillStyle = 'rgba(0, 0, 0, 0.2)';
      ctx.beginPath();
      ctx.moveTo(arrowBase.x + 2, arrowBase.y + 2);
      ctx.lineTo(
        arrowBase.x + 2 + arrowDirection * arrowSize * Math.cos(arrowAngle - Math.PI / 6),
        arrowBase.y + 2 + arrowDirection * arrowSize * Math.sin(arrowAngle - Math.PI / 6)
      );
      ctx.lineTo(
        arrowBase.x + 2 + arrowDirection * arrowSize * Math.cos(arrowAngle + Math.PI / 6),
        arrowBase.y + 2 + arrowDirection * arrowSize * Math.sin(arrowAngle + Math.PI / 6)
      );
      ctx.closePath();
      ctx.fill();
      
      // Hlavní šipka
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(arrowBase.x, arrowBase.y);
      ctx.lineTo(
        arrowBase.x + arrowDirection * arrowSize * Math.cos(arrowAngle - Math.PI / 6),
        arrowBase.y + arrowDirection * arrowSize * Math.sin(arrowAngle - Math.PI / 6)
      );
      ctx.lineTo(
        arrowBase.x + arrowDirection * arrowSize * Math.cos(arrowAngle + Math.PI / 6),
        arrowBase.y + arrowDirection * arrowSize * Math.sin(arrowAngle + Math.PI / 6)
      );
      ctx.closePath();
      ctx.fill();
      
      // Kontura šipky
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  };

  const drawRuler = (
    ctx: CanvasRenderingContext2D,
    p1: Point,
    p2: Point,
    progress: number
  ) => {
    if (!showCaptions || !rulerLoaded || !rulerImageRef.current) return;
    
    let rulerAlpha = 0;
    
    if (progress < 0.15) {
      rulerAlpha = progress / 0.15;
    } else if (progress >= 0.15 && progress <= 0.85) {
      rulerAlpha = 1;
    } else if (progress > 0.85 && progress < 1) {
      rulerAlpha = (1 - progress) / 0.15;
    } else {
      return;
    }
    
    const ruler = rulerImageRef.current;
    const rulerLength = 800;
    const rulerWidth = 400;
    
    ctx.save();
    
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const lineLength = Math.sqrt(dx * dx + dy * dy);
    const angle = Math.atan2(dy, dx);
    
    ctx.translate(p1.x, p1.y);
    ctx.rotate(angle);
    ctx.globalAlpha = rulerAlpha;
    
    const rulerOffsetX = lineLength / 2 - rulerLength / 2;
    ctx.drawImage(ruler, rulerOffsetX, -rulerWidth, rulerLength, rulerWidth);
    
    ctx.restore();
  };

  const drawRulerOnRay = (
    ctx: CanvasRenderingContext2D,
    start: Point,
    angle: number,
    progress: number
  ) => {
    if (!showCaptions || !rulerLoaded || !rulerImageRef.current) return;
    
    let rulerAlpha = 0;
    
    if (progress < 0.15) {
      rulerAlpha = progress / 0.15;
    } else if (progress >= 0.15 && progress <= 0.85) {
      rulerAlpha = 1;
    } else if (progress > 0.85 && progress < 1) {
      rulerAlpha = (1 - progress) / 0.15;
    } else {
      return;
    }
    
    const ruler = rulerImageRef.current;
    const rulerLength = 800;
    const rulerWidth = 400;
    
    ctx.save();
    
    ctx.translate(start.x, start.y);
    ctx.rotate(angle);
    ctx.globalAlpha = rulerAlpha;
    
    const rulerOffsetX = 200; // Posunout pravítko doprava od počátku paprsku
    ctx.drawImage(ruler, rulerOffsetX, -rulerWidth, rulerLength, rulerWidth);
    
    ctx.restore();
  };

  const getStepInfo = () => {
    switch (currentStep) {
      case 0:
        return {
          title: 'Narýsuj základnu AB',
          description: waitingForInput 
            ? 'Kolik centimetrů má mít základna AB?' 
            : `Rýsujeme základnu AB = ${sideAB} cm. Body A a B můžeš přesouvat myší!`,
          needsInput: waitingForInput,
          inputLabel: 'Délka základny AB (cm)'
        };
      case 1:
        return {
          title: 'Zadej úhel α při vrcholu A',
          description: waitingForInput
            ? 'Kolik stupňů má mít úhel α (alfa) při vrcholu A?'
            : `Úhel α při vrcholu A = ${angleAlpha}°`,
          needsInput: waitingForInput,
          inputLabel: 'Úhel α (stupně)'
        };
      case 2:
        return {
          title: 'Narýsuj paprsek z bodu A',
          description: `Rýsujeme paprsek z bodu A pod úhlem ${angleAlpha}°`,
          needsInput: false
        };
      case 3:
        return {
          title: 'Zadej úhel β při vrcholu B',
          description: waitingForInput
            ? 'Kolik stupňů má mít úhel β (beta) při vrcholu B?'
            : `Úhel β při vrcholu B = ${angleBeta}°`,
          needsInput: waitingForInput,
          inputLabel: 'Úhel β (stupně)'
        };
      case 4:
        return {
          title: 'Narýsuj paprsek z bodu B',
          description: `Rýsujeme paprsek z bodu B pod úhlem ${angleBeta}°`,
          needsInput: false
        };
      case 5:
        if (!pointC) {
          return {
            title: 'Paprsky se neprotly! ❌',
            description: `Úhly ${angleAlpha}° a ${angleBeta}° netvoří trojúhelník. Součet musí být menší než 180°.`,
            needsInput: false,
            error: true
          };
        }
        return {
          title: 'Označ průsečík jako bod C',
          description: 'Bod, ve kterém se paprsky protly, pojmenujeme C. To je třetí vrchol trojúhelníku.',
          needsInput: false
        };
      case 6:
        return {
          title: 'Dorýsuj trojúhelník',
          description: 'Spojíme body A-C a B-C. Trojúhelník ABC je hotový!',
          needsInput: false
        };
      case 7:
        return {
          title: 'Opsat trojúhelník',
          description: 'Připíšeme délky stran a velikost úhlu C.',
          needsInput: false
        };
      default:
        return { title: '', description: '', needsInput: false };
    }
  };

  const stepInfo = getStepInfo();

  const renderToBuffer = (bufferCtx: CanvasRenderingContext2D, progress: number) => {
    const dpr = window.devicePixelRatio || 1;

    if (!bufferCanvasRef.current || bufferCanvasRef.current.width === 0 || bufferCanvasRef.current.height === 0) {
      return;
    }

    bufferCtx.clearRect(0, 0, bufferCanvasRef.current.width, bufferCanvasRef.current.height);
    
    bufferCtx.save();
    bufferCtx.scale(dpr, dpr);
    
    drawGrid(bufferCtx);
    
    // Titulky a popis se zobrazují v horním popupu (ne na canvasu)
    
    bufferCtx.translate(offset.x, offset.y);
    bufferCtx.scale(scale, scale);

    const dpr2 = window.devicePixelRatio || 1;
    const baseAngle = Math.atan2(pointB.y - pointA.y, pointB.x - pointA.x);
    const segmentColor = darkMode ? '#e5e7eb' : '#1f2937';
    const rayColor = darkMode ? '#93c5fd' : '#3b82f6';
    const highlightColor = darkMode ? '#fca5a5' : '#ef4444';
    const triangleColor = darkMode ? '#6ee7b7' : '#10b981';
    const angleColor = darkMode ? '#fbbf24' : '#f59e0b';

    // Krok 0: Základna AB
    if (currentStep >= 0 && sideAB) {
      const stepProgress = currentStep === 0 && !waitingForInput ? progress : 1;
      drawSegment(bufferCtx, pointA, pointB, segmentColor, 6, stepProgress);

      if (currentStep === 0 && !waitingForInput && showCaptions) {
        drawRuler(bufferCtx, pointA, pointB, progress);
      }
      
      // Zobrazit popisek délky po narýsování
      if (currentStep > 0 || (currentStep === 0 && !waitingForInput && progress > 0.85)) {
        if (showCaptions) {
          drawLengthLabel(bufferCtx, pointA, pointB, sideAB, dpr2);
        }
      }
    }

    // Krok 1: Úhel alpha - zobrazit úhloměr a oblouk
    if (currentStep >= 1 && angleAlpha && !waitingForInput) {
      const alphaRad = (angleAlpha * Math.PI) / 180;
      const rayAAngle = baseAngle + alphaRad;
      
      if (currentStep === 1) {
        // Úhloměr kolem bodu A (jen v kroku 1)
        if (progress > 0.05) {
          const protractorAlpha = Math.min((progress - 0.05) / 0.15, 1);
          bufferCtx.globalAlpha = protractorAlpha;
          drawProtractor(bufferCtx, pointA, baseAngle, 200, '#f97316', dpr2);
          bufferCtx.globalAlpha = 1;
        }
        
        // Animovaný oblouk úhlu
        const arcProgress = progress;
        if (arcProgress > 0.2) {
          const arcAngle = baseAngle + alphaRad * ((arcProgress - 0.2) / 0.8);
          const isRightAngle = angleAlpha === 90 || angleAlpha === 270;
          
          if (isRightAngle && arcProgress > 0.8) {
            // Na konci animace zobrazit symbol pravého úhlu
            drawRightAngleSymbol(bufferCtx, pointA, baseAngle, arcAngle, 120, angleColor);
          } else {
            // Během animace zobrazit oblouk se šipkou (krok 1)
            drawAngleArc(bufferCtx, pointA, baseAngle, arcAngle, 120, angleColor, true);
          }
          
          // Zobrazit hodnotu úhlu
          if (arcProgress > 0.5) {
            const angle = (arcAngle - baseAngle) * 180 / Math.PI;
            const textRadius = 160;
            const textAngle = baseAngle + (arcAngle - baseAngle) / 2;
            const textX = pointA.x + Math.cos(textAngle) * textRadius;
            const textY = pointA.y + Math.sin(textAngle) * textRadius;
            
            bufferCtx.save();
            bufferCtx.setTransform(dpr2, 0, 0, dpr2, 0, 0);
            const screenX = textX * scale + offset.x;
            const screenY = textY * scale + offset.y;
            
            bufferCtx.font = '600 20px "Fenomen Sans", Arial, sans-serif';
            bufferCtx.fillStyle = angleColor;
            bufferCtx.textAlign = 'center';
            bufferCtx.textBaseline = 'middle';
            bufferCtx.fillText(`${Math.round(angle)}°`, screenX, screenY);
            bufferCtx.restore();
          }
        }
      } else if (currentStep >= 2) {
        // Plný oblouk s hodnotou (nebo symbol pravého úhlu)
        const isRightAngle = angleAlpha === 90 || angleAlpha === 270;
        
        if (isRightAngle) {
          // Nakreslit symbol pravého úhlu (oblouk s tečkou)
          drawRightAngleSymbol(bufferCtx, pointA, baseAngle, baseAngle + alphaRad, 120, angleColor);
        } else {
          // Oblouk bez šipky (kroky >= 2)
          drawAngleArc(bufferCtx, pointA, baseAngle, baseAngle + alphaRad, 120, angleColor, false);
        }
        
        // Zobrazit hodnotu úhlu (pouze pokud showCaptions)
        if (showCaptions) {
          const textRadius = 160;
          const textAngle = baseAngle + alphaRad / 2;
          const textX = pointA.x + Math.cos(textAngle) * textRadius;
          const textY = pointA.y + Math.sin(textAngle) * textRadius;
          
          bufferCtx.save();
          bufferCtx.setTransform(dpr2, 0, 0, dpr2, 0, 0);
          const screenX = textX * scale + offset.x;
          const screenY = textY * scale + offset.y;
          
          bufferCtx.font = '600 20px "Fenomen Sans", Arial, sans-serif';
          bufferCtx.fillStyle = angleColor;
          bufferCtx.textAlign = 'center';
          bufferCtx.textBaseline = 'middle';
          bufferCtx.fillText(`${angleAlpha}°`, screenX, screenY);
          bufferCtx.restore();
        }
      }
    }

    // Krok 2: Paprsek z A
    if (currentStep >= 2 && angleAlpha) {
      const alphaRad = (angleAlpha * Math.PI) / 180;
      const rayAAngle = baseAngle + alphaRad;
      const rayLength = 800;
      
      const stepProgress = currentStep === 2 ? progress : 1;
      drawRay(bufferCtx, pointA, rayAAngle, rayLength, rayColor, 4, stepProgress);
      
      if (currentStep === 2 && showCaptions) {
        drawRulerOnRay(bufferCtx, pointA, rayAAngle, progress);
      }
    }

    // Krok 3: Úhel beta - zobrazit úhloměr a oblouk
    if (currentStep >= 3 && angleBeta && !waitingForInput) {
      const betaRad = (angleBeta * Math.PI) / 180;
      const rayBAngle = baseAngle + Math.PI - betaRad;
      
      if (currentStep === 3) {
        // Úhloměr kolem bodu B (jen v kroku 3)
        if (progress > 0.05) {
          const protractorAlpha = Math.min((progress - 0.05) / 0.15, 1);
          bufferCtx.globalAlpha = protractorAlpha;
          drawProtractor(bufferCtx, pointB, baseAngle + Math.PI, 200, '#f97316', dpr2);
          bufferCtx.globalAlpha = 1;
        }
        
        // Animovaný oblouk úhlu - od BA směrem dolů (do trojúhelníku)
        const arcProgress = progress;
        if (arcProgress > 0.2) {
          const arcAngle = baseAngle + Math.PI - betaRad * ((arcProgress - 0.2) / 0.8);
          const isRightAngle = angleBeta === 90 || angleBeta === 270;
          
          if (isRightAngle && arcProgress > 0.8) {
            // Na konci animace zobrazit symbol pravého úhlu
            drawRightAngleSymbol(bufferCtx, pointB, baseAngle + Math.PI, arcAngle, 120, angleColor);
          } else {
            // Během animace zobrazit oblouk se šipkou (krok 3)
            // Správné pořadí: od BA (baseAngle + Math.PI) k arcAngle
            drawAngleArc(bufferCtx, pointB, baseAngle + Math.PI, arcAngle, 120, angleColor, true);
          }
          
          // Zobrazit hodnotu úhlu
          if (arcProgress > 0.5) {
            const angle = ((baseAngle + Math.PI - arcAngle) * 180) / Math.PI;
            const textRadius = 160;
            const textAngle = baseAngle + Math.PI - (baseAngle + Math.PI - arcAngle) / 2;
            const textX = pointB.x + Math.cos(textAngle) * textRadius;
            const textY = pointB.y + Math.sin(textAngle) * textRadius;
            
            bufferCtx.save();
            bufferCtx.setTransform(dpr2, 0, 0, dpr2, 0, 0);
            const screenX = textX * scale + offset.x;
            const screenY = textY * scale + offset.y;
            
            bufferCtx.font = '600 20px "Fenomen Sans", Arial, sans-serif';
            bufferCtx.fillStyle = angleColor;
            bufferCtx.textAlign = 'center';
            bufferCtx.textBaseline = 'middle';
            bufferCtx.fillText(`${Math.round(angle)}°`, screenX, screenY);
            bufferCtx.restore();
          }
        }
      } else if (currentStep >= 4) {
        // Plný oblouk s hodnotou (nebo symbol pravého úhlu)
        const isRightAngle = angleBeta === 90 || angleBeta === 270;
        
        if (isRightAngle) {
          // Nakreslit symbol pravého úhlu (oblouk s tečkou)
          drawRightAngleSymbol(bufferCtx, pointB, baseAngle + Math.PI, rayBAngle, 120, angleColor);
        } else {
          // Oblouk bez šipky (kroky >= 4)
          // Správné pořadí: od BA (baseAngle + Math.PI) k rayBAngle
          drawAngleArc(bufferCtx, pointB, baseAngle + Math.PI, rayBAngle, 120, angleColor, false);
        }
        
        // Zobrazit hodnotu úhlu (pouze pokud showCaptions)
        if (showCaptions) {
          const textRadius = 160;
          const textAngle = baseAngle + Math.PI - betaRad / 2;
          const textX = pointB.x + Math.cos(textAngle) * textRadius;
          const textY = pointB.y + Math.sin(textAngle) * textRadius;
          
          bufferCtx.save();
          bufferCtx.setTransform(dpr2, 0, 0, dpr2, 0, 0);
          const screenX = textX * scale + offset.x;
          const screenY = textY * scale + offset.y;
          
          bufferCtx.font = '600 20px "Fenomen Sans", Arial, sans-serif';
          bufferCtx.fillStyle = angleColor;
          bufferCtx.textAlign = 'center';
          bufferCtx.textBaseline = 'middle';
          bufferCtx.fillText(`${angleBeta}°`, screenX, screenY);
          bufferCtx.restore();
        }
      }
    }

    // Krok 4: Paprsek z B
    if (currentStep >= 4 && angleBeta) {
      const betaRad = (angleBeta * Math.PI) / 180;
      const rayBAngle = baseAngle + Math.PI - betaRad;
      const rayLength = 800;
      
      const stepProgress = currentStep === 4 ? progress : 1;
      drawRay(bufferCtx, pointB, rayBAngle, rayLength, rayColor, 4, stepProgress);
      
      if (currentStep === 4 && showCaptions) {
        drawRulerOnRay(bufferCtx, pointB, rayBAngle, progress);
      }
    }

    // Krok 5: Bod C - průsečík paprsků
    if (currentStep >= 5 && pointC) {
      if (currentStep === 5) {
        // Animace zvýraznění průsečíku
        if (progress > 0.1) {
          const highlightProgress = Math.min((progress - 0.1) / 0.3, 1);
          
          // Velký pulzující žlutý kruh - ukazuje místo průsečíku
          if (highlightProgress < 1) {
            const pulseRadius = 25 + highlightProgress * 35;
            bufferCtx.strokeStyle = `rgba(251, 191, 36, ${0.7 * (1 - highlightProgress)})`;
            bufferCtx.lineWidth = 6;
            bufferCtx.beginPath();
            bufferCtx.arc(pointC.x, pointC.y, pulseRadius, 0, Math.PI * 2);
            bufferCtx.stroke();
            
            // Vnitřní pulzující kruh
            const innerRadius = 15 + highlightProgress * 20;
            bufferCtx.strokeStyle = `rgba(251, 191, 36, ${0.5 * (1 - highlightProgress)})`;
            bufferCtx.lineWidth = 4;
            bufferCtx.beginPath();
            bufferCtx.arc(pointC.x, pointC.y, innerRadius, 0, Math.PI * 2);
            bufferCtx.stroke();
          }
          
          // Křížek přesně na průsečíku
          if (highlightProgress > 0.3) {
            const crossProgress = Math.min((highlightProgress - 0.3) / 0.4, 1);
            const crossSize = 25 * crossProgress;
            
            bufferCtx.strokeStyle = angleColor;
            bufferCtx.lineWidth = 4;
            bufferCtx.globalAlpha = crossProgress;
            
            // Horizontální čára
            bufferCtx.beginPath();
            bufferCtx.moveTo(pointC.x - crossSize, pointC.y);
            bufferCtx.lineTo(pointC.x + crossSize, pointC.y);
            bufferCtx.stroke();
            
            // Vertikální čára
            bufferCtx.beginPath();
            bufferCtx.moveTo(pointC.x, pointC.y - crossSize);
            bufferCtx.lineTo(pointC.x, pointC.y + crossSize);
            bufferCtx.stroke();
            
            bufferCtx.globalAlpha = 1;
          }
        }
        
        // Bod C se vykreslí až na konci (nad všemi čarami)
      }
    }

    // Krok 6: Dorýsovat strany trojúhelníku
    if (currentStep >= 6 && pointC && sideAB) {
      const halfProgress = progress * 2;
      if (halfProgress <= 1) {
        drawSegment(bufferCtx, pointA, pointC, triangleColor, 5, halfProgress);
        if (showCaptions) {
          drawRuler(bufferCtx, pointA, pointC, halfProgress);
        }
      } else {
        drawSegment(bufferCtx, pointA, pointC, triangleColor, 5, 1);
        drawSegment(bufferCtx, pointB, pointC, triangleColor, 5, (halfProgress - 1));
        if (showCaptions) {
          drawRuler(bufferCtx, pointB, pointC, (halfProgress - 1));
        }
      }
      
      // Zobrazit popisky délek po narýsování
      if (currentStep > 6 || (currentStep === 6 && progress > 0.85)) {
        if (showCaptions) {
          const lengthAC = Math.sqrt(Math.pow(pointC.x - pointA.x, 2) + Math.pow(pointC.y - pointA.y, 2));
          const lengthBC = Math.sqrt(Math.pow(pointC.x - pointB.x, 2) + Math.pow(pointC.y - pointB.y, 2));
          const segmentLengthAB = Math.sqrt(Math.pow(pointB.x - pointA.x, 2) + Math.pow(pointB.y - pointA.y, 2));
          const lengthACcm = Math.round((lengthAC / segmentLengthAB) * sideAB * 10) / 10;
          const lengthBCcm = Math.round((lengthBC / segmentLengthAB) * sideAB * 10) / 10;
          
          drawLengthLabel(bufferCtx, pointA, pointC, lengthACcm, dpr2);
          drawLengthLabel(bufferCtx, pointB, pointC, lengthBCcm, dpr2);
        }
      }
    }

    // Krok 7: Popisky délek a úhlů
    if (currentStep >= 7 && pointC && sideAB && angleAlpha && angleBeta) {
      // Spočítat délky stran AC a BC
      const lengthAC = Math.sqrt(Math.pow(pointC.x - pointA.x, 2) + Math.pow(pointC.y - pointA.y, 2));
      const lengthBC = Math.sqrt(Math.pow(pointC.x - pointB.x, 2) + Math.pow(pointC.y - pointB.y, 2));
      
      // Převést na cm (poměr k AB)
      const lengthACcm = Math.round((lengthAC / segmentLengthAB) * sideAB * 10) / 10;
      const lengthBCcm = Math.round((lengthBC / segmentLengthAB) * sideAB * 10) / 10;
      
      // Spočítat úhel C
      const angleC = 180 - angleAlpha - angleBeta;
      
      // Nakreslit popisky délek
      if (showCaptions) {
        bufferCtx.globalAlpha = Math.min(progress / 0.3, 1);
        drawLengthLabel(bufferCtx, pointA, pointB, sideAB, dpr2);
        
        if (progress > 0.3) {
          bufferCtx.globalAlpha = Math.min((progress - 0.3) / 0.3, 1);
          drawLengthLabel(bufferCtx, pointA, pointC, lengthACcm, dpr2);
        }
        
        if (progress > 0.6) {
          bufferCtx.globalAlpha = Math.min((progress - 0.6) / 0.3, 1);
          drawLengthLabel(bufferCtx, pointB, pointC, lengthBCcm, dpr2);
        }
        
        bufferCtx.globalAlpha = 1;
        
        // Zobrazit úhel C s obloukem
        if (progress > 0.8) {
          const angleAlpha = Math.min((progress - 0.8) / 0.2, 1);
          bufferCtx.globalAlpha = angleAlpha;
          
          const angle1 = Math.atan2(pointA.y - pointC.y, pointA.x - pointC.x);
          const angle2 = Math.atan2(pointB.y - pointC.y, pointB.x - pointC.x);
          
          // Nakreslit oblouk nebo symbol pravého úhlu
          const isRightAngle = angleC === 90 || angleC === 270;
          if (isRightAngle) {
            drawRightAngleSymbol(bufferCtx, pointC, angle1, angle2, 80, angleColor);
          } else {
            drawAngleArc(bufferCtx, pointC, angle1, angle2, 80, angleColor, false);
          }
          
          // Text úhlu
          const textRadius = 120;
          const midAngle = (angle1 + angle2) / 2;
          const textX = pointC.x + Math.cos(midAngle) * textRadius;
          const textY = pointC.y + Math.sin(midAngle) * textRadius;
          
          bufferCtx.save();
          bufferCtx.setTransform(dpr2, 0, 0, dpr2, 0, 0);
          const screenX = textX * scale + offset.x;
          const screenY = textY * scale + offset.y;
          
          bufferCtx.font = '600 20px "Fenomen Sans", Arial, sans-serif';
          bufferCtx.fillStyle = angleColor;
          bufferCtx.textAlign = 'center';
          bufferCtx.textBaseline = 'middle';
          bufferCtx.fillText(`${angleC}°`, screenX, screenY);
          bufferCtx.restore();
          
          bufferCtx.globalAlpha = 1;
        }
      }
    }

    // BODY - kreslíme jako poslední, aby byly nad všemi čarami
    
    // Body A a B (pokud existují)
    if (currentStep >= 0 && sideAB) {
      if (showCaptions) {
        drawEndpointMark(bufferCtx, pointA, baseAngle, segmentColor, hoveredPoint === 'A');
        drawEndpointMark(bufferCtx, pointB, baseAngle, segmentColor, hoveredPoint === 'B');
      }
      drawLabel(bufferCtx, pointA, 'A', segmentColor, -25, -12, dpr2);
      drawLabel(bufferCtx, pointB, 'B', segmentColor, 12, -12, dpr2);
    }
    
    // Bod C (pokud existuje)
    if (currentStep >= 5 && pointC) {
      if (currentStep === 5) {
        // V kroku 5 s postupným zjevením
        if (progress > 0.5) {
          const pointProgress = Math.min((progress - 0.5) / 0.3, 1);
          bufferCtx.globalAlpha = pointProgress;
          drawPoint(bufferCtx, pointC, 'C', highlightColor);
          bufferCtx.globalAlpha = 1;
          
          if (pointProgress > 0.4) {
            drawLabel(bufferCtx, pointC, 'C', highlightColor, 12, -12, dpr2);
          }
        }
      } else {
        // V dalších krocích plně viditelný
        drawPoint(bufferCtx, pointC, 'C', highlightColor);
        drawLabel(bufferCtx, pointC, 'C', highlightColor, 12, -12, dpr2);
      }
    }

    bufferCtx.restore();
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    const bufferCanvas = bufferCanvasRef.current;
    if (!canvas || !bufferCanvas) return;

    if (canvas.width === 0 || canvas.height === 0) return;
    if (bufferCanvas.width === 0 || bufferCanvas.height === 0) return;

    const ctx = canvas.getContext('2d');
    const bufferCtx = bufferCanvas.getContext('2d');
    if (!ctx || !bufferCtx) return;

    renderToBuffer(bufferCtx, animProgress);

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const fadeInAlpha = animProgress < 0.05 ? animProgress / 0.05 : 1;
    ctx.globalAlpha = fadeInAlpha;

    ctx.drawImage(bufferCanvas, 0, 0);

    ctx.globalAlpha = 1;
  }, [currentStep, scale, offset, canvasSize, pointA, pointB, pointC, hoveredPoint, animProgress, showCaptions, darkMode, sideAB, angleAlpha, angleBeta, waitingForInput]);

  const changeStep = (newStep: number) => {
    if (newStep > currentStep) {
      if (currentStep === 0 && !sideAB) return;
      if (currentStep === 1 && !angleAlpha) return;
      if (currentStep === 3 && !angleBeta) return;
      if (currentStep === 5 && !pointC) return;
    }
    
    setCurrentStep(newStep);
    setAnimProgress(0);
    setIsAnimating(true);
    
    if (newStep === 0 && !sideAB) {
      setWaitingForInput(true);
    } else if (newStep === 1 && !angleAlpha) {
      setWaitingForInput(true);
    } else if (newStep === 3 && !angleBeta) {
      setWaitingForInput(true);
    } else {
      setWaitingForInput(false);
    }
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    const mouseWorld = screenToWorld(mouseX, mouseY);
    const mouseScreen = { x: mouseX, y: mouseY };
    
    if (isPointHovered(pointA, mouseWorld) || isLabelHovered(pointA, mouseScreen, { x: -25, y: -12 })) {
      setDraggedPoint('A');
      return;
    }
    
    if (isPointHovered(pointB, mouseWorld) || isLabelHovered(pointB, mouseScreen, { x: 12, y: -12 })) {
      setDraggedPoint('B');
      return;
    }
    
    if (pointC && currentStep >= 5 && (isPointHovered(pointC, mouseWorld) || isLabelHovered(pointC, mouseScreen, { x: 12, y: -12 }))) {
      setDraggedPoint('C');
      return;
    }
    
    setIsDragging(true);
    setDragStart({ x: e.clientX - offset.x, y: e.clientY - offset.y });
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    const mouseWorld = screenToWorld(mouseX, mouseY);
    const mouseScreen = { x: mouseX, y: mouseY };
    
    if (draggedPoint === 'A') {
      setPointA(mouseWorld);
      return;
    }
    
    if (draggedPoint === 'B') {
      setPointB(mouseWorld);
      return;
    }
    
    if (draggedPoint === 'C') {
      setPointC(mouseWorld);
      return;
    }
    
    if (isDragging) {
      setOffset({
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y
      });
      return;
    }
    
    if (isPointHovered(pointA, mouseWorld) || isLabelHovered(pointA, mouseScreen, { x: -25, y: -12 })) {
      setHoveredPoint('A');
    } else if (isPointHovered(pointB, mouseWorld) || isLabelHovered(pointB, mouseScreen, { x: 12, y: -12 })) {
      setHoveredPoint('B');
    } else if (pointC && currentStep >= 5 && (isPointHovered(pointC, mouseWorld) || isLabelHovered(pointC, mouseScreen, { x: 12, y: -12 }))) {
      setHoveredPoint('C');
    } else {
      setHoveredPoint(null);
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
    setDraggedPoint(null);
  };

  const getTouchDistance = (touch1: React.Touch, touch2: React.Touch): number => {
    const dx = touch1.clientX - touch2.clientX;
    const dy = touch1.clientY - touch2.clientY;
    return Math.sqrt(dx * dx + dy * dy);
  };

  const getTouchCenter = (touch1: React.Touch, touch2: React.Touch): Point => {
    return {
      x: (touch1.clientX + touch2.clientX) / 2,
      y: (touch1.clientY + touch2.clientY) / 2
    };
  };

  const handleTouchStart = (e: React.TouchEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    
    if (e.touches.length === 2) {
      const distance = getTouchDistance(e.touches[0], e.touches[1]);
      const center = getTouchCenter(e.touches[0], e.touches[1]);
      
      setIsPinching(true);
      setInitialPinchDistance(distance);
      setInitialPinchScale(scale);
      setPinchCenter(center);
      
      e.preventDefault();
      return;
    }
    
    if (e.touches.length !== 1) return;
    
    const touch = e.touches[0];
    const touchX = touch.clientX - rect.left;
    const touchY = touch.clientY - rect.top;
    const touchWorld = screenToWorld(touchX, touchY);
    const touchScreen = { x: touchX, y: touchY };
    
    if (isPointHovered(pointA, touchWorld) || isLabelHovered(pointA, touchScreen, { x: -25, y: -12 })) {
      setDraggedPoint('A');
      e.preventDefault();
      return;
    }
    
    if (isPointHovered(pointB, touchWorld) || isLabelHovered(pointB, touchScreen, { x: 12, y: -12 })) {
      setDraggedPoint('B');
      e.preventDefault();
      return;
    }
    
    if (pointC && currentStep >= 5 && (isPointHovered(pointC, touchWorld) || isLabelHovered(pointC, touchScreen, { x: 12, y: -12 }))) {
      setDraggedPoint('C');
      e.preventDefault();
      return;
    }
    
    setIsDragging(true);
    setDragStart({ x: touch.clientX - offset.x, y: touch.clientY - offset.y });
    e.preventDefault();
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    
    if (e.touches.length === 2 && isPinching) {
      const currentDistance = getTouchDistance(e.touches[0], e.touches[1]);
      const currentCenter = getTouchCenter(e.touches[0], e.touches[1]);
      
      const scaleMultiplier = currentDistance / initialPinchDistance;
      const newScale = Math.max(0.2, Math.min(0.6, initialPinchScale * scaleMultiplier));
      
      const centerX = currentCenter.x - rect.left;
      const centerY = currentCenter.y - rect.top;
      
      const scaleChange = newScale / scale;
      const newOffset = {
        x: centerX - (centerX - offset.x) * scaleChange,
        y: centerY - (centerY - offset.y) * scaleChange
      };
      
      setScale(newScale);
      setOffset(newOffset);
      
      e.preventDefault();
      return;
    }
    
    if (e.touches.length !== 1) return;
    
    const touch = e.touches[0];
    const touchX = touch.clientX - rect.left;
    const touchY = touch.clientY - rect.top;
    const touchWorld = screenToWorld(touchX, touchY);
    
    if (draggedPoint === 'A') {
      setPointA(touchWorld);
      e.preventDefault();
      return;
    }
    
    if (draggedPoint === 'B') {
      setPointB(touchWorld);
      e.preventDefault();
      return;
    }
    
    if (draggedPoint === 'C') {
      setPointC(touchWorld);
      e.preventDefault();
      return;
    }
    
    if (isDragging) {
      setOffset({
        x: touch.clientX - dragStart.x,
        y: touch.clientY - dragStart.y
      });
      e.preventDefault();
      return;
    }
  };

  const handleTouchEnd = () => {
    setIsDragging(false);
    setDraggedPoint(null);
    setIsPinching(false);
  };

  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    const newScale = Math.max(0.2, Math.min(0.6, scale * delta));
    
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;
    
    const scaleChange = newScale / scale;
    setOffset({
      x: centerX - (centerX - offset.x) * scaleChange,
      y: centerY - (centerY - offset.y) * scaleChange
    });
    
    setScale(newScale);
  };

  const handleZoomChange = (value: number[]) => {
    const newScale = value[0] / 100;
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) {
      setScale(newScale);
      return;
    }
    
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;
    
    const scaleChange = newScale / scale;
    setOffset({
      x: centerX - (centerX - offset.x) * scaleChange,
      y: centerY - (centerY - offset.y) * scaleChange
    });
    
    setScale(newScale);
  };

  const getCursor = () => {
    if (draggedPoint) return 'grabbing';
    if (hoveredPoint) return 'move';
    if (isDragging) return 'grabbing';
    return 'grab';
  };

  const handleRestart = () => {
    setCurrentStep(0);
    setSideAB(null);
    setAngleAlpha(null);
    setAngleBeta(null);
    setPointC(null);
    setInitialSegmentLength(null);
    setInputError('');
    setWaitingForInput(true);
    setAnimProgress(0);
    setIsAnimating(true);
    centerView();
  };
  
  const handlePlayStep = () => {
    setAnimProgress(0);
    setIsAnimating(true);
  };

  const canGoNext = () => {
    if (currentStep === 0 && waitingForInput) return false;
    if (currentStep === 1 && waitingForInput) return false;
    if (currentStep === 3 && waitingForInput) return false;
    if (currentStep === 5 && !pointC) return false;
    return currentStep < 7;
  };

  const canGoPrev = () => {
    return currentStep > 0;
  };

  return (
    <div className="size-full flex flex-col relative">
      <div ref={containerRef} className={`flex-1 ${darkMode ? 'bg-[#1a1b26]' : 'bg-white'}`}>
        <canvas
          ref={canvasRef}
          className="w-full h-full"
          style={{ 
            cursor: getCursor(),
            touchAction: 'none'
          }}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          onTouchCancel={handleTouchEnd}
          onWheel={handleWheel}
        />
      </div>
      
      <button
        onClick={onBack}
        onTouchEnd={(e) => { e.preventDefault(); onBack(); }}
        className={`absolute top-4 left-4 z-10 flex items-center gap-2 px-3 py-2 rounded-xl shadow-[0_2px_12px_rgba(0,0,0,0.08)] transition-all ${
          darkMode
            ? 'bg-[#1a1b26]/90 hover:bg-[#24283b] text-[#c0caf5] border border-[#2a2b3d] backdrop-blur-sm'
            : 'bg-white/90 hover:bg-gray-50 border border-gray-200/60 backdrop-blur-sm'
        }`}
      >
        <ArrowLeft className="size-5" />
        <span className="text-sm font-medium">Menu</span>
      </button>

      {/* Zápis konstrukce - tlačítko vpravo nahoře */}
      <div className={`absolute top-4 z-10 transition-all duration-300 ${showProtocol ? 'right-[576px]' : 'right-4'}`}>
        <button
          onClick={() => setShowProtocol(!showProtocol)}
          onTouchEnd={(e) => { e.preventDefault(); setShowProtocol(!showProtocol); }}
          className={`p-3 rounded-xl transition-all relative group/protocol ${
            showProtocol
              ? darkMode ? 'bg-[#7aa2f7] text-white' : 'bg-[#1e1b4b] text-white'
              : darkMode ? 'bg-[#24283b] hover:bg-[#414868] text-[#c0caf5]' : 'bg-white/90 hover:bg-gray-50 text-gray-700 shadow-[0_2px_12px_rgba(0,0,0,0.08)] border border-gray-200/60 backdrop-blur-sm'
          }`}
          title="Zápis konstrukce"
        >
          <FileText className="size-5" />
          {!showProtocol && (
            <div className="absolute right-0 top-full mt-2 px-3 py-1.5 bg-black/80 text-white text-xs rounded-lg whitespace-nowrap opacity-0 group-hover/protocol:opacity-100 transition-opacity pointer-events-none">
              Zápis konstrukce
            </div>
          )}
        </button>
      </div>
      
      {stepInfo.needsInput && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className={`w-full max-w-2xl rounded-2xl border-2 p-8 ${
            darkMode
              ? 'bg-[#1f2937] border-gray-600'
              : 'bg-white border-gray-200'
          }`}>
            <div className="mb-8">
              <BigNumberInput
                value={
                  currentStep === 0 ? sideAB :
                  currentStep === 1 ? angleAlpha :
                  currentStep === 3 ? angleBeta :
                  null
                }
                onChange={(value) => {
                  if (currentStep === 0) {
                    setSideAB(value);
                  } else if (currentStep === 1) {
                    setAngleAlpha(value);
                  } else if (currentStep === 3) {
                    setAngleBeta(value);
                  }
                }}
                min={0}
                max={currentStep === 0 ? 99 : 179}
                step={1}
                unit={currentStep === 0 ? 'cm' : '°'}
                darkMode={darkMode}
                label={stepInfo.title}
              />
            </div>
            
            {inputError && (
              <div className={`p-4 rounded-lg mb-6 ${
                darkMode
                  ? 'bg-red-900/30 border border-red-700 text-red-300'
                  : 'bg-red-50 border border-red-200 text-red-700'
              }`}>
                {inputError}
              </div>
            )}
            
            <button
              onClick={handleInputSubmit}
              className="w-full px-6 py-4 bg-[#2563eb] text-white rounded-xl hover:bg-[#1d4ed8] transition-colors text-lg"
            >
              Pokračovat
            </button>
          </div>
        </div>
      )}
      
      {/* Krok info nahoře */}
      <div className={`absolute top-4 left-1/2 -translate-x-1/2 z-10 rounded-2xl shadow-lg max-w-2xl ${
        darkMode ? 'bg-gray-900 border border-gray-800 text-[#c0caf5]' : 'bg-white border border-gray-200 text-gray-900'
      }`} style={{ fontFamily: "var(--font-family, 'Fenomen Sans', sans-serif)", padding: '24px 40px' }}>
        <div className={`text-base font-medium mb-3 ${darkMode ? 'text-[#565f89]' : 'text-gray-400'}`}>
          Krok {currentStep + 1} / {stepNotations.length}
        </div>
        <div className="flex items-center gap-3">
          <span className="flex items-center justify-center w-10 h-10 rounded-full text-sm font-bold shrink-0" style={{ backgroundColor: stepNotations[currentStep]?.type === 'circle' ? '#f43f5e' : stepNotations[currentStep]?.type === 'segment' ? '#10b981' : stepNotations[currentStep]?.type === 'line' ? '#8b5cf6' : stepNotations[currentStep]?.type === 'angle' ? '#f97316' : '#3b82f6', color: '#fff' }}>
            {stepNotations[currentStep]?.type === 'circle' ? '○' : stepNotations[currentStep]?.type === 'segment' ? '—' : stepNotations[currentStep]?.type === 'line' ? '↔' : stepNotations[currentStep]?.type === 'angle' ? '∠' : '•'}
          </span>
          <span className="text-xl font-medium" style={{ fontFamily: '"Times New Roman", Georgia, serif', fontStyle: 'italic' }}>
            {currentStep + 1}. {stepNotations[currentStep]?.notation}
          </span>
        </div>
        <div className={`text-base mt-2.5 ${darkMode ? 'text-[#565f89]' : 'text-gray-500'}`}>
          {stepInfo.description}
        </div>
      </div>

      <ConstructionControlPanel
        currentStep={currentStep}
        totalSteps={stepNotations.length}
        showCaptions={showCaptions}
        darkMode={darkMode}
        scale={scale}
        onStepChange={changeStep}
        onRestart={handleRestart}
        onToggleCaptions={() => setShowCaptions(!showCaptions)}
        onToggleDarkMode={() => onDarkModeChange(!darkMode)}
        onZoomChange={(newScale: number) => {
          const clampedScale = Math.max(0.2, Math.min(0.6, newScale));
          const centerX = canvasSize.width / 2;
          const centerY = canvasSize.height / 2;
          const worldX = (centerX - offset.x) / scale;
          const worldY = (centerY - offset.y) / scale;
          setScale(clampedScale);
          setOffset({
            x: centerX - worldX * clampedScale,
            y: centerY - worldY * clampedScale
          });
        }}
      />
      <ConstructionStepLog
        steps={stepNotations}
        currentStep={currentStep}
        constructionTitle="Konstrukce trojúhelníku (SUS)"
        darkMode={darkMode}
        visible={showProtocol}
        onClose={() => setShowProtocol(false)}
      />
    </div>
  );
}