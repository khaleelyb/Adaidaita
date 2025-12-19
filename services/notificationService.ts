import { getToken, onMessage } from "firebase/messaging";
import { messaging } from "../lib/firebase";
import { supabaseClient } from "./supabaseClient";

export class NotificationService {
    static async requestPermissionAndGetToken(userId: string) {
        try {
            console.log('[NotificationService] Requesting permission...');
            
            // Check if notifications are supported
            if (!('Notification' in window)) {
                console.warn('[NotificationService] Notifications not supported in this browser');
                return null;
            }

            // If already granted, just get the token
            if (Notification.permission === 'granted') {
                console.log('[NotificationService] Permission already granted');
                return await this.getFCMToken(userId);
            }

            // If previously denied, don't ask again
            if (Notification.permission === 'denied') {
                console.warn('[NotificationService] Notification permission previously denied');
                return null;
            }

            // Request permission
            const permission = await Notification.requestPermission();
            console.log('[NotificationService] Permission response:', permission);

            if (permission === 'granted') {
                console.log('[NotificationService] Notification permission granted.');
                return await this.getFCMToken(userId);
            } else {
                console.warn('[NotificationService] Notification permission denied.');
                return null;
            }
        } catch (error) {
            console.error('[NotificationService] Error getting permission:', error);
            return null;
        }
    }

    private static async getFCMToken(userId: string) {
        try {
            console.log('[NotificationService] Getting FCM token...');
            
            // Ensure service worker is registered
            if ('serviceWorker' in navigator) {
                const registration = await navigator.serviceWorker.ready;
                console.log('[NotificationService] Service worker ready:', registration);
            }

            const token = await getToken(messaging, {
                vapidKey: 'BBf-LAYrwI1fFZIqaVLHGDGWPjPIwJfhOquGZa3jU9AjXlL6-F5nnQ3kj8wl3_P_oKtDHZP85QZCHaJZFv08cFY',
                serviceWorkerRegistration: await navigator.serviceWorker.ready
            });

            if (token) {
                console.log('[NotificationService] FCM Token obtained:', token.substring(0, 20) + '...');
                // Save token to Supabase
                await this.saveTokenToSupabase(userId, token);
                return token;
            } else {
                console.warn('[NotificationService] No registration token available.');
                return null;
            }
        } catch (error) {
            console.error('[NotificationService] Error getting FCM token:', error);
            return null;
        }
    }

    private static async saveTokenToSupabase(userId: string, token: string) {
        try {
            // Check if fcm_token column exists by attempting an update
            const { error } = await supabaseClient
                .from('users')
                .update({
                    fcm_token: token,
                    updated_at: new Date().toISOString()
                }).eq('id', userId);

            if (error) {
                console.error('[NotificationService] Error saving token to Supabase:', error);
            } else {
                console.log('[NotificationService] FCM token saved to profile');
            }
        } catch (err) {
            console.error('[NotificationService] Unexpected error saving token:', err);
        }
    }

    static listenForMessages() {
        onMessage(messaging, (payload) => {
            console.log('[NotificationService] Message received in foreground: ', payload);
            if (payload.notification) {
                // Show browser notification if app is in foreground
                const title = payload.notification.title || 'Adaidaita';
                const options = {
                    body: payload.notification.body || '',
                    icon: '/favicon.ico',
                    tag: payload.data?.type || 'notification',
                    requireInteraction: payload.data?.type === 'new_trip' || payload.data?.type === 'incoming_call'
                };
                
                try {
                    new Notification(title, options);
                    console.log('[NotificationService] Notification displayed:', title);
                } catch (err) {
                    console.warn('[NotificationService] Could not show notification:', err);
                }
            }
        });
    }

    /**
     * Trigger a trip notification via Supabase Edge Function.
     */
    static async sendTripNotification(trip: any) {
        console.log('[NotificationService] 📣 Triggering trip notification for drivers', trip.id);

        try {
            // In a real app, you'd fetch all driver tokens from your 'users' table
            // For now, we'll assume the caller provides or we fetch tokens here.
            // This is just an example of how to call the function.
            const { data: drivers, error: fetchError } = await supabaseClient
                .from('users')
                .select('fcm_token')
                .eq('user_type', 'driver')
                .not('fcm_token', 'is', null);

            if (fetchError) throw fetchError;

            const tokens = drivers?.map(d => d.fcm_token).filter(Boolean) || [];

            if (tokens.length === 0) {
                console.warn('[NotificationService] No drivers with valid FCM tokens found.');
                return;
            }

            const { data, error } = await supabaseClient.functions.invoke('push-notifications', {
                body: {
                    tokens,
                    title: 'New Trip Request',
                    body: `A new trip is available near you!`,
                    data: { tripId: trip.id, type: 'new_trip' }
                }
            });

            if (error) throw error;
            console.log('[NotificationService] Notification sent successfully:', data);
        } catch (err) {
            console.error('[NotificationService] Failed to send trip notification:', err);
        }
    }

    /**
     * Trigger a call notification via Supabase Edge Function.
     */
    static async sendCallNotification(targetUserId: string, callerName: string) {
        console.log(`[NotificationService] 📞 Triggering call notification for user ${targetUserId} from ${callerName}`);

        try {
            // Fetch the target user's FCM token
            const { data: user, error: fetchError } = await supabaseClient
                .from('users')
                .select('fcm_token')
                .eq('id', targetUserId)
                .single();

            if (fetchError) throw fetchError;

            if (!user?.fcm_token) {
                console.warn('[NotificationService] Target user has no FCM token.');
                return;
            }

            const { data, error } = await supabaseClient.functions.invoke('push-notifications', {
                body: {
                    tokens: [user.fcm_token],
                    title: 'Trip Accepted',
                    body: `${callerName} has accepted your trip request!`,
                    data: { callerName, type: 'trip_accepted' }
                }
            });

            if (error) throw error;
            console.log('[NotificationService] Trip accepted notification sent successfully:', data);
        } catch (err) {
            console.error('[NotificationService] Failed to send trip accepted notification:', err);
        }
    }

    /**
     * Trigger a trip completion notification via Supabase Edge Function.
     */
    static async sendTripCompletedNotification(targetUserId: string, driverName: string) {
        console.log(`[NotificationService] ✅ Triggering trip completed notification for user ${targetUserId}`);

        try {
            // Fetch the target user's FCM token
            const { data: user, error: fetchError } = await supabaseClient
                .from('users')
                .select('fcm_token')
                .eq('id', targetUserId)
                .single();

            if (fetchError) throw fetchError;

            if (!user?.fcm_token) {
                console.warn('[NotificationService] Target user has no FCM token.');
                return;
            }

            const { data, error } = await supabaseClient.functions.invoke('push-notifications', {
                body: {
                    tokens: [user.fcm_token],
                    title: 'Trip Completed',
                    body: `Your trip with ${driverName} has been completed. Thank you for riding with us!`,
                    data: { driverName, type: 'trip_completed' }
                }
            });

            if (error) throw error;
            console.log('[NotificationService] Trip completed notification sent successfully:', data);
        } catch (err) {
            console.error('[NotificationService] Failed to send trip completed notification:', err);
        }
    }
}
