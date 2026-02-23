import { BrowserRouter, Navigate, Routes, Route, useParams } from 'react-router-dom';
import { Crossroads } from './components/landing/Crossroads';
import { Landing } from './components/landing/Landing';
import { CviceniPage } from './components/landing/CviceniPage';
import { CviceniSetupPage } from './components/landing/CviceniSetupPage';
import { ObjectPage } from './components/viewer/ObjectPage';
import { ObjectExercisePage } from './components/viewer/ObjectExercisePage';
import { FlatObjectPage } from './components/viewer/FlatObjectPage';
import { RysovaniPage } from './components/rysovani/RysovaniPage';
import { TutorialPage } from './components/tutorial/TutorialPage';
import { getObjectDef } from './data/objects';
import { AuthGate } from './components/auth/AuthGate';

/** Wrapper that routes to 3D or 2D page */
function SmartObjectPage() {
  const { objectId } = useParams<{ objectId: string }>();
  const def = getObjectDef(objectId || '');
  if (def?.is2D) return <FlatObjectPage />;
  return <ObjectPage />;
}

export default function App() {
  const routerBase = import.meta.env.BASE_URL.replace(/\/$/, '');

  return (
    <AuthGate>
      <BrowserRouter basename={routerBase}>
        <Routes>
          <Route path="/" element={<Crossroads />} />
          <Route path="/menu-rysovani" element={<Landing mode="rysovani-app" />} />
          <Route path="/menu-telesa" element={<Landing mode="telesa-app" />} />
          <Route path="/rysovani-app" element={<Navigate to="/menu-rysovani" replace />} />
          <Route path="/telesa-app" element={<Navigate to="/menu-telesa" replace />} />
          <Route path="/rysovani" element={<RysovaniPage />} />
          <Route path="/tutorial/:tutorialId" element={<TutorialPage />} />
          <Route path="/cviceni" element={<CviceniPage />} />
          <Route path="/cviceni/:objectId/:taskType" element={<CviceniSetupPage />} />
          <Route path="/:objectId/cviceni/:taskType" element={<ObjectExercisePage />} />
          <Route path="/:objectId" element={<SmartObjectPage />} />
        </Routes>
      </BrowserRouter>
    </AuthGate>
  );
}
