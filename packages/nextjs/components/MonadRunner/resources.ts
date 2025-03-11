// components/MonadRunner/resources.ts
import * as ex from "excalibur";

// Will be expanded with actual game assets later
export const Resources = {
  // Examples:
  // PlayerSprite: new ex.ImageSource("/assets/player.png"),
  // ObstacleSprite: new ex.ImageSource("/assets/obstacle.png"),
  // TokenSprite: new ex.ImageSource("/assets/token.png"),
  // JumpSound: new ex.Sound("/assets/jump.wav"),
  // GameOverSound: new ex.Sound("/assets/gameover.wav"),
};

// Create a loader with all resources
export const createResourceLoader = () => {
  const loader = new ex.Loader();
  
  // Add resources to the loader
  for (const resource of Object.values(Resources)) {
    loader.addResource(resource);
  }
  
  return loader;
};