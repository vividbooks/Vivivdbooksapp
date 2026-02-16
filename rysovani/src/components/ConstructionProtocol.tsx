import React, { useRef, useEffect, useState, useMemo } from 'react';
import { X, FileText, Trash2, Copy, Check } from 'lucide-react';
import katex from 'katex';

// --- TYPY ---

export interface ConstructionStep {
  id: string;
  stepNumber: number;
  type: 'point' | 'segment' | 'line' | 'ray' | 'circle' | 'perpendicular' | 'angle' | 'freehand';
  notation: string;
  latex: string;
  description: string;
  objectIds: string[];
}

// --- Czech strings ---
const CZ = {
  title: "Z\u00e1pis konstrukce",
  step1: "krok",
  step24: "kroky",
  step5: "krok\u016f",
  copyText: "Kop\u00edrovat jako text",
  copyLatex: "Kop\u00edrovat jako LaTeX",
  clear: "Vymazat z\u00e1pis",
  close: "Zav\u0159\u00edt",
  empty: "Zat\u00edm \u017e\u00e1dn\u00e9 kroky",
  emptyHint: "Za\u010dn\u011bte r\u00fdsovat a kroky se automaticky zap\u00ed\u0161\u00ed.",
  lines: "p\u0159\u00edmky",
  circles: "kru\u017enice",
};

// --- KaTeX CSS loader ---
function useKatexCSS() {
  useEffect(() => {
    const id = 'katex-css-link';
    if (!document.getElementById(id)) {
      const link = document.createElement('link');
      link.id = id;
      link.rel = 'stylesheet';
      link.href = 'https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.css';
      link.crossOrigin = 'anonymous';
      document.head.appendChild(link);
    }
  }, []);
}

