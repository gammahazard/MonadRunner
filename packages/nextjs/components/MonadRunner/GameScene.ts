import * as ex from "excalibur";
import { Player } from "./actors/Player";
import { Obstacle } from "./actors/Obstacle";
import { Token } from "./actors/Token";
import { ReplayComponent } from "./ReplayComponent";
import { Resources } from "./resources";

export class GameScene extends ex.Scene {
  // Make player public so it can be accessed by Replay.tsx
  public player!: Player;
  private ground!: ex.Actor;
  private spawnTimer: number = 0;
  private gameTime: number = 0; // total elapsed time in ms
  private initialSpawnInterval: number = 2000; // starting spawn interval (ms)
  private minSpawnInterval: number = 500; // lower limit (ms)
  private baseScrollSpeed: number = 1; // starting auto-scroll speed (pixels per update)
  private gameOver: boolean = false; // flag to ensure kill logic runs only once
  private scoreAccumulator: number = 0; // accumulates delta for score increments
  private currentScore: number = 0; // track current score
  private isReplayMode: boolean = false; // flag to indicate if we're in replay mode

  // Instantiate the replay recorder
  public replayRecorder: ReplayComponent = new ReplayComponent();

  // Constructor to support replay mode
  constructor(isReplayMode: boolean = false) {
    super();
    this.isReplayMode = isReplayMode;
  }

  public onInitialize(engine: ex.Engine) {
    console.group('[GameScene] Initialization');
    console.log('Scene initialization started', {
      isReplayMode: this.isReplayMode,
      engineExists: !!engine
    });
    console.log("[GameScene] onInitialize: Initializing scene...");
    
    if (!this.isReplayMode) {
      // Only start recording in game mode, not replay mode
      this.replayRecorder.startRecording();
    }

    // Create the ground (remains static)
    const groundY = 400;
    this.ground = new ex.Actor({
      name: "ground",
      pos: new ex.Vector(400, groundY),
      width: 800,
      height: 50,
      collisionType: ex.CollisionType.Fixed,
      z: 0,
    });
    console.log('Ground created', this.ground);
    console.log('Player created', this.player);
    console.groupEnd();
    // Use the new ground sprite
    this.ground.graphics.use(
        new ex.Rectangle({
          width: this.ground.width,
          height: this.ground.height,
          color: ex.Color.Green,
        })
      );
    this.add(this.ground);
    console.log("[GameScene] onInitialize: Ground created at", this.ground.pos);

    // Create the player and add to the scene.
    this.player = new Player();
    this.player.pos = new ex.Vector(200, groundY - this.player.height / 2);
    this.add(this.player);
    console.log("[GameScene] onInitialize: Player created at", this.player.pos);

    // Set up keyboard controls (recording inputs)
    if (!this.isReplayMode) {
      engine.input.keyboard.on("press", (evt) => {
        console.log("[GameScene] Key Pressed:", evt.key);
        this.replayRecorder.record("input", { event: "press", key: evt.key });
        if (evt.key === ex.Keys.W) {
          console.log("[GameScene] W pressed - Jumping");
          this.player.jump();
        }
        if (evt.key === ex.Keys.S) {
          console.log("[GameScene] S pressed - Quick fall");
          this.player.quickFall();
        }
      });

      engine.input.keyboard.on("hold", (evt) => {
        console.log("[GameScene] Key Held:", evt.key);
        this.replayRecorder.record("input", { event: "hold", key: evt.key });
        if (evt.key === ex.Keys.A || evt.key === ex.Keys.Left) {
          this.player.vel.x = -200;
          console.log("[GameScene] Moving left, player.vel.x:", this.player.vel.x);
        }
        if (evt.key === ex.Keys.D || evt.key === ex.Keys.Right) {
          this.player.vel.x = 200;
          console.log("[GameScene] Moving right, player.vel.x:", this.player.vel.x);
        }
      });

      engine.input.keyboard.on("release", (evt) => {
        console.log("[GameScene] Key Released:", evt.key);
        this.replayRecorder.record("input", { event: "release", key: evt.key });
        if ((evt.key === ex.Keys.A || evt.key === ex.Keys.Left) && this.player.vel.x < 0) {this.player.vel.x = 0;
            console.log("[GameScene] Stopped moving left, player.vel.x:", this.player.vel.x);
          }
          if ((evt.key === ex.Keys.D || evt.key === ex.Keys.Right) && this.player.vel.x > 0) {
            this.player.vel.x = 0;
            console.log("[GameScene] Stopped moving right, player.vel.x:", this.player.vel.x);
          }
        });
      }
  
      // Collision handling on the player (recording collisions)
      this.player.on("collisionstart", (evt: ex.CollisionStartEvent) => {
        // Record collision event using the owner's name
        const collidedWith = evt.other.owner ? evt.other.owner.name : "unknown";
        
        if (!this.isReplayMode) {
          this.replayRecorder.record("collision", { with: collidedWith });
        }
        
        console.log("[GameScene] Collision detected with", evt.other);
        if (evt.other instanceof Obstacle) {
          console.log("[GameScene] Player collided with an obstacle!");
          this.killPlayer(engine);
        } else if (evt.other instanceof Token) {
          console.log("[GameScene] Player collected a token!");
          evt.other.kill();
          window.dispatchEvent(new CustomEvent("tokencollected", { detail: { points: 5 } }));
          
          if (!this.isReplayMode) {
            this.currentScore += 5;
            this.replayRecorder.record("score", { points: 5, total: this.currentScore });
          }
        }
      });
  
      console.log("[GameScene] onInitialize: Finished initializing scene.");
    }
  
