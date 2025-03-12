// monad-app/packages/nextjs/components/Replay.tsx
"use client";

import React, { useEffect, useRef, useState } from "react";
import * as ex from "excalibur";
import { GameScene } from "./MonadRunner/GameScene"; 
import { ReplayEvent } from "./MonadRunner/ReplayComponent";

interface ReplayProps {
  replayData: ReplayEvent[]; 
  onScoreUpdate?: (score: number) => void;
  onClose?: () => void;
}

const Replay: React.FC<ReplayProps> = ({ replayData, onScoreUpdate, onClose }) => {
  const canvasRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<ex.Engine | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const [isPlaying, setIsPlaying] = useState(true);
  const [currentScore, setCurrentScore] = useState(0);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);

  // Calculate total duration when replay data is loaded
  useEffect(() => {
    if (replayData && replayData.length > 0) {
      const lastEvent = replayData[replayData.length - 1];
      const totalDuration = lastEvent.timestamp;
      setDuration(totalDuration);
    }
  }, [replayData]);

  useEffect(() => {
    if (!canvasRef.current) {
      console.error("[Replay] Canvas ref is not available");
      return;
    }
    
    if (!replayData) {
      console.error("[Replay] No replay data provided");
      return;
    }
    
    if (!Array.isArray(replayData)) {
      console.error("[Replay] Replay data is not an array:", replayData);
      return;
    }
    
    if (replayData.length === 0) {
      console.error("[Replay] Replay data array is empty");
      return;
    }
    
    console.log("[Replay] Initializing with", replayData.length, "events");

    // Clear any previous canvas elements
    while (canvasRef.current.firstChild) {
      canvasRef.current.removeChild(canvasRef.current.firstChild);
    }

    const canvasElement = document.createElement("canvas");
    canvasElement.width = 800;
    canvasElement.height = 450;
    canvasElement.style.width = "100%";
    canvasElement.style.height = "100%";
    canvasElement.style.display = "block";
    canvasRef.current.appendChild(canvasElement);

    // Create a new engine for the replay
    const engine = new ex.Engine({
      width: 800,
      height: 450,
      canvasElement,
      backgroundColor: ex.Color.fromHex("#1a1a2e"),
      physics: { gravity: new ex.Vector(0, 800) },
    });
    engineRef.current = engine;

    // Create a GameScene in replay mode
    const replayScene = new GameScene(true);
    engine.add("replay", replayScene);
    engine.goToScene("replay");

    // Disable live input
    engine.input.keyboard.off("press");
    engine.input.keyboard.off("hold");
    engine.input.keyboard.off("release");

    engine.start().then(() => {
      console.log("[Replay] Engine started, beginning replay...");
      
      // Start replaying events
      startReplay(engine, replayScene, replayData);
    }).catch((error) => {
      console.error("[Replay] Engine error:", error);
    });

    return () => {
      if (engineRef.current) {
        console.log("[Replay] Stopping engine on cleanup");
        engineRef.current.stop();
        engineRef.current = null;
      }
      
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
        animFrameRef.current = null;
      }
    };
  }, [replayData]);

  const startReplay = (engine: ex.Engine, scene: GameScene, events: ReplayEvent[]) => {
    // Cancel any existing animation frame
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
    
    const startTime = performance.now();
    let eventIndex = 0;
    let lastScore = 0;
    
    // Process objects that need to be tracked during replay
    const trackedObjects: Record<string, ex.Actor> = {};

    console.log("[Replay] Beginning replay with", events.length, "events");

    function replayLoop() {
      if (!isPlaying) {
        animFrameRef.current = requestAnimationFrame(replayLoop);
        return;
      }
      
      const now = performance.now();
      const elapsed = now - startTime;
      
      // Update current time for display
      setCurrentTime(elapsed);

      // Process all events scheduled up to now
      while (eventIndex < events.length && events[eventIndex].timestamp <= elapsed) {
        const event = events[eventIndex];
        
        // Skip logging for high-frequency events
        if (event.type !== "camera" && event.type !== "playerState") {
          console.log("[Replay] Processing event:", event.type, "at", event.timestamp.toFixed(0), "ms");
        }

        switch (event.type) {
          case "input":
            handleInputEvent(scene, event);
            break;
          
          case "collision":
            // Collisions are handled automatically by the physics engine
            console.log("[Replay] Collision event with:", event.payload.with);
            break;
          
          case "spawn":
            handleSpawnEvent(scene, event, trackedObjects);
            break;
          
          case "camera":
            handleCameraEvent(scene, event);
            break;
          
          case "score":
            handleScoreEvent(event);
            lastScore = event.payload.total;
            break;
          
          case "playerState":
            handlePlayerStateEvent(scene, event);
            break;
        }
        
        eventIndex++;
      }

      // Update the displayed score
      if (lastScore !== currentScore) {
        setCurrentScore(lastScore);
        if (onScoreUpdate) {
          onScoreUpdate(lastScore);
        }
      }

      // Continue the replay loop if there are still events or stop when done
      if (eventIndex < events.length) {
        animFrameRef.current = requestAnimationFrame(replayLoop);
      } else {
        console.log("[Replay] Replay finished - all events processed");
        setIsPlaying(false);
      }
    }

    // Start the replay loop
    animFrameRef.current = requestAnimationFrame(replayLoop);
  };

  // Handle different event types
  const handleInputEvent = (scene: GameScene, event: ReplayEvent) => {
    const { key, event: inputEvent } = event.payload;
    
    if (inputEvent === "press") {
      if (key === "KeyW" || key === "ArrowUp") {
        scene.player.jump();
      } else if (key === "KeyS" || key === "ArrowDown") {
        scene.player.quickFall();
      }
    } else if (inputEvent === "hold") {
      if (key === "KeyA" || key === "ArrowLeft") {
        scene.player.vel.x = -200;
      } else if (key === "KeyD" || key === "ArrowRight") {
        scene.player.vel.x = 200;
      }
    } else if (inputEvent === "release") {
      if ((key === "KeyA" || key === "ArrowLeft") && scene.player.vel.x < 0) {
        scene.player.vel.x = 0;
      } else if ((key === "KeyD" || key === "ArrowRight") && scene.player.vel.x > 0) {
        scene.player.vel.x = 0;
      }
    }
  };

  const handleSpawnEvent = (scene: GameScene, event: ReplayEvent, trackedObjects: Record<string, ex.Actor>) => {
    const { type, x, y, id } = event.payload;
    console.log("[Replay] Spawning", type, "at", x, y, "with id", id);
    scene.spawnObject(type, x, y, id);
  };

  const handleCameraEvent = (scene: GameScene, event: ReplayEvent) => {
    scene.setCameraPosition(event.payload.x);
  };

  const handleScoreEvent = (event: ReplayEvent) => {
    const { points, total } = event.payload;
    console.log("[Replay] Score update:", points, "points, total:", total);
    window.dispatchEvent(new CustomEvent(
      points === 5 ? "tokencollected" : "scoreincrement", 
      { detail: { points } }
    ));
  };

  const handlePlayerStateEvent = (scene: GameScene, event: ReplayEvent) => {
    const { x, y, velX, velY, isOnGround } = event.payload;
    
    // Update player state based on recorded values
    scene.player.pos.x = x;
    scene.player.pos.y = y;
    scene.player.vel.x = velX;
    scene.player.vel.y = velY;
    scene.player.isOnGround = isOnGround;
  };

  const togglePlayPause = () => {
    setIsPlaying(prev => !prev);
  };
  
  const handleClose = () => {
    if (onClose) {
      onClose();
    }
  };
  
  // Format milliseconds to MM:SS
  const formatTime = (ms: number) => {
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  };

  return (
    <div className="relative w-full aspect-[16/9]">
      <div ref={canvasRef} className="w-full h-full"></div>
      
      {/* Close button to return to replay list */}
      {onClose && (
        <button
          onClick={handleClose}
          className="absolute top-2 right-2 btn btn-circle btn-sm btn-ghost"
        >
          ✕
        </button>
      )}
      
      {/* Score display */}
      <div className="absolute top-2 left-2 glass p-2 rounded-lg">
        <span className="font-mono">Score: {currentScore}</span>
      </div>
      
      {/* Time display */}
      <div className="absolute bottom-12 left-0 right-0 text-center">
        <span className="glass p-1 rounded-lg text-xs font-mono">
          {formatTime(currentTime)} / {formatTime(duration)}
        </span>
      </div>
      
      {/* Simple playback control */}
    
    </div>
  );
};

export default Replay;