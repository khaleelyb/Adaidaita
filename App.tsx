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
import { Car, MapPin, Navigation, Phone } from 'lucide-react';

const App: React.FC = () => {
  // Global State
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [currentTrip, setCurrentTrip] = useState<Trip | null>(null);
  const [availableTrip, setAvailableTrip] = useState<Trip | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);
  
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
        console.log('馃攼 Starting auth initialization...');
        
        const timeoutId = setTimeout(() => {
          if (isMounted.current && isAuthLoading) {
            console.warn('鈿狅笍 Auth check timeout - forcing completion');
            setIsAuthLoading(false);
          }
        }, 5000);

        const user = await authService.getCurrentUser();
        
        clearTimeout(timeoutId);

        if (!isMounted.current) return;

        if (user) {
          console.log('鉁� User session restored:', user.email);
          setCurrentUser(user);
        } else {
          console.log('鈩癸笍 No active session - showing login');
        }
        setIsAuthLoading(false);

      } catch (error) {
        console.error('鉂� Auth initialization error:', error);
        if (isMounted.current) {
          setIsAuthLoading(false);
          setAuthError('Failed to load. Please try again.');
        }
      }
    };

    initAuth();

    authSubscriptionRef.current = authService.onAuthStateChange((user) => {
      if (!isMounted.current) return;
      
      console.log('馃攧 Auth state changed:', user ? user.email : 'Logged out');
      setCurrentUser(user);
      
      if (!user) {
        // Clean up everything on logout
        setCurrentTrip(null);
        setAvailableTrip(null);
        setIsCallModalOpen(false);
        setHasIncomingCall(false);
        setLocalStream(null);
        setRemoteStream(null);
        
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

  // --- Setup WebRTC Listener when trip becomes active ---
  useEffect(() => {
    if (!currentUser || !currentTrip) return;
    
    // Only setup listener for accepted trips or later
    if (currentTrip.status === TripStatus.SEARCHING) return;

    const targetUserId = currentUser.role === UserRole.RIDER 
      ? currentTrip.driverId 
      : currentTrip.riderId;

    if (!targetUserId) {
      console.warn('[App] Cannot setup call listener: missing target user');
      return;
    }

    console.log('[App] 馃帶 Setting up call listener for trip:', currentTrip.id);

    // Create WebRTC service and start listening
    const rtc = new WebRTCService(
      currentTrip.id,
      currentUser.id,
      targetUserId
    );

    rtc.onIncomingCall(() => {
      console.log('[App] 馃敂 INCOMING CALL!');
      if (isMounted.current) {
        setHasIncomingCall(true);
      }
    });

    rtc.startListening().catch(error => {
      console.error('[App] 鉂� Failed to start call listener:', error);
    });

    rtcServiceRef.current = rtc;

    return () => {
      console.log('[App] 馃Ч Cleaning up call listener');
      if (rtc) {
        rtc.destroy();
      }
    };
  }, [currentUser?.id, currentTrip?.id, currentTrip?.status]);

  // --- Driver Online Status & Trip Subscription ---
  useEffect(() => {
    if (!currentUser || currentUser.role !== UserRole.DRIVER) return;

    console.log('馃殫 Setting up driver mode...');
    
    let subscription: { unsubscribe: () => void } | null = null;

    const setupDriver = async () => {
      try {
        await supabase.setDriverOnline(currentUser.id, true);

        subscription = supabase.subscribeToAvailableTrips((trip) => {
          console.log('馃摙 New trip available:', trip);
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
      console.log('馃憢 Logging out...');
      
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
      
      // Sign out
      await authService.signOut();
      
      console.log('鉁� Logout complete');
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
      setCurrentTrip(trip);

      supabase.subscribe(`trip-${trip.id}`, (data) => {
        if (data.event === 'trip_updated') {
          setCurrentTrip(data.payload.trip);
        } else if (data.event === 'location_update') {
          setCurrentTrip(prev => prev ? ({ ...prev, driverLocation: data.payload }) : null);
        }
      });
      
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

        supabase.subscribe(`trip-${trip.id}`, (data) => {
          if (data.event === 'trip_updated') {
            setCurrentTrip(data.payload.trip);
          }
        });
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
    if (!currentTrip) return;

    if (status === TripStatus.IDLE) {
      // Clean up call listener when trip ends
      if (rtcServiceRef.current) {
        rtcServiceRef.current.destroy();
        rtcServiceRef.current = null;
      }
      setCurrentTrip(null);
      return;
    }
    
    try {
      await supabase.updateTripStatus(currentTrip.id, status);
      setCurrentTrip(prev => prev ? ({ ...prev, status }) : null);
    } catch (error) {
      console.error('Error updating trip status:', error);
    }
  };

  // --- Call Handlers ---
  const initiateCall = async () => {
    if (!rtcServiceRef.current) {
      console.error('[App] Cannot initiate call: WebRTC service not initialized');
      alert('Call service not ready. Please wait a moment.');
      return;
    }

    console.log('[App] 馃摓 Initiating call...');
    setIsCallModalOpen(true);
    setIsCalling(true);

    rtcServiceRef.current.onRemoteStream((stream) => {
      console.log('[App] 鉁� Remote stream received');
      if (isMounted.current) {
        setRemoteStream(stream);
        setIsCalling(false);
      }
    });

    rtcServiceRef.current.onCallEnd(() => {
      console.log('[App] 馃摓 Call ended');
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
        console.log('[App] 鉁� Local stream started');
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

    console.log('[App] 馃摓 Answering call...');
    setHasIncomingCall(false);
    setIsCallModalOpen(true);
    setIsCalling(true);

    rtcServiceRef.current.onRemoteStream((stream) => {
      console.log('[App] 鉁� Remote stream received');
      if (isMounted.current) {
        setRemoteStream(stream);
        setIsCalling(false);
      }
    });

    rtcServiceRef.current.onCallEnd(() => {
      console.log('[App] 馃摓 Call ended');
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
        console.log('[App] 鉁� Local stream started');
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
          <div className="text-red-500 text-6xl mb-4">鈿狅笍</div>
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
      
      <Header user={currentUser} onLogout={logout} />

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

      {/* Bottom Controls */}
      <div className="absolute bottom-0 left-0 right-0 z-30 p-4 md:max-w-md md:mx-auto md:bottom-8">
        
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

      {/* Call Modal */}
      {isCallModalOpen && (
        <CallModal 
          localStream={localStream}
          remoteStream={remoteStream}
          onEndCall={endCall}
          isConnecting={isCalling}
          remoteUserName={currentUser.role === UserRole.RIDER ? "Driver" : "Rider"}
        />
      )}
    </div>
  );
};

export default App;
