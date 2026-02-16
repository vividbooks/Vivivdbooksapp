import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { Toaster, toast } from 'sonner@2.0.3';
import katex from 'katex';
import { 
  ArrowLeft, 
  MousePointer2, 
  Circle, 
  Minus, 
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
  Printer
} from 'lucide-react';
import { useIsMobile } from './ui/use-mobile';
import { Slider } from './ui/slider';
import protractorAsset from "figma:asset/7cb6453b8f9704d306161a4002715da792974ba7.png";
import { handleToolMenuClick } from './toolMenuHandler';
import { ConstructionProtocol, ConstructionStep, Latex } from './ConstructionProtocol';
import { projectId, publicAnonKey } from '../utils/supabase/info';
import { rafThrottle, detectDevicePerformance } from '../utils/performance';

import Pero from '../imports/Group23910-135-1585';
import Pravitko from '../imports/Pravitko';
import Kruzitko from '../imports/Group23908-135-1191';
import Uhel from '../imports/Uhel';
import Papir from '../imports/Papir';

// --- TYPY ---

type ToolType = 'move' | 'point' | 'segment' | 'line' | 'ray' | 'circle' | 'angle' | 'distance' | 'perpendicular' | 'pan' | 'paper' | 'freehand' | 'highlighter';

interface GeoPoint {
  id: string;
  x: number;
  y: number;
  label: string;
  hidden?: boolean;
}

interface FreehandPath {
  id: string;
  points: {x: number, y: number}[];
  color: string;
  width: number;
  isHighlight?: boolean;
}

interface GeoShape {
  id: string;
  type: 'segment' | 'line' | 'ray' | 'circle';
  label: string;
  points: string[]; // IDs bodů, na kterých tvar závisí
  definition: {
    p1Id: string;
    p2Id?: string; // Pro kružnici je to bod na obvodu
    angle?: number; // Pro polopřímku zadanou úhlem
    length?: number; // Volitelně délka
  };
}