    public onPreUpdate(engine: ex.Engine, delta: number) {
        console.group('[GameScene] PreUpdate');
        console.log('Update details', {
          delta,
          gameOver: this.gameOver,
          gameTime: this.gameTime
        });
      console.log("[GameScene] onPreUpdate: Delta =", delta);
      if (this.gameOver) {
        console.log("[GameScene] onPreUpdate: Game is over; skipping update.");
        return;
      }
      
      this.gameTime += delta;
      this.scoreAccumulator += delta;
      console.log("[GameScene] onPreUpdate: Total game time =", this.gameTime);
  
      if (this.scoreAccumulator >= 1000) {
        window.dispatchEvent(new CustomEvent("scoreincrement", { detail: { points: 1 } }));
        
        if (!this.isReplayMode) {
          this.currentScore += 1;
          this.replayRecorder.record("score", { points: 1, total: this.currentScore });
        }
        
        console.log("[GameScene] onPreUpdate: Score increment dispatched (1 point).");
        this.scoreAccumulator -= 1000;
      }
  
      const scrollSpeed = this.baseScrollSpeed + this.gameTime / 10000;
      console.log("[GameScene] onPreUpdate: Scroll speed =", scrollSpeed);
  
      const currentSpawnInterval = Math.max(this.minSpawnInterval, this.initialSpawnInterval - this.gameTime / 10);
      console.log("[GameScene] onPreUpdate: Current spawn interval =", currentSpawnInterval);
  
      const playerBottom = this.player.pos.y + this.player.height / 2;
      const groundTop = this.ground.pos.y - this.ground.height / 2;
      console.log("[GameScene] onPreUpdate: Player bottom =", playerBottom, "Ground top =", groundTop);
      if (Math.abs(playerBottom - groundTop) < 5 && this.player.vel.y >= 0) {
        if (!this.player.isOnGround) console.log("[GameScene] onPreUpdate: Player is now on the ground.");
        this.player.isOnGround = true;
      } else {
        if (this.player.isOnGround) console.log("[GameScene] onPreUpdate: Player is no longer on the ground.");
        this.player.isOnGround = false;
      }
  
      const camera = engine.currentScene.camera;
      camera.pos.x += scrollSpeed;
      console.log("[GameScene] onPreUpdate: Camera pos.x =", camera.pos.x);
  
      // Record camera position for replay
      if (!this.isReplayMode) {
        this.replayRecorder.record("camera", { x: camera.pos.x });
      }
  
      this.ground.pos.x = camera.pos.x;
      console.log("[GameScene] onPreUpdate: Ground pos.x updated to", this.ground.pos.x);
  
      // Record player state for replay
      if (!this.isReplayMode) {
        this.replayRecorder.record("playerState", {
          x: this.player.pos.x,
          y: this.player.pos.y,
          velX: this.player.vel.x,
          velY: this.player.vel.y,
          isOnGround: this.player.isOnGround
        });
      }
  
      const playerScreenX = this.player.pos.x - camera.pos.x + engine.drawWidth / 2;
      console.log("[GameScene] onPreUpdate: Player screen pos.x =", playerScreenX);
      if (playerScreenX < 15 || playerScreenX > engine.drawWidth - 15) {
        console.log("[GameScene] onPreUpdate: Player hit the screen edge (screen pos.x =", playerScreenX, ")");
        this.killPlayer(engine);
      }
  
      this.spawnTimer += delta;
      console.log("[GameScene] onPreUpdate: Spawn timer =", this.spawnTimer);
      if (this.spawnTimer >= currentSpawnInterval) {
        this.spawnTimer = 0;
        const spawnChoice = Math.random();
        const spawnX = camera.pos.x + engine.drawWidth / 2; // Spawn just off screen to the right
        
        if (spawnChoice < 0.7) {
          const obstacle = new Obstacle(spawnX, 360);
          this.add(obstacle);
          console.log("[GameScene] Spawned Obstacle at pos", obstacle.pos);
          
          // Record spawn event for replay
          if (!this.isReplayMode) {
            this.replayRecorder.record("spawn", {
              type: "obstacle",
              x: spawnX,
              y: 360,
              id: obstacle.id.toString()
            });
          }
        } else {
          const token = new Token(spawnX, 365);
          this.add(token);
          console.log("[GameScene] Spawned Token at pos", token.pos);
          console.groupEnd();
          // Record spawn event for replay
          if (!this.isReplayMode) {
            this.replayRecorder.record("spawn", {
              type: "token",
              x: spawnX,
              y: 365,
              id: token.id.toString()
            });
          }
        }
      }
    }
  
