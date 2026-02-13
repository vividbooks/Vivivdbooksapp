import { ChevronUp, ChevronDown } from 'lucide-react';
import { useState, useEffect } from 'react';

interface BigNumberInputProps {
  value: number | null;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  unit: 'cm' | '°';
  darkMode?: boolean;
  label?: string;
}

export function BigNumberInput({
  value,
  onChange,
  min = 0,
  max = 999,
  step = 1,
  unit,
  darkMode = false,
  label
}: BigNumberInputProps) {
  const [digits, setDigits] = useState<string[]>([]);
  
  // Určit počet číslic podle jednotky: cm = 2, ° = 3
  const totalDigits = unit === 'cm' ? 2 : 3;
  
  // Inicializovat cifry z hodnoty
  useEffect(() => {
    if (value !== null && value >= 0) {
      const valueStr = Math.round(value).toString();
      const digitArray = valueStr.padStart(totalDigits, '0').split('');
      setDigits(digitArray);
    } else {
      // Výchozí hodnota - začneme s minimem
      const defaultValue = Math.ceil(min).toString();
      const digitArray = defaultValue.padStart(totalDigits, '0').split('');
      setDigits(digitArray);
      // Nastavit min hodnotu při inicializaci
      if (value === null) {
        onChange(Math.ceil(min));
      }
    }
  }, [value, min, totalDigits]);
  
  const getCurrentValue = (): number => {
    if (digits.length === 0) return min;
    const digitStr = digits.join('');
    return parseInt(digitStr) || 0;
  };
  
  const updateValue = (newValue: number) => {
    const clampedValue = Math.max(min, Math.min(max, newValue));
    onChange(Math.round(clampedValue));
  };
  
  const incrementDigit = (index: number) => {
    const currentValue = getCurrentValue();
    const position = digits.length - index - 1;
    const digitValue = Math.pow(10, position);
    
    updateValue(currentValue + digitValue);
  };
  
  const decrementDigit = (index: number) => {
    const currentValue = getCurrentValue();
    const position = digits.length - index - 1;
    const digitValue = Math.pow(10, position);
    
    updateValue(currentValue - digitValue);
  };
  
  const handleDigitChange = (index: number, newDigit: string) => {
    if (!/^\d$/.test(newDigit)) return;
    
    const newDigits = [...digits];
    newDigits[index] = newDigit;
    setDigits(newDigits);
    
    const digitStr = newDigits.join('');
    const newValue = parseInt(digitStr) || 0;
    updateValue(newValue);
  };
  
  return (
    <div className="flex flex-col items-center gap-6">
      {label && (
        <h3 className={`text-center ${darkMode ? 'text-gray-100' : 'text-gray-900'}`}>
          {label}
        </h3>
      )}
      
      <div className="flex items-center gap-6">
        {/* Velké znaménko jednotky */}
        <div className={`text-[120px] leading-none select-none ${
          darkMode ? 'text-gray-400' : 'text-gray-500'
        }`}>
          {unit}
        </div>
        
        {/* Číslice */}
        <div className="flex items-center gap-3">
          {digits.map((digit, index) => (
            <div key={index} className="flex flex-col items-center gap-2">
              {/* Šipka nahoru */}
              <button
                onClick={() => incrementDigit(index)}
                className={`w-16 h-16 flex items-center justify-center rounded-xl transition-all ${
                  darkMode
                    ? 'bg-gray-600 hover:bg-gray-500 active:bg-gray-400'
                    : 'bg-gray-200 hover:bg-gray-300 active:bg-gray-400'
                }`}
                aria-label="Zvýšit"
              >
                <ChevronUp className={`size-10 ${darkMode ? 'text-gray-100' : 'text-gray-700'}`} />
              </button>
              
              {/* Číslice */}
              <input
                type="text"
                inputMode="numeric"
                value={digit}
                onChange={(e) => handleDigitChange(index, e.target.value.slice(-1))}
                className={`w-24 h-32 text-center leading-none rounded-2xl border-4 transition-all ${
                  darkMode
                    ? 'bg-gray-700 border-gray-500 text-blue-400 focus:border-blue-400'
                    : 'bg-white border-gray-300 text-blue-600 focus:border-blue-500'
                } focus:outline-none`}
                style={{ fontSize: '100px' }}
                maxLength={1}
              />
              
              {/* Šipka dolů */}
              <button
                onClick={() => decrementDigit(index)}
                className={`w-16 h-16 flex items-center justify-center rounded-xl transition-all ${
                  darkMode
                    ? 'bg-gray-600 hover:bg-gray-500 active:bg-gray-400'
                    : 'bg-gray-200 hover:bg-gray-300 active:bg-gray-400'
                }`}
                aria-label="Snížit"
              >
                <ChevronDown className={`size-10 ${darkMode ? 'text-gray-100' : 'text-gray-700'}`} />
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