// --- Inline LaTeX renderer ---
export function Latex({ math, className }: { math: string; className?: string }) {
  const html = useMemo(() => {
    try {
      return katex.renderToString(math, {
        throwOnError: false,
        displayMode: false,
        strict: false,
        trust: true,
      });
    } catch {
      return null;
    }
  }, [math]);

  if (!html) {
    return <span className={className}>{math}</span>;
  }

  return (
    <span
      className={className}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

interface GeoPointLike {
  id: string;
  x: number;
  y: number;
  label: string;
}

interface GeoShapeLike {
  id: string;
  type: 'segment' | 'line' | 'ray' | 'circle';
  label: string;
  definition: { p1Id: string; p2Id?: string };
}

interface ConstructionProtocolProps {
  steps: ConstructionStep[];
  visible: boolean;
  onClose: () => void;
  onClear: () => void;
  darkMode: boolean;
  tabletMode?: boolean;
  points?: GeoPointLike[];
  shapes?: GeoShapeLike[];
  pixelsPerCm?: number;
}

export function ConstructionProtocol({ steps, visible, onClose, onClear, darkMode, tabletMode = false, points = [], shapes = [], pixelsPerCm = 50 }: ConstructionProtocolProps) {
  useKatexCSS();

  const scrollRef = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState<'none' | 'text' | 'latex'>('none');
  const t = tabletMode;

  const fmtCm = (px: number): string => {
    const cm = px / pixelsPerCm;
    return cm % 1 === 0 ? cm.toFixed(0) : cm.toFixed(1);
  };

  const liveSteps = useMemo(() => {
    if (points.length === 0 && shapes.length === 0) return steps;
    return steps.map(step => {
      if (step.type === 'segment' || step.type === 'circle') {
        const shape = shapes.find(s => step.objectIds.includes(s.id));
        if (!shape) return step;
        const p1 = points.find(p => p.id === shape.definition.p1Id);
        const p2 = shape.definition.p2Id ? points.find(p => p.id === shape.definition.p2Id) : null;
        if (!p1 || !p2) return step;
        const dist = Math.sqrt((p2.x - p1.x) ** 2 + (p2.y - p1.y) ** 2);
        const d = fmtCm(dist);
        if (step.type === 'segment') {
          const lA = p1.label || '?';
          const lB = p2.label || '?';
          return {
            ...step,
            notation: `${lA}${lB}; |${lA}${lB}| = ${d} cm`,
            latex: `${lA}${lB} \\;;\\; |${lA}${lB}| = ${d} \\text{ cm}`,
            description: `Úsečka ${lA}${lB} o délce ${d} cm`,
          };
        } else {
          const lS = p1.label || '?';
          return {
            ...step,
            notation: `${shape.label}(${lS}; ${d} cm)`,
            latex: `${shape.label}(${lS};\\, ${d} \\text{ cm})`,
            description: `Kružnice ${shape.label} se středem ${lS} a poloměrem ${d} cm`,
          };
        }
      }
      return step;
    });
  }, [steps, points, shapes, pixelsPerCm]);

  useEffect(() => {
    if (scrollRef.current && steps.length > 0) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [steps.length]);

  const stepsLabel = steps.length === 1 ? CZ.step1 : steps.length >= 2 && steps.length <= 4 ? CZ.step24 : CZ.step5;

  const copyToClipboard = (text: string): boolean => {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch {}
    document.body.removeChild(ta);
    return ok;
  };

  const handleCopyPlain = () => {
    if (liveSteps.length === 0) return;
    const text = CZ.title + ":\n" + liveSteps.map(s => `${s.stepNumber}. ${s.notation}`).join('\n');
    if (copyToClipboard(text)) {
      setCopied('text');
      setTimeout(() => setCopied('none'), 2000);
    }
  };

  const handleCopyLatex = () => {
    if (liveSteps.length === 0) return;
    const text = "% " + CZ.title + "\n\\begin{enumerate}\n" +
      liveSteps.map(s => `  \\item $${s.latex}$`).join('\n') +
      "\n\\end{enumerate}";
    if (copyToClipboard(text)) {
      setCopied('latex');
      setTimeout(() => setCopied('none'), 2000);
    }
  };

  const getTypeSymbol = (type: ConstructionStep['type']) => {
    switch (type) {
      case 'point': return '\\bullet';
      case 'segment': return '\\text{\\textemdash}';
      case 'line': return '\\leftrightarrow';
      case 'ray': return '\\rightarrow';
      case 'circle': return '\\circ';
      case 'perpendicular': return '\\perp';
      case 'angle': return '\\angle';
      case 'freehand': return '\\sim';
      default: return '\\cdot';
    }
  };

  const getTypeColor = (type: ConstructionStep['type']) => {
    switch (type) {
      case 'point': return '#3b82f6';
      case 'segment': return '#10b981';
      case 'line': return '#8b5cf6';
      case 'ray': return '#f59e0b';
      case 'circle': return '#f43f5e';
      case 'perpendicular': return '#06b6d4';
      case 'angle': return '#f97316';
      case 'freehand': return '#9ca3af';
      default: return '#6b7280';
    }
  };

  const btnBase = (enabled: boolean) =>
    `${t ? 'p-3.5' : 'p-2'} rounded-lg transition-all ${
      !enabled
        ? 'opacity-30 cursor-not-allowed'
        : darkMode
          ? 'hover:bg-[#24283b] text-[#565f89] hover:text-[#7aa2f7]'
          : 'hover:bg-gray-100 text-gray-400 hover:text-gray-600'
    }`;

  // Icon size classes
  const iconSm = t ? 'w-6 h-6' : 'w-4 h-4';
  const iconHeaderBox = t ? 'w-[46px] h-[46px] rounded-xl' : 'w-8 h-8 rounded-lg';
  const iconHeader = t ? 'w-6 h-6' : 'w-4 h-4';

  return (
    <div
      className={`absolute top-0 right-0 h-full z-30 transition-transform duration-300 ease-out ${
        visible ? 'translate-x-0' : 'translate-x-full'
      } ${t ? 'protocol-tablet' : ''}`}
      style={{ width: t ? 500 : 370 }}
    >
      <div className={`h-full flex flex-col shadow-[-4px_0_24px_rgba(0,0,0,0.12)] ${
        darkMode
          ? 'bg-[#1a1b26] border-l border-[#2a2b3d]'
          : 'bg-white border-l border-gray-200'
      }`}>
        {/* Header */}
        <div className={`flex items-center justify-between ${t ? 'px-5 py-4' : 'px-4 py-3'} border-b ${
          darkMode ? 'border-[#2a2b3d]' : 'border-gray-100'
        }`}>
          <div className={`flex items-center ${t ? 'gap-4' : 'gap-2.5'}`}>
            <div className={`flex items-center justify-center ${iconHeaderBox} ${
              darkMode ? 'bg-[#24283b]' : 'bg-gray-100'
            }`}>
              <FileText className={`${iconHeader} ${darkMode ? 'text-[#7aa2f7]' : 'text-gray-600'}`} />
            </div>
            <div>
              <h3 className={`${t ? 'text-[20px]' : 'text-sm'} ${darkMode ? 'text-[#c0caf5]' : 'text-gray-900'}`}>
                {CZ.title}
              </h3>
              <p className={`${t ? 'text-[15px]' : 'text-[10px]'} ${darkMode ? 'text-[#565f89]' : 'text-gray-400'}`}>
                {steps.length} {stepsLabel}
              </p>
            </div>
          </div>

          <div className={`flex items-center ${t ? 'gap-1' : 'gap-0.5'}`}>
            <button
              onClick={handleCopyPlain}
              disabled={steps.length === 0}
              className={btnBase(steps.length > 0)}
              title={CZ.copyText}
            >
              {copied === 'text'
                ? <Check className={`${iconSm} text-emerald-500`} />
                : <Copy className={iconSm} />
              }
            </button>
            <button
              onClick={handleCopyLatex}
              disabled={steps.length === 0}
              className={`${btnBase(steps.length > 0)} relative`}
              title={CZ.copyLatex}
            >
              {copied === 'latex' ? (
                <Check className={`${iconSm} text-emerald-500`} />
              ) : (
                <span className={t ? 'text-[20px]' : 'text-xs'} style={{ fontFamily: 'serif', fontStyle: 'italic' }}>
                  T<sub className={`${t ? 'text-[12px]' : 'text-[8px]'} relative`} style={{ top: '1px', left: '-1px', fontFamily: 'serif' }}>E</sub>X
                </span>
              )}
            </button>
            <button
              onClick={onClear}
              disabled={steps.length === 0}
              className={`${t ? 'p-3.5' : 'p-2'} rounded-lg transition-all ${
                steps.length === 0
                  ? 'opacity-30 cursor-not-allowed'
                  : darkMode
                    ? 'hover:bg-[#24283b] text-[#565f89] hover:text-red-400'
                    : 'hover:bg-gray-100 text-gray-400 hover:text-red-500'
              }`}
              title={CZ.clear}
            >
              <Trash2 className={iconSm} />
            </button>
            <button
              onClick={onClose}
              className={`${t ? 'p-3.5' : 'p-2'} rounded-lg transition-all ${
                darkMode
                  ? 'hover:bg-[#24283b] text-[#565f89] hover:text-[#c0caf5]'
                  : 'hover:bg-gray-100 text-gray-400 hover:text-gray-600'
              }`}
              title={CZ.close}
            >
              <X className={iconSm} />
            </button>
          </div>
        </div>

        {/* Steps list */}
        <div
          ref={scrollRef}
          className={`flex-1 overflow-y-auto ${t ? 'px-5 py-5' : 'px-3 py-3'}`}
        >
          {liveSteps.length === 0 ? (
            <div className={`flex flex-col items-center justify-center h-full text-center px-6 ${
              darkMode ? 'text-[#565f89]' : 'text-gray-400'
            }`}>
              <FileText className={`${t ? 'w-14 h-14' : 'w-10 h-10'} mb-3 opacity-40`} />
              <p className={`${t ? 'text-[20px]' : 'text-sm'} mb-1`}>{CZ.empty}</p>
              <p className={`${t ? 'text-[17px]' : 'text-xs'} opacity-70`}>{CZ.emptyHint}</p>
            </div>
          ) : (
            <div className={t ? 'space-y-2' : 'space-y-1'}>
              {liveSteps.map((step, idx) => (
                <div
                  key={step.id}
                  className={`group flex items-start ${t ? 'gap-3 px-4 py-4' : 'gap-2 px-3 py-2.5'} rounded-xl transition-colors ${
                    darkMode
                      ? 'hover:bg-[#24283b]/60'
                      : 'hover:bg-gray-50'
                  } ${idx === liveSteps.length - 1 ? (darkMode ? 'bg-[#24283b]/40' : 'bg-blue-50/50') : ''}`}
                >
                  <span className={`${t ? 'text-[20px] min-w-[32px]' : 'text-xs min-w-[22px]'} text-right pt-1 tabular-nums ${
                    darkMode ? 'text-[#565f89]' : 'text-gray-400'
                  }`}>
                    {step.stepNumber}.
                  </span>

                  <span className="pt-0.5 flex-shrink-0" style={{ minWidth: t ? 26 : 18 }}>
                    <Latex
                      math={`{\\color{${getTypeColor(step.type)}} ${getTypeSymbol(step.type)}}`}
                    />
                  </span>

                  <div className="flex-1 min-w-0">
                    <div className={`${t ? 'text-[20px]' : 'text-sm'} leading-relaxed ${
                      darkMode ? 'katex-dark' : ''
                    }`}>
                      <Latex
                        math={step.latex || step.notation}
                        className={darkMode ? 'katex-dark' : ''}
                      />
                    </div>
                    <p className={`${t ? 'text-[15px] mt-1.5' : 'text-[10px] mt-1'} ${darkMode ? 'text-[#565f89]' : 'text-gray-400'}`}>
                      {step.description}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        {liveSteps.length > 0 && (
          <div className={`${t ? 'px-6 py-4' : 'px-4 py-2.5'} border-t ${
            darkMode
              ? 'border-[#2a2b3d] text-[#565f89]'
              : 'border-gray-100 text-gray-400'
          }`}>
            <div className={`flex items-center ${t ? 'gap-4 text-[15px]' : 'gap-3 text-[10px]'} flex-wrap`}>
              <span className="flex items-center gap-1">
                <Latex math="A, B" /> {"= body"}
              </span>
              <span className="opacity-40">|</span>
              <span className="flex items-center gap-1">
                <Latex math="p, q" /> {"= " + CZ.lines}
              </span>
              <span className="opacity-40">|</span>
              <span className="flex items-center gap-1">
                <Latex math={"k(S;\\, r)"} /> {"= " + CZ.circles}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* KaTeX dark mode override + tablet scaling */}
      <style>{`
        .katex-dark .katex,
        .katex-dark .katex .katex-mathml,
        .katex-dark .katex .katex-html {
          color: #c0caf5;
        }
        .katex-dark .katex .mord,
        .katex-dark .katex .mbin,
        .katex-dark .katex .mrel,
        .katex-dark .katex .mopen,
        .katex-dark .katex .mclose,
        .katex-dark .katex .mpunct,
        .katex-dark .katex .minner {
          color: #c0caf5;
        }
        .katex { font-size: 1em !important; }
        .protocol-tablet .katex { font-size: 1.45em !important; }
      `}</style>
    </div>
  );
}