import { ArrowLeft, ArrowRight, RotateCw, Sun, Moon, ZoomIn, ZoomOut } from 'lucide-react';
import { Slider } from './ui/slider';

interface ControlPanelProps {
  currentStep: number;
  totalSteps: number;
  showCaptions: boolean;
  darkMode: boolean;
  scale: number;
  onStepChange: (step: number) => void;
  onRestart: () => void;
  onToggleCaptions: () => void;
  onToggleDarkMode: () => void;
  onZoomChange: (scale: number) => void;
}

export function ConstructionControlPanel({
  currentStep,
  totalSteps,
  showCaptions,
  darkMode,
  scale,
  onStepChange,
  onRestart,
  onToggleCaptions,
  onToggleDarkMode,
  onZoomChange,
}: ControlPanelProps) {
  const changeStep = (newStep: number) => {
    if (newStep >= 0 && newStep < totalSteps) {
      onStepChange(newStep);
    }
  };

  return (
    <div className={`absolute bottom-8 left-1/2 -translate-x-1/2 z-10 flex items-center gap-3 px-6 py-4 rounded-2xl shadow-2xl ${
      darkMode ? 'bg-gray-900 border border-gray-800' : 'bg-white'
    }`} style={{ fontFamily: "var(--font-family, 'Fenomen Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif)" }}>
      {/* Reset */}
      <button
        onClick={onRestart}
        className={`p-3 rounded-full transition-all ${
          darkMode ? 'hover:bg-gray-800' : 'hover:bg-gray-100'
        }`}
        title="Od začátku"
      >
        <RotateCw className="size-6" />
      </button>

      {/* Zpět */}
      <button
        onClick={() => changeStep(currentStep - 1)}
        disabled={currentStep === 0}
        className={`px-5 py-2.5 rounded-xl font-bold transition-all ${
          currentStep === 0
            ? darkMode ? 'bg-gray-800 text-gray-600 cursor-not-allowed' : 'bg-gray-200 text-gray-400 cursor-not-allowed'
            : 'bg-blue-500 hover:bg-blue-400 text-white'
        }`}
      >
        <ArrowLeft className="size-5 inline mr-2" />
        Zpět
      </button>

      {/* Další */}
      <button
        onClick={() => changeStep(currentStep + 1)}
        disabled={currentStep >= totalSteps - 1}
        className={`px-5 py-2.5 rounded-xl font-bold transition-all ${
          currentStep >= totalSteps - 1
            ? darkMode ? 'bg-gray-800 text-gray-600 cursor-not-allowed' : 'bg-gray-200 text-gray-400 cursor-not-allowed'
            : 'bg-blue-600 hover:bg-blue-500 text-white'
        }`}
      >
        Další
        <ArrowRight className="size-5 inline ml-2" />
      </button>

      {/* Separator */}
      <div className={`w-px h-8 ${darkMode ? 'bg-gray-700' : 'bg-gray-300'}`} />

      {/* Zoom */}
      <button
        onClick={() => onZoomChange(Math.max(0.2, scale - 0.05))}
        className={`p-1.5 rounded-lg transition-colors ${
          darkMode ? 'hover:bg-gray-800 text-[#c0caf5]' : 'hover:bg-gray-100 text-gray-600'
        }`}
        title="Oddálit"
      >
        <ZoomOut className="size-5" />
      </button>

      <div className="w-24 px-1">
        <Slider
          value={[scale * 100]}
          onValueChange={(vals) => onZoomChange(vals[0] / 100)}
          min={20}
          max={60}
          step={1}
        />
      </div>

      <button
        onClick={() => onZoomChange(Math.min(0.6, scale + 0.05))}
        className={`p-1.5 rounded-lg transition-colors ${
          darkMode ? 'hover:bg-gray-800 text-[#c0caf5]' : 'hover:bg-gray-100 text-gray-600'
        }`}
        title="Přiblížit"
      >
        <ZoomIn className="size-5" />
      </button>

      {/* Separator */}
      <div className={`w-px h-8 ${darkMode ? 'bg-gray-700' : 'bg-gray-300'}`} />

      {/* Dark mode */}
      <button
        onClick={onToggleDarkMode}
        className={`p-3 rounded-full transition-all ${
          darkMode ? 'hover:bg-gray-800' : 'hover:bg-gray-100'
        }`}
        title={darkMode ? 'Světlý režim' : 'Tmavý režim'}
      >
        {darkMode ? <Sun className="size-6" /> : <Moon className="size-6" />}
      </button>
    </div>
  );
}