interface AnimationState {
  isActive: boolean;
  type: 'segment' | 'line' | 'ray' | 'circle' | 'angle' | null;
  startTime: number;
  p1: { x: number, y: number } | null;
  p2: { x: number, y: number } | null;
  angle?: number; // Cílový úhel pro animaci úhloměru
  baseAngle?: number; // Základní úhel (natočení nuly)
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

interface FreeGeometryEditorProps {
  onBack: () => void;
  darkMode: boolean;
  onDarkModeChange: (dark: boolean) => void;
  deviceType?: 'board' | 'computer';
  sharedRecording?: { name: string; steps: any[] };
}

interface RecordedStep {
  id: string;
  actionType: 'create-point' | 'create-segment' | 'create-line' | 'create-ray' | 'create-circle' | 'create-angle' | 'move-point' | 'delete' | 'freehand';
  description: string;
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

// --- HLAVNÍ KOMPONENTA ---

export function FreeGeometryEditor({ onBack, darkMode, onDarkModeChange, deviceType: deviceTypeProp, sharedRecording }: FreeGeometryEditorProps) {
  const isMobile = useIsMobile();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const animationFrameRef = useRef<number>();

  // Detekce vykon zar zenia - optimalizace pro stare tablety
  const devicePerformance = useMemo(() => detectDevicePerformance(), []);
  const isLowPerformance = devicePerformance === 'low';

  // State
  const [deviceType, setDeviceType] = useState<'board' | 'computer' | null>(deviceTypeProp ?? null);
  const [isTabletMode, setIsTabletMode] = useState(deviceTypeProp === 'board');
  const [activeTool, setActiveTool] = useState<ToolType>('point');
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

  // Assets
  const rulerImageRef = useRef<HTMLImageElement | null>(null);
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
    radius: 5,
    center: null as { x: number; y: number } | null,
    handleAngle: 0, // úhel handle od středu (radiány)
    isDraggingCenter: false,
    isDraggingHandle: false,
    mode: 'circle' as 'point' | 'circle',
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
  const pendingCircleCenterRef = useRef<string | null>(null); // ID of point created as circle center (removed if circle not completed)
  const mouseMoveThrottleRef = useRef(false); // Throttle flag for conditional throttling
  const lastTouchTimeRef = useRef<number>(0); // Timestamp posledniho touch eventu pro prevenci double-tap
  const pinchRef = useRef<{ active: boolean; lastDist: number; lastCenter: { x: number; y: number } }>({ active: false, lastDist: 0, lastCenter: { x: 0, y: 0 } });
  const [visualEffects, setVisualEffects] = useState<VisualEffect[]>([]);
  const [activeGroup, setActiveGroup] = useState<string | null>(null);
  const [showMeasurements, setShowMeasurements] = useState(true); // Toggle pro zobrazení měření - defaultně zapnuté
  const canvasWarningTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [canvasWarning, setCanvasWarning] = useState<string | null>(null);
  
  const showCanvasWarning = (msg: string) => {
    if (canvasWarningTimerRef.current) clearTimeout(canvasWarningTimerRef.current);
    setCanvasWarning(msg);
    canvasWarningTimerRef.current = setTimeout(() => setCanvasWarning(null), 2500);
  };
  
  // Výběr tvarů, laso a group drag
  const [selectedShapeIds, setSelectedShapeIds] = useState<string[]>([]);
  const [hoveredShapeForMove, setHoveredShapeForMove] = useState<string | null>(null);
  const marqueeRef = useRef<{startX: number, startY: number, endX: number, endY: number} | null>(null);
  const groupDragRef = useRef<{ startWx: number; startWy: number; pointSnapshots: {id: string; x: number; y: number}[] } | null>(null);

  const PIXELS_PER_CM = 50; // Základní jednotka: 50px = 1cm (odpovídá mřížce)

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
  const previousStateRef = useRef<{points: GeoPoint[], shapes: GeoShape[], freehandPaths: FreehandPath[]} | null>(null);
  const pendingToolVisualizationRef = useRef<RecordedStep['toolVisualization']>(undefined);
  const playbackAnimationTimeoutRef = useRef<number | null>(null);
  const recordingDebounceTimeoutRef = useRef<number | null>(null);

  // Sharing state
  const [recordingName, setRecordingName] = useState('');
  const [isSavingRecording, setIsSavingRecording] = useState(false);
  const [shareLink, setShareLink] = useState<string | null>(null);

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

    // Použít constructionSteps (mají LaTeX), fallback na recording steps
    const printSteps = constructionSteps.length > 0 ? constructionSteps : null;
    const stepsHtml = printSteps
      ? printSteps.map((step, i) => {
          const latexHtml = renderLatex(step.latex || step.notation);
          return `<tr>
            <td style="padding:8px 12px 8px 0;font-weight:bold;color:#6366f1;vertical-align:top;white-space:nowrap;font-size:15px">${step.stepNumber}.</td>
            <td style="padding:8px 0;vertical-align:top">
              <div style="font-size:16px;line-height:1.6">${latexHtml}</div>
              <div style="font-size:12px;color:#94a3b8;margin-top:2px">${step.description}</div>
            </td>
          </tr>`;
        }).join('')
      : steps.map((step, i) => {
          const desc = step.description || `Krok ${i + 1}`;
          return `<tr>
            <td style="padding:8px 12px 8px 0;font-weight:bold;color:#6366f1;vertical-align:top;white-space:nowrap">${i + 1}.</td>
            <td style="padding:8px 0;vertical-align:top">${desc}</td>
          </tr>`;
        }).join('');

    const stepCount = printSteps ? printSteps.length : steps.length;

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
      case 'create-ray': return <ArrowRight className="size-4" />;
      case 'create-circle': return <Circle className="size-4" />;
      case 'create-angle': return <span className="text-xs font-bold">∠</span>;
      case 'move-point': return <MoveDiagonal className="size-4" />;
      case 'delete': return <Trash2 className="size-4" />;
      case 'freehand': return <Pencil className="size-4" />;
      default: return <Dot className="size-4" />;
    }
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
    )
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
        { id: 'highlighter', label: 'Zvýraznění', icon: Highlighter }
      ]
    },
    {
      id: 'group_construct',
      icon: Pravitko,
      label: 'Konstrukce',
      tools: [
        { id: 'segment', label: 'Úsečka', icon: Minus },
        { id: 'line', label: 'Přímka', icon: Minus },
        { id: 'perpendicular', label: 'Kolmice', icon: Minus },
        { id: '__popup__segment_fixed', label: 'Úsečka o rozměru', icon: Ruler }
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
  const deletePoint = (id: string) => {
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

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.key === 'Delete' || e.key === 'Backspace') && (selection || selectedShapeIds.length > 0)) {
        if (selectedShapeIds.length > 0) {
          // Smazat vybrané tvary a jejich definiční body
          const shapeIdsToDelete = new Set(selectedShapeIds);
          const pointIdsToDelete = new Set<string>();
          shapes.forEach(s => {
            if (shapeIdsToDelete.has(s.id)) {
              s.points.forEach(pid => pointIdsToDelete.add(pid));
            }
          });
          setShapes(prev => prev.filter(s => !shapeIdsToDelete.has(s.id)));
          // Smazat body, které nejsou používané jinými tvary
          const remainingShapes = shapes.filter(s => !shapeIdsToDelete.has(s.id));
          const usedPointIds = new Set<string>();
          remainingShapes.forEach(s => s.points.forEach(pid => usedPointIds.add(pid)));
          setPoints(prev => prev.filter(p => !pointIdsToDelete.has(p.id) || usedPointIds.has(p.id)));
          setSelectedShapeIds([]);
        } else if (selection) {
          deletePoint(selection);
        }
      }
      if (e.key === 'Escape') {
        setActiveTool('move');
        setSelectedPointId(null);
        setSelectedShapeIds([]);
        setActiveGroup(null);
        setAngleInput(prev => ({ ...prev, visible: false }));
        setAngleTabletState({ step: 'idle', selectedLineId: null, currentPos: null, baseAngle: 0 });
        marqueeRef.current = null;
        groupDragRef.current = null;
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
  }, [selection, historyIndex, history, selectedShapeIds, shapes, points]);

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

  // Automatické ukládání do historie při změně stavu
  useEffect(() => {
    if (isUndoRedoRef.current) {
      isUndoRedoRef.current = false;
      return;
    }

    if (points.length === 0 && shapes.length === 0 && freehandPaths.length === 0) {
      return;
    }

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
      if (newHistory.length > 50) {
        return newHistory.slice(newHistory.length - 50);
      }
      return newHistory;
    });
    setHistoryIndex(prev => Math.min(prev + 1, 49));
  }, [points, shapes, freehandPaths]);

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
        const typeNames: Record<string, string> = { segment: 'úsečky', line: 'přímky', ray: 'polopřímky', circle: 'kružnice', angle: 'úhlu' };
        description = `Vytvoření ${typeNames[newShape.type] || newShape.type} ${newShape.label}`;
        if (newShape.type === 'segment') actionType = 'create-segment';
        else if (newShape.type === 'line') actionType = 'create-line';
        else if (newShape.type === 'ray') actionType = 'create-ray';
        else if (newShape.type === 'circle') actionType = 'create-circle';
        else if (newShape.type === 'angle') actionType = 'create-angle';
        else actionType = 'create-segment';
      } else if (shapes.length > prev.shapes.length) {
        // Pouze tvar (bez nových bodů)
        const newShape = shapes[shapes.length - 1];
        const typeNames: Record<string, string> = { segment: 'úsečky', line: 'přímky', ray: 'polopřímky', circle: 'kružnice', angle: 'úhlu' };
        description = `Vytvoření ${typeNames[newShape.type] || newShape.type} ${newShape.label}`;
        if (newShape.type === 'segment') actionType = 'create-segment';
        else if (newShape.type === 'line') actionType = 'create-line';
        else if (newShape.type === 'ray') actionType = 'create-ray';
        else if (newShape.type === 'circle') actionType = 'create-circle';
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
      } else if (points.length < prev.points.length) {
        const deletedPoint = prev.points.find(p => !points.some(pt => pt.id === p.id));
        description = `Smazání bodu ${deletedPoint?.label || ''}`;
        actionType = 'delete';
      } else if (shapes.length < prev.shapes.length) {
        const deletedShape = prev.shapes.find(s => !shapes.some(sh => sh.id === s.id));
        description = `Smazání tvaru ${deletedShape?.label || ''}`;
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
        // Otevrit prehravac primo po nahravani
        setEditableSteps(recordingState.steps);
        setRecordingState(prev => ({
          ...prev,
          isRecording: false,
          showPlayer: true,
          currentStepIndex: -1
        }));
        // Vycistit canvas pro prehravani
        setPoints([]);
        setShapes([]);
        setFreehandPaths([]);
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

  // --- GENERÁTORY NÁZVŮ ---
  const getNextPointLabel = () => {
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    // Jednoduchá logika - najde první volné písmeno, nebo přidá index
    for (const char of alphabet) {
      if (!points.some(p => p.label === char)) return char;
    }
    return 'A' + (points.length + 1);
  };

  const getNextShapeLabel = (type: 'segment' | 'line' | 'circle') => {
    if (type === 'circle') {
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
    objectIds: string[] = []
  ) => {
    constructionStepCounter.current += 1;
    const step: ConstructionStep = {
      id: crypto.randomUUID(),
      stepNumber: constructionStepCounter.current,
      type,
      notation,
      latex,
      description,
      objectIds
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

  // Helper: vzdálenost v cm
  const distanceCm = (x1: number, y1: number, x2: number, y2: number): string => {
    const px = Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
    const cm = px / PIXELS_PER_CM;
    return cm % 1 === 0 ? cm.toFixed(0) : cm.toFixed(1);
  };

  // --- POHYB A ZOOM ---
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

  // Initialize compass center when compass mode opens
  useEffect(() => {
    if (circleInput.visible && !circleInput.center) {
      const centerX = (canvasSize.width / 2 - offset.x) / scale;
      const centerY = (canvasSize.height / 2 - offset.y) / scale;
      setCircleInput(prev => ({ ...prev, center: { x: centerX, y: centerY } }));
    }
  }, [circleInput.visible, circleInput.center]);

  // Cleanup pending circle center when tool changes or circle creation is cancelled
  useEffect(() => {
    if (activeTool !== 'circle' && pendingCircleCenterRef.current) {
      const pendingId = pendingCircleCenterRef.current;
      pendingCircleCenterRef.current = null;
      // Remove the orphaned center point (only if it's not used by any shape)
      setPoints(prev => {
        const usedByShape = shapes.some(s =>
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

  const screenToWorld = (sx: number, sy: number) => ({
    x: (sx - offset.x) / scale,
    y: (sy - offset.y) / scale
  });

  const getSnappingPoint = (wx: number, wy: number, threshold = 20) => {
    const effectiveThreshold = isTabletMode ? threshold * 1.5 : threshold;
    let closest: GeoPoint | null = null;
    let minDist = effectiveThreshold / scale;

    for (const p of points) {
      const isCircleHandle = shapes.some(s => s.type === 'circle' && s.definition.p2Id === p.id);
      const currentThreshold = isCircleHandle ? 15 / scale : minDist;
      
      const distToPoint = Math.sqrt(Math.pow(p.x - wx, 2) + Math.pow(p.y - wy, 2));
      
      const labelX = p.x + 20;
      const labelY = p.y - 20;
      const distToLabel = Math.sqrt(Math.pow(labelX - wx, 2) + Math.pow(labelY - wy, 2));
      const labelRadius = 18;
      
      let isNearPoint = false;
      if (distToPoint < currentThreshold) {
        isNearPoint = true;
      } else if (!isCircleHandle && distToLabel < labelRadius) {
        isNearPoint = true;
      }
      
      if (isNearPoint && distToPoint < minDist) {
        minDist = distToPoint;
        closest = p;
      } else if (isNearPoint && !isCircleHandle && distToLabel < labelRadius) {
        closest = p;
        minDist = 0;
      }
    }
    return closest;
  };

  // Unified snap: first try existing points, then intersection points
  const getSnapPosition = (wx: number, wy: number, threshold = 25): { x: number; y: number } | null => {
    const pointSnap = getSnappingPoint(wx, wy, threshold);
    if (pointSnap) return { x: pointSnap.x, y: pointSnap.y };
    const intSnap = findNearestIntersection(wx, wy, threshold);
    if (intSnap) return intSnap;
    return null;
  };

  // Helper: najde nejbližší průsečík dvou čar/kružnic v okolí bodu
  const findNearestIntersection = (wx: number, wy: number, threshold = 30): {x: number, y: number} | null => {
    const lineShapes = shapes.filter(s => ['line', 'segment', 'ray'].includes(s.type));
    const circleShapes = shapes.filter(s => s.type === 'circle');
    const effectiveThreshold = isTabletMode ? threshold * 1.5 : threshold;
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

        if (s1.type === 'segment' && (t < 0 || t > 1)) continue;
        if (s1.type === 'ray' && t < 0) continue;
        if (s2.type === 'segment' && (u < 0 || u > 1)) continue;
        if (s2.type === 'ray' && u < 0) continue;

        const ix = a1.x + t * dx1;
        const iy = a1.y + t * dy1;
        const dist = Math.sqrt((ix - wx) ** 2 + (iy - wy) ** 2);
        if (dist < bestDist) {
          bestDist = dist;
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
    e.preventDefault();
    
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

  const handleMouseDown = (e: React.MouseEvent) => {
    if (animState.isActive) return;
    
    // Zavřít otevřené submenu při kliknutí na canvas
    setActiveGroup(null);
    
    // Ignorovat mouse eventy ktere prisly kratce po touch eventu (< 500ms)
    // Prevence duplicitniho zpracovani na tabletech
    const timeSinceTouch = Date.now() - lastTouchTimeRef.current;
    if (timeSinceTouch < 500 && timeSinceTouch > 0) {
      return; // Ignorovat - uz byl zpracovan touch event
    }

    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const wx = (e.clientX - rect.left - offset.x) / scale;
    const wy = (e.clientY - rect.top - offset.y) / scale;

    // Compass mode - handle center/handle dragging or repositioning
    if (circleInput.visible && circleInput.center) {
      const r = circleInput.radius * PIXELS_PER_CM;
      const handleX = circleInput.center.x + Math.cos(circleInput.handleAngle) * r;
      const handleY = circleInput.center.y + Math.sin(circleInput.handleAngle) * r;
      
      const distToHandle = Math.sqrt(Math.pow(wx - handleX, 2) + Math.pow(wy - handleY, 2));
      const distToCenter = Math.sqrt(Math.pow(wx - circleInput.center.x, 2) + Math.pow(wy - circleInput.center.y, 2));
      
      const threshold = 40 / scale;
      
      if (distToHandle < threshold) {
        setCircleInput(prev => ({ ...prev, isDraggingHandle: true }));
      } else if (distToCenter < threshold) {
        setCircleInput(prev => ({ ...prev, isDraggingCenter: true }));
      } else {
        // Snap to nearest point or intersection
        const snap = getSnapPosition(wx, wy, 30);
        const snapX = snap ? snap.x : wx;
        const snapY = snap ? snap.y : wy;
        setCircleInput(prev => ({ ...prev, center: { x: snapX, y: snapY } }));
      }
      return;
    }
    if (circleInput.visible && !circleInput.center) {
      return; // Center not yet initialized
    }

    if (angleInput.visible) {
      showCanvasWarning('Nejdříve nastavte úhel');
      return; // Nedělat nic - uživatel musí kliknout na "Narýsovat" nebo zavřít popup
    }

    if (segmentInput.visible) {
      showCanvasWarning('Nejdříve nastavte délku');
      return; // Nedělat nic - uživatel musí kliknout na "Použít" nebo zavřít popup
    }

    // Pokud máme nástroj úhel a hoverujeme nad tvarem, otevřeme dialog
    if (activeTool === 'angle' && hoveredShape) {
        // Tablet mód - krokový workflow
        if (isTabletMode) {
          if (angleTabletState.step === 'selectLine') {
            // Krok 1: Výběr linky (s přichytáváním na body)
            const baseShape = shapes.find(s => s.id === hoveredShape.id);
            if (baseShape && ['line', 'segment', 'ray'].includes(baseShape.type)) {
              let initPos = hoveredShape.proj;
              const snap = getSnapPosition(hoveredShape.proj.x, hoveredShape.proj.y, 25);
              if (snap) initPos = snap;
              setAngleTabletState({
                step: 'positioning',
                selectedLineId: baseShape.id,
                currentPos: initPos,
                baseAngle: hoveredShape.angle
              });
            }
            return;
          }
          // Krok 2: positioning - čekáme na tlačítko, ne na klik
          return;
        }
        
        // PC mód - původní logika (jeden klik otevře popup) s přichytáváním na body/průsečíky
        let anglePos = hoveredShape.proj;
        const snapAngle = getSnapPosition(hoveredShape.proj.x, hoveredShape.proj.y, 25);
        if (snapAngle) {
          anglePos = snapAngle;
        }
        setAngleInput({
            visible: true,
            value: 45,
            vertexId: null, 
            directionId: null,
            customVertex: anglePos,
            baseAngle: hoveredShape.angle,
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

    const snapped = getSnappingPoint(wx, wy);

    // NÁSTROJ: POSUN PLÁTNA (PAN)
    if (activeTool === 'pan') {
       isPanning.current = true;
       lastPanPos.current = { x: e.clientX, y: e.clientY };
       return;
    }

    // 1. NÁSTROJ: POSUN (MOVE) — výběr bodů i tvarů + group drag
    if (activeTool === 'move') {
      if (snapped) {
        // Bod je součástí vybraných tvarů? => group drag
        const isPartOfSelection = selectedShapeIds.length > 0 && shapes.some(s => 
          selectedShapeIds.includes(s.id) && s.points.includes(snapped.id)
        );
        if (isPartOfSelection) {
          // Začít group drag všech bodů vybraných tvarů
          const allPointIds = new Set<string>();
          shapes.forEach(s => {
            if (selectedShapeIds.includes(s.id)) s.points.forEach(pid => allPointIds.add(pid));
          });
          groupDragRef.current = {
            startWx: wx, startWy: wy,
            pointSnapshots: points.filter(p => allPointIds.has(p.id)).map(p => ({ id: p.id, x: p.x, y: p.y }))
          };
        } else {
          setDraggedPointId(snapped.id);
          setSelection(snapped.id);
          if (!(e.ctrlKey || e.metaKey)) setSelectedShapeIds([]);
        }
      } else {
        // Zkusit vybrat tvar kliknutím
        const clickedShapeId = getHoveredShapeAtPoint(wx, wy);
        if (clickedShapeId) {
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
            const effectiveIds = alreadySelected ? selectedShapeIds : [clickedShapeId];
            const allPointIds = new Set<string>();
            shapes.forEach(s => {
              if (effectiveIds.includes(s.id)) s.points.forEach(pid => allPointIds.add(pid));
            });
            if (allPointIds.size > 0) {
              groupDragRef.current = {
                startWx: wx, startWy: wy,
                pointSnapshots: points.filter(p => allPointIds.has(p.id)).map(p => ({ id: p.id, x: p.x, y: p.y }))
              };
            }
          }
          setSelection(null);
        } else {
          // Empty space click: start rectangle marquee selection
          setSelection(null);
          if (!(e.ctrlKey || e.metaKey)) {
            setSelectedShapeIds([]);
          }
          groupDragRef.current = null;
          marqueeRef.current = { startX: wx, startY: wy, endX: wx, endY: wy };
        }
      }
      return;
    }

    // 2. NÁSTROJ: BOD (POINT)
    if (activeTool === 'point') {
      if (snapped && (snapped.hidden || !snapped.label)) {
        // Klik na skrytý/neoznačený bod (např. definiční bod přímky) — povýšit na viditelný
        const assignedLabel = promoteToVisiblePoint(snapped.id);
        triggerEffect(snapped.x, snapped.y, '#3b82f6');
        if (assignedLabel) {
          addConstructionStep('point', assignedLabel, assignedLabel, `Bod ${assignedLabel}`, [snapped.id]);
        }
      } else if (!snapped) {
        // Zkusit přichytit k průsečíku dvou čar
        const intersection = findNearestIntersection(wx, wy);
        const px = intersection ? intersection.x : wx;
        const py = intersection ? intersection.y : wy;
        // Vytvořit nový bod
        const newPoint: GeoPoint = {
          id: crypto.randomUUID(),
          x: px,
          y: py,
          label: getNextPointLabel()
        };
        setPoints(prev => [...prev, newPoint]);
        triggerEffect(px, py, '#3b82f6'); // Effect
        // Zápis konstrukce
        addConstructionStep('point', newPoint.label, newPoint.label, `Bod ${newPoint.label}`, [newPoint.id]);
      }
      // Pokud snapped je viditelný bod s labelem — nic nedělat (bod již existuje)
      return;
    }

    // 3. NÁSTROJ: KOLMICE
    if (activeTool === 'perpendicular') {
      // Tablet mód - speciální workflow
      if (isTabletMode) {
        if (perpTabletState.step === 'selectLine') {
          // Krok 1: Výběr linky (s přichytáváním na body)
          if (hoveredShape) {
            const baseShape = shapes.find(s => s.id === hoveredShape.id);
            if (baseShape && ['line', 'segment', 'ray'].includes(baseShape.type)) {
              let initPos = hoveredShape.proj;
              const snap = getSnapPosition(hoveredShape.proj.x, hoveredShape.proj.y, 25);
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
      if (hoveredShape) {
        const baseShape = shapes.find(s => s.id === hoveredShape.id);
        if (baseShape && ['line', 'segment', 'ray'].includes(baseShape.type)) {
            
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
            
            // Snap to existing point, then intersection, then raw position
            const snapPos = snapped ? { x: snapped.x, y: snapped.y } : getSnapPosition(wx, wy, 25);
            const pX = snapPos ? snapPos.x : wx;
            const pY = snapPos ? snapPos.y : wy;
            
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
            pendingToolVisualizationRef.current = {
                type: 'ruler',
                p1: { x: pX, y: pY },
                p2: { x: pX + (perpDx / len) * 100, y: pY + (perpDy / len) * 100 },
                angle: Math.atan2(perpDy, perpDx) * 180 / Math.PI
            };
            
            setShapes(prev => [...prev, newLine]);
            triggerEffect(pX, pY, '#3b82f6');
            // Zápis konstrukce - kolmice
            addConstructionStep('perpendicular', `${newLine.label} ⊥ ${baseShape.label}`, `${newLine.label} \\perp ${baseShape.label}`, `Kolmice ${newLine.label} k přímce ${baseShape.label}`, [newLine.id]);
            setActiveTool('move'); // Reset nástroje po dokončení
        }
      }
      return;
    }

    // 5. NÁSTROJ: VOLNÉ PERO / ZVÝRAZŇOVAČ
    if (activeTool === 'freehand' || activeTool === 'highlighter') {
       if (activeTool === 'highlighter' && e.shiftKey && lastHighlightPointRef.current) {
         // Shift+click: straight line from last point to here
         const start = lastHighlightPointRef.current;
         setFreehandPaths(prev => [...prev, {
           id: crypto.randomUUID(),
           points: [start, { x: wx, y: wy }],
           color: 'rgba(250, 204, 21, 0.4)',
           width: 20,
           isHighlight: true,
         }]);
         lastHighlightPointRef.current = { x: wx, y: wy };
         return;
       }
       currentPathRef.current = [{ x: wx, y: wy }];
       return;
    }

    // 4. NÁSTROJE TVARŮ (ÚSEČKA, PŘÍMKA, KRUŽNICE, ÚHEL)
    // V tablet módu úhloměr nepoužívá 2-bodový workflow
    if (activeTool === 'angle' && isTabletMode) return;
    if (['segment', 'line', 'circle', 'angle'].includes(activeTool)) {
      let targetPointId = snapped?.id;

      // Pokud klikneme do prázdna, vytvoříme bod automaticky
      // KROMĚ: druhého kliku s aktivním fixním poloměrem (ten vytvoří bod sám)
      // KROMĚ: druhého kliku s aktivní fixní délkou úsečky (ten vytvoří bod sám)
      if (!targetPointId) {
        const skipAutoPoint = 
          (activeTool === 'segment' && segmentInput.active && segmentInput.mode === 'fixed' && selectedPointId !== null) ||
          (activeTool === 'circle' && isTabletMode && selectedPointId === null); // Tablet circle first click handled by its own section with intersection snapping
        
        if (!skipAutoPoint) {
          const isHidden = activeTool === 'line';
          // Pro kružnici: pokud je už vybraný první bod (střed), druhý bod (na obvodu) nemá label
          const isCircleRadiusPoint = activeTool === 'circle' && selectedPointId !== null;
          // Zkusit přichytit k průsečíku dvou čar
          const intersection = findNearestIntersection(wx, wy);
          const ptX = intersection ? intersection.x : wx;
          const ptY = intersection ? intersection.y : wy;
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
            // Zkusit přichytit k průsečíku dvou čar
            const intersection = findNearestIntersection(wx, wy);
            const cX = intersection ? intersection.x : wx;
            const cY = intersection ? intersection.y : wy;
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
        startConstructionAnimation(activeTool as 'segment'|'line'|'circle'|'ray', p1, p2);
        setSelectedPointId(null);
      }
    }
  };

  const confirmAngle = () => {
    // Podpora pro customVertex (přichycení k čáře)
    if (angleInput.customVertex && angleInput.baseAngle !== undefined) {
         setAngleInput(prev => ({ ...prev, visible: false }));
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

         const dummyP2 = {
             x: startP.x + Math.cos(finalRad) * 200,
             y: startP.y + Math.sin(finalRad) * 200,
             id: 'temp-end'
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
      const p2 = {
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
        progress: 0
      });
    }
    
    setAngleInput(prev => ({ ...prev, visible: false }));
    // Reset angle tablet state po narýsování
    if (isTabletMode) {
      setAngleTabletState({ step: 'idle', selectedLineId: null, currentPos: null, baseAngle: 0 });
    }
  };

  const distToSegment = (p: {x:number, y:number}, v: {x:number, y:number}, w: {x:number, y:number}) => {
    const l2 = (w.x - v.x) ** 2 + (w.y - v.y) ** 2;
    if (l2 === 0) return { dist: Math.sqrt((p.x - v.x) ** 2 + (p.y - v.y) ** 2), proj: v, t: 0 };
    let t = ((p.x - v.x) * (w.x - v.x) + (p.y - v.y) * (w.y - v.y)) / l2;
    t = Math.max(0, Math.min(1, t));
    const proj = { x: v.x + t * (w.x - v.x), y: v.y + t * (w.y - v.y) };
    return {
        dist: Math.sqrt((p.x - proj.x) ** 2 + (p.y - proj.y) ** 2),
        proj: proj,
        t: t
    };
  };

  // Detekce nejbližšího tvaru pod kurzorem (pro výběr kliknutím)
  const getHoveredShapeAtPoint = (wx: number, wy: number, threshold = 15): string | null => {
    let closestId: string | null = null;
    let minD = threshold / scale;

    shapes.forEach(shape => {
      const p1 = points.find(p => p.id === shape.definition.p1Id);
      const p2 = points.find(p => p.id === shape.definition.p2Id);
      if (!p1 || !p2) return;

      if (shape.type === 'circle') {
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
        if (shape.type === 'line' || shape.type === 'ray') {
          const dx = p2.x - p1.x;
          const dy = p2.y - p1.y;
          const len = Math.sqrt(dx * dx + dy * dy);
          if (len > 0.001) {
            const EXT = 100000;
            if (shape.type === 'line') start = { x: p1.x - dx / len * EXT, y: p1.y - dy / len * EXT };
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
    if (activeTool === 'pan' && isPanning.current) {
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

    // Angle tool shape snapping
    if (activeTool === 'angle' || activeTool === 'perpendicular') {
        let closest = null;
        // During positioning mode, always snap to the selected line (no distance limit)
        const isInPositioningMode = 
          (activeTool === 'perpendicular' && isTabletMode && perpTabletState.step === 'positioning') ||
          (activeTool === 'angle' && isTabletMode && angleTabletState.step === 'positioning');
        // Use larger threshold for touch interactions (finger is less precise than mouse)
        const isTouchActive = (Date.now() - lastTouchTimeRef.current) < 1000;
        const baseThreshold = isTouchActive ? 80 : 50;
        let minD = isInPositioningMode ? Infinity : baseThreshold / scale;

        shapes.forEach(shape => {
            if (shape.type === 'segment' || shape.type === 'line' || shape.type === 'ray') {
                // V positioning módu kolmice snappuj pouze na vybranou linku
                if (activeTool === 'perpendicular' && isTabletMode && perpTabletState.step === 'positioning') {
                    if (shape.id !== perpTabletState.selectedLineId) return;
                }
                // V positioning módu úhloměru snappuj pouze na vybranou linku
                if (activeTool === 'angle' && isTabletMode && angleTabletState.step === 'positioning') {
                    if (shape.id !== angleTabletState.selectedLineId) return;
                }
                const p1 = points.find(p => p.id === shape.definition.p1Id);
                const p2 = points.find(p => p.id === shape.definition.p2Id);
                if (p1 && p2) {
                    let start = p1;
                    let end = p2;
                    // Pro ray a line musíme "prodloužit" segment pro detekci
                    if (shape.type === 'line' || shape.type === 'ray') {
                         const dx = p2.x - p1.x;
                         const dy = p2.y - p1.y;
                         const len = Math.sqrt(dx*dx + dy*dy);
                         if (len > 0.001) {
                             const EXT = 100000;
                             if (shape.type === 'line') start = { x: p1.x - dx/len * EXT, y: p1.y - dy/len * EXT } as any;
                             end = { x: p1.x + dx/len * EXT, y: p1.y + dy/len * EXT } as any;
                         }
                    }

                    const res = distToSegment({x:wx, y:wy}, start, end);
                    if (res.dist < minD) {
                        minD = res.dist;
                        const angle = Math.atan2(p2.y - p1.y, p2.x - p1.x);
                        closest = { id: shape.id, proj: res.proj, angle: angle };
                    }
                }
            }
        });
        setHoveredShape(closest);
    } else {
        if (hoveredShape) setHoveredShape(null);
    }

    // Hover logic for points
    const snapped = getSnappingPoint(wx, wy);
    setHoveredPointId(snapped ? snapped.id : null);
    mousePosRef.current = { x: wx, y: wy };

    // Intersection snap indicator (only when no point is snapped and tool is relevant)
    if (!snapped && ['point', 'circle', 'segment', 'line', 'angle', 'perpendicular'].includes(activeTool)) {
      nearestIntersectionRef.current = findNearestIntersection(wx, wy);
    } else {
      nearestIntersectionRef.current = null;
    }

    // Shape hover pro nástroj Výběr (detekce tvaru pod kurzorem)
    if (activeTool === 'move' && !draggedPointId && !groupDragRef.current && !marqueeRef.current) {
      const hovered = snapped ? null : getHoveredShapeAtPoint(wx, wy);
      setHoveredShapeForMove(hovered);
    } else if (activeTool !== 'move') {
      if (hoveredShapeForMove) setHoveredShapeForMove(null);
    }

    // Group drag — přesouvání všech bodů vybraných tvarů
    if (activeTool === 'move' && groupDragRef.current) {
      const gd = groupDragRef.current;
      const dx = wx - gd.startWx;
      const dy = wy - gd.startWy;
      const snapMap = new Map(gd.pointSnapshots.map(s => [s.id, s]));
      setPoints(prev => prev.map(p => {
        const snap = snapMap.get(p.id);
        return snap ? { ...p, x: snap.x + dx, y: snap.y + dy } : p;
      }));
      return;
    }

    // Drag logic (single point)
    if (activeTool === 'move' && draggedPointId) {
      setPoints(prev => prev.map(p => 
        p.id === draggedPointId 
          ? { ...p, x: wx, y: wy } 
          : p
      ));
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
        // Snap to nearby point on the line
        const snapPerp = getSnapPosition(hoveredShape.proj.x, hoveredShape.proj.y, 25);
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
    
    // Compass mode - dragging handle or center
    if (circleInput.visible && circleInput.center) {
      if (circleInput.isDraggingHandle) {
        const dx = wx - circleInput.center.x;
        const dy = wy - circleInput.center.y;
        const newRadiusPx = Math.sqrt(dx * dx + dy * dy);
        const newRadiusCm = Math.max(0.5, newRadiusPx / PIXELS_PER_CM);
        const rounded = Math.round(newRadiusCm * 2) / 2; // Zaokrouhlit na 0.5
        setCircleInput(prev => ({
          ...prev,
          radius: rounded,
          handleAngle: Math.atan2(dy, dx)
        }));
        return;
      }
      if (circleInput.isDraggingCenter) {
        const snap = getSnapPosition(wx, wy, 25);
        const snapX = snap ? snap.x : wx;
        const snapY = snap ? snap.y : wy;
        setCircleInput(prev => ({ ...prev, center: { x: snapX, y: snapY } }));
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
    }
    
    // Compass mode - end dragging
    if (circleInput.isDraggingHandle || circleInput.isDraggingCenter) {
      setCircleInput(prev => ({ ...prev, isDraggingHandle: false, isDraggingCenter: false }));
    }
    
    setDraggedPointId(null);
    if (activeTool === 'pan') {
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
                color: isHL ? 'rgba(250, 204, 21, 0.4)' : '#3b82f6',
                width: isHL ? 20 : 2,
                isHighlight: isHL || undefined,
            }]);
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
          
          if (shape.type === 'circle') {
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
        
        setSelectedShapeIds(foundShapeIds);
        if (foundPointIds.length > 0 && foundShapeIds.length === 0) {
          setSelection(foundPointIds[0]);
        }
      }
      
      marqueeRef.current = null;
    }
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    // Prevent default vzdy pro vsechny nastroje aby se zabranilo mouse eventum
    e.preventDefault();
    
    // Zavřít otevřené submenu při dotyku na canvas
    setActiveGroup(null);
    
    // Zaznamej cas touch eventu
    lastTouchTimeRef.current = Date.now();
    
    // Two-finger gesture: pinch-to-zoom & pan
    if (e.touches.length === 2) {
      const t1 = e.touches[0];
      const t2 = e.touches[1];
      const dist = Math.sqrt(Math.pow(t2.clientX - t1.clientX, 2) + Math.pow(t2.clientY - t1.clientY, 2));
      const cx = (t1.clientX + t2.clientX) / 2;
      const cy = (t1.clientY + t2.clientY) / 2;
      pinchRef.current = { active: true, lastDist: dist, lastCenter: { x: cx, y: cy } };
      // Cancel any single-finger action in progress
      if (draggedPointId) setDraggedPointId(null);
      if (isPanning.current) isPanning.current = false;
      if (groupDragRef.current) groupDragRef.current = null;
      if (marqueeRef.current) marqueeRef.current = null;
      return;
    }
    
    if (e.touches.length === 1 && !pinchRef.current.active) {
      const touch = e.touches[0];
      const fakeEvent = {
        clientX: touch.clientX,
        clientY: touch.clientY,
        target: e.target,
        ctrlKey: false,
        metaKey: false,
        preventDefault: () => {},
        stopPropagation: () => {}
      } as unknown as React.MouseEvent;
      handleMouseDown(fakeEvent);
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
        stopPropagation: () => {}
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
      handleMouseUp();
  };

  // --- ANIMACE ---
  const startConstructionAnimation = (
    type: 'segment' | 'line' | 'circle' | 'ray', 
    p1: {x: number, y: number, id: string}, 
    p2: {x: number, y: number, id: string}
  ) => {
    // Uložit vizualizaci pro přehrávání
    const angle = Math.atan2(p2.y - p1.y, p2.x - p1.x);
    const radius = Math.sqrt((p2.x - p1.x) ** 2 + (p2.y - p1.y) ** 2);
    
    if (type === 'segment' || type === 'line' || type === 'ray') {
      pendingToolVisualizationRef.current = {
        type: 'ruler',
        p1: { x: p1.x, y: p1.y },
        p2: { x: p2.x, y: p2.y },
        angle
      };
    } else if (type === 'circle') {
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
      type: type,
      startTime: performance.now(),
      p1,
      p2,
      progress: 0
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
        const duration = isLowPerformance ? 1000 : 2000; // ms (zkr ceno pro star  za zen )
        const elapsed = time - animState.startTime;
        const rawProgress = Math.min(elapsed / duration, 1);
        
        setAnimState(prev => ({ ...prev, progress: rawProgress }));

        if (rawProgress >= 1) {
          // Konec animace -> Vytvořit trvalý tvar
          // POZOR: Při přehrávání NEPŘIDÁVAT tvary (detekce: p1 nemá .id)
          const isPlayback = !animState.p1 || !(animState.p1 as any).id;
          
          if (!isPlayback) {
            setActiveTool('move'); // Reset nástroje po dokončení animace
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

            // Pokud p1 je dočasný (z customVertex) nebo neexistuje, vytvoříme ho
            const p1Exists = points.some(p => p.id === p1Id);
            if (!p1Exists || p1Id === 'temp-vertex' || p1Id === 'temp-angle-point') {
                const realP1Id = crypto.randomUUID();
                const newP1: GeoPoint = {
                    id: realP1Id,
                    x: animState.p1.x,
                    y: animState.p1.y,
                    label: getFreeLabel(),
                    hidden: true
                };
                newPointsToAdd.push(newP1);
                p1Id = realP1Id;
            }

            // Vytvoříme koncový bod p2 (skrytý, pouze pro určení směru)
            const newP2Id = crypto.randomUUID();
            const newP2: GeoPoint = {
                id: newP2Id,
                x: animState.p2.x,
                y: animState.p2.y,
                label: getFreeLabel(),
                hidden: true
            };
            newPointsToAdd.push(newP2);

            setPoints(prev => [...prev, ...newPointsToAdd]);

            // Vytvoříme polopřímku (ray) - dlouhá čára bez koncového bodu
            newShape = {
              id: crypto.randomUUID(),
              type: 'ray',
              label: getNextShapeLabel('ray'),
              points: [p1Id, newP2Id],
              definition: {
                p1Id: p1Id,
                p2Id: newP2Id
              }
            };

          } else if (!isPlayback) {
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
          
          if (newShape && !isPlayback) {
            setShapes(prev => [...prev, newShape!]);
            // Trigger effect at end point
            if (animState.p2) {
               triggerEffect(animState.p2.x, animState.p2.y, '#10b981'); // Green pulse for success
            }
            // Zápis konstrukce
            const p1data = animState.p1 as any;
            const p2data = animState.p2 as any;
            if (newShape.type === 'segment') {
              const lA = getPointLabel(p1data.id);
              const lB = getPointLabel(p2data.id);
              const d = distanceCm(p1data.x, p1data.y, p2data.x, p2data.y);
              addConstructionStep(
                'segment',
                `${lA}${lB}; |${lA}${lB}| = ${d} cm`,
                `${lA}${lB} \\;;\\; |${lA}${lB}| = ${d} \\text{ cm}`,
                `Úsečka ${lA}${lB} o délce ${d} cm`,
                [newShape.id]
              );
            } else if (newShape.type === 'line') {
              const lA = getPointLabel(p1data.id);
              const lB = getPointLabel(p2data.id);
              const hasLabels = lA !== '?' && lB !== '?' && lA !== '' && lB !== '';
              const notation = hasLabels ? `${newShape.label} = ${lA}${lB}` : `přímka ${newShape.label}`;
              const latex = hasLabels ? `${newShape.label} = ${lA}${lB}` : `\\text{přímka } ${newShape.label}`;
              const desc = hasLabels ? `Přímka ${newShape.label} procházející body ${lA}, ${lB}` : `Přímka ${newShape.label}`;
              addConstructionStep('line', notation, latex, desc, [newShape.id]);
            } else if (newShape.type === 'circle') {
              const lS = getPointLabel(p1data.id);
              const r = distanceCm(p1data.x, p1data.y, p2data.x, p2data.y);
              addConstructionStep(
                'circle',
                `${newShape.label}(${lS}; ${r} cm)`,
                `${newShape.label}(${lS};\\, ${r} \\text{ cm})`,
                `Kružnice ${newShape.label} se středem ${lS} a poloměrem ${r} cm`,
                [newShape.id]
              );
            } else if (newShape.type === 'ray') {
              const lV = getPointLabel(p1data.id);
              const angleVal = angleInput.value || 0;
              addConstructionStep(
                'angle',
                `∠ = ${angleVal}°, polopřímka z ${lV}`,
                `\\angle = ${angleVal}^{\\circ},\\; \\text{polopřímka z } ${lV}`,
                `Vynesení úhlu ${angleVal}° z bodu ${lV}`,
                [newShape.id]
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
            progress: 0
          });
        }
      }
      
      try {
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
  }, [animState, points, shapes, freehandPaths, scale, offset, canvasSize, darkMode, selectedPointId, hoveredPointId, hoveredShape, activeTool, visualEffects, angleInput, circleInput, recordingState.showPlayer, showMeasurements, perpTabletState, circleTabletState, isTabletMode, angleTabletState, selectedShapeIds, hoveredShapeForMove]);


  // --- RENDEROVÁNÍ ---
  const renderCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

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
    drawGrid(ctx, offset, scale);

    ctx.translate(offset.x, offset.y);
    ctx.scale(scale, scale);

    // 0a. Zvýrazňovač (highlighter) - pod vším ostatním
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    
    freehandPaths.forEach(path => {
        if (!path.isHighlight || path.points.length < 2) return;
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
        ctx.strokeStyle = darkMode ? 'rgba(250, 204, 21, 0.4)' : 'rgba(250, 204, 21, 0.4)';
        ctx.lineWidth = 20 / scale;
        if (path.length === 1) {
            ctx.fillStyle = 'rgba(250, 204, 21, 0.4)';
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

    // 0b. Volné pero (freehand) - pod tvary ale nad zvýrazňovačem
    freehandPaths.forEach(path => {
        if (path.isHighlight || path.points.length < 2) return;
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

    // 1. Vykreslení hotových tvarů
    shapes.forEach(shape => {
      const p1 = points.find(p => p.id === shape.definition.p1Id);
      const p2 = points.find(p => p.id === shape.definition.p2Id);
      
      if (!p1 || !p2) return;

      if (shape.type === 'segment') {
        drawSegment(ctx, p1, p2, 1, darkMode ? '#e5e7eb' : '#1f2937');
        drawLabel(ctx, { x: (p1.x + p2.x)/2, y: (p1.y + p2.y)/2 }, shape.label, darkMode ? '#9ca3af' : '#6b7280');
        
        if (showMeasurements) {
            const dist = Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2));
            const cm = (dist / PIXELS_PER_CM).toFixed(1).replace('.', ',');
            const segAngle = Math.atan2(p2.y - p1.y, p2.x - p1.x);
            const perpOff = 15;
            drawMeasurement(ctx, (p1.x + p2.x)/2 + (-Math.sin(segAngle) * perpOff), (p1.y + p2.y)/2 + (Math.cos(segAngle) * perpOff), `${cm} cm`, segAngle);
        }
      } else if (shape.type === 'line') {
        drawLine(ctx, p1, p2, 1, darkMode ? '#e5e7eb' : '#1f2937');
        drawLabel(ctx, { x: p1.x + (p2.x - p1.x)*1.1, y: p1.y + (p2.y - p1.y)*1.1 }, shape.label, darkMode ? '#9ca3af' : '#6b7280');
      } else if (shape.type === 'ray') {
        drawRay(ctx, p1, p2, 1, darkMode ? '#e5e7eb' : '#1f2937');
        drawLabel(ctx, { x: p1.x + (p2.x - p1.x)*0.5, y: p1.y + (p2.y - p1.y)*0.5 }, shape.label, darkMode ? '#9ca3af' : '#6b7280');
      } else if (shape.type === 'circle') {
        const r = Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2));
        drawCircle(ctx, p1, r, 1, darkMode ? '#e5e7eb' : '#1f2937');
        drawLabel(ctx, { x: p1.x + r * 0.7, y: p1.y - r * 0.7 }, shape.label, darkMode ? '#9ca3af' : '#6b7280');
        
        // Malý kontrolní bod (handle) na obvodu pro změnu velikosti
        const isHandleHovered = p2.id === hoveredPointId;
        const isHandleDragged = p2.id === draggedPointId;
        ctx.save();
        
        // Glow efekt při hoveru
        if (isHandleHovered || isHandleDragged) {
          ctx.beginPath();
          ctx.arc(p2.x, p2.y, 12, 0, Math.PI * 2);
          ctx.fillStyle = darkMode ? 'rgba(122, 162, 247, 0.2)' : 'rgba(59, 130, 246, 0.2)';
          ctx.fill();
        }
        
        ctx.beginPath();
        ctx.arc(p2.x, p2.y, isHandleHovered || isHandleDragged ? 7 : 6, 0, Math.PI * 2);
        ctx.fillStyle = darkMode ? '#7aa2f7' : '#3b82f6';
        ctx.fill();
        ctx.strokeStyle = darkMode ? '#c0caf5' : '#ffffff';
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.restore();
        
        if (showMeasurements) {
             const cm = (r / PIXELS_PER_CM).toFixed(1).replace('.', ',');
             // circle radius label
              drawRadiusMeasurement(ctx, p1, p2, `r = ${cm} cm`);
             
             
             
        }
      }
    });

    // 1b. Zvýraznění vybraných tvarů (selectedShapeIds)
    if (selectedShapeIds.length > 0) {
      selectedShapeIds.forEach(shapeId => {
        const shape = shapes.find(s => s.id === shapeId);
        if (!shape) return;
        const sp1 = points.find(p => p.id === shape.definition.p1Id);
        const sp2 = points.find(p => p.id === shape.definition.p2Id);
        if (!sp1 || !sp2) return;

        ctx.save();
        const selColor = darkMode ? '#7aa2f7' : '#3b82f6';
        const selGlow = darkMode ? 'rgba(122, 162, 247, 0.45)' : 'rgba(59, 130, 246, 0.35)';
        
        // Glow vrstva - výraznější
        ctx.globalAlpha = 0.7;
        ctx.shadowColor = selColor;
        ctx.shadowBlur = 18;
        if (shape.type === 'circle') {
          const r = Math.sqrt(Math.pow(sp2.x - sp1.x, 2) + Math.pow(sp2.y - sp1.y, 2));
          ctx.beginPath();
          ctx.arc(sp1.x, sp1.y, r, 0, Math.PI * 2);
          ctx.strokeStyle = selGlow;
          ctx.lineWidth = 16;
          ctx.stroke();
        } else if (shape.type === 'segment') {
          ctx.beginPath();
          ctx.moveTo(sp1.x, sp1.y);
          ctx.lineTo(sp2.x, sp2.y);
          ctx.strokeStyle = selGlow;
          ctx.lineWidth = 16;
          ctx.stroke();
        } else if (shape.type === 'line') {
          const dx = sp2.x - sp1.x, dy = sp2.y - sp1.y;
          const len = Math.sqrt(dx*dx+dy*dy) || 1;
          const EXT = 100000;
          ctx.beginPath();
          ctx.moveTo(sp1.x - dx/len*EXT, sp1.y - dy/len*EXT);
          ctx.lineTo(sp1.x + dx/len*EXT, sp1.y + dy/len*EXT);
          ctx.strokeStyle = selGlow;
          ctx.lineWidth = 16;
          ctx.stroke();
        } else if (shape.type === 'ray') {
          const dx = sp2.x - sp1.x, dy = sp2.y - sp1.y;
          const len = Math.sqrt(dx*dx+dy*dy) || 1;
          const EXT = 100000;
          ctx.beginPath();
          ctx.moveTo(sp1.x, sp1.y);
          ctx.lineTo(sp1.x + dx/len*EXT, sp1.y + dy/len*EXT);
          ctx.strokeStyle = selGlow;
          ctx.lineWidth = 16;
          ctx.stroke();
        }
        ctx.shadowBlur = 0;

        // Obrys výběru (čárkovaný) - silnější
        ctx.globalAlpha = 1;
        ctx.setLineDash([6, 4]);
        if (shape.type === 'circle') {
          const r = Math.sqrt(Math.pow(sp2.x - sp1.x, 2) + Math.pow(sp2.y - sp1.y, 2));
          ctx.beginPath();
          ctx.arc(sp1.x, sp1.y, r, 0, Math.PI * 2);
          ctx.strokeStyle = selColor;
          ctx.lineWidth = 3;
          ctx.stroke();
        } else if (shape.type === 'segment') {
          ctx.beginPath();
          ctx.moveTo(sp1.x, sp1.y);
          ctx.lineTo(sp2.x, sp2.y);
          ctx.strokeStyle = selColor;
          ctx.lineWidth = 3;
          ctx.stroke();
        } else if (shape.type === 'line') {
          const dx = sp2.x - sp1.x, dy = sp2.y - sp1.y;
          const len = Math.sqrt(dx*dx+dy*dy) || 1;
          const EXT = 100000;
          ctx.beginPath();
          ctx.moveTo(sp1.x - dx/len*EXT, sp1.y - dy/len*EXT);
          ctx.lineTo(sp1.x + dx/len*EXT, sp1.y + dy/len*EXT);
          ctx.strokeStyle = selColor;
          ctx.lineWidth = 3;
          ctx.stroke();
        } else if (shape.type === 'ray') {
          const dx = sp2.x - sp1.x, dy = sp2.y - sp1.y;
          const len = Math.sqrt(dx*dx+dy*dy) || 1;
          const EXT = 100000;
          ctx.beginPath();
          ctx.moveTo(sp1.x, sp1.y);
          ctx.lineTo(sp1.x + dx/len*EXT, sp1.y + dy/len*EXT);
          ctx.strokeStyle = selColor;
          ctx.lineWidth = 3;
          ctx.stroke();
        }
        ctx.setLineDash([]);
        ctx.restore();
      });
    }

    // 1c. Zvýraznění hoveru tvaru pro move tool
    if (hoveredShapeForMove && activeTool === 'move' && !selectedShapeIds.includes(hoveredShapeForMove)) {
      const shape = shapes.find(s => s.id === hoveredShapeForMove);
      if (shape) {
        const sp1 = points.find(p => p.id === shape.definition.p1Id);
        const sp2 = points.find(p => p.id === shape.definition.p2Id);
        if (sp1 && sp2) {
          ctx.save();
          const hoverColor = darkMode ? '#7dcfff' : '#0ea5e9';
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
          } else {
            let start = sp1, end = sp2;
            if (shape.type === 'line' || shape.type === 'ray') {
              const dx = sp2.x - sp1.x, dy = sp2.y - sp1.y;
              const len = Math.sqrt(dx*dx+dy*dy) || 1;
              const EXT = 100000;
              if (shape.type === 'line') start = { ...sp1, x: sp1.x - dx/len*EXT, y: sp1.y - dy/len*EXT };
              end = { ...sp1, x: sp1.x + dx/len*EXT, y: sp1.y + dy/len*EXT };
            }
            ctx.beginPath();
            ctx.moveTo(start.x, start.y);
            ctx.lineTo(end.x, end.y);
            ctx.strokeStyle = hoverColor;
            ctx.lineWidth = 8;
            ctx.stroke();
          }
          ctx.restore();
        }
      }
    }

    // 2. Vykreslení animovaného tvaru (právě rýsovaného)
    if (animState.isActive && animState.p1 && animState.p2) {
      const { p1, p2, progress, type, angle } = animState;
      
      const drawProg = getDrawProgress(progress);
      const activeColor = '#f97316'; // Neon Orange
      const activeWidth = 4;

      if (type === 'segment') {
        console.log('Kreslím segment s pravítkem!');
        drawRuler(ctx, p1, p2, progress);
        drawSegment(ctx, p1, p2, progress, activeColor, activeWidth);
        
        if (showMeasurements) {
            const dist = Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2));
            const cm = (dist / PIXELS_PER_CM).toFixed(1).replace('.', ',');
            const sA2 = Math.atan2(p2.y - p1.y, p2.x - p1.x);
            drawMeasurement(ctx, (p1.x + p2.x)/2 + (-Math.sin(sA2) * 20), (p1.y + p2.y)/2 + (Math.cos(sA2) * 20), `${cm} cm`, sA2);
        }
        
        if (progress > 0.2 && progress < 0.8) {
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
        
        // Fix: Pravítko ukotvíme v P1 a směrujeme k P2, aby bylo vidět v záběru a chovalo se intuitivně
        drawRuler(ctx, p1, p2, progress);
        drawLine(ctx, p1, p2, progress, activeColor, activeWidth);

        if (progress > 0.2 && progress < 0.8) {
             const cx = start.x + (end.x - start.x) * drawProg;
             const cy = start.y + (end.y - start.y) * drawProg;
             drawPenTip(ctx, cx, cy, activeColor);
        }
      } else if (type === 'ray') {
         drawRuler(ctx, p1, p2, progress);
         drawRay(ctx, p1, p2, progress, activeColor, activeWidth);
         
         if (progress > 0.2 && progress < 0.8) {
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
          drawProtractor(ctx, p1, baseAngle, 200, '#f97316');
          
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
          
          if (lineProgress > 0.2 && lineProgress < 0.8) {
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
        drawCompass(ctx, p1, r, progress);
        drawCircle(ctx, p1, r, progress, activeColor, activeWidth);

        if (showMeasurements) {
             const cm = (r / PIXELS_PER_CM).toFixed(1).replace('.', ',');
             drawRadiusMeasurement(ctx, p1, p2, `r = ${cm} cm`);
        }
        
        if (progress > 0.2 && progress < 0.8) {
           const endAngle = Math.PI * 2 * drawProg;
           const cx = p1.x + r * Math.cos(endAngle);
           const cy = p1.y + r * Math.sin(endAngle);
           drawPenTip(ctx, cx, cy, activeColor);
        }
      }
    }

    // 3. Vykreslení bodů (vždy nahoře)
    points.forEach(p => {
      if (p.hidden) return; // Skip hidden points
      
      // Skrýt bod B u kružnic (bod na obvodu)
      const isCircleRadiusPoint = shapes.some(s => s.type === 'circle' && s.definition.p2Id === p.id);
      if (isCircleRadiusPoint) return; // Bod B se nevykresluje

      const isHovered = p.id === hoveredPointId;
      const isSelected = p.id === selectedPointId;
      const isDragging = p.id === draggedPointId;
      const isActiveSelection = p.id === selection;
      
      // Styl čárky
      let tickColor = darkMode ? '#e5e7eb' : '#1f2937'; // Default
      let tickLength = 10;
      let tickWidth = 3;
      
      if (isSelected) {
        tickColor = '#3b82f6'; // Blue
        tickLength = 16;
        tickWidth = 3.5;
      } else if (isHovered || isDragging) {
        tickColor = '#f59e0b'; // Amber
        tickLength = 16;
        tickWidth = 3.5;
      }

      // Zjistit, jestli je bod součástí nějaké přímky/úsečky/paprsku
      const lineShape = shapes.find(s => 
        (s.type === 'segment' || s.type === 'line' || s.type === 'ray') && 
        (s.definition.p1Id === p.id || s.definition.p2Id === p.id)
      );
      
      let lineAngle = 0; // Úhel přímky v radiánech
      if (lineShape) {
        const p1 = points.find(pt => pt.id === lineShape.definition.p1Id);
        const p2 = points.find(pt => pt.id === lineShape.definition.p2Id);
        if (p1 && p2) {
          lineAngle = Math.atan2(p2.y - p1.y, p2.x - p1.x);
        }
      }

      // Výběr pro smazání (dashed ring)
      if (isActiveSelection) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, 22, 0, Math.PI * 2);
        ctx.strokeStyle = darkMode ? '#f7768e' : '#ef4444'; // Tokyo Night Red or normal red
        ctx.lineWidth = 2;
        ctx.setLineDash([4, 4]);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      
      if (isHovered || isSelected) {
        // Vnější glow ring
        ctx.save();
        ctx.beginPath();
        ctx.arc(p.x, p.y, 20, 0, Math.PI * 2);
        ctx.fillStyle = darkMode ? 'rgba(125, 207, 255, 0.18)' : 'rgba(59, 130, 246, 0.1)';
        ctx.fill();
        ctx.restore();
        // Vnitřní highlight
        ctx.beginPath();
        ctx.arc(p.x, p.y, 14, 0, Math.PI * 2);
        ctx.fillStyle = darkMode ? 'rgba(125, 207, 255, 0.45)' : 'rgba(59, 130, 246, 0.25)';
        ctx.fill();
        // Glow ring obrys
        ctx.beginPath();
        ctx.arc(p.x, p.y, 20, 0, Math.PI * 2);
        ctx.strokeStyle = isSelected 
          ? (darkMode ? 'rgba(122, 162, 247, 0.7)' : 'rgba(59, 130, 246, 0.5)') 
          : (darkMode ? 'rgba(125, 207, 255, 0.5)' : 'rgba(59, 130, 246, 0.3)');
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }

      if (lineShape) {
        // Bod je součástí přímky - nakreslit čárku KOLMOU na přímku
        const perpAngle = lineAngle + Math.PI / 2; // Kolmý úhel
        const dx = Math.cos(perpAngle) * tickLength / 2;
        const dy = Math.sin(perpAngle) * tickLength / 2;
        
        ctx.beginPath();
        ctx.moveTo(p.x - dx, p.y - dy);
        ctx.lineTo(p.x + dx, p.y + dy);
        ctx.strokeStyle = tickColor;
        ctx.lineWidth = tickWidth;
        ctx.stroke();
      } else {
        // Samostatný bod - nakreslit křížek
        ctx.beginPath();
        ctx.moveTo(p.x, p.y - tickLength / 2);
        ctx.lineTo(p.x, p.y + tickLength / 2);
        ctx.strokeStyle = tickColor;
        ctx.lineWidth = tickWidth;
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(p.x - tickLength / 2, p.y);
        ctx.lineTo(p.x + tickLength / 2, p.y);
        ctx.strokeStyle = tickColor;
        ctx.lineWidth = tickWidth;
        ctx.stroke();
      }

      // Label v modrém koužku bez outline
      const labelBgColor = '#3b82f6'; // Modrá
      const labelTextColor = '#ffffff'; // Bílý text
      
      ctx.font = 'bold 16px Inter, system-ui, sans-serif';
      const labelWidth = ctx.measureText(p.label).width;
      const padding = 8;
      const labelX = p.x + 20;
      const labelY = p.y - 20;

      // Pozadí labelu - kružnice BEZ outline
      ctx.beginPath();
      ctx.arc(labelX, labelY, (labelWidth / 2 + padding), 0, Math.PI * 2);
      ctx.fillStyle = labelBgColor;
      ctx.fill();

      // Text labelu
      ctx.fillStyle = labelTextColor;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(p.label, labelX, labelY);
    });

    // 3b. Intersection snap indicator
    if (nearestIntersectionRef.current && !animState.isActive) {
      const ix = nearestIntersectionRef.current.x;
      const iy = nearestIntersectionRef.current.y;
      const crossSize = 8 / scale; // Fixed screen size
      
      // Pulsing diamond indicator
      ctx.save();
      ctx.strokeStyle = '#f59e0b'; // Amber
      ctx.lineWidth = 2 / scale;
      ctx.setLineDash([]);
      
      // Diamond shape
      ctx.beginPath();
      ctx.moveTo(ix, iy - crossSize);
      ctx.lineTo(ix + crossSize, iy);
      ctx.lineTo(ix, iy + crossSize);
      ctx.lineTo(ix - crossSize, iy);
      ctx.closePath();
      ctx.stroke();
      
      // Small center dot
      ctx.beginPath();
      ctx.arc(ix, iy, 2.5 / scale, 0, Math.PI * 2);
      ctx.fillStyle = '#f59e0b';
      ctx.fill();
      
      ctx.restore();
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
        drawCircle(ctx, p1, r, 1, ghostColor, 2.5);

        // Kontrastní střed kružnice
        ctx.globalAlpha = 1;
        ctx.beginPath();
        ctx.arc(p1.x, p1.y, 10, 0, Math.PI * 2);
        ctx.fillStyle = darkMode ? '#ffffff' : '#1e1b4b';
        ctx.fill();
        ctx.lineWidth = 3;
        ctx.strokeStyle = '#3b82f6';
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(p1.x, p1.y, 4, 0, Math.PI * 2);
        ctx.fillStyle = '#3b82f6';
        ctx.fill();

        // Radius measurement
        if (showMeasurements && r > 10) {
          const ghostCm = (r / PIXELS_PER_CM).toFixed(1).replace('.', ',');
          const ghostRadAngle = Math.atan2(actualP2.y - p1.y, actualP2.x - p1.x);
          const ghostMidX = p1.x + (actualP2.x - p1.x) / 2;
          const ghostMidY = p1.y + (actualP2.y - p1.y) / 2;
          const ghostPerpOff = 18;
          const ghostOx = -Math.sin(ghostRadAngle) * ghostPerpOff;
          const ghostOy = Math.cos(ghostRadAngle) * ghostPerpOff;
          drawMeasurement(ctx, ghostMidX + ghostOx, ghostMidY + ghostOy, `r = ${ghostCm} cm`, ghostRadAngle);
        }
        
        // Pulzující handle
        const isHandleDragged = circleTabletState.isDraggingHandle;
        const radialAngle = Math.atan2(actualP2.y - p1.y, actualP2.x - p1.x);
        const pulse = (Math.sin(Date.now() * 0.004) + 1) / 2;
        const dragPulse = isHandleDragged ? 1 : pulse;
        
        const glowRadius = 24 + dragPulse * 12;
        const glowAlpha = 0.12 + dragPulse * 0.18;
        ctx.beginPath();
        ctx.arc(actualP2.x, actualP2.y, glowRadius, 0, Math.PI * 2);
        ctx.fillStyle = darkMode 
          ? `rgba(122, 162, 247, ${glowAlpha})` 
          : `rgba(59, 130, 246, ${glowAlpha})`;
        ctx.fill();
        
        ctx.beginPath();
        ctx.arc(actualP2.x, actualP2.y, 17, 0, Math.PI * 2);
        ctx.fillStyle = darkMode 
          ? `rgba(122, 162, 247, ${0.2 + dragPulse * 0.12})` 
          : `rgba(59, 130, 246, ${0.2 + dragPulse * 0.12})`;
        ctx.fill();
        
        const mainRadius = isHandleDragged ? 13 : 12;
        ctx.beginPath();
        ctx.arc(actualP2.x, actualP2.y, mainRadius, 0, Math.PI * 2);
        ctx.fillStyle = darkMode ? '#7aa2f7' : '#3b82f6';
        ctx.fill();
        ctx.strokeStyle = darkMode ? '#c0caf5' : '#ffffff';
        ctx.lineWidth = 2.5;
        ctx.stroke();
        
        // Oboustranná šipka v handle
        ctx.save();
        ctx.translate(actualP2.x, actualP2.y);
        ctx.rotate(radialAngle);
        const arrowLen = 7;
        const headLen = 3.5;
        const headAngle = Math.PI / 5;
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.95)';
        ctx.lineWidth = 2;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.beginPath();
        ctx.moveTo(-arrowLen, 0);
        ctx.lineTo(arrowLen, 0);
        ctx.moveTo(-arrowLen + headLen * Math.cos(headAngle), -headLen * Math.sin(headAngle));
        ctx.lineTo(-arrowLen, 0);
        ctx.lineTo(-arrowLen + headLen * Math.cos(headAngle), headLen * Math.sin(headAngle));
        ctx.moveTo(arrowLen - headLen * Math.cos(headAngle), -headLen * Math.sin(headAngle));
        ctx.lineTo(arrowLen, 0);
        ctx.lineTo(arrowLen - headLen * Math.cos(headAngle), headLen * Math.sin(headAngle));
        ctx.stroke();
        ctx.restore();
        
        ctx.restore();
      }
    }

    // 4b. Náhled při tvorbě (ghost line) - requires mousePosRef for non-tablet tools
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
             console.log('🎯 ghostSeg tablet:', isTabletMode);
             if (!isTabletMode) {
               console.log('✏️ Kreslím GHOST pravítko pro segment');
               drawRuler(ctx, p1, p2, 0.5); // 0.5 progress = plné zobrazení bez animace
             }
             drawSegment(ctx, p1, p2, 1, ghostColor, ghostLW);

             if (showMeasurements) {
                  const dist = Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2));
                  const cm = (dist / PIXELS_PER_CM).toFixed(1).replace('.', ',');
                  drawLineMeasurement(ctx, p1, p2, `${cm} cm`);
             }
         } else if (activeTool === 'line') {
             console.log('🎯 GHOST LINE - isTabletMode:', isTabletMode);
             if (!isTabletMode) {
               console.log('✏️ Kreslím GHOST pravítko pro line');
               drawRuler(ctx, p1, p2, 0.5);
             }
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

         } else if (activeTool === 'ray') {
             console.log('🎯 GHOST RAY - isTabletMode:', isTabletMode);
             if (!isTabletMode) {
               console.log('✏️ Kreslím GHOST pravítko pro ray');
               drawRuler(ctx, p1, p2, 0.5);
             }
             // Ghost ray
             const dx = p2.x - p1.x;
             const dy = p2.y - p1.y;
             const len = Math.sqrt(dx*dx + dy*dy);
             const extend = 2000;
             const endRay = { x: p1.x + dx/len * extend, y: p1.y + dy/len * extend };
             
             drawRay(ctx, p1, endRay, 1, ghostColor, 2.5);

         } else if (activeTool === 'circle') {
             // Tablet circle rendering is handled in section 4a above (independent of mousePosRef)
             if (isTabletMode && circleTabletState.active) {
               // Already rendered above, skip
             } else {
             const actualP2 = p2;
             const r = Math.sqrt(Math.pow(actualP2.x - p1.x, 2) + Math.pow(actualP2.y - p1.y, 2));
             
             drawCompass(ctx, p1, r, 0.5, actualP2);
             drawCircle(ctx, p1, r, 1, ghostColor, 2.5);

              // Ghost circle radius measurement
              if (showMeasurements && r > 10) {
                   const ghostCm = (r / PIXELS_PER_CM).toFixed(1).replace('.', ',');
                   const ghostRadAngle = Math.atan2(actualP2.y - p1.y, actualP2.x - p1.x);
                   const ghostMidX = p1.x + (actualP2.x - p1.x) / 2;
                   const ghostMidY = p1.y + (actualP2.y - p1.y) / 2;
                   const ghostPerpOff = 18;
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
               } else if (selectedShape.type === 'ray') {
                  drawRay(ctx, sp1, sp2, 1, hlColor, 3);
               }
               ctx.setLineDash([]);
               ctx.restore();
           }
       }
    }
    
    // 4b. Zvýraznění hoveredShape (čára pod myší pro úhel nebo kolmici)
    if (hoveredShape && (activeTool === 'angle' || activeTool === 'perpendicular')) {
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

    // Náhled úhloměru před kliknutím (Angle Tool Hover)
    if (activeTool === 'angle' && !animState.isActive && !selectedPointId && !angleInput.visible) {
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
        } else if (hoveredShape && mousePosRef.current) {
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

    // 4a. Aktivní úhloměr při zadávání (Angle Input)
    if (angleInput.visible && angleInput.customVertex) {
         drawProtractor(
            ctx, 
            angleInput.customVertex, 
            angleInput.baseAngle || 0, 
            200, 
            '#f97316', 
            angleInput.value, 
            angleInput.rotationOffset,
            angleInput.isMirrored
         );
         
         // Střed
         drawPenTip(ctx, angleInput.customVertex.x, angleInput.customVertex.y, '#f97316');
    }

    // 4b. COMPASS MODE - interaktivní kružítko s centrem a handle
    if (circleInput.visible && circleInput.center) {
         const cc = circleInput.center;
         const r = circleInput.radius * PIXELS_PER_CM;
         const hx = cc.x + Math.cos(circleInput.handleAngle) * r;
         const hy = cc.y + Math.sin(circleInput.handleAngle) * r;
         
         ctx.save();
         
         // Kružnice
         drawCircle(ctx, cc, r, 1, darkMode ? 'rgba(200, 200, 255, 0.7)' : 'rgba(30, 27, 75, 0.6)', 2.5);
         
         // Kružítko (compass image)
         drawCompass(ctx, cc, r, 0.5, { x: hx, y: hy });
         
         // Středový bod - reticle
         ctx.beginPath();
         ctx.arc(cc.x, cc.y, 8, 0, Math.PI * 2);
         ctx.fillStyle = darkMode ? '#ffffff' : '#1e1b4b';
         ctx.fill();
         ctx.lineWidth = 3;
         ctx.strokeStyle = '#3b82f6';
         ctx.stroke();
         ctx.beginPath();
         ctx.arc(cc.x, cc.y, 3, 0, Math.PI * 2);
         ctx.fillStyle = '#3b82f6';
         ctx.fill();
         // Křížek ve středu
         ctx.strokeStyle = darkMode ? '#1e1b4b' : '#ffffff';
         ctx.lineWidth = 1.5;
         ctx.beginPath();
         ctx.moveTo(cc.x - 5, cc.y);
         ctx.lineTo(cc.x + 5, cc.y);
         ctx.moveTo(cc.x, cc.y - 5);
         ctx.lineTo(cc.x, cc.y + 5);
         ctx.stroke();
         
         // Radiální čára od středu k handle
         ctx.beginPath();
         ctx.setLineDash([6, 4]);
         ctx.moveTo(cc.x, cc.y);
         ctx.lineTo(hx, hy);
         ctx.strokeStyle = darkMode ? 'rgba(122, 162, 247, 0.6)' : 'rgba(59, 130, 246, 0.5)';
         ctx.lineWidth = 1.5;
         ctx.stroke();
         ctx.setLineDash([]);
         
         // Handle na obvodu - pulzující
         const pulse = (Math.sin(Date.now() * 0.004) + 1) / 2;
         const isDragging = circleInput.isDraggingHandle;
         const dragPulse = isDragging ? 1 : pulse;
         
         // Glow
         const glowRadius = 22 + dragPulse * 10;
         ctx.beginPath();
         ctx.arc(hx, hy, glowRadius, 0, Math.PI * 2);
         ctx.fillStyle = darkMode 
           ? `rgba(122, 162, 247, ${0.1 + dragPulse * 0.15})` 
           : `rgba(59, 130, 246, ${0.1 + dragPulse * 0.15})`;
         ctx.fill();
         
         // Hlavní kulička
         const handleR = isDragging ? 13 : 11;
         ctx.beginPath();
         ctx.arc(hx, hy, handleR, 0, Math.PI * 2);
         ctx.fillStyle = darkMode ? '#7aa2f7' : '#3b82f6';
         ctx.fill();
         ctx.strokeStyle = '#ffffff';
         ctx.lineWidth = 2.5;
         ctx.stroke();
         
         // Oboustranná šipka v handle
         ctx.save();
         ctx.translate(hx, hy);
         ctx.rotate(circleInput.handleAngle);
         ctx.strokeStyle = 'rgba(255, 255, 255, 0.95)';
         ctx.lineWidth = 2;
         ctx.lineCap = 'round';
         ctx.lineJoin = 'round';
         const aLen = 6;
         const hLen = 3;
         const hAng = Math.PI / 5;
         ctx.beginPath();
         ctx.moveTo(-aLen, 0);
         ctx.lineTo(aLen, 0);
         ctx.stroke();
         ctx.beginPath();
         ctx.moveTo(aLen - hLen * Math.cos(hAng), -hLen * Math.sin(hAng));
         ctx.lineTo(aLen, 0);
         ctx.lineTo(aLen - hLen * Math.cos(hAng), hLen * Math.sin(hAng));
         ctx.stroke();
         ctx.beginPath();
         ctx.moveTo(-aLen + hLen * Math.cos(hAng), -hLen * Math.sin(hAng));
         ctx.lineTo(-aLen, 0);
         ctx.lineTo(-aLen + hLen * Math.cos(hAng), hLen * Math.sin(hAng));
         ctx.stroke();
         ctx.restore();
         
         // Měření
         const cm = circleInput.radius.toFixed(1).replace('.', ',');
         const radAngle = circleInput.handleAngle;
         const midX = cc.x + Math.cos(radAngle) * r / 2;
         const midY = cc.y + Math.sin(radAngle) * r / 2;
         const perpOff = 18;
         const ox = -Math.sin(radAngle) * perpOff;
         const oy = Math.cos(radAngle) * perpOff;
         drawMeasurement(ctx, midX + ox, midY + oy, `r = ${cm} cm`, radAngle);
         
         ctx.restore();
    }

    // 5a. Marquee rectangle selection
    const currentMarquee = marqueeRef.current;
    if (currentMarquee) {
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

  // --- HELPER DRAW FUNCTIONS ---
  
  const drawMeasurement = (ctx: CanvasRenderingContext2D, x: number, y: number, text: string, angle?: number) => {
    ctx.save();
    try {
      ctx.font = 'bold 14px sans-serif';
      const padding = 5;
      const metrics = ctx.measureText(text);
      const width = metrics.width + padding * 2;
      const height = 18;
      
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
      const r = 4;
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
      ctx.lineWidth = 1;
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

  // Helper: nakloeny popisek mery mezi dvema body s kolmym odsazenim
  const drawLineMeasurement = (ctx: CanvasRenderingContext2D, p1: {x:number,y:number}, p2: {x:number,y:number}, text: string, perpOffset = 20) => {
    const a = Math.atan2(p2.y - p1.y, p2.x - p1.x);
    const mx = (p1.x + p2.x) / 2 + (-Math.sin(a) * perpOffset);
    const my = (p1.y + p2.y) / 2 + (Math.cos(a) * perpOffset);
    drawMeasurement(ctx, mx, my, text, a);
  };

  // Helper: nakloeny popisek polomerove mery
  const drawRadiusMeasurement = (ctx: CanvasRenderingContext2D, center: {x:number,y:number}, handle: {x:number,y:number}, text: string, perpOffset = 15) => {
    const a = Math.atan2(handle.y - center.y, handle.x - center.x);
    const mx = center.x + (handle.x - center.x) / 2 + (-Math.sin(a) * perpOffset);
    const my = center.y + (handle.y - center.y) / 2 + (Math.cos(a) * perpOffset);
    drawMeasurement(ctx, mx, my, text, a);
  };

  const drawGrid = (ctx: CanvasRenderingContext2D, offset: {x:number, y:number}, scale: number) => {
    const gridSize = 50 * scale;
    ctx.strokeStyle = darkMode ? 'rgba(125, 107, 194, 0.15)' : 'rgba(229, 231, 235, 0.8)';
    ctx.lineWidth = 1;

    // Vypočítat posun mřížky tak, aby "jezdila" s offsetem
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

  const drawSegment = (ctx: CanvasRenderingContext2D, p1: {x:number, y:number}, p2: {x:number, y:number}, progress: number, color: string, width = 2) => {
    if (progress <= 0) return;
    
    // Logic from TriangleConstruction
    let drawProgress = progress;
    // Mapování progressu na animaci rýsování (když je aktivní pravítko)
    if (animState.isActive) {
       // Pokud je animace, progress 0-0.2 je přílet pravítka, 0.2-0.8 rýsování, 0.8-1 odlet
       if (progress < 0.2) drawProgress = 0;
       else if (progress > 0.8) drawProgress = 1;
       else drawProgress = (progress - 0.2) / 0.6;
    }

    const currentP2 = {
      x: p1.x + (p2.x - p1.x) * drawProgress,
      y: p1.y + (p2.y - p1.y) * drawProgress
    };

    ctx.beginPath();
    ctx.moveTo(p1.x, p1.y);
    ctx.lineTo(currentP2.x, currentP2.y);
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.lineCap = 'round';
    ctx.stroke();
  };

  const drawLine = (ctx: CanvasRenderingContext2D, p1: {x:number, y:number}, p2: {x:number, y:number}, progress: number, color: string, width = 2) => {
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

    drawSegment(ctx, start, end, progress, color, width);
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

  const drawCircle = (ctx: CanvasRenderingContext2D, center: {x:number, y:number}, radius: number, progress: number, color: string, width = 2) => {
    if (progress <= 0) return;

    let drawProgress = progress;
    if (animState.isActive) {
        if (progress < 0.2) drawProgress = 0;
        else if (progress > 0.8) drawProgress = 1;
        else drawProgress = (progress - 0.2) / 0.6;
    }

    const endAngle = Math.PI * 2 * drawProgress;

    ctx.beginPath();
    ctx.arc(center.x, center.y, radius, 0, endAngle);
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.stroke();
  };

  const drawLabel = (ctx: CanvasRenderingContext2D, p: {x:number, y:number}, text: string, color: string, ox = 15, oy = -15) => {
    ctx.save();
    ctx.font = 'italic 18px "Times New Roman", "Computer Modern", Georgia, serif';
    ctx.fillStyle = color;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(text, p.x + ox, p.y + oy);
    ctx.restore();
  };

  const drawRuler = (ctx: CanvasRenderingContext2D, p1: {x:number, y:number}, p2: {x:number, y:number}, progress: number) => {
    if (!rulerImageRef.current) return;
    
    // Fade in logic only - pravítko nezmizí dokud se kreslí (volá tato funkce)
    let opacity = 1;
    if (progress < 0.2) opacity = progress / 0.2;
    
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

    let opacity = 0;
    if (progress < 0.2) opacity = progress / 0.2;
    else if (progress > 0.8) opacity = (1 - progress) / 0.2;
    else opacity = 1;

    if (opacity <= 0) return;

    // Kružítko se točí buď s kreslením, nebo směrem k p2 (pokud je zadán)
    let rotation = 0;
    if (p2) {
        // Pokud máme p2, natočíme kružítko směrem k němu
        rotation = Math.atan2(p2.y - center.y, p2.x - center.x);
    } else if (progress >= 0.2 && progress <= 0.8) {
        // Jinak se točí s animací kreslení
        rotation = (progress - 0.2) / 0.6 * Math.PI * 2;
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
    ctx.lineWidth = 3;
    ctx.beginPath();
    // Kreslíme oblouk od 0 do PI proti směru hodinových ručiček (horní polovina)
    ctx.arc(0, 0, radius, 0, Math.PI, true);
    ctx.closePath(); // Spojí konce, vytvoří rovnou základnu
    ctx.stroke();
    
    // 2. Vnitřní oblouk pro stupnici
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
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
       let width = 1;

       if (isMajor) {
           len = 35; 
           width = 3;
       } else if (isTen) {
           len = 15;
           width = 2;
       } else {
           // isFive
           len = 8;
           width = 1;
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
           const fontSize = isMajor ? 18 : 12;
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
    if (activeTool !== 'highlighter') lastHighlightPointRef.current = null;
    // Angle tablet mode: inicializace při přepnutí na úhloměr v tablet módu
    if (activeTool === 'angle' && isTabletMode) {
      setAngleTabletState({ step: 'selectLine', selectedLineId: null, currentPos: null, baseAngle: 0 });
    } else {
      setAngleTabletState({ step: 'idle', selectedLineId: null, currentPos: null, baseAngle: 0 });
    }
  }, [activeTool]);

  const getContainerCursor = (): string => {
    if (activeTool === 'pan') return 'grab';
    if (activeTool === 'move') {
      if (hoveredShapeForMove) return selectedShapeIds.includes(hoveredShapeForMove) ? 'move' : 'pointer';
      return hoveredPointId ? 'move' : 'default';
    }
    return 'crosshair';
  };

  const clearAll = () => {
    if (confirm('Opravdu chceš smazat celé plátno?')) {
      setPoints([]);
      setShapes([]);
      setFreehandPaths([]);
      setSelectedPointId(null);
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
     if (progress < 0.2) return 0;
     if (progress > 0.8) return 1;
     return (progress - 0.2) / 0.6;
  };

  return (
    <>
    <div className={`relative size-full overflow-hidden select-none ${darkMode ? 'bg-[#1a1b26]' : 'bg-white'}`}>
      
              
              {/* Computer mode */}
      {/* CANVAS */}
      <div 
        ref={containerRef} 
        className="absolute inset-0 touch-none z-0"
        style={{ cursor: getContainerCursor() }}
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
          ref={canvasRef} 
          className="block" 
          style={{ width: '100%', height: '100%' }}
        />
      </div>

      {/* TOP RIGHT CORNER: Undo, Redo, Record, Zápis konstrukce */}
      {!recordingState.showPlayer && (
      <div className="absolute top-4 right-4 z-30 bg-[#F2F2F2] rounded-full p-2 flex items-center gap-1 shadow-sm" onTouchStart={(e) => e.stopPropagation()}>
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
      </div>
      )}

      {/* TOOLBAR - LEFT SIDE (NEW DESIGN) */}
      {!recordingState.showPlayer && !circleInput.visible && !angleInput.visible && !segmentInput.visible && (
      <div className="absolute left-4 top-1/2 -translate-y-1/2 z-30 pointer-events-auto" style={{ touchAction: 'auto' }} onTouchStart={(e) => e.stopPropagation()}>
         <div className="bg-[#F2F2F2] rounded-full p-2 flex flex-col items-center shadow-sm w-[72px] py-8">
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
                            onClick={(e) => {
                                e.stopPropagation();
                                if (group.tools.length === 1) {
                                    setActiveTool(group.tools[0].id as ToolType);
                                    setSelectedPointId(null);
                                    setActiveGroup(null);
                                } else {
                                    setActiveGroup(prev => prev === group.id ? null : group.id);
                                }
                            }}
                            onTouchEnd={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                if (group.tools.length === 1) {
                                    setActiveTool(group.tools[0].id as ToolType);
                                    setSelectedPointId(null);
                                    setActiveGroup(null);
                                } else {
                                    setActiveGroup(prev => prev === group.id ? null : group.id);
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
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setActiveTool(tool.id as ToolType);
                                                setSelectedPointId(null);
                                                setActiveGroup(null);
                                            }}
                                            onTouchEnd={(e) => {
                                                e.preventDefault();
                                                e.stopPropagation();
                                                setActiveTool(tool.id as ToolType);
                                                setSelectedPointId(null);
                                                setActiveGroup(null);
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
                        {/* Tooltip (jen pro skupiny s 1 nástrojem) */}
                        {group.tools.length === 1 && (
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
                const isGroupActive = group.tools.some(t => t.id === activeTool);
                
                // Check if any "large" tool is active (Construct, Circles, Angles, Paper)
                // Excludes Point (index 2) from triggering the shift
                const isBigToolActive = toolGroups.slice(3).some(g => g.tools.some(t => t.id === activeTool));
                const isOther = isBigToolActive && !isGroupActive;

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
                     return (
                         <div key={group.id} className="relative group w-full flex justify-center transition-all duration-300">
                             <button
                                 onClick={() => setShowMeasurements(!showMeasurements)}
                                 onTouchEnd={(e) => { e.preventDefault(); e.stopPropagation(); setShowMeasurements(!showMeasurements); }}
                                 className={`w-12 h-12 relative flex items-center justify-center rounded-lg transition-transform hover:scale-105 overflow-visible z-10 border-2 group/measure ${
                                     showMeasurements 
                                        ? 'bg-[#1e1b4b] border-[#1e1b4b] text-white' 
                                        : 'bg-white border-gray-200 text-black'
                                 }`}
                             >
                                 <span className="text-[10px] font-bold">1cm</span>
                                 {/* Tooltip */}
                                 <div className="absolute left-full ml-3 px-3 py-1.5 bg-black/80 text-white text-xs rounded-lg whitespace-nowrap opacity-0 group-hover/measure:opacity-100 transition-opacity pointer-events-none">
                                   {showMeasurements ? 'Skrýt míry' : 'Zobrazit míry'}
                                 </div>
                             </button>
                         </div>
                     );
                }

                return (
                    <div key={group.id} className={`relative w-full flex justify-center transition-all duration-300 ${isOther ? 'opacity-30 grayscale cursor-pointer' : ''}`}>
                         {/* Main Button */}
                         <button
                            onClick={(e) => {
                                e.stopPropagation();
                                if (isOther || group.tools.length === 1) {
                                    handleToolMenuClick(group.tools[0].id, setCircleInput, setActiveTool, setSelectedPointId, setActiveGroup, setSegmentInput, setPerpTabletState, isTabletMode, setCircleTabletState);
                                } else {
                                    setActiveGroup(isMenuOpen ? null : group.id);
                                }
                            }}
                            onTouchEnd={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                if (isOther || group.tools.length === 1) {
                                    handleToolMenuClick(group.tools[0].id, setCircleInput, setActiveTool, setSelectedPointId, setActiveGroup, setSegmentInput, setPerpTabletState, isTabletMode, setCircleTabletState);
                                } else {
                                    setActiveGroup(isMenuOpen ? null : group.id);
                                }
                            }}
                            className={`w-14 h-14 relative flex items-center justify-center overflow-visible ${isOther ? 'z-20' : 'z-10'}`}
                         >
                            <div className="pointer-events-none relative w-full h-full">
                                <div className={iconStyle}>
                                    {IconComponent && <IconComponent />}
                                </div>
                            </div>
                         </button>

                         {/* Submenu - čistě stavové, bez group-hover */}
                         {group.tools.length > 1 && isMenuOpen && (
                         <div 
                           className="absolute left-[80%] top-1/2 -translate-y-1/2 ml-2 bg-white rounded-2xl shadow-[0_4px_20px_rgba(0,0,0,0.15)] p-2 flex flex-col gap-1 min-w-[160px] z-50 border border-gray-100"
                           style={{ touchAction: 'auto' }}
                           onTouchStart={(e) => e.stopPropagation()}
                         >
                             <div className="text-[10px] font-bold px-3 py-1 text-gray-400 uppercase tracking-wider">{group.label}</div>
                             {group.tools.map(tool => {
                                 const ToolIcon = getIcon(tool.icon);
                                 return (
                                 <button
                                    key={tool.id}
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        handleToolMenuClick(tool.id, setCircleInput, setActiveTool, setSelectedPointId, setActiveGroup, setSegmentInput, setPerpTabletState, isTabletMode, setCircleTabletState);
                                    }}
                                    onTouchEnd={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        handleToolMenuClick(tool.id, setCircleInput, setActiveTool, setSelectedPointId, setActiveGroup, setSegmentInput, setPerpTabletState, isTabletMode, setCircleTabletState);
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
                    </div>
                );
            })}
            </div>

             {/* Separator */}
             <div className="h-8"></div>

             {/* Bottom: Trash / Delete selection */}
             {(selection || selectedShapeIds.length > 0) ? (
             <button
                 onClick={() => {
                   if (selectedShapeIds.length > 0) {
                     const shapeIdsToDelete = new Set(selectedShapeIds);
                     const pointIdsToDelete = new Set<string>();
                     shapes.forEach(s => { if (shapeIdsToDelete.has(s.id)) s.points.forEach(pid => pointIdsToDelete.add(pid)); });
                     setShapes(prev => prev.filter(s => !shapeIdsToDelete.has(s.id)));
                     const remainingShapes = shapes.filter(s => !shapeIdsToDelete.has(s.id));
                     const usedPointIds = new Set<string>();
                     remainingShapes.forEach(s => s.points.forEach(pid => usedPointIds.add(pid)));
                     setPoints(prev => prev.filter(p => !pointIdsToDelete.has(p.id) || usedPointIds.has(p.id)));
                     setSelectedShapeIds([]);
                   } else if (selection) {
                     deletePoint(selection);
                   }
                 }}
                 onTouchEnd={(e) => {
                   e.preventDefault();
                   e.stopPropagation();
                   if (selectedShapeIds.length > 0) {
                     const shapeIdsToDelete = new Set(selectedShapeIds);
                     const pointIdsToDelete = new Set<string>();
                     shapes.forEach(s => { if (shapeIdsToDelete.has(s.id)) s.points.forEach(pid => pointIdsToDelete.add(pid)); });
                     setShapes(prev => prev.filter(s => !shapeIdsToDelete.has(s.id)));
                     const remainingShapes = shapes.filter(s => !shapeIdsToDelete.has(s.id));
                     const usedPointIds = new Set<string>();
                     remainingShapes.forEach(s => s.points.forEach(pid => usedPointIds.add(pid)));
                     setPoints(prev => prev.filter(p => !pointIdsToDelete.has(p.id) || usedPointIds.has(p.id)));
                     setSelectedShapeIds([]);
                   } else if (selection) {
                     deletePoint(selection);
                   }
                 }}
                 className="w-12 flex flex-col items-center justify-center rounded-xl bg-red-50 text-red-500 hover:bg-red-100 transition-colors group/trash relative py-2"
             >
                 <Trash2 className="w-5 h-5" />
                 <span className="text-[9px] font-bold mt-0.5 leading-tight">výběr</span>
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
      )}

      {/* Circle fixed radius helper button */}
      {!recordingState.showPlayer && activeTool === 'circle' && !circleInput.visible && !(isTabletMode && circleTabletState.active) && !selectedPointId && (
        <button
          onClick={() => {
            const cx = (canvasSize.width / 2 - offset.x) / scale;
            const cy = (canvasSize.height / 2 - offset.y) / scale;
            setCircleInput(prev => ({ ...prev, visible: true, center: { x: cx, y: cy } }));
            setCircleTabletState({ active: false, centerId: null, center: null, radius: 150, isDraggingHandle: false, handlePos: null });
            setSelectedPointId(null);
          }}
          onTouchEnd={(e) => {
            e.preventDefault(); e.stopPropagation();
            const cx = (canvasSize.width / 2 - offset.x) / scale;
            const cy = (canvasSize.height / 2 - offset.y) / scale;
            setCircleInput(prev => ({ ...prev, visible: true, center: { x: cx, y: cy } }));
            setCircleTabletState({ active: false, centerId: null, center: null, radius: 150, isDraggingHandle: false, handlePos: null });
            setSelectedPointId(null);
          }}
          className={`absolute left-4 z-10 px-4 py-2 rounded-full text-sm font-medium flex items-center gap-2 transition-all hover:scale-105 ${
            darkMode ? 'bg-[#24283b] text-[#c0caf5] border border-[#565f89]' : 'bg-white text-gray-600 shadow-md border'
          }`}
          style={{ bottom: 'calc(16px + env(safe-area-inset-bottom, 0px))' }}
        >
          <Ruler className="size-4" />
          Nastavit rozměr
        </button>
      )}
      
      {/* Segment fixed length helper button */}
      {!recordingState.showPlayer && activeTool === 'segment' && !segmentInput.visible && (
        <button
          onClick={() => setSegmentInput(prev => ({ ...prev, visible: true }))}
          className={`absolute left-4 z-10 px-4 py-2 rounded-full text-sm font-medium flex items-center gap-2 transition-all hover:scale-105 ${
            segmentInput.active 
              ? 'bg-blue-600 text-white shadow-lg' 
              : darkMode ? 'bg-[#24283b] text-[#c0caf5] border border-[#565f89]' : 'bg-white text-gray-600 shadow-md border'
          }`}
          style={{ bottom: 'calc(16px + env(safe-area-inset-bottom, 0px))' }}
        >
          <Ruler className="size-4" />
          {segmentInput.active 
            ? `${segmentInput.length} cm` 
            : 'Nastavit délku'
          }
        </button>
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
              addConstructionStep('perpendicular', `${newLine.label} ⊥ ${baseShape.label}`, `${newLine.label} \\perp ${baseShape.label}`, `Kolmice ${newLine.label} k přímce ${baseShape.label}`, [newLine.id]);
              
              setPerpTabletState({ step: 'idle', selectedLineId: null, currentPos: null });
              setActiveTool('move');
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
            // Vytvoříme bod na obvodu kružnice
            const centerPoint = points.find(p => p.id === circleTabletState.centerId);
            if (!centerPoint) return;
            
            const radiusPointId = crypto.randomUUID();
            const effectiveRadius = circleTabletState.radius;
            const handleAngle = circleTabletState.handlePos 
              ? Math.atan2(circleTabletState.handlePos.y - centerPoint.y, circleTabletState.handlePos.x - centerPoint.x)
              : 0; // Default doprava
            const radiusPoint: GeoPoint = {
              id: radiusPointId,
              x: centerPoint.x + Math.cos(handleAngle) * effectiveRadius,
              y: centerPoint.y + Math.sin(handleAngle) * effectiveRadius,
              label: '',
              hidden: false
            };
            
            setPoints(prev => [...prev, radiusPoint]);
            
            // Spustíme animaci
            pendingCircleCenterRef.current = null; // Circle completed
            startConstructionAnimation('circle', centerPoint, radiusPoint);
            
            // Resetujeme tablet state i selectedPointId
            setSelectedPointId(null);
            setCircleTabletState({
              active: false,
              centerId: null,
              center: null,
              radius: 150,
              isDraggingHandle: false,
              handlePos: null
            });
          }}
          onTouchEnd={(e) => {
            e.preventDefault();
            e.stopPropagation();
            const centerPoint = points.find(p => p.id === circleTabletState.centerId);
            if (!centerPoint) return;
            const radiusPointId = crypto.randomUUID();
            const effectiveRadius = circleTabletState.radius;
            const handleAngle = circleTabletState.handlePos 
              ? Math.atan2(circleTabletState.handlePos.y - centerPoint.y, circleTabletState.handlePos.x - centerPoint.x)
              : 0;
            const radiusPoint: GeoPoint = {
              id: radiusPointId,
              x: centerPoint.x + Math.cos(handleAngle) * effectiveRadius,
              y: centerPoint.y + Math.sin(handleAngle) * effectiveRadius,
              label: '',
              hidden: false
            };
            setPoints(prev => [...prev, radiusPoint]);
            pendingCircleCenterRef.current = null; // Circle completed
            startConstructionAnimation('circle', centerPoint, radiusPoint);
            setSelectedPointId(null);
            setCircleTabletState({
              active: false, centerId: null, center: null, radius: 150, isDraggingHandle: false, handlePos: null
            });
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
        const circleDrawActive = activeTool === 'circle' && circleTabletState.active && circleTabletState.center && circleTabletState.centerId;
        const anglePositioningActive = activeTool === 'angle' && angleTabletState.step === 'positioning' && angleTabletState.currentPos;
        if (isTabletMode && (perpPositioningActive || circleDrawActive || anglePositioningActive)) return null;

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
          else if (activeTool === 'circle' && !isTabletMode && selectedPointId) text = 'Vyber bod na obvodu (poloměr)';
          else if (activeTool === 'angle' && !isTabletMode && selectedPointId) text = 'Vyber bod na rameni úhlu';
          if (text) content = <span>{text}</span>;
        }

        if (!content) return null;

        return (
      <div className={`absolute left-1/2 -translate-x-1/2 z-10 rounded-2xl font-medium transition-all duration-300 px-5 py-2.5 text-sm border ${
        darkMode ? 'bg-[#24283b]/95 text-[#c0caf5] border-[#565f89] shadow-lg' : 'bg-white/95 text-gray-600 shadow-lg border-gray-200 backdrop-blur-sm'
      }`} style={{ bottom: 'calc(24px + env(safe-area-inset-bottom, 0px))' }}>
        {content}
      </div>
        );
      })()}

      {/* ZOOM + CONTROLS (top center) */}
      {!recordingState.showPlayer && (
      <div className="absolute left-1/2 -translate-x-1/2 top-4 z-10 flex items-center gap-1 p-2 bg-[#F2F2F2] rounded-full shadow-sm">
        <button 
          onClick={() => zoomToCenter(scale - 0.1)}
          className="w-10 h-10 flex items-center justify-center rounded-xl text-black hover:bg-gray-200 transition-all duration-300"
        >
          <ZoomOut className="w-5 h-5" />
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
          onClick={() => zoomToCenter(scale + 0.1)}
          className="w-10 h-10 flex items-center justify-center rounded-xl text-black hover:bg-gray-200 transition-all duration-300"
        >
          <ZoomIn className="w-5 h-5" />
        </button>

        {/* Dark Mode Toggle */}
        <div className="w-px h-6 bg-gray-300" />
        <button 
          onClick={() => onDarkModeChange(!darkMode)}
          className="w-10 h-10 flex items-center justify-center rounded-xl text-black hover:bg-gray-200 transition-all duration-300"
          title={darkMode ? 'Světlý režim' : 'Tmavý režim'}
        >
          {darkMode ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
        </button>

        {/* Tablet/Board Mode Toggle */}
        <div className="w-px h-6 bg-gray-300" />
        <button 
          onClick={() => {
            console.log('🔄 Přepínám režim:', !isTabletMode ? 'TABULE' : 'PC');
            setIsTabletMode(!isTabletMode);
          }}
          className={`px-3 py-1.5 rounded-xl transition-all duration-300 font-medium text-xs ${
            isTabletMode 
              ? 'bg-[#1e1b4b] text-white' 
              : 'text-black hover:bg-gray-200'
          }`}
          title={isTabletMode ? 'Klasický režim' : 'Režim pro tabule a tablety'}
        >
          {isTabletMode ? '📱 Tabule' : '🖥️ PC'}
        </button>
      </div>
      )}

      {/* CIRCLE INPUT PANEL (Compass mode) */}
      {circleInput.visible && (
        <>
          <div className={`absolute left-4 top-1/2 -translate-y-1/2 z-50 p-4 rounded-2xl shadow-2xl animate-in slide-in-from-left-4 fade-in duration-300 w-52 border backdrop-blur-md ${
            darkMode ? 'bg-[#24283b]/95 border-[#565f89]' : 'bg-white/95 border-gray-200'
          }`}>
              {/* Velký křížek pro zavření */}
              <button
                onClick={() => setCircleInput(prev => ({ ...prev, visible: false, center: null, isDraggingCenter: false, isDraggingHandle: false }))}
                onTouchEnd={(e) => { e.preventDefault(); e.stopPropagation(); setCircleInput(prev => ({ ...prev, visible: false, center: null, isDraggingCenter: false, isDraggingHandle: false })); }}
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
                     Táhni střed nebo handle na plátně
                   </p>
              </div>
            
            {/* Value Input */}
            <div className="mb-4 relative">
                <label className={`text-xs font-medium mb-1.5 block ${darkMode ? 'text-[#7aa2f7]' : 'text-gray-500'}`}>
                    Poloměr (cm)
                </label>
                <div className="relative">
                    <input 
                        type="number"
                        min="0.5"
                        max="50"
                        step="0.5"
                        value={circleInput.radius}
                        onChange={(e) => setCircleInput(prev => ({ ...prev, radius: Math.max(0.5, Number(e.target.value)) }))}
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
                    onValueChange={(vals) => setCircleInput(prev => ({ ...prev, radius: vals[0] }))}
                    min={0.5}
                    max={20}
                    step={0.5}
                />
                <div className="flex justify-between mt-3 gap-1">
                    {[1, 3, 5, 10, 15].map((val) => (
                        <button 
                            key={val} 
                            onClick={() => setCircleInput(prev => ({ ...prev, radius: val }))}
                            onTouchEnd={(e) => { e.preventDefault(); e.stopPropagation(); setCircleInput(prev => ({ ...prev, radius: val })); }}
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

            {/* Přepínač: Bod / Kružnice */}
            <div className="mt-4">
                <label className={`text-xs font-medium mb-2 block ${darkMode ? 'text-[#7aa2f7]' : 'text-gray-500'}`}>
                    Narýsovat
                </label>
                <div className="flex gap-2">
                    <button
                        onClick={() => setCircleInput(prev => ({ ...prev, mode: 'point' }))}
                        onTouchEnd={(e) => { e.preventDefault(); e.stopPropagation(); setCircleInput(prev => ({ ...prev, mode: 'point' })); }}
                        className={`flex-1 py-2.5 rounded-lg font-medium text-sm transition-all ${
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
                        className={`flex-1 py-2.5 rounded-lg font-medium text-sm transition-all ${
                            circleInput.mode === 'circle'
                                ? 'bg-blue-600 text-white shadow-lg'
                                : darkMode
                                    ? 'bg-[#414868] hover:bg-[#565f89] text-[#7aa2f7]'
                                    : 'bg-gray-100 hover:bg-gray-200 text-gray-600'
                        }`}
                    >
                        Kružnice
                    </button>
                </div>
            </div>
          </div>

          {/* Compass mode: Narýsovat button at bottom center */}
          {circleInput.center && (() => {
            const doCompassDraw = () => {
              if (!circleInput.center) return;
              const r = circleInput.radius * PIXELS_PER_CM;
              const targetX = circleInput.center.x + Math.cos(circleInput.handleAngle) * r;
              const targetY = circleInput.center.y + Math.sin(circleInput.handleAngle) * r;

              if (circleInput.mode === 'point') {
                const centerId = crypto.randomUUID();
                const centerLabel = getNextPointLabel();
                const centerPoint: GeoPoint = { id: centerId, x: circleInput.center.x, y: circleInput.center.y, label: centerLabel, hidden: false };
                const pointId = crypto.randomUUID();
                const pointLabel = getNextPointLabel();
                const newPoint: GeoPoint = { id: pointId, x: targetX, y: targetY, label: pointLabel, hidden: false };
                setPoints(prev => [...prev, centerPoint, newPoint]);
                triggerEffect(targetX, targetY, '#3b82f6');
              } else {
                const centerId = crypto.randomUUID();
                const centerLabel = getNextPointLabel();
                const centerPoint: GeoPoint = { id: centerId, x: circleInput.center.x, y: circleInput.center.y, label: centerLabel, hidden: false };
                const radiusId = crypto.randomUUID();
                const radiusPoint: GeoPoint = { id: radiusId, x: targetX, y: targetY, label: '', hidden: false };
                setPoints(prev => [...prev, centerPoint, radiusPoint]);
                pendingCircleCenterRef.current = null;
                startConstructionAnimation('circle', centerPoint, radiusPoint);
              }
              pendingCircleCenterRef.current = null;
              setCircleInput(prev => ({ ...prev, visible: false, center: null, isDraggingCenter: false, isDraggingHandle: false }));
              setActiveTool('circle');
            };
            return (
            <button
              onClick={doCompassDraw}
              onTouchEnd={(e) => { e.preventDefault(); e.stopPropagation(); doCompassDraw(); }}
              className="absolute left-1/2 -translate-x-1/2 z-50 px-8 py-4 rounded-full text-base font-bold bg-blue-600 text-white shadow-lg shadow-blue-500/30 flex items-center gap-2 transition-all hover:scale-105 active:scale-95"
              style={{ bottom: 'calc(80px + env(safe-area-inset-bottom, 0px))' }}
            >
              Narýsovat {circleInput.mode === 'point' ? 'bod' : 'kružnici'} ({circleInput.radius.toFixed(1).replace('.', ',')} cm)
            </button>
            );
          })()}
        </>
      )}

      {/* SEGMENT LENGTH INPUT PANEL */}
      {segmentInput.visible && (
        <>
          <div className={`absolute left-4 top-1/2 -translate-y-1/2 z-50 p-4 rounded-2xl shadow-2xl animate-in slide-in-from-left-4 fade-in duration-300 w-52 border backdrop-blur-md ${
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
                        type="number"
                        min="0.5"
                        max="50"
                        step="0.5"
                        value={segmentInput.length}
                        onChange={(e) => setSegmentInput(prev => ({ ...prev, length: Number(e.target.value) }))}
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
                    onValueChange={(vals) => setSegmentInput(prev => ({ ...prev, length: vals[0] }))}
                    min={0.5}
                    max={20}
                    step={0.5}
                />
                <div className="flex justify-between mt-3 gap-1">
                    {[1, 3, 5, 10, 15].map((val) => (
                        <button 
                            key={val} 
                            onClick={() => setSegmentInput(prev => ({ ...prev, length: val }))}
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
                  setSegmentInput(prev => ({ ...prev, active: true, visible: false, mode: 'fixed' }));
                  setActiveTool('segment');
                }}
                className="w-full py-3 rounded-xl font-bold text-white bg-blue-600 hover:bg-blue-700 flex items-center justify-center gap-2 shadow-lg shadow-blue-500/30 transition-all active:scale-95 text-sm"
            >
                <Check className="size-5" />
                <span>Použít</span>
            </button>
          </div>
        </>
      )}

      {/* ANGLE INPUT PANEL */}
      {angleInput.visible && (
        <>
          <div className={`absolute left-4 top-1/2 -translate-y-1/2 z-50 p-4 rounded-2xl shadow-2xl animate-in slide-in-from-left-4 fade-in duration-300 w-52 border backdrop-blur-md ${
            darkMode ? 'bg-[#24283b]/95 border-[#565f89]' : 'bg-white/95 border-gray-200'
          }`}>
              {/* Velký křížek pro zavření - nad popupem */}
              <button
                onClick={() => {
                  setAngleInput(prev => ({ ...prev, visible: false }));
                  // Reset angle tablet state při zavření popupu
                  if (isTabletMode) {
                    setAngleTabletState({ step: 'idle', selectedLineId: null, currentPos: null, baseAngle: 0 });
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
                <div className="relative">
                    <input 
                        type="number"
                        min="0"
                        max="360"
                        value={angleInput.value}
                        onChange={(e) => setAngleInput(prev => ({ ...prev, value: Number(e.target.value) }))}
                        className={`w-full p-3 text-center text-3xl font-bold rounded-xl border-2 transition-all outline-none ${
                        darkMode 
                            ? 'bg-[#414868] border-[#565f89] text-[#c0caf5] focus:border-[#7aa2f7]' 
                            : 'bg-white border-gray-200 text-gray-900 focus:border-blue-500'
                        }`}
                    />
                    <span className={`absolute right-3 top-1/2 -translate-y-1/2 text-xl font-bold ${darkMode ? 'text-[#565f89]' : 'text-gray-400'}`}>°</span>
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
                         isMirrored: !prev.isMirrored
                     }))}
                     className={`h-12 rounded-xl flex items-center justify-center border-2 transition-all ${
                         angleInput.isMirrored
                            ? 'bg-blue-600 border-blue-600 text-white'
                            : darkMode 
                                ? 'bg-[#414868] border-[#565f89] hover:bg-[#565f89] text-[#c0caf5]' 
                                : 'bg-white border-gray-200 hover:bg-gray-50 text-gray-600'
                     }`}
                     title="Zrcadlit úhloměr"
                 >
                     <FlipVertical className="size-5" />
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
        </>
      )}

      {/* EDITOR KROKŮ - Po ukončení nahrávání */}
      {recordingState.showEditor && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
          <div className={`${darkMode ? 'bg-[#24283b]' : 'bg-white'} rounded-2xl p-8 shadow-2xl max-w-2xl w-full mx-4 max-h-[80vh] overflow-hidden flex flex-col`}>
            <h2 className={`text-2xl font-bold mb-2 ${darkMode ? 'text-[#c0caf5]' : 'text-gray-900'}`}>
              Uprava kroku
            </h2>
            <p className={`mb-4 ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
              Nahrano {editableSteps.length} kroku. Muzes upravit nazvy jednotlivych kroku.
            </p>

            {/* Recording name input */}
            <div className="mb-4">
              <label className={`block text-sm font-medium mb-1.5 ${darkMode ? 'text-[#9aa5ce]' : 'text-gray-700'}`}>
                Nazev zaznamu (pro sdileni)
              </label>
              <input
                type="text"
                value={recordingName}
                onChange={(e) => setRecordingName(e.target.value)}
                placeholder="Napr. Konstrukce trojuhelniku ABC..."
                className={`w-full px-4 py-2.5 rounded-xl border ${
                  darkMode ? 'bg-[#414868] border-[#565f89] text-[#c0caf5] placeholder-[#565f89]' : 'bg-white border-gray-300 text-gray-900 placeholder-gray-400'
                } focus:outline-none focus:ring-2 focus:ring-blue-500`}
              />
            </div>

            <div className="flex-1 overflow-y-auto mb-6 space-y-3">
              {editableSteps.map((step, index) => (
                <div key={step.id} className={`flex items-center gap-3 p-3 rounded-lg ${darkMode ? 'bg-gray-800' : 'bg-gray-50'}`}>
                  <div className={`flex items-center justify-center w-8 h-8 rounded-full ${darkMode ? 'bg-gray-700 text-gray-300' : 'bg-gray-200 text-gray-700'} font-bold text-sm`}>
                    {index + 1}
                  </div>
                  <div className={`flex items-center justify-center w-8 h-8 rounded-full ${darkMode ? 'bg-blue-900/50 text-blue-400' : 'bg-blue-100 text-blue-600'}`}>
                    {getActionIcon(step.actionType)}
                  </div>
                  <input
                    type="text"
                    value={step.description}
                    onChange={(e) => {
                      const newSteps = [...editableSteps];
                      newSteps[index] = { ...newSteps[index], description: e.target.value };
                      setEditableSteps(newSteps);
                    }}
                    className={`flex-1 px-3 py-2 rounded-lg border ${
                      darkMode ? 'bg-[#414868] border-[#565f89] text-[#c0caf5]' : 'bg-white border-gray-300 text-gray-900'
                    } focus:outline-none focus:ring-2 focus:ring-blue-500`}
                  />
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
                  let animType: 'segment' | 'line' | 'ray' | 'circle' | 'angle' | null = null;
                  
                  if (viz.type === 'ruler') {
                    if (step.actionType === 'create-segment') animType = 'segment';
                    else if (step.actionType === 'create-line') animType = 'line';
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
                    console.log('🎬 Spouštím animaci:', animType, 'p1:', viz.p1, 'p2:', viz.p2);
                    
                    // Nejdřív nastavit finální snapshot (body a tvary)
                    setPoints(step.snapshot.points);
                    setShapes(step.snapshot.shapes);
                    setFreehandPaths(step.snapshot.freehandPaths);
                    
                    // Pak spustit animaci nástroje (vizuální efekt)
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
                    
                    // Po 2 sekundách zrušit animaci nástroje
                    setTimeout(() => {
                      setAnimState({
                        isActive: false,
                        type: null,
                        startTime: 0,
                        p1: null,
                        p2: null,
                        progress: 0
                      });
                    }, 2000);
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
              onClick={() => {
                if (sharedRecording) {
                  onBack();
                } else {
                  setRecordingState(prev => ({
                    ...prev,
                    showPlayer: false,
                    currentStepIndex: -1
                  }));
                  setPoints([]);
                  setShapes([]);
                  setFreehandPaths([]);
                  setShareLink(null);
                  setRecordingName('');
                  setAnimState({
                    isActive: false,
                    type: null,
                    startTime: 0,
                    p1: null,
                    p2: null,
                    progress: 0
                  });
                }
              }}
              className={`p-3 rounded-full transition-all ${
                darkMode ? 'hover:bg-gray-800 text-red-400' : 'hover:bg-gray-100 text-red-500'
              }`}
              title="Zavrit prehravac"
            >
              <X className="size-6" />
            </button>
          </div>

          {/* Share link display - po sdileni */}
          {shareLink && (
            <div className={`absolute bottom-28 left-1/2 -translate-x-1/2 z-50 px-5 py-4 rounded-2xl shadow-2xl ${
              darkMode ? 'bg-gray-900 border border-gray-800' : 'bg-white border border-gray-200'
            }`}>
              <div className="flex items-center gap-2 mb-2">
                <Link className={`size-4 ${darkMode ? 'text-[#7aa2f7]' : 'text-blue-600'}`} />
                <span className={`text-sm font-medium ${darkMode ? 'text-[#7aa2f7]' : 'text-blue-700'}`}>Odkaz ke sdileni</span>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  readOnly
                  value={shareLink}
                  className={`w-80 px-3 py-2 rounded-lg text-sm font-mono ${
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
                    try { document.execCommand('copy'); toast.success('Odkaz zkopirovan!'); }
                    catch { toast.error('Nelze zkopirovat'); }
                    document.body.removeChild(ta);
                  }}
                  className={`p-2.5 rounded-lg transition-all ${
                    darkMode ? 'bg-[#7aa2f7] hover:bg-[#7aa2f7]/80 text-white' : 'bg-blue-600 hover:bg-blue-700 text-white'
                  }`}
                  title="Kopirovat odkaz"
                >
                  <Copy className="size-4" />
                </button>
              </div>
            </div>
          )}

          {/* Shared recording name badge */}
          {sharedRecording && (
            <div className={`absolute top-8 right-8 px-4 py-2 rounded-xl ${
              darkMode ? 'bg-[#24283b] border border-[#565f89]' : 'bg-white shadow-lg'
            }`}>
              <div className={`text-sm font-bold ${darkMode ? 'text-[#c0caf5]' : 'text-gray-900'}`}>
                {sharedRecording.name}
              </div>
            </div>
          )}

          {/* Název aktuálního kroku — zápis konstrukce (LaTeX) */}
          {recordingState.currentStepIndex >= 0 && recordingState.currentStepIndex < recordingState.steps.length && (() => {
            const recStep = recordingState.steps[recordingState.currentStepIndex];
            const prevSnapshot = recordingState.currentStepIndex > 0
              ? recordingState.steps[recordingState.currentStepIndex - 1].snapshot
              : { points: [] as GeoPoint[], shapes: [] as GeoShape[] };
            const prevPointIds = new Set(prevSnapshot.points.map((p: GeoPoint) => p.id));
            const prevShapeIds = new Set(prevSnapshot.shapes.map((s: GeoShape) => s.id));
            const newIds = [
              ...recStep.snapshot.points.filter((p: GeoPoint) => !prevPointIds.has(p.id)).map((p: GeoPoint) => p.id),
              ...recStep.snapshot.shapes.filter((s: GeoShape) => !prevShapeIds.has(s.id)).map((s: GeoShape) => s.id),
            ];
            const matchingStep = newIds.length > 0
              ? constructionSteps.find(cs => cs.objectIds.some(id => newIds.includes(id)))
              : undefined;
            return (
              <div className={`absolute top-8 left-1/2 -translate-x-1/2 px-6 py-3 rounded-xl shadow-lg ${
                darkMode ? 'bg-[#24283b] text-[#c0caf5] border border-[#565f89]' : 'bg-white text-gray-900'
              }`}>
                <div className={`text-sm mb-1 ${darkMode ? 'text-[#9aa5ce]' : 'text-gray-500'}`}>
                  Krok {recordingState.currentStepIndex + 1} / {recordingState.steps.length}
                </div>
                <div className="flex items-center gap-3">
                  <div className={`flex items-center justify-center w-10 h-10 rounded-full ${darkMode ? 'bg-[#7aa2f7]/20 text-[#7aa2f7]' : 'bg-blue-100 text-blue-600'}`}>
                    {getActionIcon(recStep.actionType)}
                  </div>
                  {matchingStep ? (
                    <div className="text-lg">
                      <span className={`mr-2 ${darkMode ? 'text-[#565f89]' : 'text-gray-400'}`}>{matchingStep.stepNumber}.</span>
                      <Latex math={matchingStep.latex || matchingStep.notation} className={darkMode ? 'katex-dark' : ''} />
                    </div>
                  ) : (
                    <div className="font-bold text-lg">
                      {recStep.description}
                    </div>
                  )}
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

    </div>
    <Toaster position="top-center" theme={darkMode ? 'dark' : 'light'} />
    </>
  );
}
