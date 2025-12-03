// This utility now interfaces with the global OneSignal v16 SDK injected via index.html

export function getPlayerId(): Promise<string | null> {
  return new Promise((resolve) => {
    if (window.OneSignalDeferred) {
      window.OneSignalDeferred.push(async function(OneSignal: any) {
        try {
          const id = OneSignal.User.PushSubscription.id;
          resolve(id || null);
        } catch (e) {
          console.warn("Error getting player ID", e);
          resolve(null);
        }
      });
    } else {
      resolve(null);
    }
  });
}

// Initialization is now handled in index.html script tag
export async function initOneSignal() {
  // No-op for compatibility with existing imports
  console.log("OneSignal initialized via script tag");
}