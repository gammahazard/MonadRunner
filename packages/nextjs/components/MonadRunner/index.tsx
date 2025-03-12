"use client";

import React, { useEffect, useRef, useState, useCallback } from "react";
import dynamic from "next/dynamic";
import * as ex from "excalibur";
import { GameScene } from "./GameScene";
import GameOver from "./components/GameOver";
import MobileControls from "./MobileControls";
import { ReplayEvent } from "./ReplayComponent";
import { createResourceLoader } from "./resources";

/**
 * Props
 */
interface MonadRunnerProps {
  walletAddress: string;
  username?: string;
  // Called when the game ends with a final score
  onGameEnd: (score: number) => void;
  // Called when user closes the modal
  onClose: () => void;
}

/**
 * The main MonadRunner component
 */
const MonadRunner: React.FC<MonadRunnerProps> = ({
  walletAddress,
  username = "Player",
  onGameEnd,
  onClose,
}) => {
  const gameCanvasRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<ex.Engine | null>(null);
  const gameSceneRef = useRef<GameScene | null>(null);

  // UI state for "Game Over" modal
  const [gameOver, setGameOver] = useState(false);
  const [score, setScore] = useState(0);
  const [replayData, setReplayData] = useState<ReplayEvent[]>([]);

  // For controlling mobile vs. desktop, loading state, etc.
  const [isMobile, setIsMobile] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isClient, setIsClient] = useState(false);

  /**
   * Canvas ref callback
   */
  const handleCanvasRef = useCallback((node: HTMLDivElement | null) => {
    if (node) {
      (gameCanvasRef as any).current = node;
    }
  }, []);

  /**
   * This effect initializes the engine & scene once we're on the client
   */
  useEffect(() => {
    console.group("[MonadRunner] Initialization");
    console.log("Client-side rendering =>", { isClient, walletAddress });

    if (!isClient) {
      console.log("Skipping engine init, not on client yet");
      console.groupEnd();
      return;
    }

    // If we've already created the engine, skip
    if (engineRef.current) {
      console.log("Engine already exists, skipping re-init.");
      console.groupEnd();
      return;
    }

    // Must have a canvas container in the DOM
    const canvasContainer = gameCanvasRef.current;
    if (!canvasContainer) {
      console.error("No canvas container available");
      console.groupEnd();
      return;
    }

    // Clear out any old canvases
    while (canvasContainer.firstChild) {
      canvasContainer.removeChild(canvasContainer.firstChild);
    }

    // Create our <canvas>
    const canvasElement = document.createElement("canvas");
    canvasElement.id = "monad-runner-canvas";
    canvasElement.width = 800;
    canvasElement.height = 450;
    canvasElement.style.width = "100%";
    canvasElement.style.height = "100%";
    canvasElement.style.display = "block";
    canvasContainer.appendChild(canvasElement);

    // Create the Excalibur engine
    const engine = new ex.Engine({
      width: 800,
      height: 450,
      canvasElement,
      backgroundColor: ex.Color.fromHex("#1a1a2e"),
      // optional physics config
      physics: {
        enabled: true,
        gravity: new ex.Vector(0, 800),
      },
      // you can do FitScreen if you want
      // displayMode: ex.DisplayMode.FitScreen,
    });

    // Debug toggles (optional)
    // engine.showDebug(true);
    engine.debug.body.showAll = true;
    engine.debug.collider.showAll = true;

    // Store ref
    engineRef.current = engine;

    // Listen for engine start
    engine.on("start", () => {
      console.log("[MonadRunner] Engine started", {
        drawWidth: engine.drawWidth,
        drawHeight: engine.drawHeight,
      });
    });

    // Listen for fatal exceptions
    engine.onFatalException = (err) => {
      console.error("[MonadRunner] Fatal engine exception:", err);
    };

    // Show spinner
    setIsLoading(true);

    // Create our resource loader (may be empty if no images)
    const loader = createResourceLoader();
    // if you want to skip the "Click to Start" overlay in some old versions:
    loader.suppressPlayButton = true;

    // Start the engine with the loader
    console.log("Starting engine with loader...");
    engine
      .start(loader)
      .then(() => {
        console.log("Engine + resources loaded");

        // Create the main game scene
        const gameScene = new GameScene(false);
        gameSceneRef.current = gameScene;
        engine.add("game", gameScene);

        // Listen for `gameover` from the scene to trigger our local UI
        // Also listen for `scoreincrement`, `tokencollected` if we want
        window.addEventListener("gameover", handleGameOver);
        window.addEventListener("scoreincrement", handleScoreIncrement);
        window.addEventListener("tokencollected", handleTokenCollected);
        window.addEventListener("replaydata", handleReplayData);

        // Go to the game scene
        engine.goToScene("game");
        console.log("Game scene added & activated");
      })
      .then(() => {
        console.log("Game initialization complete");
        setIsLoading(false);
      })
      .catch((error) => {
        console.error("Initialization failed:", error);
        setIsLoading(false);
      })
      .finally(() => {
        console.groupEnd();
      });

    // Cleanup
    return () => {
      window.removeEventListener("gameover", handleGameOver);
      window.removeEventListener("scoreincrement", handleScoreIncrement);
      window.removeEventListener("tokencollected", handleTokenCollected);
      window.removeEventListener("replaydata", handleReplayData);

      if (engineRef.current) {
        console.log("Stopping engine on unmount");
        engineRef.current.stop();
        engineRef.current = null;
      }
    };
  }, [isClient, walletAddress]);

  /**
   * Mark that we are indeed on the client
   */
  useEffect(() => {
    setIsClient(true);
  }, []);

  /**
   * Handler for "gameover" event from the Excalibur scene
   */
  const handleGameOver = (evt: any) => {
    console.log("[MonadRunner] handleGameOver => event detail:", evt.detail);
    // read finalScore from detail
    const finalScore = evt.detail?.finalScore ?? 0;
  
    // Optionally set it in local React state to show in a modal:
    setScore(finalScore);
    setGameOver(true);
  
    // Then call parent
    onGameEnd(finalScore);
  };

  /**
   * Handler for "scoreincrement" event
   */
  const handleScoreIncrement = (evt: any) => {
    // The detail might have { points: 1 }, so we add it to `score`
    const points = evt.detail?.points ?? 0;
    setScore((prev) => prev + points);
  };

  /**
   * Handler for "tokencollected" event
   */
  const handleTokenCollected = (evt: any) => {
    // e.g. if points are 5 for a token
    const points = evt.detail?.points ?? 0;
    setScore((prev) => prev + points);
  };

  /**
   * Handler for "replaydata" event
   */
  const handleReplayData = async (evt: any) => {
    const replay = evt.detail?.replay ?? [];
    console.log("[MonadRunner] Received replay data from scene:", replay);
    
    // Possibly we also have a final score in the scene, or we have it in local 'score' state
    // If we want to pass finalScore from killPlayer as well, we might put it into the "replaydata" event detail
    const finalScore = evt.detail?.finalScore ?? 0;  // or pass from detail
  
    try {
      const walletAddr = walletAddress; // from props
      if (!walletAddr) return;
  
      // Post to /api/game/replay
      const res = await fetch("/api/game/replay", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          walletAddress: walletAddr,
          score: finalScore,
          replayData: replay
        })
      });
      
      if (!res.ok) {
        console.error("Failed to POST replay data:", await res.text());
      } else {
        console.log("Replay posted successfully!");
      }
    } catch (err) {
      console.error("Error posting replay data:", err);
    }
    
    setReplayData(replay); // local state if you still want it
  };
  
  /**
   * If we're not on client, just show nothing (to avoid SSR mismatch)
   */
  if (!isClient) {
    return null;
  }

  /**
   * The UI
   */
  return (
    <div className="relative w-full aspect-[16/9] bg-base-300/50 rounded-lg overflow-hidden">
      {/* The container for our canvas */}
      <div
        ref={handleCanvasRef}
        className="absolute inset-0"
        style={{
          border: "2px solid red",
          backgroundColor: "rgba(255,0,0,0.1)",
        }}
      />

      {/* Overlay a loading spinner if isLoading */}
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/40">
          <span className="loading loading-spinner loading-lg text-primary" />
        </div>
      )}

      {/* Mobile controls if needed */}
      {isMobile && !gameOver && (
        <MobileControls
          onLeftPressed={() => {
            const scene = gameSceneRef.current;
            if (!scene?.player) return;
            scene.player.vel.x = -200;
          }}
          onRightPressed={() => {
            const scene = gameSceneRef.current;
            if (!scene?.player) return;
            scene.player.vel.x = 200;
          }}
          onJumpPressed={() => {
            const scene = gameSceneRef.current;
            if (!scene?.player) return;
            scene.player.jump();
          }}
          onLeftReleased={() => {
            const scene = gameSceneRef.current;
            if (!scene?.player) return;
            if (scene.player.vel.x < 0) {
              scene.player.vel.x = 0;
            }
          }}
          onRightReleased={() => {
            const scene = gameSceneRef.current;
            if (!scene?.player) return;
            if (scene.player.vel.x > 0) {
              scene.player.vel.x = 0;
            }
          }}
        />
      )}

      {/* Some top-left UI with your username */}
      <div className="absolute top-5 left-5 glass p-2 rounded-lg z-10 flex items-center space-x-2">
        <div className="w-6 h-6 bg-primary rounded-full flex items-center justify-center text-base-100 text-xs font-bold">
          {username.charAt(0).toUpperCase()}
        </div>
        <span className="font-mono text-sm">{username}</span>
      </div>

      {/* Score display top-right */}
      <div className="absolute top-5 right-16 glass p-2 rounded-lg">
        <span className="font-mono">Score: {score}</span>
      </div>

      {/* A "close" button top-right */}
      <button
        onClick={onClose}
        className="absolute top-5 right-5 btn btn-sm btn-circle btn-outline"
      >
        ✕
      </button>

      {/* A small controls reminder at bottom-right */}
      <div className="absolute bottom-5 right-5 glass p-2 rounded-lg text-xs">
        <p>Controls: A/D to move, W to jump, S to drop</p>
      </div>

      {/* The GameOver modal if the player died */}
      {gameOver && (
        <GameOver
          finalScore={score}
          onRestart={() => {
            // Close the game, reset everything or go back to parent
            setGameOver(false);
            setScore(0);
            onClose(); 
            // or you could do something like setIsLoading(true) & re-init
          }}
        />
      )}
    </div>
  );
};

/** 
 * Export with no SSR 
 */
export default dynamic(() => Promise.resolve(MonadRunner), { ssr: false });
