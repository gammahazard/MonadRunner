// components/MonadRunner/index.tsx
"use client";

import React, { useEffect, useRef, useState } from "react";
import * as ex from "excalibur";
import { Player } from "./actors/Player";

interface MonadRunnerProps {
  walletAddress: string;
  username?: string;
  onGameEnd: (score: number) => void;
  onClose: () => void;
}

const MonadRunner: React.FC<MonadRunnerProps> = ({ 
  walletAddress, 
  username = "Player", 
  onGameEnd, 
  onClose 
}) => {
  const gameCanvasRef = useRef<HTMLDivElement>(null);
  const [score, setScore] = useState(0);
  const engineRef = useRef<ex.Engine | null>(null);
  const playerRef = useRef<Player | null>(null);
  
  // Initialize and start the game
  useEffect(() => {
    if (!gameCanvasRef.current) {
      console.error("Game canvas ref is null");
      return;
    }

    console.log("Starting to initialize game...");

    // Clear any existing canvas elements
    while (gameCanvasRef.current.firstChild) {
      gameCanvasRef.current.removeChild(gameCanvasRef.current.firstChild);
    }

    // Create a canvas element and add it to our container
    const canvasElement = document.createElement("canvas");
    canvasElement.width = 800;
    canvasElement.height = 450;
    canvasElement.style.width = "100%";
    canvasElement.style.height = "100%";
    canvasElement.style.display = "block";
    gameCanvasRef.current.appendChild(canvasElement);

    // Initialize Excalibur engine with global physics settings
    const engine = new ex.Engine({
      width: 800,
      height: 450,
      canvasElement: canvasElement,
      backgroundColor: ex.Color.fromHex("#1a1a2e"),
      physics: {
        gravity: new ex.Vector(0, 800)
      }
    });
    
    engineRef.current = engine;
    
    // Create a simple game scene
    const gameScene = new ex.Scene();
    
    // Define ground level
    const groundY = 400;
    
    // Create ground
    const ground = new ex.Actor({
      name: "ground", // Give it a name for debugging
      pos: new ex.Vector(400, groundY),
      width: 800,
      height: 50,
      color: ex.Color.fromHex("#7209b7"),
      collisionType: ex.CollisionType.Fixed, // Fixed so it doesn't move
    });
    
    // Create player instance
    const player = new Player();
    player.pos = new ex.Vector(200, groundY - 25); // Position directly above ground
    
    // Store reference to player
    playerRef.current = player;
    
    // Add a debug flag to check if jump key was pressed
    let jumpKeyPressed = false;
    
    // Setup keyboard controls
    engine.input.keyboard.on("press", (evt) => {
      // Jump with W
      if (evt.key === ex.Keys.W) {
        jumpKeyPressed = true;
        console.log('W key pressed, player.isOnGround:', player.isOnGround);
        player.jump();
      }
      
      // Quick fall with S
      if (evt.key === ex.Keys.S) {
        player.quickFall();
      }
    });
    
    // Reset jump key flag after update
    gameScene.on("postupdate", () => {
      if (jumpKeyPressed) {
        jumpKeyPressed = false;
      }
    });
    
    // Movement with A/D
    engine.input.keyboard.on("hold", (evt) => {
      // Handle A/D movement
      if (evt.key === ex.Keys.A || evt.key === ex.Keys.Left) {
        player.vel.x = -200;
      }
      
      if (evt.key === ex.Keys.D || evt.key === ex.Keys.Right) {
        player.vel.x = 200;
      }
    });
    
    // Reset velocity when keys are released
    engine.input.keyboard.on("release", (evt) => {
      if ((evt.key === ex.Keys.A || evt.key === ex.Keys.Left) && player.vel.x < 0) {
        player.vel.x = 0;
      }
      
      if ((evt.key === ex.Keys.D || evt.key === ex.Keys.Right) && player.vel.x > 0) {
        player.vel.x = 0;
      }
    });
    
    // Update game state each frame - use the elapsed parameter instead of delta
    gameScene.on("preupdate", (evt: any) => {
      // Get elapsed time from event
      const elapsed = evt.elapsed || 16; // Default to 16ms if not available
      
      // Debug information
      if (player.isOnGround) {
        console.log("Player is on ground");
      }
      
      // Manually check if player is on ground by position
      const playerBottom = player.pos.y + player.height / 2;
      const groundTop = ground.pos.y - ground.height / 2;
      if (Math.abs(playerBottom - groundTop) < 5 && player.vel.y >= 0) {
        // If player is near ground and not moving up, force on-ground state
        player.isOnGround = true;
      }
      
      // Keep player within game bounds
      if (player.pos.x < 15) {
        player.pos.x = 15;
      }
      if (player.pos.x > 785) {
        player.pos.x = 785;
      }
      
      // Update score based on time - use elapsed instead of delta
      if (elapsed > 0) {
        const scoreIncrement = elapsed / 1000;
        setScore(prevScore => Math.floor(prevScore + scoreIncrement));
      }
    });
    
    // Add actors to scene
    gameScene.add(ground);
    gameScene.add(player);
    
    // Add scene to game and activate it
    engine.add("game", gameScene);
    engine.goToScene("game");
    
    // Enable debug drawing to see collision boundaries
    engine.showDebug(true);
    
    // Start the game engine
    engine.start().then(() => {
      console.log("Engine started successfully!");
    }).catch(error => {
      console.error("Error starting engine:", error);
    });

    // Cleanup function
    return () => {
      if (engineRef.current) {
        engineRef.current.stop();
        engineRef.current = null;
      }
    };
  }, [walletAddress]);

  return (
    <div className="relative w-full aspect-[16/9] bg-base-300/50 rounded-lg overflow-hidden">
      <div 
        ref={gameCanvasRef} 
        className="absolute inset-0"
      ></div>
      
      {/* Username display */}
      <div className="absolute top-5 left-5 glass p-2 rounded-lg z-10 flex items-center space-x-2">
        <div className="w-6 h-6 bg-primary rounded-full flex items-center justify-center text-base-100 text-xs font-bold">
          {username.charAt(0).toUpperCase()}
        </div>
        <span className="font-mono text-sm">{username}</span>
      </div>
      
      {/* Score display */}
      <div className="absolute top-5 right-16 glass p-2 rounded-lg">
        <span className="font-mono">Score: {score}</span>
      </div>
      
      <button
        onClick={onClose}
        className="absolute top-5 right-5 btn btn-sm btn-circle btn-outline"
      >
        ✕
      </button>
      
      {/* Debug instructions */}
      <div className="absolute bottom-5 right-5 glass p-2 rounded-lg text-xs">
        <p>Controls: A/D to move, W to jump, S to drop</p>
      </div>
    </div>
  );
};

export default MonadRunner;