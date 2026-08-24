import { Component, useMemo, useState, useRef, useCallback, useEffect, lazy, Suspense } from 'react';
import { useParams } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Download, Eye, EyeOff, GripVertical, Image as ImageIcon } from 'lucide-react';
import { ShareModal } from '../components/ShareModal';
import '../../../rysovani/src/index.css';
import type { GeometrySubmissionSnapshot } from '../../../rysovani/src/components/FreeGeometryEditor';
import { formatGeometryStepSubmissions, formatGeometrySubmission, geometrySnapshotIsEmpty } from '../utils/geometrySubmissionCodec';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { getSupabase } from '@/lib/supabase';
import { CIRCUIT_ASSIGNMENTS_TABLE, CIRCUIT_SUBMISSIONS_TABLE } from '@/lib/circuitTables';
import { submissionPublicUrl } from '../utils/appUrl';
import { normalizeInitialCanvasSnapshot } from '../utils/assignmentCanvasFixes';
import { assignmentInstructionDisplay, assignmentUsesNewCanvasPerStep, parseCanvasSnapshot } from '../utils/instructionSteps';
import { downloadAssignmentPdf } from '../utils/assignmentPdf';
import { getAssignmentModelSolution } from '../utils/assignmentSolutions';
import { toast } from 'sonner';

const FreeGeometryEditor = lazy(() =>
  import('../../../rysovani/src/components/FreeGeometryEditor').then(m => ({
    default: m.FreeGeometryEditor,
  })),
);

const ASIDE_W_KEY = 'elobvod-student-aside-w';
const ASIDE_COLLAPSED_KEY = 'elobvod-student-aside-collapsed';
const NOTE_KEY_PREFIX = 'elobvod-student-note-';
const MIN_ASIDE_PX = 200;
const MAX_ASIDE_PX = 640;
const DEFAULT_ASIDE_PX = 288;
// Feature flag: keep detection code, hide UI for now.
const SHOW_OBJECT_DETECT_UI = false;

function detectPreferredGeometryDeviceType(): 'board' | 'computer' {
  if (typeof window === 'undefined') return 'computer';
  try {
    const coarsePointer = window.matchMedia?.('(pointer: coarse)')?.matches ?? false;
    const noHover = window.matchMedia?.('(hover: none)')?.matches ?? false;
    const touchPoints = Number((navigator as any)?.maxTouchPoints ?? 0);
    // Prefer "board/tablet" only when the environment looks touch-first.
    if (coarsePointer || (touchPoints > 0 && noHover)) return 'board';
    return 'computer';
  } catch {
    return 'computer';
  }
}

function readAsideWidth(): number {
  if (typeof sessionStorage === 'undefined') return DEFAULT_ASIDE_PX;
  const v = Number(sessionStorage.getItem(ASIDE_W_KEY));
  return Number.isFinite(v) && v >= MIN_ASIDE_PX && v <= MAX_ASIDE_PX ? v : DEFAULT_ASIDE_PX;
}

function readAsideCollapsed(): boolean {
  // Default: show assignment panel on open.
  if (typeof sessionStorage === 'undefined') return false;
  const v = sessionStorage.getItem(ASIDE_COLLAPSED_KEY);
  if (v === null) return false;
  return v === '1';
}

function nameStorageKey(assignmentId: string) {
  return `elobvod-ukol-jmeno-${assignmentId}`;
}

function noteStorageKey(assignmentId: string) {
  return `${NOTE_KEY_PREFIX}${assignmentId}`;
}

function emptyGeometrySnapshot(): GeometrySubmissionSnapshot {
  return { points: [], shapes: [], freehandPaths: [] };
}

type AssignmentRow = {
  id: string;
  title?: string;
  instruction_text: string;
  instruction_image: string | null;
  instruction_steps?: unknown;
  initial_canvas_snapshot?: unknown;
  new_canvas_per_step?: boolean;
};

