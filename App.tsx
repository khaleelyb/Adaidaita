import React, { useState, useEffect, useRef } from 'react';
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
import { Car, MapPin, Navigation, Phone } from 'lucide-react';

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
  const [pickupInput, setPickupInput] = useState('Central Market');
  const [destinationInput, setDestinationInput] = useState('');
  const [isRequesting, setIsRequesting] = useState(false);
  const [requestError, setRequestError] = useState<string | undefined>(undefined);
  const [isCallModalOpen, setIsCallModalOpen] = useState(false);
  const [isCalling, setIsCalling] = useState(false);
  const [hasIncomingCall, setHasIncomingCall] = useState(false);
  
  // WebRTC State
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const rtcServiceRef = useRef<WebRTCService | null>(null);
  
  // Refs
  const isMounted = useRef(true);
  const authSubscriptionRef = useRef<any>(null);

  // --- Auth Handlers ---
  useEffect(() => {
    isMounted.current = true;
    
    const initAuth = async () => {
      try {
        console.log('🔍 Starting auth initialization...');
        
        const timeoutId = setTimeout(() => {
          if (isMounted.current && isAuthLoading) {
            console.warn('⚠️ Auth check timeout - forcing completion');
            setIsAuthLoading(false);
          }
        }, 5000);

        const user = await authService.getCurrentUser();
        
        clearTimeout(timeoutId);

        if (!isMounted.current) return;

        if (user) {
          console.log('✅ User session restored:', user.email);
          setCurrentUser(user);
        } else {
          console.log('ℹ️ No active session - showing login');
        }
        setIsAuthLoading(false);

      } catch (error) {
        console.error('❌ Auth initialization error:', error);
        if (isMounted.current) {
          setIsAuthLoading(false);
          setAuthError('Failed to load. Please try again.');
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
      }
    });

    return () => {
      isMounted.current = false;
      if (authSubscriptionRef.current?.subscription) {
        authSubscriptionRef.current.subscription.unsubscribe();
      }
    };
  }, []);

  // --- 1. TRIP MANAGEMENT (Realtime + Polling) ---
  // This replaces the ad-hoc subscription in requestTrip with a robust persistent listener
  useEffect(() => {
    if (!currentTrip) return;

    // A. Realtime Subscription
    console.log('[App] 📡 Subscribing to trip updates:', currentTrip.id);
    const subscription = supabase.subscribe(`trip-${currentTrip.id}`, (data) => {
      if (data.event === 'trip_updated') {
        console.log('[App] 🔄 Realtime update:', data.payload.trip.status);
        setCurrentTrip(data.payload.trip);
      } else if (data.event === 'location_update') {
        setCurrentTrip(prev => prev ? ({ ...prev, driverLocation: data.payload }) : null);
      }
    });

    // B. Polling Fallback (For robustness against socket drops)
    // Poll every 3s if searching (critical), 10s if active (less critical)
    const pollInterval = currentTrip.status === TripStatus.SEARCHING ? 3000 : 10000;
    
    const poller = setInterval(async () => {
      if (!isMounted.current) return;
      
      try {
        const freshTrip = await supabase.getTripById(currentTrip.id);
        if (freshTrip) {
          // Check if status changed or driver assigned (sync drift)
          if (freshTrip.status !== currentTrip.status || freshTrip.driverId !== currentTrip.driverId) {
            console.log('[App] 📥 Polling sync mismatch found. Updating...');
            setCurrentTrip(freshTrip);
          }
        }
      } catch (err) {
        console.warn('[App] Polling failed', err);
      }
    }, pollInterval);

    return () => {
      console.log('[App] 🔌 Unsubscribing trip updates');
      subscription.unsubscribe();
      clearInterval(poller);
    };
  }, [currentTrip?.id, currentTrip?.status, currentTrip?.driverId]);

  // --- Setup WebRTC Listener when trip becomes active ---
  useEffect(() => {
    if (!currentUser || !currentTrip) return;
    
    // Only setup listener for accepted trips or later
    if (currentTrip.status === TripStatus.SEARCHING) return;

    const targetUserId = currentUser.role === UserRole.RIDER 
      ? currentTrip.driverId 
      : currentTrip.riderId;

    if (!targetUserId) {
      // If we don't have a target user yet, we can't connect
      return;
    }

    console.log('[App] 🎧 Setting up call listener for trip:', currentTrip.id);

    // Create WebRTC service and start listening
    const rtc = new WebRTCService(
      currentTrip.id,
      currentUser.id,
      targetUserId
    );

    rtc.onIncomingCall(() => {
      console.log('[App] 🔔 INCOMING CALL!');
      if (isMounted.current) {
        setHasIncomingCall(true);
      }
    });

    rtc.startListening().catch(error => {
      console.error('[App] ❌ Failed to start call listener:', error);
    });

    rtcServiceRef.current = rtc;

    return () => {
      console.log('[App] 🧹 Cleaning up call listener');
      if (rtc) {
        rtc.destroy();
      }
    };
  }, [currentUser?.id, currentTrip?.id, currentTrip?.status]);

  // --- Driver Online Status & Trip Subscription ---
  useEffect(() => {
    if (!currentUser || currentUser.role !== UserRole.DRIVER) return;

    console.log('🚕 Setting up driver mode...');
    
    let subscription: { unsubscribe: () => void } | null = null;

    const setupDriver = async () => {
      try {
        await supabase.setDriverOnline(currentUser.id, true);

        subscription = supabase.subscribeToAvailableTrips((trip) => {
          console.log('📡 New trip available:', trip);
          // Only show available trip if we aren't currently in one
          if (!currentTrip) {
            setAvailableTrip(trip);
          }
        });
      } catch (error) {
        console.error('Error setting up driver:', error);
      }
    };

    setupDriver();

    return () => {
      if (subscription) {
        subscription.unsubscribe();
      }
      supabase.setDriverOnline(currentUser.id, false).catch(console.error);
    };
  }, [currentUser?.id, currentUser?.role, currentTrip]);

  const logout = async () => {
    try {
      console.log('👋 Logging out...');
      
      // Clean up WebRTC
      if (rtcServiceRef.current) {
        rtcServiceRef.current.destroy();
        rtcServiceRef.current = null;
      }
      
      // Clear state
      setCurrentUser(null);
      setCurrentTrip(null);
      setAvailableTrip(null);
      setIsCallModalOpen(false);
      setHasIncomingCall(false);
      setLocalStream(null);
      setRemoteStream(null);
      setCurrentTab('home');
      
      // Sign out
      await authService.signOut();
      
      console.log('✅ Logout complete');
    } catch (error) {
      console.error('Error logging out:', error);
    }
  };

  // --- Trip Handlers ---
  const requestTrip = async () => {
    if (!currentUser) return;
    setIsRequesting(true);
    setRequestError(undefined);
    
    try {
      const trip = await supabase.createTrip(currentUser.id, pickupInput, destinationInput);
      // We just set the trip here. The useEffect above handles the subscription automatically.
      setCurrentTrip(trip);
      
    } catch (error: any) {
      console.error('Error requesting trip:', error);
      setRequestError(error.message || 'Failed to request trip. Please try again.');
    } finally {
      setIsRequesting(false);
    }
  };

  const acceptTrip = async () => {
    if (!availableTrip || !currentUser) return;

    try {
      const trip = await supabase.acceptTrip(availableTrip.id, currentUser.id);
      if (trip) {
        setCurrentTrip(trip);
        setAvailableTrip(null);
        // Again, subscription is handled by the useEffect automatically
      } else {
        // If accept returns null, it likely failed or trip was taken
        setAvailableTrip(null);
        alert('This trip is no longer available.');
      }
    } catch (error) {
      console.error('Error accepting trip:', error);
      alert('Failed to accept trip. Please try again.');
    }
  };

  const updateTripStatus = async (status: TripStatus) => {
    if (!currentTrip) {
      console.error('Cannot update status: No active trip');
      return;
    }

    // Handle idle status (cancelling/ending trip)
    if (status === TripStatus.IDLE) {
      if (rtcServiceRef.current) {
        rtcServiceRef.current.destroy();
        rtcServiceRef.current = null;
      }
      setCurrentTrip(null);
      return;
    }
    
    console.log(`Updating trip status from ${currentTrip.status} to ${status}`);

    // OPTIMISTIC UPDATE: Update UI immediately
    const previousTrip = { ...currentTrip };
    setCurrentTrip(prev => prev ? ({ ...prev, status }) : null);

    try {
      // Send update to server
      const updatedTrip = await supabase.updateTripStatus(currentTrip.id, status);
      
      if (updatedTrip) {
        // Sync with server response
        setCurrentTrip(updatedTrip);
      } else {
        // Rollback if failed
        console.error('Server returned null for status update, reverting...');
        setCurrentTrip(previousTrip);
        alert('Failed to update trip status. Please check your connection.');
      }
    } catch (error) {
      console.error('Error updating trip status:', error);
      // Rollback on error
      setCurrentTrip(previousTrip);
      alert('Failed to update trip status.');
    }
  };

  // --- Call Handlers ---
  const initiateCall = async () => {
    if (!rtcServiceRef.current) {
      console.error('[App] Cannot initiate call: WebRTC service not initialized');
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
      }
    } catch (err: any) {
      console.error("[App] Failed to initiate call:", err);
      if (isMounted.current) {
        setIsCallModalOpen(false);
        setIsCalling(false);
        alert(err.message || 'Failed to start call. Please check permissions.');
      }
    }
  };

  const answerCall = async () => {
    if (!rtcServiceRef.current) {
      console.error('[App] Cannot answer call: WebRTC service not initialized');
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
      console.error("[App] Failed to answer call:", err);
      if (isMounted.current) {
        setIsCallModalOpen(false);
        setIsCalling(false);
        setHasIncomingCall(false);
        alert(err.message || 'Failed to answer call.');
      }
    }
  };

  const endCall = () => {
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
    return <AuthModal onSuccess={() => {}} />;
  }

  // --- Render Authenticated App ---
  return (
    <div className="flex flex-col h-screen bg-white relative overflow-hidden font-sans">
      
      {/* Show Global Header only on Home tab */}
      {currentTab === 'home' && (
        <Header user={currentUser} onLogout={logout} />
      )}

      {/* Main Content Area */}
      <div className="flex-1 relative">
        
        {/* HOME TAB CONTENT (Map, Request, etc.) */}
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
              isSearching={currentTrip?.status === TripStatus.SEARCHING}
              onLocationSelect={setPickupInput}
            />
          </div>

          {/* Incoming Call Notification */}
          {hasIncomingCall && !isCallModalOpen && (
            <div className="absolute top-24 left-4 right-4 z-50 md:left-auto md:right-8 md:w-96">
              <div className="bg-emerald-600 text-white rounded-2xl shadow-2xl p-6 animate-in slide-in-from-top duration-500">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 bg-white/20 rounded-full flex items-center justify-center animate-pulse">
                      <Phone size={24} />
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

          {/* Driver Incoming Trip Request */}
          {currentUser.role === UserRole.DRIVER && availableTrip && !currentTrip && (
            <div className="absolute top-24 left-4 right-4 z-40 md:left-auto md:right-8 md:w-96">
              <div className="bg-white rounded-2xl shadow-2xl border-2 border-emerald-500 p-6 animate-in slide-in-from-top duration-500">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-emerald-100 rounded-full flex items-center justify-center text-emerald-600">
                      <Navigation size={20} />
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
                    <MapPin size={18} className="text-zinc-400" />
                    <span className="text-sm font-medium">{availableTrip.pickup}</span>
                  </div>
                  <div className="flex items-center gap-3 text-zinc-700">
                    <MapPin size={18} className="text-emerald-500" />
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

          {/* Bottom Controls for Home */}
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
                    <Car size={32} className="text-emerald-600" />
                  </div>
                  <h3 className="text-xl font-bold text-zinc-900">You are Online</h3>
                  <p className="text-zinc-500 mt-1">Waiting for ride requests...</p>
              </div>
            )}
          </div>
        </div>

        {/* SERVICES TAB */}
        {currentTab === 'services' && (
          <Services />
        )}

        {/* ACCOUNT TAB */}
        {currentTab === 'account' && (
          <Account user={currentUser} onLogout={logout} />
        )}
      </div>

      {/* Call Modal - Always visible if active */}
      {isCallModalOpen && (
        <CallModal 
          localStream={localStream}
          remoteStream={remoteStream}
          onEndCall={endCall}
          isConnecting={isCalling}
          remoteUserName={currentUser.role === UserRole.RIDER ? "Driver" : "Rider"}
        />
      )}

      {/* Bottom Navigation */}
      <BottomNav 
        currentTab={currentTab} 
        onTabChange={setCurrentTab} 
        hasActiveTrip={!!currentTrip}
      />
    </div>
  );
};

export default App;
