import { useEffect, useRef, useState } from 'react';
import { 
  ArrowLeft, 
  PlayCircle, 
  RotateCcw, 
  ChevronLeft, 
  ChevronRight, 
  Info, 
  Sun, 
  Moon,
  FileText 
} from 'lucide-react';
import { useIsMobile } from './ui/use-mobile';
import { BigNumberInput } from './BigNumberInput';
import { ConstructionControlPanel } from './ConstructionControlPanel';
import { ConstructionStepLog, StepNotation } from './ConstructionStepLog';
import { Slider } from './ui/slider';

interface Point {
  x: number;
  y: number;
}

interface InteractiveTriangleConstructionProps {
  onBack: () => void;
  darkMode: boolean;
  onDarkModeChange: (dark: boolean) => void;
}

export function InteractiveTriangleConstruction({ onBack, darkMode, onDarkModeChange }: InteractiveTriangleConstructionProps) {
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
      description: 'Narýsuj stranu AB',
      type: 'segment'
    },
    {
      notation: 'A',
      description: 'Zapíchni kružítko do bodu A',
      type: 'point'
    },
    {
      notation: 'k(A, AC)',
      description: 'Narýsuj kružnici z bodu A',
      type: 'circle'
    },
    {
      notation: 'B',
      description: 'Zapíchni kružítko do bodu B',
      type: 'point'
    },
    {
      notation: 'k(B, BC)',
      description: 'Narýsuj kružnici z bodu B',
      type: 'circle'
    },
    {
      notation: 'C = k(A, AC) ∩ k(B, BC)',
      description: 'Označ průsečík jako bod C',
      type: 'point'
    },
    {
      notation: 'AC, BC',
      description: 'Dorýsuj trojúhelník',
      type: 'segment'
    },
    {
      notation: 'ABC',
      description: 'Opsat trojúhelník',
      type: 'segment'
    }
  ];
  
  const rulerImageRef = useRef<HTMLImageElement | null>(null);
  const [rulerLoaded, setRulerLoaded] = useState(false);
  const compassImageRef = useRef<HTMLImageElement | null>(null);
  const [compassLoaded, setCompassLoaded] = useState(false);
  
  const [pointA, setPointA] = useState<Point>({ x: 860, y: 900 });
  const [pointB, setPointB] = useState<Point>({ x: 1460, y: 900 });
  const [draggedPoint, setDraggedPoint] = useState<'A' | 'B' | null>(null);
  const [hoveredPoint, setHoveredPoint] = useState<'A' | 'B' | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);
  
  const [isPinching, setIsPinching] = useState(false);
  const [initialPinchDistance, setInitialPinchDistance] = useState(0);
  const [initialPinchScale, setInitialPinchScale] = useState(1);
  const [pinchCenter, setPinchCenter] = useState<Point>({ x: 0, y: 0 });

  // Interaktivní zadávání délek
  const [sideAB, setSideAB] = useState<number | null>(null);
  const [sideAC, setSideAC] = useState<number | null>(null);
  const [sideBC, setSideBC] = useState<number | null>(null);
  const [inputError, setInputError] = useState('');
  const [waitingForInput, setWaitingForInput] = useState(true);

  // Vypočítat délky v pixelech
  const segmentLengthAB = Math.sqrt(
    Math.pow(pointB.x - pointA.x, 2) + Math.pow(pointB.y - pointA.y, 2)
  );
  
  const radiusAC = sideAC && sideAB ? segmentLengthAB * (sideAC / sideAB) : 0;
  const radiusBC = sideBC && sideAB ? segmentLengthAB * (sideBC / sideAB) : 0;

  const calculateIntersections = (): { top: Point; bottom: Point } | null => {
    if (!sideAC || !sideBC || !sideAB) return null;
    
    const d = segmentLengthAB;
    const r1 = radiusAC;
    const r2 = radiusBC;
    
    // Zkontrolovat, zda se kružnice protnou
    if (d > r1 + r2 || d < Math.abs(r1 - r2) || d === 0) {
      return null; // Kružnice se neprotnou!
    }
    
    const a = (d * d + r1 * r1 - r2 * r2) / (2 * d);
    const hSquared = r1 * r1 - a * a;
    
    if (hSquared < 0) return null; // Neplatný trojúhelník
    
    const h = Math.sqrt(hSquared);
    
    const midX = pointA.x + (pointB.x - pointA.x) * (a / d);
    const midY = pointA.y + (pointB.y - pointA.y) * (a / d);
    
    const dx = pointB.x - pointA.x;
    const dy = pointB.y - pointA.y;
    const perpX = -dy / d;
    const perpY = dx / d;
    
    return {
      top: {
        x: midX + h * perpX,
        y: midY + h * perpY
      },
      bottom: {
        x: midX - h * perpX,
        y: midY - h * perpY
      }
    };
  };

  const intersections = calculateIntersections();

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

  useEffect(() => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      compassImageRef.current = img;
      setCompassLoaded(true);
    };
    img.onerror = () => console.error('Failed to load compass image');
    img.src = 'https://jjpiguuubvmiobmixwgh.supabase.co/storage/v1/object/public/Admin%20math/kruzitko.svg';
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
        let increment = 0.025;
        
        if (currentStep === 1 || currentStep === 3) {
          increment = 0.008;
        } else if (currentStep === 2 || currentStep === 4) {
          increment = 0.015;
        }
        
        setAnimProgress(prev => Math.min(prev + increment, 1));
      });
    } else if (animProgress >= 1) {
      setIsAnimating(false);
    }
    
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [isAnimating, animProgress, currentStep, waitingForInput]);

  const handleInputSubmit = () => {
    setInputError('');
    
    if (currentStep === 0) {
      // Zadání AB
      if (sideAB === null || sideAB < 0) {
        setInputError('Zadej prosím platnou délku (0-99 cm)');
        return;
      }
      if (sideAB === 0) {
        setInputError('Délka strany musí být větší než 0 cm');
        return;
      }
      setWaitingForInput(false);
    } else if (currentStep === 1) {
      // Zadání AC
      if (sideAC === null || sideAC <= 0) {
        setInputError('Zadej prosím kladné číslo větší než 0');
        return;
      }
      setWaitingForInput(false);
    } else if (currentStep === 3) {
      // Zadání BC
      if (sideBC === null || sideBC <= 0) {
        setInputError('Zadej prosím kladné číslo větší než 0');
        return;
      }
      setWaitingForInput(false);
    }
  };

  const drawGrid = (ctx: CanvasRenderingContext2D) => {
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

  const drawCircle = (
    ctx: CanvasRenderingContext2D,
    center: Point,
    r: number,
    color: string = '#93c5fd',
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
    
    const endAngle = Math.PI * 2 * drawProgress;
    const isDrawing = drawProgress < 1;
    
    if (isDrawing && drawProgress > 0) {
      ctx.strokeStyle = 'rgba(251, 191, 36, 0.5)';
      ctx.lineWidth = width * 10;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.arc(center.x, center.y, r, 0, endAngle);
      ctx.stroke();
    }
    
    if (drawProgress > 0) {
      ctx.strokeStyle = color;
      ctx.lineWidth = isDrawing ? width * 1.5 : width;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.arc(center.x, center.y, r, 0, endAngle);
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

  const drawCompass = (
    ctx: CanvasRenderingContext2D,
    center: Point,
    r: number,
    progress: number,
    angle: number
  ) => {
    if (!showCaptions || !compassLoaded || !compassImageRef.current) return;
    
    let compassAlpha = 0;
    
    if (progress < 0.15) {
      compassAlpha = progress / 0.15;
    } else if (progress >= 0.15 && progress <= 0.85) {
      compassAlpha = 1;
    } else if (progress > 0.85 && progress < 1) {
      compassAlpha = (1 - progress) / 0.15;
    } else {
      return;
    }
    
    const compass = compassImageRef.current;
    const compassWidth = r;
    const compassHeight = r;
    
    ctx.save();
    
    ctx.translate(center.x, center.y);
    ctx.rotate(angle);
    ctx.globalAlpha = compassAlpha;
    
    ctx.drawImage(compass, 0, -compassHeight, compassWidth, compassHeight);
    
    ctx.restore();
  };

  const getStepInfo = () => {
    switch (currentStep) {
      case 0:
        return {
          title: 'Narýsuj stranu AB',
          description: waitingForInput 
            ? 'Kolik centimetrů má mít strana AB?' 
            : `Rýsujeme stranu AB = ${sideAB} cm. Body A a B můžeš přesouvat myší!`,
          needsInput: waitingForInput,
          inputLabel: 'Délka strany AB (cm)'
        };
      case 1:
        return {
          title: 'Zapíchni kružítko do bodu A',
          description: waitingForInput
            ? 'Kolik centimetrů má mít strana AC?'
            : `Zapíchneme kružítko do bodu A a vezmeme do něj délku AC = ${sideAC} cm.`,
          needsInput: waitingForInput,
          inputLabel: 'Délka strany AC (cm)'
        };
      case 2:
        return {
          title: 'Narýsuj kružnici z bodu A',
          description: `Rýsujeme kružnici z bodu A s poloměrem AC = ${sideAC} cm.`,
          needsInput: false
        };
      case 3:
        return {
          title: 'Zapíchni kružítko do bodu B',
          description: waitingForInput
            ? 'Kolik centimetrů má mít strana BC?'
            : `Zapíchneme kružítko do bodu B a vezmeme do něj délku BC = ${sideBC} cm.`,
          needsInput: waitingForInput,
          inputLabel: 'Délka strany BC (cm)'
        };
      case 4:
        return {
          title: 'Narýsuj kružnici z bodu B',
          description: `Rýsujeme kružnici z bodu B s poloměrem BC = ${sideBC} cm.`,
          needsInput: false
        };
      case 5:
        if (!intersections) {
          return {
            title: 'Kružnice se neprotly! ❌',
            description: 'Tyto strany netvoří trojúhelník. Součet dvou stran musí být větší než třetí strana.',
            needsInput: false,
            error: true
          };
        }
        return {
          title: 'Označ průsečík jako bod C',
          description: 'Bod, ve kterém se kružnice protly, pojmenujeme C. To je třetí vrchol trojúhelníku.',
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
          description: 'Připíšeme délky stran.',
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

    // Vykreslit konstrukci podle aktuálního stavu
    const dpr2 = window.devicePixelRatio || 1;
    const angle = Math.atan2(pointB.y - pointA.y, pointB.x - pointA.x);
    const segmentColor = darkMode ? '#e5e7eb' : '#1f2937';
    const circleColor = darkMode ? '#93c5fd' : '#3b82f6';
    const highlightColor = darkMode ? '#fca5a5' : '#ef4444';
    const triangleColor = darkMode ? '#6ee7b7' : '#10b981';

    // Krok 0: AB
    if (currentStep >= 0 && sideAB) {
      const stepProgress = currentStep === 0 && !waitingForInput ? progress : 1;
      drawSegment(bufferCtx, pointA, pointB, segmentColor, 6, stepProgress);
      drawEndpointMark(bufferCtx, pointA, angle, segmentColor, hoveredPoint === 'A');
      drawEndpointMark(bufferCtx, pointB, angle, segmentColor, hoveredPoint === 'B');
      drawLabel(bufferCtx, pointA, 'A', segmentColor, -25, -12, dpr2);
      drawLabel(bufferCtx, pointB, 'B', segmentColor, 12, -12, dpr2);

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

    // Krok 1-2: Kružítko a kružnice z A
    if (currentStep >= 1 && sideAC && radiusAC > 0) {
      if (currentStep === 1 && !waitingForInput && showCaptions) {
        drawCompass(bufferCtx, pointA, radiusAC, progress, 0);
      }
      
      if (currentStep >= 2) {
        const stepProgress = currentStep === 2 ? progress : 1;
        drawCircle(bufferCtx, pointA, radiusAC, circleColor, 4, stepProgress);
        
        if (currentStep === 2 && showCaptions) {
          const currentAngle = progress > 0.15 ? Math.PI * 2 * ((progress - 0.15) / 0.7) : 0;
          drawCompass(bufferCtx, pointA, radiusAC, progress, currentAngle);
        }
      }
    }

    // Krok 3-4: Kružítko a kružnice z B
    if (currentStep >= 3 && sideBC && radiusBC > 0) {
      if (currentStep === 3 && !waitingForInput && showCaptions) {
        drawCompass(bufferCtx, pointB, radiusBC, progress, 0);
      }
      
      if (currentStep >= 4) {
        const stepProgress = currentStep === 4 ? progress : 1;
        drawCircle(bufferCtx, pointB, radiusBC, circleColor, 4, stepProgress);
        
        if (currentStep === 4 && showCaptions) {
          const currentAngle = progress > 0.15 ? Math.PI * 2 * ((progress - 0.15) / 0.7) : 0;
          drawCompass(bufferCtx, pointB, radiusBC, progress, currentAngle);
        }
      }
    }

    // Krok 5: Bod C (pokud existuje průsečík)
    if (currentStep >= 5 && intersections) {
      if (currentStep === 5 && progress > 0.3) {
        const pointProgress = Math.min((progress - 0.3) / 0.7, 1);
        bufferCtx.globalAlpha = pointProgress;
        drawPoint(bufferCtx, intersections.top, 'C', highlightColor);
        bufferCtx.globalAlpha = 1;
        
        if (pointProgress > 0.5) {
          drawLabel(bufferCtx, intersections.top, 'C', highlightColor, 12, -12, dpr2);
        }
      } else if (currentStep >= 6) {
        drawPoint(bufferCtx, intersections.top, 'C', highlightColor);
        drawLabel(bufferCtx, intersections.top, 'C', highlightColor, 12, -12, dpr2);
      }
    }

    // Krok 6: Dorýsovat strany trojúhelníku
    if (currentStep >= 6 && intersections && sideAC && sideBC) {
      const halfProgress = progress * 2;
      if (halfProgress <= 1) {
        drawSegment(bufferCtx, pointA, intersections.top, triangleColor, 5, halfProgress);
        if (showCaptions) {
          drawRuler(bufferCtx, pointA, intersections.top, halfProgress);
        }
      } else {
        drawSegment(bufferCtx, pointA, intersections.top, triangleColor, 5, 1);
        drawSegment(bufferCtx, pointB, intersections.top, triangleColor, 5, (halfProgress - 1));
        if (showCaptions) {
          drawRuler(bufferCtx, pointB, intersections.top, (halfProgress - 1));
        }
      }
      
      // Zobrazit popisky délek po narýsování
      if (currentStep > 6 || (currentStep === 6 && progress > 0.85)) {
        if (showCaptions) {
          drawLengthLabel(bufferCtx, pointA, intersections.top, sideAC, dpr2);
          drawLengthLabel(bufferCtx, pointB, intersections.top, sideBC, dpr2);
        }
      }
    }

    // Krok 7: Popisky délek
    if (currentStep >= 7 && intersections && sideAB && sideAC && sideBC) {
      if (showCaptions && progress > 0) {
        bufferCtx.globalAlpha = Math.min(progress / 0.3, 1);
        drawLengthLabel(bufferCtx, pointA, pointB, sideAB, dpr2);
        
        if (progress > 0.3) {
          bufferCtx.globalAlpha = Math.min((progress - 0.3) / 0.3, 1);
          drawLengthLabel(bufferCtx, pointA, intersections.top, sideAC, dpr2);
        }
        
        if (progress > 0.6) {
          bufferCtx.globalAlpha = Math.min((progress - 0.6) / 0.3, 1);
          drawLengthLabel(bufferCtx, pointB, intersections.top, sideBC, dpr2);
        }
        
        bufferCtx.globalAlpha = 1;
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
  }, [currentStep, scale, offset, canvasSize, pointA, pointB, hoveredPoint, animProgress, showCaptions, darkMode, sideAB, sideAC, sideBC, waitingForInput]);

  const changeStep = (newStep: number) => {
    // Zkontrolovat, zda můžeme přejít na další krok
    if (newStep > currentStep) {
      if (currentStep === 0 && !sideAB) return;
      if (currentStep === 1 && !sideAC) return;
      if (currentStep === 3 && !sideBC) return;
      if (currentStep === 5 && !intersections) return; // Nelze pokračovat bez průsečíku
    }
    
    setCurrentStep(newStep);
    setAnimProgress(0);
    setIsAnimating(true);
    
    // Nastavit, zda čekáme na input v novém kroku
    if (newStep === 0 && !sideAB) {
      setWaitingForInput(true);
    } else if (newStep === 1 && !sideAC) {
      setWaitingForInput(true);
    } else if (newStep === 3 && !sideBC) {
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
    setSideAC(null);
    setSideBC(null);
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
    if (currentStep === 5 && !intersections) return false;
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
      
      {/* Input modal - zobrazit když čekáme na vstup */}
      {stepInfo.needsInput && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className={`w-full max-w-md mx-4 rounded-2xl border p-6 ${
            darkMode
              ? 'bg-[#1a1b26] border-[#2a2b3d]'
              : 'bg-white border-gray-200'
          }`} style={{ fontFamily: "var(--font-family, 'Fenomen Sans', sans-serif)" }}>
            <div className="space-y-4">
              <BigNumberInput
                value={
                  currentStep === 0 ? sideAB :
                  currentStep === 1 ? sideAC :
                  currentStep === 3 ? sideBC :
                  null
                }
                onChange={(value) => {
                  if (currentStep === 0) {
                    setSideAB(value);
                  } else if (currentStep === 1) {
                    setSideAC(value);
                  } else if (currentStep === 3) {
                    setSideBC(value);
                  }
                }}
                min={0}
                max={99}
                step={1}
                unit="cm"
                darkMode={darkMode}
                label={stepInfo.title}
              />
              
              {inputError && (
                <div className={`p-3 rounded-lg text-sm ${
                  darkMode
                    ? 'bg-red-900/30 border border-red-700 text-red-300'
                    : 'bg-red-50 border border-red-200 text-red-700'
                }`}>
                  {inputError}
                </div>
              )}
              
              <button
                onClick={handleInputSubmit}
                className="w-full px-4 py-3 bg-[#2563eb] text-white rounded-lg hover:bg-[#1d4ed8] transition-colors"
              >
                Pokračovat
              </button>
            </div>
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
          <span className="flex items-center justify-center w-10 h-10 rounded-full text-sm font-bold shrink-0" style={{ backgroundColor: stepNotations[currentStep]?.type === 'circle' ? '#f43f5e' : stepNotations[currentStep]?.type === 'segment' ? '#10b981' : stepNotations[currentStep]?.type === 'line' ? '#8b5cf6' : '#3b82f6', color: '#fff' }}>
            {stepNotations[currentStep]?.type === 'circle' ? '○' : stepNotations[currentStep]?.type === 'segment' ? '—' : stepNotations[currentStep]?.type === 'line' ? '↔' : '•'}
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
        constructionTitle="Interaktivní konstrukce trojúhelníku"
        darkMode={darkMode}
        visible={showProtocol}
        onClose={() => setShowProtocol(false)}
      />
    </div>
  );
}
