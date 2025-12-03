import OneSignal from 'react-onesignal';
import { ONE_SIGNAL_APP_ID } from '../constants';

export async function initOneSignal() {
  try {
    await OneSignal.init({
      appId: ONE_SIGNAL_APP_ID,
      allowLocalhostAsSecureOrigin: true,
    });

    // Optional prompt
    await OneSignal.Slidedown.promptPush();
  } catch (error) {
    console.warn("OneSignal init error:", error);
  }
}

export function getPlayerId() {
  try {
    // Attempt to get ID (version dependent)
    return OneSignal.User.PushSubscription.id;
  } catch (e) {
    console.warn("Could not get OneSignal Player ID", e);
    return null;
  }
}