    // Method to set the camera position - used during replay
    public setCameraPosition(x: number): void {
      if (this.engine) {
        this.engine.currentScene.camera.pos.x = x;
        this.ground.pos.x = x;
      }
    }
  
    // Method to spawn objects - used during replay
    public spawnObject(type: string, x: number, y: number, id: string): void {
      if (type === "obstacle") {
        const obstacle = new Obstacle(x, y);
        obstacle.id = id as unknown as number; // Set the same ID for consistency
        this.add(obstacle);
      } else if (type === "token") {
        const token = new Token(x, y);
        token.id = id as unknown as number; // Set the same ID for consistency
        this.add(token);
      }
    }
  
    private killPlayer(engine: ex.Engine) {
        if (this.gameOver) return;
        this.gameOver = true;
        this.player.kill();
        console.log("[GameScene] killPlayer: Game Over! Player killed.");
      
        if (!this.isReplayMode) {
          const replayData = this.replayRecorder.stopRecording();
          console.log("[GameScene] killPlayer: Replay data recorded:", replayData);
      
          // Include the final scene score in the 'replaydata' event
          window.dispatchEvent(
            new CustomEvent("replaydata", {
              detail: {
                replay: replayData,
                finalScore: this.currentScore,
              },
            })
          );
        }
      
        window.dispatchEvent(
          new CustomEvent("gameover", {
            detail: { finalScore: this.currentScore },
          })
        );
        engine.stop();
      }
  }