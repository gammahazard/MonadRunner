// NOTE: This will soon be replaced with a MongoDB-based solution
// The backend API will handle session management instead of this in-memory store

export interface SessionData {
  userAddress: string;
  publicKey: string;
  signature: string;
  validUntil: number;
  createdAt: number;
}

// Global store for sessions - this will be accessible across API routes
// But will reset on server restart
export const sessions: Map<string, SessionData> = new Map();

// Get a session by user address and public key
export function getSession(userAddress: string, publicKey: string): SessionData | undefined {
  const sessionKey = `${userAddress.toLowerCase()}:${publicKey}`;
  return sessions.get(sessionKey);
}

// Store a new session
export function storeSession(session: SessionData): void {
  const sessionKey = `${session.userAddress.toLowerCase()}:${session.publicKey}`;
  sessions.set(sessionKey, session);
}

// Remove a session
export function removeSession(userAddress: string, publicKey: string): boolean {
  const sessionKey = `${userAddress.toLowerCase()}:${publicKey}`;
  return sessions.delete(sessionKey);
}

// Validate if a session is active
export function isSessionValid(userAddress: string, publicKey: string): boolean {
  const session = getSession(userAddress, publicKey);
  if (!session) return false;
  
  const now = Math.floor(Date.now() / 1000);
  return session.validUntil > now;
}

// Clean up expired sessions
export function cleanExpiredSessions(): number {
  let count = 0;
  const now = Math.floor(Date.now() / 1000);
  
  for (const [key, session] of sessions.entries()) {
    if (session.validUntil <= now) {
      sessions.delete(key);
      count++;
    }
  }
  
  return count;
}

// Schedule cleanup every hour
if (typeof setInterval !== 'undefined') {
  setInterval(() => {
    const removed = cleanExpiredSessions();
    if (removed > 0) {
      console.log(`Cleaned up ${removed} expired sessions`);
    }
  }, 60 * 60 * 1000); // Every hour
}