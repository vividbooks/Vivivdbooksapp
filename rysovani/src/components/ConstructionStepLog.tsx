import { FileText, X, Copy, Check } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';

export interface StepNotation {
  notation: string;
  description: string;
  type: 'point' | 'segment' | 'line' | 'circle' | 'perpendicular' | 'angle';
}

interface ConstructionStepLogProps {
  steps: StepNotation[];
  currentStep: number;
  constructionTitle: string;
  darkMode: boolean;
  visible: boolean;
  onClose: () => void;
}

const TYPE_COLORS: Record<StepNotation['type'], string> = {
  point: '#3b82f6',
  segment: '#10b981',
  line: '#8b5cf6',
  circle: '#f43f5e',
  perpendicular: '#06b6d4',
  angle: '#f97316',
};

const TYPE_SYMBOLS: Record<StepNotation['type'], string> = {
  point: '•',
  segment: '—',
  line: '↔',
  circle: '○',
  perpendicular: '⊥',
  angle: '∠',
};

export function ConstructionStepLog({
  steps,
  currentStep,
  constructionTitle,
  darkMode,
  visible,
  onClose,
}: ConstructionStepLogProps) {
  const [copied, setCopied] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to current step
  useEffect(() => {
    if (scrollRef.current && visible) {
      const stepEl = scrollRef.current.querySelector(`[data-step="${currentStep}"]`);
      if (stepEl) {
        stepEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    }
  }, [currentStep, visible]);

  const handleCopy = () => {
    const text = steps
      .map((s, i) => `${i + 1}. ${s.notation}`)
      .join('\n');
    const fullText = `${constructionTitle}\n\n${text}`;
    navigator.clipboard.writeText(fullText).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const stepsLabel = steps.length === 1 ? 'krok' : steps.length < 5 ? 'kroky' : 'kroků';

  return (
    <div
      className={`absolute top-0 right-0 h-full z-30 transition-transform duration-300 ease-out ${
        visible ? 'translate-x-0' : 'translate-x-full'
      }`}
      style={{ width: 560 }}
    >
      <div className={`h-full flex flex-col shadow-[-4px_0_24px_rgba(0,0,0,0.12)] ${
        darkMode
          ? 'bg-[#1a1b26] border-l border-[#2a2b3d]'
          : 'bg-white border-l border-gray-200'
      }`} style={{ fontFamily: "var(--font-family, 'Fenomen Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif)" }}>
        {/* Header */}
        <div className={`flex items-center justify-between px-6 py-5 border-b ${
          darkMode ? 'border-[#2a2b3d]' : 'border-gray-100'
        }`}>
          <div className="flex items-center gap-3">
            <div className={`flex items-center justify-center w-14 h-14 rounded-xl ${
              darkMode ? 'bg-[#24283b]' : 'bg-gray-100'
            }`}>
              <FileText className={`w-7 h-7 ${darkMode ? 'text-[#7aa2f7]' : 'text-gray-600'}`} />
            </div>
            <div>
              <h3 className={`text-2xl font-semibold ${darkMode ? 'text-[#c0caf5]' : 'text-gray-900'}`}>
                Zápis konstrukce
              </h3>
              <p className={`text-base ${darkMode ? 'text-[#565f89]' : 'text-gray-400'}`}>
                {steps.length} {stepsLabel}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1">
            <button
              onClick={handleCopy}
              className={`p-3 rounded-lg transition-all ${
                darkMode
                  ? 'hover:bg-[#24283b] text-[#565f89] hover:text-[#c0caf5]'
                  : 'hover:bg-gray-100 text-gray-400 hover:text-gray-600'
              }`}
              title="Kopírovat zápis"
            >
              {copied ? <Check className="w-7 h-7 text-emerald-500" /> : <Copy className="w-7 h-7" />}
            </button>
            <button
              onClick={onClose}
              className={`p-3 rounded-lg transition-all ${
                darkMode
                  ? 'hover:bg-[#24283b] text-[#565f89] hover:text-[#c0caf5]'
                  : 'hover:bg-gray-100 text-gray-400 hover:text-gray-600'
              }`}
              title="Zavřít"
            >
              <X className="w-7 h-7" />
            </button>
          </div>
        </div>

        {/* Title bar */}
        <div className={`px-6 py-4 border-b ${
          darkMode ? 'border-[#2a2b3d] bg-[#24283b]/50' : 'border-gray-50 bg-gray-50/50'
        }`}>
          <p className={`text-xl font-medium ${darkMode ? 'text-[#7aa2f7]' : 'text-indigo-600'}`}>
            {constructionTitle}
          </p>
        </div>

        {/* Steps list */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-5 py-5">
          <div className="space-y-2">
            {steps.map((step, idx) => {
              const isCurrent = idx === currentStep;
              const isPast = idx < currentStep;
              const typeColor = TYPE_COLORS[step.type];
              const typeSymbol = TYPE_SYMBOLS[step.type];

              return (
                <div
                  key={idx}
                  data-step={idx}
                  className={`flex items-start gap-3.5 px-5 py-4 rounded-xl transition-all duration-200 ${
                    isCurrent
                      ? (darkMode ? 'bg-[#24283b]' : 'bg-blue-50/80')
                      : isPast
                        ? ''
                        : (darkMode ? 'opacity-40' : 'opacity-40')
                  }`}
                >
                  {/* Step number */}
                  <span className={`text-2xl min-w-[38px] text-right pt-0.5 tabular-nums font-medium ${
                    isCurrent
                      ? (darkMode ? 'text-[#7aa2f7]' : 'text-blue-600')
                      : (darkMode ? 'text-[#565f89]' : 'text-gray-400')
                  }`}>
                    {idx + 1}.
                  </span>

                  {/* Type symbol */}
                  <span
                    className="pt-1 shrink-0 text-3xl font-bold"
                    style={{ color: typeColor, minWidth: 36, textAlign: 'center' }}
                  >
                    {typeSymbol}
                  </span>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className={`text-2xl leading-relaxed font-medium ${
                      isCurrent
                        ? (darkMode ? 'text-[#c0caf5]' : 'text-gray-900')
                        : isPast
                          ? (darkMode ? 'text-[#a9b1d6]' : 'text-gray-700')
                          : (darkMode ? 'text-[#565f89]' : 'text-gray-400')
                    }`}
                    style={{ fontFamily: '"Times New Roman", "Computer Modern", Georgia, serif', fontStyle: 'italic' }}
                    >
                      {step.notation}
                    </div>
                    <p className={`text-lg mt-1.5 ${
                      darkMode ? 'text-[#565f89]' : 'text-gray-400'
                    }`}>
                      {step.description}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Footer legend */}
        <div className={`px-6 py-4 border-t ${
          darkMode
            ? 'border-[#2a2b3d] text-[#565f89]'
            : 'border-gray-100 text-gray-400'
        }`}>
          <div className="flex items-center gap-4 text-base flex-wrap">
            <span className="flex items-center gap-1.5">
              <span style={{ color: TYPE_COLORS.point }}>•</span> body
            </span>
            <span className="opacity-40">|</span>
            <span className="flex items-center gap-1.5">
              <span style={{ color: TYPE_COLORS.segment }}>—</span> úsečky
            </span>
            <span className="opacity-40">|</span>
            <span className="flex items-center gap-1.5">
              <span style={{ color: TYPE_COLORS.circle }}>○</span> kružnice
            </span>
            <span className="opacity-40">|</span>
            <span className="flex items-center gap-1.5">
              <span style={{ color: TYPE_COLORS.line }}>↔</span> přímky
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
