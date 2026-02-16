import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, FileText } from 'lucide-react';
import { useIsMobile } from './ui/use-mobile';
import { ConstructionControlPanel } from './ConstructionControlPanel';
import { ConstructionStepLog, StepNotation } from './ConstructionStepLog';

interface Point {
  x: number;
  y: number;
}

interface ConstructionStep {
  id: number;
  title: string;
  description: string;
  draw: (ctx: CanvasRenderingContext2D, scale: number, offset: Point, pointA: Point, pointB: Point, radius: number, intersections: { top: Point; bottom: Point }, animProgress: number, currentStep: number, drawingStepId: number) => void;
}

interface BisectorConstructionProps {
  onBack: () => void;
  darkMode: boolean;
  onDarkModeChange: (dark: boolean) => void;
}

export function BisectorConstruction({ onBack, darkMode, onDarkModeChange }: BisectorConstructionProps) {
  const isMobile = useIsMobile();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const bufferCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const animationFrameRef = useRef<number>();
  const [currentStep, setCurrentStep] = useState(0);
  // Výchozí zoom - menší pro mobilní zařízení
  const [scale, setScale] = useState(isMobile ? 0.2 : 0.4);
  const [offset, setOffset] = useState<Point>({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState<Point>({ x: 0, y: 0 });
  const [canvasSize, setCanvasSize] = useState({ width: 1920, height: 1080 });
  const [animProgress, setAnimProgress] = useState(0);
  const [isAnimating, setIsAnimating] = useState(true);
  const [showCaptions, setShowCaptions] = useState(true);
  const [showProtocol, setShowProtocol] = useState(false);

  // Zápis konstrukce - formální notace kroků
  const stepNotations: StepNotation[] = [
    { notation: 'AB; |AB| = 6 cm', description: 'Narýsuj úsečku AB', type: 'segment' },
    { notation: 'A ∈ AB', description: 'Zapíchni kružítko do bodu A', type: 'point' },
    { notation: 'k₁(A; r), r > |AB|/2', description: 'Narýsuj kružnici z bodu A', type: 'circle' },
    { notation: 'B ∈ AB', description: 'Zapíchni kružítko do bodu B', type: 'point' },
    { notation: 'k₂(B; r)', description: 'Narýsuj kružnici z bodu B', type: 'circle' },
    { notation: 'X, Y = k₁ ∩ k₂', description: 'Označ průsečíky kružnic', type: 'point' },
    { notation: 'o ≡ XY; o ⊥ AB', description: 'Narýsuj osu úsečky', type: 'line' },
  ];

  // Pravítko a kružítko
  const rulerImageRef = useRef<HTMLImageElement | null>(null);
  const [rulerLoaded, setRulerLoaded] = useState(false);
  const compassImageRef = useRef<HTMLImageElement | null>(null);
  const [compassLoaded, setCompassLoaded] = useState(false);
  
  // Dynamické body úsečky AB
  const [pointA, setPointA] = useState<Point>({ x: 860, y: 840 });
  const [pointB, setPointB] = useState<Point>({ x: 1460, y: 840 });
  const [draggedPoint, setDraggedPoint] = useState<'A' | 'B' | null>(null);
  const [hoveredPoint, setHoveredPoint] = useState<'A' | 'B' | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);
  
  // Pinch-to-zoom state
  const [isPinching, setIsPinching] = useState(false);
  const [initialPinchDistance, setInitialPinchDistance] = useState(0);
  const [initialPinchScale, setInitialPinchScale] = useState(1);
  const [pinchCenter, setPinchCenter] = useState<Point>({ x: 0, y: 0 });

  // Výpočet délky úsečky a poloměru
  const segmentLength = Math.sqrt(
    Math.pow(pointB.x - pointA.x, 2) + Math.pow(pointB.y - pointA.y, 2)
  );
  const radius = segmentLength * 0.7; // Poloměr větší než polovina úsečky

  // Výpočet průsečíků kružnic
  const calculateIntersections = (): { top: Point; bottom: Point } => {
    const midX = (pointA.x + pointB.x) / 2;
    const midY = (pointA.y + pointB.y) / 2;
    
    // Vzdálenost středů kružnic
    const d = segmentLength;
    
    // Výpočet průsečíků dvou kružnic se stejným poloměrem
    const a = d / 2;
    const h = Math.sqrt(radius * radius - a * a);
    
    // Kolmice k AB
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

  // Inicializace buffer canvasu
  useEffect(() => {
    if (!bufferCanvasRef.current) {
      bufferCanvasRef.current = document.createElement('canvas');
    }
  }, []);

  // Načtení SVG pravítka
  useEffect(() => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      rulerImageRef.current = img;
      setRulerLoaded(true);
    };
    img.onerror = () => {
      console.error('Failed to load ruler image');
    };
    img.src = 'https://jjpiguuubvmiobmixwgh.supabase.co/storage/v1/object/public/Admin%20math/pravitko4.svg';
  }, []);

  // Načtení SVG kružítka
  useEffect(() => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      compassImageRef.current = img;
      setCompassLoaded(true);
    };
    img.onerror = () => {
      console.error('Failed to load compass image');
    };
    img.src = 'https://jjpiguuubvmiobmixwgh.supabase.co/storage/v1/object/public/Admin%20math/kruzitko.svg';
  }, []);

  // Převod souřadnic z canvas na world souřadnice
  const screenToWorld = (screenX: number, screenY: number): Point => {
    return {
      x: (screenX - offset.x) / scale,
      y: (screenY - offset.y) / scale
    };
  };

  // Zjištění, zda je myš nad bodem
  const isPointHovered = (point: Point, mouseWorld: Point, threshold: number = 15): boolean => {
    const dx = point.x - mouseWorld.x;
    const dy = point.y - mouseWorld.y;
    return Math.sqrt(dx * dx + dy * dy) < threshold;
  };

  // Zjištění, zda je myš nad labelem bodu (v screen space)
  const isLabelHovered = (point: Point, mouseScreen: Point, labelOffset: { x: number, y: number }): boolean => {
    // Převést world souřadnice bodu na screen souřadnice
    const screenX = point.x * scale + offset.x;
    const screenY = point.y * scale + offset.y;
    
    // Pozice labelu
    const labelX = screenX + labelOffset.x;
    const labelY = screenY + labelOffset.y;
    
    // Radius labelu (přibližně podle velikosti textu)
    const labelRadius = 20;
    
    // Zkontrolovat vzdálenost myši od středu labelu
    const dx = mouseScreen.x - labelX;
    const dy = mouseScreen.y - (labelY - 8); // -8 kvůli baseline textu
    return Math.sqrt(dx * dx + dy * dy) < labelRadius;
  };

  // Funkce pro vycentrování konstrukce
  const centerView = () => {
    if (!canvasSize.width || !canvasSize.height) return;
    
    // Střed úsečky AB (střed konstrukce)
    const centerX = (pointA.x + pointB.x) / 2;
    const centerY = (pointA.y + pointB.y) / 2;
    
    // Střed canvasu
    const canvasCenterX = canvasSize.width / 2;
    const canvasCenterY = canvasSize.height / 2;
    
    // Vypočítat offset tak, aby střed konstrukce byl ve středu canvasu
    setOffset({
      x: canvasCenterX - centerX * scale,
      y: canvasCenterY - centerY * scale
    });
  };

  // Resize canvas při změně velikosti okna
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

  // Vycentrovat view při první inicializaci a při změně velikosti canvasu
  useEffect(() => {
    if (canvasSize.width > 0 && canvasSize.height > 0) {
      centerView();
      if (!isInitialized) {
        setIsInitialized(true);
      }
    }
  }, [canvasSize.width, canvasSize.height, isInitialized]);

  // Nastavit fyzické rozlišení canvasu (oddělené pro HiDPI)
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

  // Animace kreslení - pomalejší pro lepší vizualizaci s pravítkem
  useEffect(() => {
    if (isAnimating && animProgress < 1) {
      animationFrameRef.current = requestAnimationFrame(() => {
        // Různé rychlosti animace podle kroků
        let increment = 0.008; // Výchozí rychlost
        
        if (currentStep === 1 || currentStep === 3) {
          // Statická kružítka - 4x pomalejší
          increment = 0.002;
        } else if (currentStep === 2 || currentStep === 4) {
          // Točící se kružítka při rýsování
          increment = 0.005;
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
  }, [isAnimating, animProgress, currentStep]);

  // Kreslení mřížky
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

  // Pomocné funkce pro kreslení
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
    
    // Modré kolečko + bílý text (jako FreeGeometryEditor)
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
    // Čárka kolmá na úsečku - stejná tloušťka jako hlavní čára
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
    
    // Hover efekt
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
    // Světlé pozadí kolem bodu
    ctx.fillStyle = darkMode ? 'rgba(75, 85, 99, 0.4)' : 'rgba(200, 200, 200, 0.3)';
    ctx.beginPath();
    ctx.arc(p.x, p.y, 10, 0, Math.PI * 2);
    ctx.fill();
    
    // Hlavní bod - větší a výraznější
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 7, 0, Math.PI * 2);
    ctx.fill();
    
    // Bílý/tmavý okraj pro kontrast
    ctx.strokeStyle = darkMode ? '#111827' : '#ffffff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 7, 0, Math.PI * 2);
    ctx.stroke();
  };

  const drawSegment = (
    ctx: CanvasRenderingContext2D,
    p1: Point,
    p2: Point,
    color: string = '#000',
    width: number = 2,
    progress: number = 1
  ) => {
    // Mapování progressu na timeline:
    // 0.00 - 0.15: Pravítko se objevuje, žádné kreslení
    // 0.15 - 0.85: Kreslení úsečky
    // 0.85 - 1.00: Pravítko mizí, kreslení hotové
    
    let drawProgress = 0;
    if (progress <= 0.15) {
      drawProgress = 0;
    } else if (progress >= 0.85) {
      drawProgress = 1;
    } else {
      drawProgress = (progress - 0.15) / 0.7;
    }
    
    // Animovaná úsečka
    const currentP2 = {
      x: p1.x + (p2.x - p1.x) * drawProgress,
      y: p1.y + (p2.y - p1.y) * drawProgress
    };
    
    const isDrawing = drawProgress < 1;
    
    // Neonový podklad při rýsování - tlustá čára pod hlavní
    if (isDrawing && drawProgress > 0) {
      ctx.strokeStyle = 'rgba(251, 191, 36, 0.5)';
      ctx.lineWidth = width * 10;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(currentP2.x, currentP2.y);
      ctx.stroke();
    }
    
    // Hlavní čára
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
    // Mapování progressu na timeline:
    // 0.00 - 0.15: Pravítko se objevuje, žádné kreslení
    // 0.15 - 0.85: Kreslení kružnice
    // 0.85 - 1.00: Pravítko mizí, kreslení hotové
    
    let drawProgress = 0;
    if (progress <= 0.15) {
      drawProgress = 0;
    } else if (progress >= 0.85) {
      drawProgress = 1;
    } else {
      drawProgress = (progress - 0.15) / 0.7;
    }
    
    // Animovaná kružnice
    const endAngle = Math.PI * 2 * drawProgress;
    const isDrawing = drawProgress < 1;
    
    // Neonový podklad při rýsování - tlustá čára pod hlavní
    if (isDrawing && drawProgress > 0) {
      ctx.strokeStyle = 'rgba(251, 191, 36, 0.5)';
      ctx.lineWidth = width * 10;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.arc(center.x, center.y, r, 0, endAngle);
      ctx.stroke();
    }
    
    // Hlavní čára
    if (drawProgress > 0) {
      ctx.strokeStyle = color;
      ctx.lineWidth = isDrawing ? width * 1.5 : width;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.arc(center.x, center.y, r, 0, endAngle);
      ctx.stroke();
    }
  };

  // Funkce pro vykreslení pravítka s fade in/out
  const drawRuler = (
    ctx: CanvasRenderingContext2D,
    p1: Point,
    p2: Point,
    progress: number
  ) => {
    if (!showCaptions || !rulerLoaded || !rulerImageRef.current) return;
    
    // Timeline animace:
    // 0.00 - 0.15: Fade in pravítka
    // 0.15 - 0.85: Pravítko viditelné, probíhá rýsování
    // 0.85 - 1.00: Fade out pravítka
    
    let rulerAlpha = 0;
    
    if (progress < 0.15) {
      // Fade in
      rulerAlpha = progress / 0.15;
    } else if (progress >= 0.15 && progress <= 0.85) {
      // Plně viditelné
      rulerAlpha = 1;
    } else if (progress > 0.85 && progress < 1) {
      // Fade out
      rulerAlpha = (1 - progress) / 0.15;
    } else {
      // Skryté
      return;
    }
    
    const ruler = rulerImageRef.current;
    // Větší pevná velikost pravítka jako fyzického objektu
    const rulerLength = 800; // Délka pravítka (delší strana)
    const rulerWidth = 400; // Šířka pravítka (kratší strana)
    
    ctx.save();
    
    // Pro přímky a úsečky - pravítko staticky přiložené podél čáry
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const lineLength = Math.sqrt(dx * dx + dy * dy);
    const angle = Math.atan2(dy, dx);
    
    // Pravítko vycentrované na střed čáry
    ctx.translate(p1.x, p1.y);
    ctx.rotate(angle);
    ctx.globalAlpha = rulerAlpha;
    
    // Vykreslíme pravítko - celé nad čárou (dolní hrana pravítka na čáře)
    const rulerOffsetX = lineLength / 2 - rulerLength / 2;
    ctx.drawImage(ruler, rulerOffsetX, -rulerWidth, rulerLength, rulerWidth);
    
    ctx.restore();
  };

  // Funkce pro vykreslení kružítka s fade in/out
  const drawCompass = (
    ctx: CanvasRenderingContext2D,
    center: Point,
    r: number,
    progress: number,
    angle: number
  ) => {
    if (!showCaptions || !compassLoaded || !compassImageRef.current) return;
    
    // Timeline animace:
    // 0.00 - 0.15: Fade in kružítka
    // 0.15 - 0.85: Kružítko viditelné, probíhá rýsování
    // 0.85 - 1.00: Fade out kružítka
    
    let compassAlpha = 0;
    
    if (progress < 0.15) {
      // Fade in
      compassAlpha = progress / 0.15;
    } else if (progress >= 0.15 && progress <= 0.85) {
      // Plně viditelné
      compassAlpha = 1;
    } else if (progress > 0.85 && progress < 1) {
      // Fade out
      compassAlpha = (1 - progress) / 0.15;
    } else {
      // Skryté - po dokončení animace
      return;
    }
    
    const compass = compassImageRef.current;
    
    // Kružítko má šířku jako poloměr kružnice
    const compassWidth = r;
    const compassHeight = r; // Stejná výška pro čtvercový tvar
    
    ctx.save();
    
    // Umístit kružítko do středu kružnice (bod A nebo B) a otočit podle úhlu
    // Kružítko se otáčí kolem bodu A/B jako osy (hrot kružítka je v levém dolním rohu SVG)
    ctx.translate(center.x, center.y);
    ctx.rotate(angle);
    ctx.globalAlpha = compassAlpha;
    
    // Vykreslíme kružítko - hrot je v levém dolním rohu SVG
    // Takže levý dolní roh SVG musí být na pozici (0, 0) = bod A/B
    // X: 0 (levý okraj na bodu A/B)
    // Y: -compassHeight (spodní okraj na Y=0, tedy na bodu A/B)
    ctx.drawImage(compass, 0, -compassHeight, compassWidth, compassHeight);
    
    ctx.restore();
  };

  const drawLine = (
    ctx: CanvasRenderingContext2D,
    p1: Point,
    p2: Point,
    color: string = '#60a5fa',
    width: number = 2,
    progress: number = 1,
    circleRadius: number = 0
  ) => {
    // Prodloužit čáru jen o malou pevnou hodnotu za body X a Y
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const length = Math.sqrt(dx * dx + dy * dy);
    // Prodloužit o pevných 50 pixelů za každou stranu
    const extend = 50;
    
    const p1Extended = {
      x: p1.x - (dx / length) * extend,
      y: p1.y - (dy / length) * extend
    };
    const p2Extended = {
      x: p2.x + (dx / length) * extend,
      y: p2.y + (dy / length) * extend
    };
    
    // Animace z bodu p1 směrem k p2 (jedním směrem)
    const totalLength = Math.sqrt(
      Math.pow(p2Extended.x - p1Extended.x, 2) + 
      Math.pow(p2Extended.y - p1Extended.y, 2)
    );
    
    const currentLength = totalLength * progress;
    
    const currentP2 = {
      x: p1Extended.x + (dx / length) * currentLength,
      y: p1Extended.y + (dy / length) * currentLength
    };
    
    // Mapování progressu na timeline:
    // 0.00 - 0.15: Pravítko se objevuje, žádné kreslení
    // 0.15 - 0.85: Kreslení čáry
    // 0.85 - 1.00: Pravítko mizí, kreslení hotové
    
    let drawProgress = 0;
    if (progress <= 0.15) {
      drawProgress = 0;
    } else if (progress >= 0.85) {
      drawProgress = 1;
    } else {
      drawProgress = (progress - 0.15) / 0.7;
    }
    
    // Přepočítat currentP2 podle drawProgress
    const drawCurrentLength = totalLength * drawProgress;
    const drawCurrentP2 = {
      x: p1Extended.x + (dx / length) * drawCurrentLength,
      y: p1Extended.y + (dy / length) * drawCurrentLength
    };
    
    const isDrawing = drawProgress < 1;
    
    // Neonový podklad při rýsování - tlustá čára pod hlavní
    if (isDrawing && drawProgress > 0) {
      ctx.strokeStyle = 'rgba(251, 191, 36, 0.5)';
      ctx.lineWidth = width * 10;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(p1Extended.x, p1Extended.y);
      ctx.lineTo(drawCurrentP2.x, drawCurrentP2.y);
      ctx.stroke();
    }
    
    // Hlavní čára
    if (drawProgress > 0) {
      ctx.strokeStyle = color;
      ctx.lineWidth = isDrawing ? width * 1.5 : width;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(p1Extended.x, p1Extended.y);
      ctx.lineTo(drawCurrentP2.x, drawCurrentP2.y);
      ctx.stroke();
    }
  };

  // Definice kroků konstrukce
  const steps: ConstructionStep[] = [
    {
      id: 0,
      title: 'Narýsuj úsečku AB',
      description: 'Začneme s úsečkou AB o délce 6 cm. Body A a B můžeš přesouvat myší!',
      draw: (ctx, s, off, pA, pB, r, inter, progress, currentStep, drawingStepId) => {
        const dpr = window.devicePixelRatio || 1;
        const angle = Math.atan2(pB.y - pA.y, pB.x - pA.x);
        const segmentColor = darkMode ? '#e5e7eb' : '#1f2937';
        
        drawSegment(ctx, pA, pB, segmentColor, 6, progress);
        drawEndpointMark(ctx, pA, angle, segmentColor, hoveredPoint === 'A');
        drawEndpointMark(ctx, pB, angle, segmentColor, hoveredPoint === 'B');
        drawLabel(ctx, pA, 'A', segmentColor, -25, -12, dpr);
        drawLabel(ctx, pB, 'B', segmentColor, 12, -12, dpr);
      }
    },
    {
      id: 1,
      title: 'Zapíchni kružítko do bodu A',
      description: 'Zapíchneme kružítko do bodu A a vezmeme do něj délku větší než polovina úsečky AB.',
      draw: (ctx, s, off, pA, pB, r, inter, progress, currentStep, drawingStepId) => {
        const dpr = window.devicePixelRatio || 1;
        const angle = Math.atan2(pB.y - pA.y, pB.x - pA.x);
        const segmentColor = darkMode ? '#e5e7eb' : '#1f2937';
        const highlightColor = darkMode ? '#fca5a5' : '#ef4444';
        
        drawSegment(ctx, pA, pB, segmentColor, 6, 1);
        
        drawEndpointMark(ctx, pA, angle, highlightColor, hoveredPoint === 'A');
        drawEndpointMark(ctx, pB, angle, segmentColor, hoveredPoint === 'B');
        drawLabel(ctx, pA, 'A', highlightColor, -25, -12, dpr);
        drawLabel(ctx, pB, 'B', segmentColor, 12, -12, dpr);
      }
    },
    {
      id: 2,
      title: 'Narýsuj kružnici z bodu A',
      description: 'S kružítkem zapíchnutým v bodě A narýsujeme kružnici s poloměrem větším než polovina úsečky.',
      draw: (ctx, s, off, pA, pB, r, inter, progress, currentStep, drawingStepId) => {
        const dpr = window.devicePixelRatio || 1;
        const angle = Math.atan2(pB.y - pA.y, pB.x - pA.x);
        const segmentColor = darkMode ? '#e5e7eb' : '#1f2937';
        const circleColor = darkMode ? '#93c5fd' : '#3b82f6';
        
        drawSegment(ctx, pA, pB, segmentColor, 6, 1);
        drawCircle(ctx, pA, r, circleColor, 4, progress);
        
        drawEndpointMark(ctx, pA, angle, segmentColor, hoveredPoint === 'A');
        drawEndpointMark(ctx, pB, angle, segmentColor, hoveredPoint === 'B');
        drawLabel(ctx, pA, 'A', segmentColor, -25, -12, dpr);
        drawLabel(ctx, pB, 'B', segmentColor, 12, -12, dpr);
      }
    },
    {
      id: 3,
      title: 'Zapíchni kružítko do bodu B',
      description: 'Teď zapíchneme kružítko do bodu B. Velikost (poloměr) v kružítku NEMĚNÍME!',
      draw: (ctx, s, off, pA, pB, r, inter, progress, currentStep, drawingStepId) => {
        const dpr = window.devicePixelRatio || 1;
        const angle = Math.atan2(pB.y - pA.y, pB.x - pA.x);
        const segmentColor = darkMode ? '#e5e7eb' : '#1f2937';
        const circleColor = darkMode ? '#93c5fd' : '#3b82f6';
        const highlightColor = darkMode ? '#fca5a5' : '#ef4444';
        
        drawSegment(ctx, pA, pB, segmentColor, 6, 1);
        drawCircle(ctx, pA, r, circleColor, 4, 1);
        
        drawEndpointMark(ctx, pA, angle, segmentColor, hoveredPoint === 'A');
        drawEndpointMark(ctx, pB, angle, highlightColor, hoveredPoint === 'B');
        drawLabel(ctx, pA, 'A', segmentColor, -25, -12, dpr);
        drawLabel(ctx, pB, 'B', highlightColor, 12, -12, dpr);
      }
    },
    {
      id: 4,
      title: 'Narýsuj kružnici z bodu B',
      description: 'S kružítkem v bodě B narýsujeme kružnici se stejným poloměrem.',
      draw: (ctx, s, off, pA, pB, r, inter, progress, currentStep, drawingStepId) => {
        const dpr = window.devicePixelRatio || 1;
        const angle = Math.atan2(pB.y - pA.y, pB.x - pA.x);
        const segmentColor = darkMode ? '#e5e7eb' : '#1f2937';
        const circleColor = darkMode ? '#93c5fd' : '#3b82f6';
        
        drawSegment(ctx, pA, pB, segmentColor, 6, 1);
        drawCircle(ctx, pA, r, circleColor, 4, 1);
        drawCircle(ctx, pB, r, circleColor, 4, progress);
        
        drawEndpointMark(ctx, pA, angle, segmentColor, hoveredPoint === 'A');
        drawEndpointMark(ctx, pB, angle, segmentColor, hoveredPoint === 'B');
        drawLabel(ctx, pA, 'A', segmentColor, -25, -12, dpr);
        drawLabel(ctx, pB, 'B', segmentColor, 12, -12, dpr);
      }
    },
    {
      id: 5,
      title: 'Označ průsečíky X a Y',
      description: 'Body, ve kterých se kružnice protly, pojmenujeme X a Y.',
      draw: (ctx, s, off, pA, pB, r, inter, progress, currentStep, drawingStepId) => {
        const dpr = window.devicePixelRatio || 1;
        const angle = Math.atan2(pB.y - pA.y, pB.x - pA.x);
        const segmentColor = darkMode ? '#e5e7eb' : '#1f2937';
        const circleColor = darkMode ? '#93c5fd' : '#3b82f6';
        const pointColor = darkMode ? '#fca5a5' : '#ef4444';
        
        drawSegment(ctx, pA, pB, segmentColor, 6, 1);
        drawCircle(ctx, pA, r, circleColor, 4, 1);
        drawCircle(ctx, pB, r, circleColor, 4, 1);
        drawEndpointMark(ctx, pA, angle, segmentColor, hoveredPoint === 'A');
        drawEndpointMark(ctx, pB, angle, segmentColor, hoveredPoint === 'B');
        
        drawLabel(ctx, pA, 'A', segmentColor, -25, -12, dpr);
        drawLabel(ctx, pB, 'B', segmentColor, 12, -12, dpr);
        
        // Průsečíky s fade-in efektem - VYKRESLIT NAKONEC (vrátí se zpět v renderToBuffer)
        // Tato část se přesune do renderToBuffer, aby body byly nad všemi vrstvami
      }
    },
    {
      id: 6,
      title: 'Narýsuj osu úsečky',
      description: 'Spojíme body X a Y přímkou. Tato přímka je OSA úsečky AB - je kolmá na AB a prochází jejím středem.',
      draw: (ctx, s, off, pA, pB, r, inter, progress, currentStep, drawingStepId) => {
        const dpr = window.devicePixelRatio || 1;
        const angle = Math.atan2(pB.y - pA.y, pB.x - pA.x);
        const segmentColor = darkMode ? '#e5e7eb' : '#1f2937';
        const circleColor = darkMode ? '#93c5fd' : '#3b82f6';
        const lineColor = darkMode ? '#6ee7b7' : '#10b981';
        
        drawSegment(ctx, pA, pB, segmentColor, 6, 1);
        
        // Osa úsečky (přímka p) - předat poloměr pro správnou délku
        drawLine(ctx, inter.top, inter.bottom, lineColor, 5, progress, r);
        
        drawCircle(ctx, pA, r, circleColor, 4, 1);
        drawCircle(ctx, pB, r, circleColor, 4, 1);
        
        drawEndpointMark(ctx, pA, angle, segmentColor, hoveredPoint === 'A');
        drawEndpointMark(ctx, pB, angle, segmentColor, hoveredPoint === 'B');
        
        drawLabel(ctx, pA, 'A', segmentColor, -25, -12, dpr);
        drawLabel(ctx, pB, 'B', segmentColor, 12, -12, dpr);
        
        // Body X, Y, S se vykreslí nakonec v renderToBuffer (nad všemi vrstvami)
      }
    }
  ];

  // Funkce pro vykreslení scény do bufferu
  const renderToBuffer = (bufferCtx: CanvasRenderingContext2D, progress: number) => {
    const dpr = window.devicePixelRatio || 1;

    // Zkontrolovat platné rozměry
    if (!bufferCanvasRef.current || bufferCanvasRef.current.width === 0 || bufferCanvasRef.current.height === 0) {
      return;
    }

    // Vyčistit buffer
    bufferCtx.clearRect(0, 0, bufferCanvasRef.current.width, bufferCanvasRef.current.height);
    
    // Škálovat context pro HiDPI
    bufferCtx.save();
    bufferCtx.scale(dpr, dpr);
    
    // Nakreslit mřížku
    drawGrid(bufferCtx);
    
    // Titulky a popis se zobrazují v horním popupu (ne na canvasu)
    
    // Aplikovat transformace
    bufferCtx.translate(offset.x, offset.y);
    bufferCtx.scale(scale, scale);

    // Vykreslit všechny předchozí kroky jako statické
    for (let i = 0; i < currentStep; i++) {
      steps[i].draw(bufferCtx, scale, offset, pointA, pointB, radius, intersections, 1, currentStep, steps[i].id);
    }
    
    // Vykreslit aktuální krok s animací
    steps[currentStep].draw(bufferCtx, scale, offset, pointA, pointB, radius, intersections, progress, currentStep, steps[currentStep].id);

    // Vykreslit pravítko/kružítko (nad konstrukcí, ale pod body)
    // Určit, který nástroj vykreslit podle aktuálního kroku
    if (showCaptions && progress > 0) {
      if (currentStep === 0) {
        // Krok 0: Úsečka AB - pravítko
        drawRuler(bufferCtx, pointA, pointB, progress);
      } else if (currentStep === 1) {
        // Krok 1: Zapíchni kružítko do bodu A - STATICKÉ kružítko (úhel 0)
        drawCompass(bufferCtx, pointA, radius, progress, 0);
      } else if (currentStep === 2) {
        // Krok 2: Kružnice z bodu A - kružítko se točí podle progressu
        const currentAngle = progress > 0.15 ? Math.PI * 2 * ((progress - 0.15) / 0.7) : 0;
        drawCompass(bufferCtx, pointA, radius, progress, currentAngle);
      } else if (currentStep === 3) {
        // Krok 3: Zapíchni kružítko do bodu B - STATICKÉ kružítko (úhel 0)
        drawCompass(bufferCtx, pointB, radius, progress, 0);
      } else if (currentStep === 4) {
        // Krok 4: Kružnice z bodu B - kružítko se točí podle progressu
        const currentAngle = progress > 0.15 ? Math.PI * 2 * ((progress - 0.15) / 0.7) : 0;
        drawCompass(bufferCtx, pointB, radius, progress, currentAngle);
      } else if (currentStep === 6) {
        // Krok 6: Osa úsečky (přímka) - pravítko
        const dx = intersections.bottom.x - intersections.top.x;
        const dy = intersections.bottom.y - intersections.top.y;
        const length = Math.sqrt(dx * dx + dy * dy);
        const extend = 50;
        
        const p1Extended = {
          x: intersections.top.x - (dx / length) * extend,
          y: intersections.top.y - (dy / length) * extend
        };
        const p2Extended = {
          x: intersections.bottom.x + (dx / length) * extend,
          y: intersections.bottom.y + (dy / length) * extend
        };
        
        drawRuler(bufferCtx, p1Extended, p2Extended, progress);
      }
    }
    
    // Vykreslit body NAKONEC (nad všemi vrstvami včetně nástrojů)
    const pointColor = darkMode ? '#fca5a5' : '#ef4444';
    const lineColor = darkMode ? '#6ee7b7' : '#10b981';
    
    if (currentStep >= 5) {
      // Krok 5+: Průsečíky X a Y
      if (currentStep === 5 && progress > 0.3) {
        const pointProgress = Math.min((progress - 0.3) / 0.7, 1);
        bufferCtx.globalAlpha = pointProgress;
        drawPoint(bufferCtx, intersections.top, 'X', pointColor);
        drawPoint(bufferCtx, intersections.bottom, 'Y', pointColor);
        bufferCtx.globalAlpha = 1;
        
        if (pointProgress > 0.5) {
          drawLabel(bufferCtx, intersections.top, 'X', pointColor, 12, -12, dpr);
          drawLabel(bufferCtx, intersections.bottom, 'Y', pointColor, 12, 12, dpr);
        }
      } else if (currentStep >= 6) {
        // Krok 6+: X, Y plně viditelné
        drawPoint(bufferCtx, intersections.top, 'X', pointColor);
        drawPoint(bufferCtx, intersections.bottom, 'Y', pointColor);
        drawLabel(bufferCtx, intersections.top, 'X', pointColor, 12, -12, dpr);
        drawLabel(bufferCtx, intersections.bottom, 'Y', pointColor, 12, 12, dpr);
        
        // Krok 6: Střed úsečky S
        if (currentStep === 6 && progress > 0.6) {
          const mid = {
            x: (pointA.x + pointB.x) / 2,
            y: (pointA.y + pointB.y) / 2
          };
          const midProgress = Math.min((progress - 0.6) / 0.4, 1);
          bufferCtx.globalAlpha = midProgress;
          drawPoint(bufferCtx, mid, 'S', lineColor);
          bufferCtx.globalAlpha = 1;
          
          if (midProgress > 0.5) {
            drawLabel(bufferCtx, mid, 'S', lineColor, 12, -12, dpr);
          }
        }
      }
    }

    bufferCtx.restore();
  };

  // Vykreslení na canvas s fade-in efektem
  useEffect(() => {
    const canvas = canvasRef.current;
    const bufferCanvas = bufferCanvasRef.current;
    if (!canvas || !bufferCanvas) return;

    // Zkontrolovat, že canvasy mají platné rozměry
    if (canvas.width === 0 || canvas.height === 0) return;
    if (bufferCanvas.width === 0 || bufferCanvas.height === 0) return;

    const ctx = canvas.getContext('2d');
    const bufferCtx = bufferCanvas.getContext('2d');
    if (!ctx || !bufferCtx) return;

    // Vykreslit scénu do bufferu
    renderToBuffer(bufferCtx, animProgress);

    // Vyčistit hlavní canvas
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Fade-in efekt: prvních 5% animace
    const fadeInAlpha = animProgress < 0.05 ? animProgress / 0.05 : 1;
    ctx.globalAlpha = fadeInAlpha;

    // Zkopírovat buffer do hlavního canvasu
    ctx.drawImage(bufferCanvas, 0, 0);

    // Resetovat alpha
    ctx.globalAlpha = 1;
  }, [currentStep, scale, offset, canvasSize, pointA, pointB, hoveredPoint, animProgress, showCaptions, darkMode]);

  // Handler pro změnu kroku - okamžitě resetovat progress
  const changeStep = (newStep: number) => {
    setCurrentStep(newStep);
    setAnimProgress(0);
    setIsAnimating(true);
  };

  // Ovládání myší
  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    const mouseWorld = screenToWorld(mouseX, mouseY);
    const mouseScreen = { x: mouseX, y: mouseY };
    
    // Zkontrolovat, zda je myš nad bodem A nebo jeho labelem
    if (isPointHovered(pointA, mouseWorld) || isLabelHovered(pointA, mouseScreen, { x: -25, y: -12 })) {
      setDraggedPoint('A');
      return;
    }
    
    // Zkontrolovat, zda je myš nad bodem B nebo jeho labelem
    if (isPointHovered(pointB, mouseWorld) || isLabelHovered(pointB, mouseScreen, { x: 12, y: -12 })) {
      setDraggedPoint('B');
      return;
    }
    
    // Jinak začít dragovat plátno
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
    
    // Pokud dragujeme bod
    if (draggedPoint === 'A') {
      setPointA(mouseWorld);
      return;
    }
    
    if (draggedPoint === 'B') {
      setPointB(mouseWorld);
      return;
    }
    
    // Pokud dragujeme plátno
    if (isDragging) {
      setOffset({
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y
      });
      return;
    }
    
    // Detekce hover nad body nebo jejich labely
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

  // Pomocná funkce pro výpočet vzdálenosti mezi dvěma dotyky
  const getTouchDistance = (touch1: React.Touch, touch2: React.Touch): number => {
    const dx = touch1.clientX - touch2.clientX;
    const dy = touch1.clientY - touch2.clientY;
    return Math.sqrt(dx * dx + dy * dy);
  };

  // Pomocná funkce pro výpočet středu mezi dvěma dotyky
  const getTouchCenter = (touch1: React.Touch, touch2: React.Touch): Point => {
    return {
      x: (touch1.clientX + touch2.clientX) / 2,
      y: (touch1.clientY + touch2.clientY) / 2
    };
  };

  // Touch eventy pro mobilní zařízení
  const handleTouchStart = (e: React.TouchEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    
    // Pinch-to-zoom s dvěma prsty
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
    
    // One finger touch
    if (e.touches.length !== 1) return;
    
    const touch = e.touches[0];
    const touchX = touch.clientX - rect.left;
    const touchY = touch.clientY - rect.top;
    const touchWorld = screenToWorld(touchX, touchY);
    const touchScreen = { x: touchX, y: touchY };
    
    // Zkontrolovat, zda je dotyk nad bodem A nebo jeho labelem
    if (isPointHovered(pointA, touchWorld) || isLabelHovered(pointA, touchScreen, { x: -25, y: -12 })) {
      setDraggedPoint('A');
      e.preventDefault();
      return;
    }
    
    // Zkontrolovat, zda je dotyk nad bodem B nebo jeho labelem
    if (isPointHovered(pointB, touchWorld) || isLabelHovered(pointB, touchScreen, { x: 12, y: -12 })) {
      setDraggedPoint('B');
      e.preventDefault();
      return;
    }
    
    // Jinak začít dragovat plátno
    setIsDragging(true);
    setDragStart({ x: touch.clientX - offset.x, y: touch.clientY - offset.y });
    e.preventDefault();
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    
    // Pinch-to-zoom s dvěma prsty
    if (e.touches.length === 2 && isPinching) {
      const currentDistance = getTouchDistance(e.touches[0], e.touches[1]);
      const currentCenter = getTouchCenter(e.touches[0], e.touches[1]);
      
      // Vypočítat nový scale
      const scaleMultiplier = currentDistance / initialPinchDistance;
      const newScale = Math.max(0.2, Math.min(0.6, initialPinchScale * scaleMultiplier));
      
      // Vypočítat pozici středu pinche relativně k canvasu
      const centerX = currentCenter.x - rect.left;
      const centerY = currentCenter.y - rect.top;
      
      // Aplikovat zoom ke středu pinche
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
    
    // Pokud dragujeme bod
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
    
    // Pokud dragujeme plátno
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

  // Zoom kolečkem myši - zoom do středu
  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    const newScale = Math.max(0.2, Math.min(0.6, scale * delta));
    
    // Získat pozici myši relativně k canvasu
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    
    // Střed canvasu
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;
    
    // Upravit offset tak, aby zoom byl ke středu
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
    
    // Střed canvasu
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;
    
    // Upravit offset tak, aby zoom byl ke středu
    const scaleChange = newScale / scale;
    setOffset({
      x: centerX - (centerX - offset.x) * scaleChange,
      y: centerY - (centerY - offset.y) * scaleChange
    });
    
    setScale(newScale);
  };

  // Určit kurzor podle stavu
  const getCursor = () => {
    if (draggedPoint) return 'grabbing';
    if (hoveredPoint) return 'move';
    if (isDragging) return 'grabbing';
    return 'grab';
  };

  const handleRestart = () => {
    changeStep(0);
    centerView();
  };
  
  const handlePlayStep = () => {
    setAnimProgress(0);
    setIsAnimating(true);
  };

  return (
    <div className="size-full flex flex-col relative">
      {/* Canvas plátno */}
      <div ref={containerRef} className={`flex-1 ${darkMode ? 'bg-[#1a1b26]' : 'bg-white'}`}>
        <canvas
          ref={canvasRef}
          className="w-full h-full"
          style={{ 
            cursor: getCursor(),
            touchAction: 'none' // Zakázat defaultní touch akce (scrollování, zoom)
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
      
      {/* Krok info nahoře */}
      <div className={`absolute top-4 left-1/2 -translate-x-1/2 z-10 rounded-2xl shadow-lg max-w-2xl ${
        darkMode ? 'bg-gray-900 border border-gray-800 text-[#c0caf5]' : 'bg-white border border-gray-200 text-gray-900'
      }`} style={{ fontFamily: "var(--font-family, 'Fenomen Sans', sans-serif)", padding: '24px 40px' }}>
        <div className={`text-base font-medium mb-3 ${darkMode ? 'text-[#565f89]' : 'text-gray-400'}`}>
          Krok {currentStep + 1} / {steps.length}
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
          {steps[currentStep]?.description}
        </div>
      </div>

      {/* Plovoucí ovládací panel dole */}
      <ConstructionControlPanel
        currentStep={currentStep}
        totalSteps={steps.length}
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

      {/* Zápis konstrukce - sidebar */}
      <ConstructionStepLog
        steps={stepNotations}
        currentStep={currentStep}
        constructionTitle="Konstrukce osy úsečky"
        darkMode={darkMode}
        visible={showProtocol}
        onClose={() => setShowProtocol(false)}
      />

      {/* Tlačítko zpět do menu - vlevo nahoře */}
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
    </div>
  );
}
