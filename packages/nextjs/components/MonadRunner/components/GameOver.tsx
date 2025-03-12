// monad-app/packages/nextjs/components/MonadRunner/components/GameOver.tsx
import React from "react";

interface GameOverProps {
  finalScore: number;
  onRestart: () => void;
}

const GameOver: React.FC<GameOverProps> = ({ finalScore, onRestart }) => {
  return (
    <div className="fixed inset-0 flex items-center justify-center z-50 bg-black/70">
      <div className="glass p-8 rounded-2xl text-center shadow-xl max-w-sm">
        <h2 className="text-4xl font-extrabold mb-4 text-transparent bg-clip-text bg-gradient-to-r from-secondary to-accent">
          Game Over
        </h2>
        <p className="text-xl mb-6">
          Your final score is:{" "}
          <span className="font-mono font-bold text-base-content">{finalScore}</span>
        </p>
        <button onClick={onRestart} className="btn btn-primary shadow-neon">
          Return to Main Menu
        </button>
      </div>
    </div>
  );
};

export default GameOver;
