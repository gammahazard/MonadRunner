import React from 'react';

interface MobileControlsProps {
  onLeftPressed: () => void;
  onRightPressed: () => void;
  onJumpPressed: () => void;
  onLeftReleased: () => void;
  onRightReleased: () => void;
}

const MobileControls: React.FC<MobileControlsProps> = ({
  onLeftPressed,
  onRightPressed,
  onJumpPressed,
  onLeftReleased,
  onRightReleased
}) => {
  return (
    <div className="absolute bottom-0 left-0 right-0 flex justify-between p-4 z-10">
      <div className="flex space-x-4">
        <button 
          onTouchStart={(e) => { e.preventDefault(); onLeftPressed(); }}
          onTouchEnd={(e) => { e.preventDefault(); onLeftReleased(); }}
          onMouseDown={(e) => { e.preventDefault(); onLeftPressed(); }}
          onMouseUp={(e) => { e.preventDefault(); onLeftReleased(); }}
          className="btn btn-circle btn-secondary btn-sm touch-manipulation"
        >
          ←
        </button>
        <button 
          onTouchStart={(e) => { e.preventDefault(); onRightPressed(); }}
          onTouchEnd={(e) => { e.preventDefault(); onRightReleased(); }}
          onMouseDown={(e) => { e.preventDefault(); onRightPressed(); }}
          onMouseUp={(e) => { e.preventDefault(); onRightReleased(); }}
          className="btn btn-circle btn-secondary btn-sm touch-manipulation"
        >
          →
        </button>
      </div>
      <button 
        onTouchStart={(e) => { e.preventDefault(); onJumpPressed(); }}
        onMouseDown={(e) => { e.preventDefault(); onJumpPressed(); }}
        className="btn btn-circle btn-primary btn-sm touch-manipulation"
      >
        ↑
      </button>
    </div>
  );
};

export default MobileControls;