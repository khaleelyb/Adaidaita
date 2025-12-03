import OneSignal from 'react-onesignal';
import { ONE_SIGNAL_APP_ID } from '../constants';

export async function initOneSignal() {
  try {
    // Safety check: Ensure OneSignal is defined before initializing
    if (!OneSignal) {
      console.warn("OneSignal library not available");
      return;
    }

    await OneSignal.init({
      appId: ONE_SIGNAL_APP_ID,
      allowLocalhostAsSecureOrigin: true,
    });

    // Safely check for the Slidedown property before calling it
    // Newer SDK versions might change structure or it might be undefined on some platforms
    if (OneSignal.Slidedown) {
      await OneSignal.Slidedown.promptPush();
    }
  } catch (error) {
    // Log error but do not crash the app
    console.warn("OneSignal init error:", error);
  }
}

export function getPlayerId() {
  try {
    if (OneSignal && OneSignal.User && OneSignal.User.PushSubscription) {
       return OneSignal.User.PushSubscription.id;
    }
    return null;
  } catch (e) {
    console.warn("Could not get OneSignal Player ID", e);
    return null;
  }
}