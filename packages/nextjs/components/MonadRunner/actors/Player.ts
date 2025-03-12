import * as ex from "excalibur";

export class Player extends ex.Actor {
  public isOnGround = false;

  constructor() {
    super({
      pos: new ex.Vector(150, 375),
      width: 50,
      height: 50,
      collisionType: ex.CollisionType.Active,
    });
    // Enable gravity
    this.body.useGravity = true;
  }

  onInitialize(engine: ex.Engine): void {
    // Instead of a sprite, we'll use a blue rectangle
    this.graphics.use(
      new ex.Rectangle({
        width: this.width,
        height: this.height,
        color: ex.Color.Blue,
      })
    );

    this.on("collisionstart", evt => {
      if (this.isBottomCollision(evt.other)) {
        this.isOnGround = true;
        console.log("Player touched ground");
      }
    });

    this.on("collisionend", evt => {
      if (this.isBottomCollision(evt.other)) {
        this.isOnGround = false;
        console.log("Player left ground");
      }
    });
  }

  public jump(): void {
    if (this.isOnGround) {
      this.vel = new ex.Vector(0, -400);
      this.isOnGround = false;
      console.log("Player jumped!");
    } else {
      console.log("Cannot jump - not on ground");
    }
  }

  public quickFall(): void {
    if (!this.isOnGround && this.vel.y < 0) {
      this.vel = new ex.Vector(this.vel.x, 200);
      console.log("Quick fall activated");
    }
  }

  private isBottomCollision(other: ex.Collider): boolean {
    const playerBottom = this.pos.y + this.height / 2;
    let otherTop: number;

    if (other instanceof ex.Actor) {
      otherTop = other.pos.y - other.height / 2;
    } else {
      const owner = other.owner;
      if (owner) {
        const transform = owner.get(ex.TransformComponent);
        const scaleY = transform?.scale.y ?? 0;
        otherTop = transform?.pos.y! - scaleY / 2;
      } else {
        otherTop = other.bounds.top;
      }
    }

    const isGround = Math.abs(playerBottom - otherTop) < 5;
    const isLanding = this.vel.y >= -10 && isGround;
    if (isLanding) {
      console.log("Ground collision detected");
    }
    return isLanding;
  }
}
