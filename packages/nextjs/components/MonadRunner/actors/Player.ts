// components/MonadRunner/actors/Player.ts
import * as ex from "excalibur";

export class Player extends ex.Actor {
  // Track if player is on ground
  private _isOnGround: boolean = false;

  constructor() {
    super({
      pos: new ex.Vector(150, 375), // Position player closer to ground
      width: 25,
      height: 25,
      color: ex.Color.fromHex("#4cc9f0"),
      collisionType: ex.CollisionType.Active,
    });

    // Configure body properties
    this.body.useGravity = true;
  }

  // Public getter for isOnGround
  get isOnGround(): boolean {
    return this._isOnGround;
  }

  // Public setter for isOnGround
  set isOnGround(value: boolean) {
    this._isOnGround = value;
  }

  // Handle jump
  public jump(): void {
    if (this._isOnGround) {
      this.vel = new ex.Vector(0, -400);
      this._isOnGround = false;
      console.log("Player jumped!");
    } else {
      console.log("Can't jump - not on ground");
    }
  }

  // Handle quick fall
  public quickFall(): void {
    if (!this._isOnGround && this.vel.y < 0) {
      this.vel = new ex.Vector(this.vel.x, 200); // Keep x velocity, accelerate downward
      console.log("Quick fall activated");
    }
  }

  // Override onInitialize to set up collisions
  onInitialize(engine: ex.Engine): void {
    // Setup collision detection
    this.on('collisionstart', (evt: ex.CollisionStartEvent) => {
      // Check if bottom of player is colliding
      if (this.isBottomCollision(evt.other)) {
        this._isOnGround = true;
        console.log('Player touched ground');
      }
    });
    
    this.on('collisionend', (evt: ex.CollisionEndEvent) => {
      // Only set not on ground if bottom collision ended
      if (this.isBottomCollision(evt.other)) {
        this._isOnGround = false;
        console.log('Player left ground');
      }
    });
  }

  // Helper to check if collision is from below the player
  private isBottomCollision(other: ex.Collider): boolean {
    // Get the player's bottom Y coordinate
    const playerBottom = this.pos.y + this.height / 2;
    
    // Calculate approx top of other collider
    let otherTop: number;
    if (other instanceof ex.Actor) {
      otherTop = other.pos.y - other.height / 2;
    } else {
      // If it's just a collider, use its owner's position if available
      const owner = other.owner;
      if (owner) {
        // Assume it's a standard rectangular collider for simplicity
        const ownerHeight = owner.get(ex.TransformComponent)?.scale.y || 0;
        otherTop = owner.get(ex.TransformComponent)?.pos.y - ownerHeight / 2 || 0;
      } else {
        // Last resort, use collider's bounds
        otherTop = other.bounds.top;
      }
    }
    
    // Check if the player's bottom is near the other object's top
    const isGround = Math.abs(playerBottom - otherTop) < 5;
    
    // If velocity is downward or very small, and positions align, consider it ground
    const isLanding = this.vel.y >= -10 && isGround;
    
    if (isLanding) {
      console.log("Ground collision detected");
    }
    
    return isLanding;
  }
}