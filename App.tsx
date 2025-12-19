import React, { useState, useEffect, useRef, useCallback } from 'react';
import { UserRole, Trip, TripStatus, User } from './types';
import { supabase } from './services/Supabase';
import { authService } from './services/auth';
import { WebRTCService } from './services/webrtcService';
import { MapVisualizer } from './components/MapVisualizer';
import { CallModal } from './components/CallModal';
import { Header } from './components/Header';
import { RideRequestPanel } from './components/RideRequestPanel';
import { TripStatusPanel } from './components/TripStatusPanel';
import { AuthModal } from './components/AuthModal';
import { BottomNav } from './components/BottomNav';
import { Account } from './pages/Account';
import { Services } from './pages/Services';
import { NotificationService } from './services/notificationService';
import { NotificationToast, Toast } from './components/NotificationToast';


const App: React.FC = () => {
  // Global State
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [currentTrip, setCurrentTrip] = useState<Trip | null>(null);
  const [availableTrip, setAvailableTrip] = useState<Trip | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);

  // Navigation State
  const [currentTab, setCurrentTab] = useState('home');

  // UI State
  const [pickupInput, setPickupInput] = useState('Current Location');
  const [destinationInput, setDestinationInput] = useState('');

  // Coordinates State
  const [pickupCoords, setPickupCoords] = useState<{ lat: number, lng: number } | undefined>(undefined);
  const [destinationCoords, setDestinationCoords] = useState<{ lat: number, lng: number } | undefined>(undefined);

  const [isRequesting, setIsRequesting] = useState(false);
  const [requestError, setRequestError] = useState<string | undefined>(undefined);
  const [isCallModalOpen, setIsCallModalOpen] = useState(false);
  const [isCalling, setIsCalling] = useState(false);
  const [hasIncomingCall, setHasIncomingCall] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);

  // WebRTC State
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const rtcServiceRef = useRef<WebRTCService | null>(null);

  // Refs
  const isMounted = useRef(true);
  const authSubscriptionRef = useRef<any>(null);
  const lastLocalUpdateRef = useRef<number>(0);
  const watchIdRef = useRef<number | null>(null);
  const tripSubscriptionRef = useRef<any>(null);
  const driverSubscriptionRef = useRef<any>(null);

  // Toast Handlers
  const addToast = useCallback((type: 'success' | 'error' | 'info' | 'warning', title: string, message: string, duration = 4000) => {
    const id = Date.now().toString();
    const toast: Toast = { id, type, title, message };
    setToasts(prev => [...prev, toast]);
    
    if (duration > 0) {
      setTimeout(() => removeToast(id), duration);
    }
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  // --- Auth Handlers ---
  useEffect(() => {
    isMounted.current = true;

    const initAuth = async () => {
      try {
        console.log('🔍 Starting auth initialization...');

        // 1. FAST CHECK: If no local token, stop loading immediately
        if (!authService.hasSavedSession()) {
          console.log('⚡ No saved session - skipping remote check');
          if (isMounted.current) {
            setIsAuthLoading(false);
          }
          return;
        }

        // 2. Fallback timeout for UI (in case remote check hangs despite service timeout)
        const timeoutId = setTimeout(() => {
          if (isMounted.current && isAuthLoading) {
            console.warn('⚠️ Auth check timeout - forcing completion');
            setIsAuthLoading(false);
          }
        }, 6000); // Slightly longer than service timeout

        const user = await authService.getCurrentUser();

        clearTimeout(timeoutId);

        if (!isMounted.current) return;

        if (user) {
          console.log('✅ User session restored:', user.email);
          setCurrentUser(user);
        } else {
          console.log('🗑️ No active session - showing login');
          // If we had a token but getting user failed (expired/invalid), 
          // ensure we clear any stale state
          authService.clearSupabaseAuthStorage();
        }
        setIsAuthLoading(false);

      } catch (error) {
        console.error('❌ Auth initialization error:', error);
        if (isMounted.current) {
          setIsAuthLoading(false);
          // Don't show error screen for auth failures, just show login
          // setAuthError('Failed to load. Please try again.'); 
          authService.clearSupabaseAuthStorage();
        }
      }
    };

    initAuth();

    authSubscriptionRef.current = authService.onAuthStateChange((user) => {
      if (!isMounted.current) return;

      console.log('👤 Auth state changed:', user ? user.email : 'Logged out');
      setCurrentUser(user);

      if (!user) {
        // Clean up everything on logout
        cleanupAllConnections();
      }
    });

    return () => {
      isMounted.current = false;
      if (authSubscriptionRef.current?.subscription) {
        authSubscriptionRef.current.subscription.unsubscribe();
      }
    };
  }, []);

  // --- 0.1 FCM INITIALIZATION ---
  useEffect(() => {
    if (currentUser) {
      console.log('[App] 🔔 Initializing Firebase Messaging for user:', currentUser.id);

      // Request permission and get token
      NotificationService.requestPermissionAndGetToken(currentUser.id);

      // Listen for foreground messages
      NotificationService.listenForMessages();
    }
  }, [currentUser?.id]);


  // --- 0. INITIAL LOCATION FETCH (Rider) ---
  useEffect(() => {
    if (currentUser?.role === UserRole.RIDER && !pickupCoords) {
      console.log('[GPS] 📍 Fetching initial user location...');
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          (position) => {
            const { latitude, longitude } = position.coords;
            console.log('[GPS] ✅ Found location:', latitude, longitude);
            if (isMounted.current) {
              setPickupCoords({ lat: latitude, lng: longitude });
              // We keep "Current Location" as text but now it has backing coords
            }
          },
          (error) => {
            console.warn('[GPS] ⚠️ Could not get location:', error);
          },
          { enableHighAccuracy: true, timeout: 10000 }
        );
      }
    }
  }, [currentUser, pickupCoords]);


  // --- 1. TRIP MANAGEMENT (Realtime + Polling Backup) ---
  useEffect(() => {
    if (!currentTrip) {
      // Cleanup subscription if no trip
      if (tripSubscriptionRef.current) {
        console.log('[App] 🧹 Cleaning up trip subscription (no trip)');
        tripSubscriptionRef.current.unsubscribe();
        tripSubscriptionRef.current = null;
      }
      return;
    }

    console.log('[App] 📡 Setting up trip subscription:', currentTrip.id);

    // Subscribe to realtime updates
    tripSubscriptionRef.current = supabase.subscribe(`trip-${currentTrip.id}`, (data) => {
      if (!isMounted.current) return;

      if (data.event === 'trip_updated') {
        const newTrip = data.payload.trip;

        // Prevent stale updates from overwriting recent local changes
        const timeSinceLocalUpdate = Date.now() - lastLocalUpdateRef.current;
        if (timeSinceLocalUpdate < 2000 && newTrip.status !== currentTrip.status) {
          console.log('[App] ⏱️ Ignoring potentially stale realtime update');
          return;
        }

        console.log('[App] 🔄 Realtime trip update:', newTrip.status);
        setCurrentTrip(newTrip);

        // If trip was cancelled remotely, clear it
        if (newTrip.status === TripStatus.IDLE) {
          setCurrentTrip(null);
        }
      } else if (data.event === 'location_update') {
        setCurrentTrip(prev => prev ? ({ ...prev, driverLocation: data.payload }) : null);
      }
    });

    // Polling fallback for SEARCHING status (most critical phase)
    const shouldPoll = currentTrip.status === TripStatus.SEARCHING;
    let poller: NodeJS.Timeout | null = null;

    if (shouldPoll) {
      console.log('[App] 📡 Starting polling fallback for SEARCHING status');
      poller = setInterval(async () => {
        if (!isMounted.current) return;

        // Don't poll if we just updated locally
        if (Date.now() - lastLocalUpdateRef.current < 5000) return;

        try {
          const freshTrip = await supabase.getTripById(currentTrip.id);
          if (freshTrip) {
            // Only update if critical fields changed
            if (freshTrip.status !== currentTrip.status || freshTrip.driverId !== currentTrip.driverId) {
              console.log('[App] 🔄 Polling detected change:', freshTrip.status);
              setCurrentTrip(freshTrip);
            }
          }
        } catch (err) {
          console.warn('[App] ⚠️ Polling failed:', err);
        }
      }, 3000);
    }

    return () => {
      console.log('[App] 🧹 Cleaning up trip subscription');
      if (tripSubscriptionRef.current) {
        tripSubscriptionRef.current.unsubscribe();
        tripSubscriptionRef.current = null;
      }
      if (poller) {
        clearInterval(poller);
      }
    };
  }, [currentTrip?.id, currentTrip?.status, currentTrip?.driverId]);

  // --- Setup WebRTC Listener when trip becomes active ---
  useEffect(() => {
    if (!currentUser || !currentTrip) {
      // Cleanup if no trip
      if (rtcServiceRef.current) {
        console.log('[App] 🧹 Cleaning up WebRTC (no trip)');
        rtcServiceRef.current.destroy();
        rtcServiceRef.current = null;
      }
      return;
    }

    // Only setup listener for accepted trips or later
    if (currentTrip.status === TripStatus.SEARCHING) {
      return;
    }

    const targetUserId = currentUser.role === UserRole.RIDER
      ? currentTrip.driverId
      : currentTrip.riderId;

    if (!targetUserId) {
      console.warn('[App] ⚠️ No target user for WebRTC');
      return;
    }

    console.log('[App] 🎧 Setting up WebRTC listener for trip:', currentTrip.id);

    const rtc = new WebRTCService(
      currentTrip.id,
      currentUser.id,
      targetUserId
    );

    rtc.onIncomingCall(() => {
      console.log('[App] 📞 INCOMING CALL!');
      if (isMounted.current) {
        setHasIncomingCall(true);
      }
    });

    rtc.startListening().catch(error => {
      console.error('[App] ❌ Failed to start call listener:', error);
    });

    rtcServiceRef.current = rtc;

    return () => {
      console.log('[App] 🧹 Cleaning up WebRTC listener');
      if (rtc) {
        rtc.destroy();
      }
    };
  }, [currentUser?.id, currentTrip?.id, currentTrip?.status, currentTrip?.driverId, currentTrip?.riderId]);

  // --- Driver Online Status & Trip Subscription ---
  useEffect(() => {
    if (!currentUser || currentUser.role !== UserRole.DRIVER) {
      // Cleanup driver subscription if not a driver
      if (driverSubscriptionRef.current) {
        console.log('[App] 🧹 Cleaning up driver subscription (not driver)');
        driverSubscriptionRef.current.unsubscribe();
        driverSubscriptionRef.current = null;
      }
      return;
    }

    console.log('🚕 Setting up driver mode...');

    const setupDriver = async () => {
      try {
        // Mark driver as online
        await supabase.setDriverOnline(currentUser.id, true);
        console.log('[App] ✅ Driver marked as online');

        // Subscribe to available trips
        driverSubscriptionRef.current = supabase.subscribeToAvailableTrips((trip) => {
          if (!isMounted.current) return;

          console.log('[App] 📡 New trip notification:', trip.id);

          // Only show if we aren't in a trip AND trip is actually still searching
          if (!currentTrip && trip.status === TripStatus.SEARCHING && !trip.driverId) {
            console.log('[App] ✅ Showing trip to driver');
            setAvailableTrip(trip);
          } else {
            console.log('[App] 🗑️ Ignoring trip (already in trip or trip taken)');
          }
        });

        console.log('[App] ✅ Driver subscription active');
      } catch (error) {
        console.error('[App] ❌ Error setting up driver:', error);
      }
    };

    setupDriver();

    return () => {
      console.log('[App] 🧹 Cleaning up driver mode');
      if (driverSubscriptionRef.current) {
        driverSubscriptionRef.current.unsubscribe();
        driverSubscriptionRef.current = null;
      }
      if (currentUser) {
        supabase.setDriverOnline(currentUser.id, false).catch(console.error);
      }
    };
  }, [currentUser?.id, currentUser?.role, currentTrip]);

  // --- Real Driver Location Tracking (GPS) ---
  useEffect(() => {
    // Only track if driver in active trip
    if (
      !currentUser ||
      currentUser.role !== UserRole.DRIVER ||
      !currentTrip ||
      (currentTrip.status !== TripStatus.ACCEPTED && currentTrip.status !== TripStatus.IN_PROGRESS)
    ) {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
        console.log('[GPS] ❌ Stopped tracking (conditions not met)');
      }
      return;
    }

    console.log('[GPS] ✅ Starting location tracking...');

    if (navigator.geolocation) {
      watchIdRef.current = navigator.geolocation.watchPosition(
        async (position) => {
          const { latitude, longitude, heading } = position.coords;

          try {
            await supabase.updateDriverLocation(currentUser.id, {
              lat: latitude,
              lng: longitude,
              bearing: heading || 0
            });
          } catch (error) {
            console.error('[GPS] ❌ Error updating location:', error);
          }
        },
        (error) => {
          console.error('[GPS] ❌ Geolocation error:', error);
        },
        {
          enableHighAccuracy: true,
          maximumAge: 10000,
          timeout: 5000
        }
      );
    } else {
      console.error('[GPS] ❌ Geolocation not supported');
    }

    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
        console.log('[GPS] 🧹 Stopped tracking');
      }
    };
  }, [currentUser, currentTrip]);

  // --- Helper: Cleanup all connections ---
  const cleanupAllConnections = () => {
    console.log('[App] 🧹 Cleaning up all connections...');

    setCurrentUser(null);
    setCurrentTrip(null);
    setAvailableTrip(null);
    setIsCallModalOpen(false);
    setHasIncomingCall(false);
    setLocalStream(null);
    setRemoteStream(null);
    setCurrentTab('home');

    if (rtcServiceRef.current) {
      rtcServiceRef.current.destroy();
      rtcServiceRef.current = null;
    }

    if (tripSubscriptionRef.current) {
      tripSubscriptionRef.current.unsubscribe();
      tripSubscriptionRef.current = null;
    }

    if (driverSubscriptionRef.current) {
      driverSubscriptionRef.current.unsubscribe();
      driverSubscriptionRef.current = null;
    }
  };

  const logout = async () => {
    try {
      console.log('👋 Logging out...');
      cleanupAllConnections();
      await authService.signOut();
      console.log('✅ Logout complete');
    } catch (error) {
      console.error('❌ Logout error:', error);
    }
  };

  // --- Trip Handlers ---
  const requestTrip = async () => {
    if (!currentUser) return;

    if (!pickupInput || !destinationInput) {
      setRequestError('Please select both pickup and destination');
      return;
    }

    setIsRequesting(true);
    setRequestError(undefined);

    try {
      console.log('[App] 🚕 Requesting trip...');
      const trip = await supabase.createTrip(
        currentUser.id,
        pickupInput,
        destinationInput,
        pickupCoords,
        destinationCoords
      );

      console.log('[App] ✅ Trip created:', trip.id);
      setCurrentTrip(trip);

      // Trigger notification for available drivers
      console.log('[App] 📣 Sending trip notification to drivers...');
      addToast('info', '🚗 Trip Requested', 'Finding available drivers near you...');
      await NotificationService.sendTripNotification(trip);
      console.log('[App] ✅ Trip notification sent successfully');


    } catch (error: any) {
      console.error('[App] ❌ Trip request failed:', error);
      setRequestError(error.message || 'Failed to request trip. Please try again.');
    } finally {
      setIsRequesting(false);
    }
  };

  const acceptTrip = async () => {
    if (!availableTrip || !currentUser) return;

    console.log('[App] 🤝 Accepting trip:', availableTrip.id);

    // Optimistically hide the available trip immediately
    setAvailableTrip(null);

    try {
      const trip = await supabase.acceptTrip(availableTrip.id, currentUser.id);

      if (trip) {
        console.log('[App] ✅ Trip accepted successfully');
        setCurrentTrip(trip);
        addToast('success', '✅ Trip Accepted', 'Driver has accepted your trip request!');
        
        // Send notification to rider that trip was accepted
        if (trip.riderId) {
          console.log('[App] 📣 Sending acceptance notification to rider...');
          await NotificationService.sendCallNotification(trip.riderId, currentUser.name || 'Driver');
        }
      } else {
        // Trip was taken by another driver
        console.log('[App] ⚠️ Trip no longer available');
        alert('This trip was accepted by another driver.');
      }
    } catch (error) {
      console.error('[App] ❌ Accept trip error:', error);
      alert('Failed to accept trip. Please try again.');
    }
  };

  const updateTripStatus = async (status: TripStatus) => {
    if (!currentTrip) {
      console.error('[App] ❌ Cannot update status: No active trip');
      return;
    }

    // Handle ending trip
    if (status === TripStatus.IDLE) {
      console.log('[App] 🏁 Ending trip');
      
      // Send completion notification to the other user
      if (currentTrip.riderId && currentUser?.role === UserRole.DRIVER) {
        console.log('[App] 📣 Sending trip completion notification to rider...');
        addToast('success', '✅ Trip Completed', 'Trip has been completed successfully!');
        await NotificationService.sendTripCompletedNotification(currentTrip.riderId, currentUser.name || 'Driver');
      } else if (currentTrip.driverId && currentUser?.role === UserRole.RIDER) {
        console.log('[App] 📣 Sending trip completion notification to driver...');
        addToast('success', '✅ Trip Completed', 'Thank you for riding with us!');
        await NotificationService.sendTripCompletedNotification(currentTrip.driverId, currentUser.name || 'Rider');
      }
      
      if (rtcServiceRef.current) {
        rtcServiceRef.current.destroy();
        rtcServiceRef.current = null;
      }
      setCurrentTrip(null);
      return;
    }

    console.log(`[App] 🔄 Updating trip status: ${currentTrip.status} → ${status}`);

    // Track local update time
    lastLocalUpdateRef.current = Date.now();

    // Optimistic update
    const previousTrip = { ...currentTrip };
    setCurrentTrip(prev => prev ? ({ ...prev, status }) : null);

    try {
      const updatedTrip = await supabase.updateTripStatus(currentTrip.id, status);

      if (updatedTrip) {
        console.log('[App] ✅ Trip status updated successfully');
        setCurrentTrip(updatedTrip);
      } else {
        // Rollback
        console.error('[App] ❌ Status update failed, reverting');
        setCurrentTrip(previousTrip);
        alert('Failed to update trip status. Please check your connection.');
      }
    } catch (error) {
      console.error('[App] ❌ Status update error:', error);
      setCurrentTrip(previousTrip);
      alert('Failed to update trip status.');
    }
  };

  // --- LOCATION SELECTION HANDLER ---
  const handleLocationSelect = async (name: string, coords: { lat: number, lng: number }) => {
    console.log('[App] 📍 Location selected:', name);
    setDestinationInput(name);
    setDestinationCoords(coords);

    // Optionally reverse geocode if the name is just coordinates
    if (name.includes('Selected Location')) {
      try {
        const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${coords.lat}&lon=${coords.lng}`);
        const data = await res.json();
        if (data && data.display_name) {
          setDestinationInput(data.display_name.split(',')[0]); // Shorten address
        }
      } catch (err) {
        console.warn('Reverse geocode failed:', err);
      }
    }
  };

  // --- Call Handlers ---
  const initiateCall = async () => {
    if (!rtcServiceRef.current) {
      console.error('[App] ❌ Cannot initiate call: WebRTC not ready');
      alert('Call service not ready. Please wait a moment.');
      return;
    }

    console.log('[App] 📞 Initiating call...');
    setIsCallModalOpen(true);
    setIsCalling(true);

    rtcServiceRef.current.onRemoteStream((stream) => {
      console.log('[App] ✅ Remote stream received');
      if (isMounted.current) {
        setRemoteStream(stream);
        setIsCalling(false);
      }
    });

    rtcServiceRef.current.onCallEnd(() => {
      console.log('[App] 📞 Call ended');
      if (isMounted.current) {
        setIsCallModalOpen(false);
        setLocalStream(null);
        setRemoteStream(null);
        setIsCalling(false);
        setHasIncomingCall(false);
      }
    });

    try {
      const stream = await rtcServiceRef.current.initiateCall();
      if (isMounted.current) {
        setLocalStream(stream);
        console.log('[App] ✅ Local stream started');

        // Trigger call notification for the other peer
        if (currentTrip) {
          const targetId = currentUser.role === UserRole.RIDER ? currentTrip.driverId : currentTrip.riderId;
          if (targetId) {
            NotificationService.sendCallNotification(targetId, currentUser.name);
          }
        }
      }

    } catch (err: any) {
      console.error("[App] ❌ Call initiation failed:", err);
      if (isMounted.current) {
        setIsCallModalOpen(false);
        setIsCalling(false);
        alert(err.message || 'Failed to start call. Please check permissions.');
      }
    }
  };

  const answerCall = async () => {
    if (!rtcServiceRef.current) {
      console.error('[App] ❌ Cannot answer: WebRTC not ready');
      return;
    }

    console.log('[App] 📞 Answering call...');
    setHasIncomingCall(false);
    setIsCallModalOpen(true);
    setIsCalling(true);

    rtcServiceRef.current.onRemoteStream((stream) => {
      console.log('[App] ✅ Remote stream received');
      if (isMounted.current) {
        setRemoteStream(stream);
        setIsCalling(false);
      }
    });

    rtcServiceRef.current.onCallEnd(() => {
      console.log('[App] 📞 Call ended');
      if (isMounted.current) {
        setIsCallModalOpen(false);
        setLocalStream(null);
        setRemoteStream(null);
        setIsCalling(false);
        setHasIncomingCall(false);
      }
    });

    try {
      const stream = await rtcServiceRef.current.answerCall();
      if (isMounted.current) {
        setLocalStream(stream);
        console.log('[App] ✅ Local stream started');
      }
    } catch (err: any) {
      console.error("[App] ❌ Answer call failed:", err);
      if (isMounted.current) {
        setIsCallModalOpen(false);
        setIsCalling(false);
        setHasIncomingCall(false);
        alert(err.message || 'Failed to answer call.');
      }
    }
  };

  const endCall = () => {
    console.log('[App] 📱 Ending call');
    if (rtcServiceRef.current) {
      rtcServiceRef.current.endCall();
    }
    setIsCallModalOpen(false);
    setLocalStream(null);
    setRemoteStream(null);
    setIsCalling(false);
    setHasIncomingCall(false);
  };

  // --- Loading State ---
  if (isAuthLoading) {
    return (
      <div className="min-h-screen bg-zinc-900 flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="w-16 h-16 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto"></div>
          <p className="text-white text-xl font-medium">Loading Adaidaita...</p>
        </div>
      </div>
    );
  }

  // --- Auth Error State ---
  if (authError) {
    return (
      <div className="min-h-screen bg-zinc-900 flex items-center justify-center p-6">
        <div className="text-center space-y-4 max-w-md">
          <div className="text-red-500 text-6xl mb-4">⚠️</div>
          <h2 className="text-white text-2xl font-bold">Something Went Wrong</h2>
          <p className="text-zinc-400">{authError}</p>
          <button
            onClick={() => window.location.reload()}
            className="mt-4 px-6 py-3 bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 transition-colors"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  // --- Render Unauthenticated ---
  if (!currentUser) {
    return (
      <AuthModal onSuccess={() => {
        // Refresh user data after successful login
        authService.getCurrentUser().then(user => {
          if (user && isMounted.current) {
            setCurrentUser(user);
          }
        });
      }} />
    );
  }

  // --- Render Authenticated App ---
  return (
    <div className="flex flex-col h-screen bg-white relative overflow-hidden font-sans">
      <NotificationToast toasts={toasts} onRemove={removeToast} />

      {currentTab === 'home' && (
        <Header user={currentUser} onLogout={logout} />
      )}

      <div className="flex-1 relative">

        <div
          className="absolute inset-0 flex flex-col"
          style={{
            visibility: currentTab === 'home' ? 'visible' : 'hidden',
            pointerEvents: currentTab === 'home' ? 'auto' : 'none'
          }}
        >
          <div className="absolute inset-0 z-0">
            <MapVisualizer
              role={currentUser.role}
              driverLocation={currentTrip?.driverLocation}
              pickup={currentTrip?.pickup || pickupInput}
              destination={currentTrip?.destination || destinationInput}
              pickupCoords={pickupCoords}
              destinationCoords={destinationCoords}
              isSearching={currentTrip?.status === TripStatus.SEARCHING}
              onLocationSelect={handleLocationSelect}
            />
          </div>

          {/* Incoming Call Notification */}
          {hasIncomingCall && !isCallModalOpen && (
            <div className="absolute top-24 left-4 right-4 z-50 md:left-auto md:right-8 md:w-96">
              <div className="bg-emerald-600 text-white rounded-2xl shadow-2xl p-6 animate-in slide-in-from-top duration-500">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 bg-white/20 rounded-full flex items-center justify-center animate-pulse">
                      <span className="text-2xl">📞</span>
                    </div>
                    <div>
                      <h3 className="font-bold text-lg">Incoming Call</h3>
                      <p className="text-emerald-100 text-sm">
                        {currentUser.role === UserRole.RIDER ? 'Driver' : 'Rider'} is calling...
                      </p>
                    </div>
                  </div>
                </div>

                <div className="flex gap-3">
                  <button
                    onClick={() => setHasIncomingCall(false)}
                    className="flex-1 px-4 py-3 bg-white/20 text-white font-semibold rounded-xl hover:bg-white/30 transition-colors"
                  >
                    Decline
                  </button>
                  <button
                    onClick={answerCall}
                    className="flex-1 px-4 py-3 bg-white text-emerald-600 font-semibold rounded-xl hover:bg-emerald-50 transition-colors shadow-lg"
                  >
                    Answer
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Driver Trip Request */}
          {currentUser.role === UserRole.DRIVER && availableTrip && !currentTrip && (
            <div className="absolute top-24 left-4 right-4 z-40 md:left-auto md:right-8 md:w-96">
              <div className="bg-white rounded-2xl shadow-2xl border-2 border-emerald-500 p-6 animate-in slide-in-from-top duration-500">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-emerald-100 rounded-full flex items-center justify-center text-emerald-600">
                      <span className="text-xl">🚕</span>
                    </div>
                    <div>
                      <h3 className="font-bold text-zinc-900">New Trip Request!</h3>
                      <p className="text-sm text-zinc-500">{availableTrip.fare} NGN</p>
                    </div>
                  </div>
                  <span className="bg-emerald-100 text-emerald-800 text-xs font-bold px-2 py-1 rounded-full animate-pulse">
                    NEW
                  </span>
                </div>

                <div className="space-y-3 mb-6">
                  <div className="flex items-center gap-3 text-zinc-700">
                    <span className="text-sm">📍</span>
                    <span className="text-sm font-medium">{availableTrip.pickup}</span>
                  </div>
                  <div className="flex items-center gap-3 text-zinc-700">
                    <span className="text-sm">📍</span>
                    <span className="text-sm font-medium">{availableTrip.destination}</span>
                  </div>
                </div>

                <div className="flex gap-3">
                  <button
                    onClick={() => setAvailableTrip(null)}
                    className="flex-1 px-4 py-3 bg-zinc-100 text-zinc-700 font-semibold rounded-xl hover:bg-zinc-200 transition-colors"
                  >
                    Decline
                  </button>
                  <button
                    onClick={acceptTrip}
                    className="flex-1 px-4 py-3 bg-emerald-600 text-white font-semibold rounded-xl hover:bg-emerald-700 transition-colors shadow-lg"
                  >
                    Accept
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Bottom Controls */}
          <div className="absolute bottom-20 left-0 right-0 z-40 p-4 md:max-w-md md:mx-auto md:bottom-28">

            {currentUser.role === UserRole.RIDER && !currentTrip && (
              <RideRequestPanel
                pickup={pickupInput}
                setPickup={setPickupInput}
                destination={destinationInput}
                setDestination={setDestinationInput}
                onRequest={requestTrip}
                isLoading={isRequesting}
                error={requestError}
              />
            )}

            {currentTrip && (
              <TripStatusPanel
                trip={currentTrip}
                userRole={currentUser.role}
                onStatusUpdate={updateTripStatus}
                onCall={initiateCall}
              />
            )}

            {currentUser.role === UserRole.DRIVER && !currentTrip && !availableTrip && (
              <div className="bg-white rounded-2xl shadow-xl p-6 text-center border border-zinc-100">
                <div className="w-16 h-16 bg-emerald-50 rounded-full flex items-center justify-center mx-auto mb-4 animate-pulse">
                  <span className="text-3xl">🚕</span>
                </div>
                <h3 className="text-xl font-bold text-zinc-900">You are Online</h3>
                <p className="text-zinc-500 mt-1">Waiting for ride requests...</p>
              </div>
            )}
          </div>
        </div>

        {currentTab === 'services' && <Services />}
        {currentTab === 'account' && <Account user={currentUser} onLogout={logout} />}
      </div>

      {isCallModalOpen && (
        <CallModal
          localStream={localStream}
          remoteStream={remoteStream}
          onEndCall={endCall}
          isConnecting={isCalling}
          remoteUserName={currentUser.role === UserRole.RIDER ? "Driver" : "Rider"}
        />
      )}

      <BottomNav
        currentTab={currentTab}
        onTabChange={setCurrentTab}
        hasActiveTrip={!!currentTrip}
      />
    </div>
  );
};

export default App;
