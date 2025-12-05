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
import { Car, MapPin, Navigation } from 'lucide-react';
import { Button } from './components/Button';

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
  const [isCallModalOpen, setIsCallModalOpen] = useState(false);
  const [isCalling, setIsCalling] = useState(false);
  
  // WebRTC State
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const rtcServiceRef = useRef<WebRTCService | null>(null);

  // --- Auth Handlers ---
  useEffect(() => {
    let isMounted = true;
    let authSubscription: { data: { subscription: any } } | null = null;

    const initAuth = async () => {
      try {
        console.log('🔐 Initializing authentication...');
        
        // Check for current session
        const user = await authService.getCurrentUser();
        
        if (isMounted) {
          if (user) {
            console.log('✅ User restored:', user.email);
            setCurrentUser(user);
          } else {
            console.log('ℹ️ No active session found');
          }
          setIsAuthLoading(false);
        }
      } catch (error) {
        console.error('❌ Auth initialization error:', error);
        if (isMounted) {
          setIsAuthLoading(false);
          setAuthError('Failed to initialize authentication');
        }
      }
    };

    // Initialize auth
    initAuth();

    // Listen for auth changes
    authSubscription = authService.onAuthStateChange((user) => {
      if (!isMounted) return;
      
      console.log('🔄 Auth state changed:', user ? user.email : 'Logged out');
      setCurrentUser(user);
      setIsAuthLoading(false);
      
      if (!user) {
        // Cleanup on logout
        setCurrentTrip(null);
        setAvailableTrip(null);
      }
    });

    return () => {
      isMounted = false;
      if (authSubscription) {
        authSubscription.data.subscription.unsubscribe();
      }
    };
  }, []); // Empty dependency array is fine here

  // --- Driver Online Status & Trip Subscription ---
  useEffect(() => {
    if (!currentUser || currentUser.role !== UserRole.DRIVER) return;

    console.log('🚗 Driver detected. Setting online and subscribing...');
    
    let subscription: { unsubscribe: () => void } | null = null;

    const setupDriver = async () => {
      // Set driver online
      await supabase.setDriverOnline(currentUser.id, true);

      // Subscribe to available trips
      subscription = supabase.subscribeToAvailableTrips((trip) => {
        console.log('📢 New trip available:', trip);
        // Only show if driver is not currently in a trip
        if (!currentTrip) {
          setAvailableTrip(trip);
        }
      });
    };

    setupDriver();

    return () => {
      if (subscription) {
        subscription.unsubscribe();
      }
      if (currentUser) {
        supabase.setDriverOnline(currentUser.id, false);
      }
    };
  }, [currentUser?.id, currentUser?.role, currentTrip]);

  const logout = async () => {
    try {
      await authService.signOut();
      setCurrentUser(null);
      setCurrentTrip(null);
      setAvailableTrip(null);
      setIsCallModalOpen(false);
    } catch (error) {
      console.error('Error logging out:', error);
    }
  };

  // --- Trip Handlers (Rider) ---
  const requestTrip = async () => {
    if (!currentUser) return;
    setIsRequesting(true);
    
    try {
      const trip = await supabase.createTrip(currentUser.id, pickupInput, destinationInput);
      setCurrentTrip(trip);

      // Subscribe to this specific trip updates
      const sub = supabase.subscribe(`trip-${trip.id}`, (data) => {
        if (data.event === 'trip_updated') {
          setCurrentTrip(data.payload.trip);
        } else if (data.event === 'location_update') {
          setCurrentTrip(prev => prev ? ({ ...prev, driverLocation: data.payload }) : null);
        }
      });
      
    } catch (error) {
      console.error('Error requesting trip:', error);
    } finally {
      setIsRequesting(false);
    }
  };

  // --- Trip Handlers (Driver) ---
  const acceptTrip = async () => {
    if (!availableTrip || !currentUser) return;

    try {
      const trip = await supabase.acceptTrip(availableTrip.id, currentUser.id);
      if (trip) {
        setCurrentTrip(trip);
        setAvailableTrip(null);

        // Subscribe to updates for this trip
        supabase.subscribe(`trip-${trip.id}`, (data) => {
          if (data.event === 'trip_updated') {
            setCurrentTrip(data.payload.trip);
          }
        });
      }
    } catch (error) {
      console.error('Error accepting trip:', error);
    }
  };

  // --- Shared Trip Status Updates ---
  const updateTripStatus = async (status: TripStatus) => {
    if (!currentTrip) return;

    if (status === TripStatus.IDLE) {
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

  // --- WebRTC Handlers ---
  const startCall = async () => {
    if (!currentTrip) return;

    setIsCallModalOpen(true);
    setIsCalling(true);

    const rtc = new WebRTCService(currentTrip.id);
    rtcServiceRef.current = rtc;

    rtc.onRemoteStream((stream) => {
      setRemoteStream(stream);
      setIsCalling(false);
    });

    rtc.onCallEnd(() => {
      setIsCallModalOpen(false);
      setLocalStream(null);
      setRemoteStream(null);
    });

    try {
      const stream = await rtc.startCall(true);
      setLocalStream(stream);
    } catch (err) {
      console.error("Failed to start call", err);
      setIsCallModalOpen(false);
      setIsCalling(false);
    }
  };

  const endCall = () => {
    rtcServiceRef.current?.endCall();
    setIsCallModalOpen(false);
    setLocalStream(null);
    setRemoteStream(null);
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
          <h2 className="text-white text-2xl font-bold">Authentication Error</h2>
          <p className="text-zinc-400">{authError}</p>
          <button
            onClick={() => window.location.reload()}
            className="mt-4 px-6 py-3 bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 transition-colors"
          >
            Reload App
          </button>
        </div>
      </div>
    );
  }

  // --- Render Unauthenticated ---
  if (!currentUser) {
    return <AuthModal onSuccess={() => {
      console.log('Login success callback triggered');
    }} />;
  }

  // --- Render Authenticated App ---
  return (
    <div className="flex flex-col h-screen bg-white relative overflow-hidden font-sans">
      
      {/* 1. Header Layer */}
      <Header user={currentUser} onLogout={logout} />

      {/* 2. Map Background Layer */}
      <div className="absolute inset-0 z-0">
        <MapVisualizer 
          role={currentUser.role} 
          driverLocation={currentTrip?.driverLocation}
          pickup={currentTrip?.pickup || (pickupInput && isRequesting ? pickupInput : pickupInput)}
          isSearching={currentTrip?.status === TripStatus.SEARCHING}
          onLocationSelect={setPickupInput}
        />
      </div>

      {/* 3. Driver Incoming Request Notification */}
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
                  <p className="text-sm text-zinc-500">{availableTrip.fare} NGN • 2.5 km</p>
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
                className="flex-1 px-4 py-3 bg-emerald-600 text-white font-semibold rounded-xl hover:bg-emerald-700 transition-colors shadow-lg shadow-emerald-200"
              >
                Accept Ride
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 4. Bottom Sheet / Control Layer */}
      <div className="absolute bottom-0 left-0 right-0 z-30 p-4 md:max-w-md md:mx-auto md:bottom-8">
        
        {/* Scenario A: Rider - No Trip */}
        {currentUser.role === UserRole.RIDER && !currentTrip && (
          <RideRequestPanel 
            pickup={pickupInput}
            setPickup={setPickupInput}
            destination={destinationInput}
            setDestination={setDestinationInput}
            onRequest={requestTrip}
            isLoading={isRequesting}
          />
        )}

        {/* Scenario B: Active Trip (Rider or Driver) */}
        {currentTrip && (
          <TripStatusPanel 
            trip={currentTrip}
            userRole={currentUser.role}
            onStatusUpdate={updateTripStatus}
            onCall={startCall}
          />
        )}

        {/* Scenario C: Driver - Idle (Online) */}
        {currentUser.role === UserRole.DRIVER && !currentTrip && !availableTrip && (
           <div className="bg-white rounded-2xl shadow-xl p-6 text-center border border-zinc-100">
              <div className="w-16 h-16 bg-emerald-50 rounded-full flex items-center justify-center mx-auto mb-4 animate-pulse">
                <Car size={32} className="text-emerald-600" />
              </div>
              <h3 className="text-xl font-bold text-zinc-900">You are Online</h3>
              <p className="text-zinc-500 mt-1">Waiting for nearby ride requests...</p>
           </div>
        )}
      </div>

      {/* 5. Full Screen Modal Layer */}
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
