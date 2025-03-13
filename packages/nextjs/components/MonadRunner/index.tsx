// monad-app/packages/nextjs/components/MonadRunner/index.tsx
"use client";

import React, { useEffect, useRef, useState } from "react";
import * as ex from "excalibur";
import { GameScene } from "./GameScene";
import GameOver from "./components/GameOver";
import { ReplayEvent } from "./ReplayComponent";

interface MonadRunnerProps {
  walletAddress: string;
  username?: string;
  onGameEnd: (score: number, replayData: ReplayEvent[]) => void;
  onClose: () => void;
}

const MonadRunner: React.FC<MonadRunnerProps> = ({
  walletAddress,
  username = "Player",
  onGameEnd,
  onClose,
}) => {
  const gameCanvasRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<ex.Engine | null>(null);
  const gameSceneRef = useRef<GameScene | null>(null);
  const [gameOver, setGameOver] = useState(false);
  const [score, setScore] = useState(0);
  const [replayData, setReplayData] = useState<ReplayEvent[]>([]);

  // Listen for the "gameover" event and call onGameEnd with final score.
  useEffect(() => {
    const handleGameOver = () => {
      console.log("[MonadRunner] Game over with score:", score);
      setGameOver(true);
      // Pass the replay data along with the score to onGameEnd
      onGameEnd(score, replayData);
    };
    window.addEventListener("gameover", handleGameOver);
    return () => {
      window.removeEventListener("gameover", handleGameOver);
    };
  }, [onGameEnd, score, replayData]);

  // Listen for token collection events using functional updates.
  useEffect(() => {
    const handleTokenCollected = (evt: CustomEvent) => {
      setScore((prevScore) => {
        const newScore = prevScore + (evt.detail?.points || 0);
        console.log("[MonadRunner] Token collected! New score:", newScore);
        return newScore;
      });
    };
    window.addEventListener("tokencollected", handleTokenCollected as EventListener);
    return () => {
      window.removeEventListener("tokencollected", handleTokenCollected as EventListener);
    };
  }, []);

  // Listen for score increment events using functional updates.
  useEffect(() => {
    const handleScoreIncrement = (evt: CustomEvent) => {
      setScore((prevScore) => {
        const newScore = prevScore + (evt.detail?.points || 0);
        console.log("[MonadRunner] Score incremented! New score:", newScore);
        return newScore;
      });
    };
    window.addEventListener("scoreincrement", handleScoreIncrement as EventListener);
    return () => {
      window.removeEventListener("scoreincrement", handleScoreIncrement as EventListener);
    };
  }, []);

  // Listen for replay data event and capture it for on-chain submission
  useEffect(() => {
    const handleReplayData = (evt: CustomEvent) => {
      const replay = evt.detail?.replay;
      if (!replay) {
        console.error("[MonadRunner] No replay data in event:", evt);
        return;
      }
      
      console.log(`[MonadRunner] Replay data received: ${replay.length} events for score ${score}`);
      setReplayData(replay);
    };

    window.addEventListener("replaydata", handleReplayData as EventListener);
    return () => {
      window.removeEventListener("replaydata", handleReplayData as EventListener);
    };
  }, [score]);

  // Set up game engine
  useEffect(() => {
    if (!gameCanvasRef.current) {
      console.error("[MonadRunner] Game canvas ref is null");
      return;
    }
    
    // Clear any previous canvas elements
    while (gameCanvasRef.current.firstChild) {
      gameCanvasRef.current.removeChild(gameCanvasRef.current.firstChild);
    }
    
    // Create new canvas
    const canvasElement = document.createElement("canvas");
    canvasElement.width = 800;
    canvasElement.height = 450;
    canvasElement.style.width = "100%";
    canvasElement.style.height = "100%";
    canvasElement.style.display = "block";
    gameCanvasRef.current.appendChild(canvasElement);

    // Create game engine
    const engine = new ex.Engine({
      width: 800,
      height: 450,
      canvasElement,
      backgroundColor: ex.Color.fromHex("#1a1a2e"),
      physics: { gravity: new ex.Vector(0, 800) },
    });
    engineRef.current = engine;

    // Set up game scene
    const gameScene = new GameScene(false); // false = not replay mode
    gameSceneRef.current = gameScene;
    engine.add("game", gameScene);
    engine.goToScene("game");

    // For debugging
    engine.showDebug(true);

    // Start the engine
    engine.start()
      .then(() => {
        console.log("[MonadRunner] Engine started successfully!");
      })
      .catch((error) => {
        console.error("[MonadRunner] Error starting engine:", error);
      });

    // Clean up on unmount
    return () => {
      if (engineRef.current) {
        console.log("[MonadRunner] Stopping engine on cleanup");
        engineRef.current.stop();
        engineRef.current = null;
      }
    };
  }, [walletAddress]);

  const handleRestart = () => {
    setGameOver(false);
    onClose();
  };

  return (
    <div className="relative w-full aspect-[16/9] bg-base-300/50 rounded-lg overflow-hidden">
      <div ref={gameCanvasRef} className="absolute inset-0"></div>
      <div className="absolute top-5 left-5 glass p-2 rounded-lg z-10 flex items-center space-x-2">
        <div className="w-6 h-6 bg-primary rounded-full flex items-center justify-center text-base-100 text-xs font-bold">
          {username.charAt(0).toUpperCase()}
        </div>
        <span className="font-mono text-sm">{username}</span>
      </div>
      <div className="absolute top-5 right-16 glass p-2 rounded-lg">
        <span className="font-mono">Score: {score}</span>
      </div>
      <button
        onClick={onClose}
        className="absolute top-5 right-5 btn btn-sm btn-circle btn-outline"
      >
        ✕
      </button>
      <div className="absolute bottom-5 right-5 glass p-2 rounded-lg text-xs">
        <p>Controls: A/D to move, W to jump, S to drop</p>
      </div>
      {gameOver && <GameOver finalScore={score} onRestart={handleRestart} />}
    </div>
  );
};

export default MonadRunner;