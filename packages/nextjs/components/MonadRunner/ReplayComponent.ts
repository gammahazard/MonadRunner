// monad-app/packages/nextjs/components/MonadRunner/ReplayComponent.ts
import * as ex from "excalibur";

export type ReplayEventType = "input" | "collision" | "state" | "spawn" | "camera" | "score" | "init" | "playerState";

export interface ReplayEvent {
  type: ReplayEventType;
  payload: any;
  timestamp: number; // milliseconds elapsed since recording started
}

export class ReplayComponent {
  private events: ReplayEvent[] = [];
  private startTime: number = 0;
  private lastRecordedTime: number = 0;
  private readonly minTimeBetweenRecordings: number = 50; // ms between state recordings

  startRecording() {
    this.events = [];
    this.startTime = performance.now();
    this.lastRecordedTime = 0;
    console.log("[ReplayComponent] Recording started at", this.startTime);
    
    // Record initial event with timestamp 0
    this.record("init", { timestamp: 0 });
  }

  record(eventType: ReplayEventType, payload: any) {
    const timestamp = performance.now() - this.startTime;
    
    // For state events, throttle recording to avoid excessive data
    if (eventType === "state" || eventType === "camera" || eventType === "playerState") {
      if (timestamp - this.lastRecordedTime < this.minTimeBetweenRecordings) {
        return; // Skip this recording, too soon
      }
      this.lastRecordedTime = timestamp;
    }
    
    const event: ReplayEvent = { type: eventType, payload, timestamp };
    this.events.push(event);
    
    // Only log important events to avoid console spam
    if (eventType !== "camera" && eventType !== "playerState") {
      console.log(`[ReplayComponent] Recorded ${eventType} event at ${timestamp.toFixed(0)}ms:`, payload);
    }
  }

  stopRecording(): ReplayEvent[] {
    console.log("[ReplayComponent] Recording stopped. Total events recorded:", this.events.length);
    return this.events;
  }

  getEvents(): ReplayEvent[] {
    return this.events;
  }
}