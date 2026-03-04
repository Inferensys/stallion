export interface CredentialRequest {
  id: string;
  platform: string;
  type: "password" | "oauth" | "otp" | "api_key";
  context?: string;
  screenshotUrl?: string;
  timestamp: number;
}

export interface CredentialPayload {
  requestId: string;
  credentials: Record<string, string>;
}

type RequestCallback = (request: CredentialRequest) => void;
type ResolveCallback = (payload: CredentialPayload) => void;

/**
 * CredentialRelay — manages credential requests from agents to users and back.
 *
 * Flow:
 * 1. Agent needs credentials → calls `request()` → emits to WS clients
 * 2. User provides credentials → backend POSTs to `/credential` → `provide()` called
 * 3. Waiting agent receives credentials via pending promise
 */
export class CredentialRelay {
  private requestCallbacks: RequestCallback[] = [];
  private pendingRequests = new Map<string, ResolveCallback>();

  onRequest(cb: RequestCallback) {
    this.requestCallbacks.push(cb);
  }

  /**
   * Agent requests credentials. Returns a promise that resolves when user provides them.
   */
  request(req: CredentialRequest): Promise<CredentialPayload> {
    return new Promise((resolve) => {
      this.pendingRequests.set(req.id, resolve);

      // Notify all listeners (WS clients → backend → frontend)
      for (const cb of this.requestCallbacks) {
        try {
          cb(req);
        } catch (err) {
          console.error("[credential-relay] Request callback error:", err);
        }
      }
    });
  }

  /**
   * User provides credentials. Resolves the matching pending request.
   */
  provide(payload: CredentialPayload) {
    const resolve = this.pendingRequests.get(payload.requestId);
    if (resolve) {
      resolve(payload);
      this.pendingRequests.delete(payload.requestId);
    } else {
      console.warn(
        `[credential-relay] No pending request for id: ${payload.requestId}`
      );
    }
  }

  hasPending(requestId: string): boolean {
    return this.pendingRequests.has(requestId);
  }

  getPendingCount(): number {
    return this.pendingRequests.size;
  }
}