function ModelSolutionPanel({
  visible,
  stepIndex,
  stepCount,
  stepText,
  className,
  onToggle,
  onPrev,
  onNext,
}: {
  visible: boolean;
  stepIndex: number;
  stepCount: number;
  stepText: string;
  className?: string;
  onToggle: () => void;
  onPrev: () => void;
  onNext: () => void;
}) {
  return (
    <div className={className}>
      <button
        type="button"
        onClick={onToggle}
        className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-800 shadow-sm transition-colors hover:bg-slate-50"
        aria-pressed={visible}
      >
        {visible ? (
          <EyeOff className="size-4 opacity-80" aria-hidden />
        ) : (
          <Eye className="size-4 opacity-80" aria-hidden />
        )}
        {visible ? 'Skrýt řešení' : 'Zobrazit řešení'}
      </button>
      {visible ? (
        <div className="space-y-3">
          {stepCount > 1 ? (
            <div className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5">
              <button
                type="button"
                onClick={onPrev}
                disabled={stepIndex <= 0}
                className="flex size-8 items-center justify-center rounded-md text-slate-700 transition-colors hover:bg-white disabled:cursor-not-allowed disabled:opacity-35"
                aria-label="Předchozí krok řešení"
              >
                <ChevronLeft className="size-4" aria-hidden />
              </button>
              <span className="text-xs font-semibold tabular-nums text-slate-700">
                Krok řešení {stepIndex + 1} z {stepCount}
              </span>
              <button
                type="button"
                onClick={onNext}
                disabled={stepIndex >= stepCount - 1}
                className="flex size-8 items-center justify-center rounded-md text-slate-700 transition-colors hover:bg-white disabled:cursor-not-allowed disabled:opacity-35"
                aria-label="Další krok řešení"
              >
                <ChevronRight className="size-4" aria-hidden />
              </button>
            </div>
          ) : null}
          <p className="text-[13px] leading-relaxed text-slate-600 whitespace-pre-wrap">{stepText}</p>
        </div>
      ) : null}
    </div>
  );
}

class StudentAssignmentErrorBoundary extends Component<
  { children: React.ReactNode },
  { error: Error | null }
> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-white p-6 text-center">
          <div className="max-w-xl">
            <div className="text-sm font-semibold text-red-700">Chyba při vykreslení stránky úkolu</div>
            <div className="mt-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-left text-sm text-red-900 whitespace-pre-wrap">
              {this.state.error.message || String(this.state.error)}
            </div>
            <div className="mt-3 text-xs text-zinc-500">
              Otevři DevTools konzoli pro detailnější stacktrace.
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function StudentAssignmentPage() {
  const { assignmentId } = useParams<{ assignmentId: string }>();
  const submissionSnapshotRef = useRef<(() => GeometrySubmissionSnapshot | null) | null>(null);

  const [loadState, setLoadState] = useState<'loading' | 'error' | 'ready'>('loading');
  const [assignment, setAssignment] = useState<AssignmentRow | null>(null);
  const [stepIndex, setStepIndex] = useState(0);
  const [darkMode, setDarkMode] = useState(false);
  const [preferredDeviceType, setPreferredDeviceType] = useState<'board' | 'computer'>(
    detectPreferredGeometryDeviceType(),
  );

  const [gateName, setGateName] = useState('');
  /** Jméno pro odevzdání — prázdné = doplní se dialogem při odevzdání (pokud není v sessionStorage) */
  const [studentName, setStudentName] = useState('');
  const [submitNameOpen, setSubmitNameOpen] = useState(false);
  const [studentNote, setStudentNote] = useState('');

  const [submitBusy, setSubmitBusy] = useState(false);
  const [resultUrl, setResultUrl] = useState<string | null>(null);

  const [asideWidth, setAsideWidth] = useState(readAsideWidth);
  const [asideCollapsed, setAsideCollapsed] = useState(readAsideCollapsed);
  const asideResizeRef = useRef<{ startX: number; startW: number } | null>(null);

  const [projectionEnabled, setProjectionEnabled] = useState(false);
  const [projectionOpacity, setProjectionOpacity] = useState(0.35);
  const [projectionSrc, setProjectionSrc] = useState<string | null>(null);
  const [autoDetectRequestId, setAutoDetectRequestId] = useState(0);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [showModelSolution, setShowModelSolution] = useState(false);
  const [solutionStepIndex, setSolutionStepIndex] = useState(0);
  const [autoDetectSrc, setAutoDetectSrc] = useState<string | null>(null);
  const [canvasSessionKey, setCanvasSessionKey] = useState(0);
  const [editorInitialSnapshot, setEditorInitialSnapshot] =
    useState<GeometrySubmissionSnapshot | null>(null);
  const [editorCanvasReady, setEditorCanvasReady] = useState(false);
  const prevStepIndexRef = useRef(0);
  const stepSnapshotsRef = useRef<(GeometrySubmissionSnapshot | null)[]>([]);

  useEffect(() => {
    sessionStorage.setItem(ASIDE_W_KEY, String(asideWidth));
  }, [asideWidth]);

  useEffect(() => {
    sessionStorage.setItem(ASIDE_COLLAPSED_KEY, asideCollapsed ? '1' : '0');
  }, [asideCollapsed]);

  const onAsideResizePointerDown = (e: React.PointerEvent) => {
    e.preventDefault();
    asideResizeRef.current = { startX: e.clientX, startW: asideWidth };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  const onAsideResizePointerMove = (e: React.PointerEvent) => {
    const drag = asideResizeRef.current;
    if (!drag) return;
    const next = drag.startW + (drag.startX - e.clientX);
    setAsideWidth(Math.min(MAX_ASIDE_PX, Math.max(MIN_ASIDE_PX, next)));
  };

  const onAsideResizePointerUp = (e: React.PointerEvent) => {
    asideResizeRef.current = null;
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  };

  useEffect(() => {
    if (!assignmentId) {
      setLoadState('error');
      return;
    }
    // Only when opening a student assignment: auto-pick tablet vs PC defaults.
    // (Free drawing keeps user choice via the manual toggle.)
    setPreferredDeviceType(detectPreferredGeometryDeviceType());
    const saved = sessionStorage.getItem(nameStorageKey(assignmentId));
    if (saved?.trim()) setStudentName(saved.trim());
    const savedNote = sessionStorage.getItem(noteStorageKey(assignmentId));
    if (savedNote != null) setStudentNote(savedNote);

    const supabase = getSupabase();
    if (!supabase) {
      setLoadState('error');
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const { data, error } = await supabase
          .from(CIRCUIT_ASSIGNMENTS_TABLE)
          .select('*')
          .eq('id', assignmentId)
          .maybeSingle();
        if (cancelled) return;
        if (error || !data) {
          setLoadState('error');
          return;
        }
        setAssignment(data as AssignmentRow);
        setStepIndex(0);
        // Always show instructions panel when opening an assignment.
        // (Session storage might have it collapsed from a previous visit.)
        setAsideCollapsed(false);
        setLoadState('ready');
        setShowModelSolution(false);
        setSolutionStepIndex(0);
      } catch (e) {
        if (!cancelled) {
          console.error('Načtení zadání (Supabase):', e);
          setLoadState('error');
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [assignmentId]);

  const performSubmit = useCallback(async (encoded: string, name: string) => {
    const supabase = getSupabase();
    if (!supabase || !assignmentId) {
      toast.error('Nelze odevzdat – chybí Supabase nebo úkol.');
      return;
    }

    setSubmitBusy(true);
    try {
      const { data, error } = await supabase
        .from(CIRCUIT_SUBMISSIONS_TABLE)
        .insert({
          assignment_id: assignmentId,
          student_name: name,
          circuit_encoded: encoded,
          student_note: studentNote.trim(),
        })
        .select('id')
        .single();

      if (error) throw error;
      if (!data?.id) throw new Error('Chybí ID odevzdání');

      setResultUrl(submissionPublicUrl(data.id));
      toast.success('Odevzdáno – zkopíruj odkaz pro učitele.');
    } catch (e) {
      console.error(e);
      toast.error(e instanceof Error ? e.message : 'Odevzdání se nepovedlo.');
    } finally {
      setSubmitBusy(false);
    }
  }, [assignmentId, studentNote]);

  const instructionView = useMemo(() => {
    return assignment ? assignmentInstructionDisplay(assignment) : null;
  }, [assignment]);

  const modelSolution = useMemo(
    () => getAssignmentModelSolution(assignment?.id ?? assignmentId),
    [assignment?.id, assignmentId],
  );
  const modelSolutionSteps = modelSolution?.steps?.length
    ? modelSolution.steps
    : modelSolution
      ? [{ text: modelSolution.explanation, snapshot: modelSolution.snapshot }]
      : [];
  const clampedSolutionStep = Math.min(
    Math.max(0, solutionStepIndex),
    Math.max(0, modelSolutionSteps.length - 1),
  );
  const activeSolutionStep = showModelSolution ? modelSolutionSteps[clampedSolutionStep] ?? null : null;
  const toggleModelSolution = () => {
    setShowModelSolution(v => {
      if (!v) setSolutionStepIndex(0);
      return !v;
    });
  };

  const newCanvasPerStep = assignment ? assignmentUsesNewCanvasPerStep(assignment) : false;
  const stepsCount = instructionView?.kind === 'steps' ? instructionView.steps.length : 0;

  const collectGeometrySubmission = useCallback((): string | null => {
    const fn = submissionSnapshotRef.current;
    if (!fn) {
      toast.error('Editor není připravený – zkus znovu za chvíli.');
      return null;
    }
    const snap = fn();
    if (!snap) {
      toast.error('Nepodařilo se přečíst plátno.');
      return null;
    }
    if (newCanvasPerStep && stepsCount > 0) {
      const saved = [...stepSnapshotsRef.current];
      saved[stepIndex] = snap;
      stepSnapshotsRef.current = saved;
      const steps = Array.from({ length: stepsCount }, (_, i) => saved[i] ?? emptyGeometrySnapshot());
      if (steps.every(geometrySnapshotIsEmpty)) {
        toast.error('Plátna jsou prázdná – v aspoň jednom kroku něco narýsuj.');
        return null;
      }
      return formatGeometryStepSubmissions(steps);
    }
    if (geometrySnapshotIsEmpty(snap)) {
      toast.error('Plátno je prázdné – něco narýsuj.');
      return null;
    }
    return formatGeometrySubmission(snap);
  }, [newCanvasPerStep, stepIndex, stepsCount]);

  const handleSubmit = useCallback(() => {
    const encoded = collectGeometrySubmission();
    if (!encoded) return;

    const saved =
      assignmentId ? sessionStorage.getItem(nameStorageKey(assignmentId))?.trim() : '';
    const known = studentName.trim() || saved;
    if (known) {
      void performSubmit(encoded, known);
      return;
    }

    setGateName(studentName.trim() || saved || '');
    setSubmitNameOpen(true);
  }, [assignmentId, studentName, performSubmit, collectGeometrySubmission]);

  const confirmNameAndSubmit = useCallback(() => {
    const n = gateName.trim();
    if (!n) {
      toast.error('Zadej jméno');
      return;
    }
    if (assignmentId) sessionStorage.setItem(nameStorageKey(assignmentId), n);
    setStudentName(n);

    const encoded = collectGeometrySubmission();
    if (!encoded) {
      setSubmitNameOpen(false);
      return;
    }
    setSubmitNameOpen(false);
    void performSubmit(encoded, n);
  }, [assignmentId, gateName, performSubmit, collectGeometrySubmission]);

  const resolveGlobalCanvasSnapshot = useCallback((): GeometrySubmissionSnapshot | null => {
    if (!assignment?.initial_canvas_snapshot) return null;
    const raw =
      assignmentId != null
        ? normalizeInitialCanvasSnapshot(assignmentId, assignment.initial_canvas_snapshot)
        : assignment.initial_canvas_snapshot;
    return parseCanvasSnapshot(raw);
  }, [assignment, assignmentId]);

  const usesGlobalSharedCanvas = resolveGlobalCanvasSnapshot() != null;

  const baselineSnapshotForStep = useCallback(
    (index: number): GeometrySubmissionSnapshot | null => {
      const view = assignment ? assignmentInstructionDisplay(assignment) : null;
      if (view?.kind !== 'steps') return resolveGlobalCanvasSnapshot();
      if (usesGlobalSharedCanvas) return resolveGlobalCanvasSnapshot();
      return view.steps[index]?.canvasSnapshot ?? null;
    },
    [assignment, usesGlobalSharedCanvas, resolveGlobalCanvasSnapshot],
  );

  const activeStep =
    instructionView?.kind === 'steps' && stepsCount > 0
      ? instructionView.steps[Math.min(Math.max(0, stepIndex), stepsCount - 1)]
      : null;

  useEffect(() => {
    if (loadState !== 'ready' || !assignment) {
      setEditorCanvasReady(false);
      return;
    }
    setEditorInitialSnapshot(baselineSnapshotForStep(0));
    setCanvasSessionKey(0);
    prevStepIndexRef.current = 0;
    stepSnapshotsRef.current = [];
    setEditorCanvasReady(true);
  }, [loadState, assignment, assignmentId, baselineSnapshotForStep]);

  useEffect(() => {
    if (loadState !== 'ready' || !editorCanvasReady || instructionView?.kind !== 'steps') return;
    if (!newCanvasPerStep) return;
    const prev = prevStepIndexRef.current;
    if (prev === stepIndex) return;
    const currentSnap = submissionSnapshotRef.current?.() ?? null;
    const saved = [...stepSnapshotsRef.current];
    saved[prev] = currentSnap;
    stepSnapshotsRef.current = saved;
    prevStepIndexRef.current = stepIndex;
    setEditorInitialSnapshot(saved[stepIndex] ?? baselineSnapshotForStep(stepIndex));
    setCanvasSessionKey(k => k + 1);
  }, [
    stepIndex,
    loadState,
    editorCanvasReady,
    instructionView,
    baselineSnapshotForStep,
    newCanvasPerStep,
  ]);

  const handleDownloadPdf = useCallback(async () => {
    if (!assignment) return;
    setPdfBusy(true);
    try {
      const live = submissionSnapshotRef.current?.() ?? null;
      let solutionSnapshots: GeometrySubmissionSnapshot[] | undefined;
      if (live) {
        if (newCanvasPerStep && stepsCount > 0) {
          const saved = [...stepSnapshotsRef.current];
          saved[stepIndex] = live;
          stepSnapshotsRef.current = saved;
          solutionSnapshots = Array.from(
            { length: stepsCount },
            (_, i) => saved[i] ?? baselineSnapshotForStep(i) ?? emptyGeometrySnapshot(),
          );
        } else if (stepsCount > 0) {
          solutionSnapshots = Array.from({ length: stepsCount }, () => live);
        } else {
          solutionSnapshots = [live];
        }
      }
      await downloadAssignmentPdf({
        id: assignment.id,
        title: assignment.title,
        instruction_text: assignment.instruction_text,
        instruction_image: assignment.instruction_image,
        instruction_steps: assignment.instruction_steps,
        solutionSnapshots,
      });
      toast.success('PDF se stahuje');
    } catch (e) {
      console.error(e);
      toast.error('PDF se nepodařilo vytvořit.');
    } finally {
      setPdfBusy(false);
    }
  }, [assignment, baselineSnapshotForStep, newCanvasPerStep, stepIndex, stepsCount]);

  const geometryEditorKey = `${assignmentId}-canvas-${canvasSessionKey}`;

  useEffect(() => {
    if (!projectionSrc) setProjectionEnabled(false);
  }, [projectionSrc]);

  const openAssignmentButton = asideCollapsed ? (
    <button
      type="button"
      onClick={() => setAsideCollapsed(false)}
      className="flex h-12 shrink-0 items-center gap-2 rounded-full border border-[#3d4456] bg-[#565e75] px-4 text-[15px] font-semibold tracking-tight text-white shadow-md transition-colors hover:bg-[#4f566b] [font-family:system-ui,sans-serif]"
      title="Otevřít zadání"
      aria-expanded={false}
    >
      <ChevronRight className="size-5 shrink-0 opacity-95" strokeWidth={2.5} aria-hidden />
      Zadání
    </button>
  ) : null;

  if (!assignmentId) {
    return (
      <div className="min-h-screen flex items-center justify-center text-zinc-600 p-6">
        Neplatný odkaz na úkol.
      </div>
    );
  }

  if (loadState === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center text-zinc-500">
        Načítám zadání…
      </div>
    );
  }

  if (loadState === 'error' || !assignment) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-2 p-6 text-center text-zinc-600">
        <p>Zadání se nepodařilo načíst.</p>
        <p className="text-sm text-zinc-400">Zkontroluj odkaz, Supabase a proměnné prostředí.</p>
      </div>
    );
  }

  return (
    <StudentAssignmentErrorBoundary>
      <div className="relative h-screen h-[100dvh] w-full overflow-hidden bg-white">
        <div className="absolute inset-0 min-h-0 min-w-0">
          <Suspense
            fallback={
              <div className="flex h-full w-full items-center justify-center bg-white text-zinc-500">
                Načítám rýsovací editor…
              </div>
            }
          >
            <FreeGeometryEditor
              key={geometryEditorKey}
              onBack={() => {}}
              darkMode={darkMode}
              onDarkModeChange={setDarkMode}
              deviceType={preferredDeviceType}
              embedInAssignment
              initialCanvasSnapshot={editorCanvasReady ? editorInitialSnapshot : null}
              submissionSnapshotRef={submissionSnapshotRef}
              assignmentToolbarRightOffsetPx={asideCollapsed ? 16 : asideWidth}
            projectionImageSrc={projectionSrc}
              projectionEnabled={projectionEnabled}
              projectionOpacity={projectionOpacity}
              autoDetectImageSrc={autoDetectSrc}
              autoDetectRequestId={autoDetectRequestId}
              overlaySnapshot={activeSolutionStep?.snapshot ?? null}
              assignmentToolbarSlot={
                openAssignmentButton ? (
                  <div className="flex items-center gap-2">
                    {openAssignmentButton}
                  </div>
                ) : undefined
              }
            />
          </Suspense>
        </div>

      {!asideCollapsed ? (
          <aside
            className="fixed right-0 top-0 z-50 flex h-[100dvh] max-w-[100vw] flex-col border-l border-[#4a5163] bg-[#565e75] text-white shadow-2xl"
            style={{ width: asideWidth }}
            aria-expanded={true}
          >
            <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
            <header className="shrink-0 border-b border-[#4a5163] bg-[#565e75]">
              <div className="flex items-center justify-between gap-2 px-4 pt-[15px] pb-2">
                <div
                  role="separator"
                  aria-orientation="vertical"
                  aria-label="Změnit šířku panelu zadání"
                  title="Změnit šířku panelu"
                  className="flex h-12 w-7 shrink-0 cursor-col-resize touch-none select-none items-center justify-center rounded-full border border-sky-400/90 bg-sky-500 shadow-md transition-[transform,background-color,border-color] hover:border-sky-300 hover:bg-sky-600 active:scale-95"
                  onPointerDown={onAsideResizePointerDown}
                  onPointerMove={onAsideResizePointerMove}
                  onPointerUp={onAsideResizePointerUp}
                  onPointerCancel={onAsideResizePointerUp}
                >
                  <GripVertical className="size-3.5 text-white/95" strokeWidth={2} aria-hidden />
                </div>
                <button
                  type="button"
                  onClick={() => void handleDownloadPdf()}
                  disabled={pdfBusy}
                  className="flex shrink-0 items-center gap-1.5 rounded-xl border border-white/20 bg-[#4f566b] px-3 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:border-white/30 hover:bg-[#5c647a] disabled:cursor-not-allowed disabled:opacity-50"
                  title="Stáhnout zadání i s aktuálním rýsováním jako PDF"
                >
                  <Download className="size-4 shrink-0 opacity-90" aria-hidden />
                  {pdfBusy ? 'PDF…' : 'PDF'}
                </button>
                <button
                  type="button"
                  onClick={() => setAsideCollapsed(true)}
                  className="flex shrink-0 items-center gap-1.5 rounded-xl border border-white/20 bg-[#4f566b] px-3.5 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:border-white/30 hover:bg-[#5c647a]"
                  title="Skrýt zadání"
                  aria-label="Skrýt panel se zadáním"
                >
                  Skrýt
                  <ChevronRight className="size-4 shrink-0 opacity-90" aria-hidden />
                </button>
              </div>
              <div className="min-w-0 space-y-1 px-4 pb-3 pt-1">
                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#b0b8d4]">Zadání</p>
                {assignment.title?.trim() ? (
                  <h1 className="text-[15px] font-semibold leading-snug tracking-tight text-white">
                    {assignment.title.trim()}
                  </h1>
                ) : (
                  <h1 className="text-[15px] font-semibold leading-snug text-white">Úkol</h1>
                )}
              </div>
            </header>

            <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 py-4">
              {instructionView.kind === 'steps' ? (
                <div className="flex flex-col gap-3">
                  {stepsCount > 1 ? (
                    <div className="rounded-xl border border-white/12 bg-[#4f566b] p-3 shadow-sm">
                      <div className="flex items-center justify-between gap-2">
                        <span className="inline-flex items-center rounded-full bg-[#fbc02d] px-2.5 py-1 text-xs font-semibold tabular-nums text-slate-900">
                          Krok {Math.min(stepIndex + 1, stepsCount)} z {stepsCount}
                        </span>
                        <div className="flex items-center rounded-lg border border-white/15 bg-[#3d4456] p-0.5">
                          <button
                            type="button"
                            onClick={() => setStepIndex(i => Math.max(0, i - 1))}
                            disabled={stepIndex <= 0}
                            className="flex size-8 items-center justify-center rounded-md text-white/85 transition-colors hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-35"
                            aria-label="Předchozí krok"
                            title="Předchozí"
                          >
                            <ChevronLeft className="size-4" aria-hidden />
                          </button>
                          <button
                            type="button"
                            onClick={() => setStepIndex(i => Math.min(stepsCount - 1, i + 1))}
                            disabled={stepIndex >= stepsCount - 1}
                            className="flex size-8 items-center justify-center rounded-md text-white/85 transition-colors hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-35"
                            aria-label="Další krok"
                            title="Další"
                          >
                            <ChevronRight className="size-4" aria-hidden />
                          </button>
                        </div>
                      </div>
                      <div
                        className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/15"
                        role="progressbar"
                        aria-valuemin={1}
                        aria-valuemax={stepsCount}
                        aria-valuenow={Math.min(stepIndex + 1, stepsCount)}
                        aria-label="Postup v zadání"
                      >
                        <div
                          className="h-full rounded-full bg-[#fbc02d] transition-[width] duration-200 ease-out"
                          style={{ width: `${((Math.min(stepIndex + 1, stepsCount)) / stepsCount) * 100}%` }}
                        />
                      </div>
                      {newCanvasPerStep ? (
                        <p className="mt-2 text-xs leading-relaxed text-white/70">
                          Tento krok má vlastní plátno. Rýsování z ostatních kroků zůstane uložené.
                        </p>
                      ) : null}
                    </div>
                  ) : null}

                  {activeStep ? (
                    <article className="rounded-xl border border-slate-200/90 bg-white p-4 shadow-sm">
                      {activeStep.text.trim() ? (
                        <div className="text-[15px] leading-relaxed text-slate-800 whitespace-pre-wrap [font-family:'Fenomen_Sans',system-ui,sans-serif]">
                          {activeStep.text}
                        </div>
                      ) : null}
                      {modelSolution ? (
                        <ModelSolutionPanel
                          className={activeStep.text.trim() ? 'mt-4 space-y-3' : 'space-y-3'}
                          visible={showModelSolution}
                          stepIndex={clampedSolutionStep}
                          stepCount={modelSolutionSteps.length}
                          stepText={activeSolutionStep?.text || modelSolution.explanation}
                          onToggle={toggleModelSolution}
                          onPrev={() => setSolutionStepIndex(i => Math.max(0, i - 1))}
                          onNext={() =>
                            setSolutionStepIndex(i => Math.min(modelSolutionSteps.length - 1, i + 1))
                          }
                        />
                      ) : null}
                      {activeStep.image ? (
                        <div className={activeStep.text.trim() ? 'mt-4 space-y-2' : 'space-y-2'}>
                          <img
                            src={activeStep.image}
                            alt=""
                            className="w-full max-w-full rounded-lg border border-slate-200 object-contain max-h-[min(40vh,18rem)] bg-white"
                          />
                          <div className="flex flex-wrap items-center gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                if (projectionEnabled && projectionSrc === activeStep.image) {
                                  setProjectionEnabled(false);
                                  return;
                                }
                                setProjectionSrc(activeStep.image);
                                setProjectionEnabled(true);
                              }}
                              className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-800 shadow-sm transition-colors hover:bg-slate-50"
                              title={
                                projectionEnabled && projectionSrc === activeStep.image
                                  ? 'Skrýt předlohu z plátna'
                                  : 'Promítnout obrázek na plátno'
                              }
                              aria-pressed={projectionEnabled && projectionSrc === activeStep.image}
                            >
                              <ImageIcon className="size-4 opacity-80" aria-hidden />
                              {projectionEnabled && projectionSrc === activeStep.image ? 'Skrýt předlohu' : 'Promítnout na plátno'}
                            </button>
                            {SHOW_OBJECT_DETECT_UI ? (
                              <button
                                type="button"
                                onClick={() => {
                                  setAutoDetectSrc(activeStep.image);
                                  setAutoDetectRequestId((v) => v + 1);
                                }}
                                className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-800 shadow-sm transition-colors hover:bg-slate-50"
                                title="Detekovat přímky a kružnice z obrázku"
                              >
                                Detekovat objekty
                              </button>
                            ) : null}
                            <div className="h-9 w-px bg-slate-200" aria-hidden />
                            <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm">
                              <span className="text-xs font-medium text-slate-600">Průhlednost</span>
                              <input
                                type="range"
                                min={0.05}
                                max={0.9}
                                step={0.05}
                                value={projectionOpacity}
                                onChange={(e) => setProjectionOpacity(Number(e.currentTarget.value))}
                                className="w-28 text-slate-700"
                                aria-label="Průhlednost předlohy"
                              />
                            </div>
                          </div>
                        </div>
                      ) : null}
                    </article>
                  ) : (
                    <p className="rounded-xl border border-dashed border-slate-300 bg-white px-4 py-6 text-center text-sm text-slate-500">
                      —
                    </p>
                  )}
                </div>
              ) : (
                <article className="rounded-xl border border-slate-200/90 bg-white p-4 shadow-sm">
                  <div className="text-[15px] leading-relaxed text-slate-800 whitespace-pre-wrap [font-family:'Fenomen_Sans',system-ui,sans-serif]">
                    {instructionView.text || '—'}
                  </div>
                  {modelSolution ? (
                    <ModelSolutionPanel
                      className="mt-4 space-y-3"
                      visible={showModelSolution}
                      stepIndex={clampedSolutionStep}
                      stepCount={modelSolutionSteps.length}
                      stepText={activeSolutionStep?.text || modelSolution.explanation}
                      onToggle={toggleModelSolution}
                      onPrev={() => setSolutionStepIndex(i => Math.max(0, i - 1))}
                      onNext={() =>
                        setSolutionStepIndex(i => Math.min(modelSolutionSteps.length - 1, i + 1))
                      }
                    />
                  ) : null}
                  {assignment.instruction_image ? (
                    <div className="mt-4 space-y-2">
                      <img
                        src={assignment.instruction_image}
                        alt="Ilustrace ke zadání"
                        className="w-full max-w-full rounded-lg border border-slate-200 object-contain max-h-[min(40vh,18rem)] bg-white"
                      />
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            if (projectionEnabled && projectionSrc === assignment.instruction_image) {
                              setProjectionEnabled(false);
                              return;
                            }
                            setProjectionSrc(assignment.instruction_image);
                            setProjectionEnabled(true);
                          }}
                          className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-800 shadow-sm transition-colors hover:bg-slate-50"
                          title={
                            projectionEnabled && projectionSrc === assignment.instruction_image
                              ? 'Skrýt předlohu z plátna'
                              : 'Promítnout obrázek na plátno'
                          }
                          aria-pressed={projectionEnabled && projectionSrc === assignment.instruction_image}
                        >
                          <ImageIcon className="size-4 opacity-80" aria-hidden />
                          {projectionEnabled && projectionSrc === assignment.instruction_image
                            ? 'Skrýt předlohu'
                            : 'Promítnout na plátno'}
                        </button>
                        {SHOW_OBJECT_DETECT_UI ? (
                          <button
                            type="button"
                            onClick={() => {
                              setAutoDetectSrc(assignment.instruction_image);
                              setAutoDetectRequestId((v) => v + 1);
                            }}
                            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-800 shadow-sm transition-colors hover:bg-slate-50"
                            title="Detekovat přímky a kružnice z obrázku"
                          >
                            Detekovat objekty
                          </button>
                        ) : null}
                        <div className="h-9 w-px bg-slate-200" aria-hidden />
                        <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm">
                          <span className="text-xs font-medium text-slate-600">Průhlednost</span>
                          <input
                            type="range"
                            min={0.05}
                            max={0.9}
                            step={0.05}
                            value={projectionOpacity}
                            onChange={(e) => setProjectionOpacity(Number(e.currentTarget.value))}
                            className="w-28 text-slate-700"
                            aria-label="Průhlednost předlohy"
                          />
                        </div>
                      </div>
                    </div>
                  ) : null}
                </article>
              )}

              <section className="space-y-2 rounded-xl border border-dashed border-white/20 bg-[#4f566b] p-3 shadow-sm">
                <Label htmlFor="student-teacher-note" className="text-xs font-medium text-[#c8cedf]">
                  Poznámka pro učitele{' '}
                  <span className="font-normal text-[#9ca3bc]">(volitelné)</span>
                </Label>
                <textarea
                  id="student-teacher-note"
                  value={studentNote}
                  onChange={e => {
                    const v = e.target.value;
                    setStudentNote(v);
                    if (assignmentId) sessionStorage.setItem(noteStorageKey(assignmentId), v);
                  }}
                  placeholder="Např. co bylo nejasné, co jsi zkoušel(a)…"
                  rows={3}
                  className="w-full resize-y rounded-lg border border-white/15 bg-[#3d4456] px-3 py-2 text-sm text-white outline-none transition-shadow placeholder:text-[#9ca3bc] focus-visible:border-[#fbc02d]/50 focus-visible:ring-2 focus-visible:ring-[#fbc02d]/25"
                />
              </section>

              <section className="space-y-1.5 rounded-lg border border-white/10 bg-[#4f566b] px-3 py-2">
                <Label htmlFor="student-name-inline" className="text-xs font-medium text-[#c8cedf]">
                  Tvé jméno{' '}
                  <span className="font-normal text-[#9ca3bc]">(pro učitele)</span>
                </Label>
                <Input
                  id="student-name-inline"
                  type="text"
                  autoComplete="name"
                  value={studentName}
                  onChange={e => {
                    const v = e.target.value;
                    setStudentName(v);
                    if (assignmentId) {
                      const t = v.trim();
                      if (t) sessionStorage.setItem(nameStorageKey(assignmentId), t);
                      else sessionStorage.removeItem(nameStorageKey(assignmentId));
                    }
                  }}
                  className="h-9 w-full rounded-lg border border-white/15 bg-[#3d4456] px-3 py-2 text-sm text-white outline-none transition-shadow focus-visible:border-[#fbc02d]/50 focus-visible:ring-2 focus-visible:ring-[#fbc02d]/25"
                />
              </section>
            </div>

            <footer className="shrink-0 border-t border-[#4a5163] bg-[#4a5163] p-4">
              <button
                type="button"
                onClick={handleSubmit}
                disabled={submitBusy}
                className="w-full rounded-xl bg-[#fbc02d] px-4 py-3 text-sm font-semibold text-slate-900 shadow-sm transition-colors hover:bg-[#f9a825] active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {submitBusy ? 'Odevzdávám…' : 'Odevzdat cvičení'}
              </button>
            </footer>
            </div>
          </aside>
      ) : null}

      <Dialog open={submitNameOpen} onOpenChange={setSubmitNameOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Odevzdat cvičení</DialogTitle>
            <DialogDescription>
              Napiš své jméno – učitel ho uvidí u odevzdání. Rýsování se odešle tak, jak ho máš teď na plátně.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-1">
            <Label htmlFor="submit-student-name">Jméno</Label>
            <Input
              id="submit-student-name"
              value={gateName}
              onChange={e => setGateName(e.target.value)}
              placeholder="Jan Novák"
              autoComplete="name"
              autoFocus
              onKeyDown={e => e.key === 'Enter' && confirmNameAndSubmit()}
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setSubmitNameOpen(false)}>
              Zrušit
            </Button>
            <Button type="button" onClick={confirmNameAndSubmit} disabled={submitBusy}>
              Odevzdat
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {resultUrl !== null && (
        <ShareModal
          url={resultUrl}
          onClose={() => setResultUrl(null)}
          title="Odkaz pro učitele"
          description="Zkopíruj tento odkaz a pošli ho učiteli – uvidí tvé odevzdané rýsování."
        />
      )}
      </div>
    </StudentAssignmentErrorBoundary>
  );
}
