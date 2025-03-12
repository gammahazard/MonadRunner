// monad-app/packages/nextjs/components/MonadRunner/actors/Player.ts
import * as ex from "excalibur";

export class Player extends ex.Actor {
  // Make isOnGround publicly accessible
  public isOnGround: boolean = false;

  constructor() {
    super({
      pos: new ex.Vector(150, 375),
      width: 25,
      height: 25,
      color: ex.Color.fromHex("#4cc9f0"),
      collisionType: ex.CollisionType.Active,
    });

    // Enable gravity
    this.body.useGravity = true;
  }

  // Jump method
  public jump(): void {
    if (this.isOnGround) {
      this.vel = new ex.Vector(0, -400);
      this.isOnGround = false;
      console.log("Player jumped!");
    } else {
      console.log("Cannot jump - not on ground");
    }
  }

  // Quick fall method
  public quickFall(): void {
    if (!this.isOnGround && this.vel.y < 0) {
      this.vel = new ex.Vector(this.vel.x, 200);
      console.log("Quick fall activated");
    }
  }

  // Setup collision events
  onInitialize(engine: ex.Engine): void {
    this.on('collisionstart', (evt: ex.CollisionStartEvent) => {
      if (this.isBottomCollision(evt.other)) {
        this.isOnGround = true;
        console.log("Player touched ground");
      }
    });
    this.on('collisionend', (evt: ex.CollisionEndEvent) => {
      if (this.isBottomCollision(evt.other)) {
        this.isOnGround = false;
        console.log("Player left ground");
      }
    });
  }

  private isBottomCollision(other: ex.Collider): boolean {
    const playerBottom = this.pos.y + this.height / 2;
    let otherTop: number;
    if (other instanceof ex.Actor) {
      otherTop = other.pos.y - other.height / 2;
    } else {
      const owner = other.owner;
      if (owner) {
        otherTop = owner.get(ex.TransformComponent)?.pos.y - (owner.get(ex.TransformComponent)?.scale.y || 0) / 2 || 0;
      } else {
        otherTop = other.bounds.top;
      }
    }
    const isGround = Math.abs(playerBottom - otherTop) < 5;
    const isLanding = this.vel.y >= -10 && isGround;
    if (isLanding) console.log("Ground collision detected");
    return isLanding;
  }
}