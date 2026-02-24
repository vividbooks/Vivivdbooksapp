import React from 'react';
import { Calculator } from 'lucide-react';
import { ExerciseTile } from './ExerciseTile';
import { objects } from '../../data/objects';
import type { TaskType } from '../viewer/ObjectQuizPanel';

const TASK_TYPES_3D: TaskType[] = ['objem', 'povrch'];
const TASK_TYPES_2D: TaskType[] = ['obvod', 'obsah'];

export function CviceniPage() {
  const exercises = objects.flatMap((obj) => {
    const taskTypes = obj.is2D ? TASK_TYPES_2D : TASK_TYPES_3D;
    return taskTypes.map((taskType) => ({ object: obj, taskType }));
  });

  return (
    <div style={{ backgroundColor: '#ffffff', minHeight: '100vh', paddingBottom: 80 }}>
      <div style={{ maxWidth: 1280, margin: '0 auto', padding: '0 16px' }}>
        <div className="flex items-center gap-3 mb-2" style={{ paddingTop: 32 }}>
          <div
            className="w-12 h-12 rounded-xl flex items-center justify-center"
            style={{ background: 'linear-gradient(135deg, #fef3c7 0%, #fde047 100%)' }}
          >
            <Calculator className="h-6 w-6 text-amber-700" />
          </div>
          <div>
            <h1 style={{ fontSize: 28, fontWeight: 600, color: '#0f172a', margin: 0 }}>
              Cvičení
            </h1>
            <p style={{ fontSize: 14, color: '#64748b', margin: '4px 0 0' }}>
              Objem a povrch těles — vyberte úlohu
            </p>
          </div>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
            gap: 24,
            marginTop: 32,
          }}
        >
          {exercises.map(({ object, taskType }) => (
            <ExerciseTile key={`${object.id}-${taskType}`} object={object} taskType={taskType} />
          ))}
        </div>
      </div>
    </div>
  );
}
