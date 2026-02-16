// Helper for handling tool menu clicks
export const handleToolMenuClick = (
  toolId: string,
  setCircleInput: (fn: (prev: any) => any) => void,
  setActiveTool: (tool: any) => void,
  setSelectedPointId: (id: string | null) => void,
  setActiveGroup: (id: string | null) => void,
  setSegmentInput?: (fn: (prev: any) => any) => void,
  setPerpTabletState?: (fn: (prev: any) => any) => void,
  isTabletMode?: boolean,
  setCircleTabletState?: (state: any) => void
) => {
  if (toolId.startsWith('__popup__')) {
    // Special popup triggers
    if (toolId === '__popup__circle_fixed') {
      setCircleInput(prev => ({ ...prev, visible: true, center: null, isDraggingCenter: false, isDraggingHandle: false }));
    } else if (toolId === '__popup__segment_fixed') {
      if (setSegmentInput) {
        setSegmentInput(prev => ({ ...prev, visible: true }));
      }
    }
  } else {
    setActiveTool(toolId);
    
    // Reset perpTabletState when switching tools
    if (setPerpTabletState) {
      setPerpTabletState({ step: 'idle', selectedLineId: null, currentPos: null });
    }
    
    // Reset circleTabletState when switching tools
    if (setCircleTabletState) {
      setCircleTabletState({ active: false, centerId: null, center: null, radius: 150, isDraggingHandle: false, handlePos: null });
    }
    
    // If switching to perpendicular in tablet mode, activate selectLine step
    if (toolId === 'perpendicular' && isTabletMode) {
      if (setPerpTabletState) {
        setPerpTabletState({ step: 'selectLine', selectedLineId: null, currentPos: null });
      }
    }
  }
  setSelectedPointId(null);
  setActiveGroup(null);
};