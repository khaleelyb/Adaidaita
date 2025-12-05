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
    let authSubscription: any = null;

    const initAuth = async () => {
      try {
        console.log('🔐 Starting auth initialization...');
        
        // Add a timeout to prevent infinite loading
        const timeoutId = setTimeout(() => {
          if (isMounted && isAuthLoading) {
            console.warn('⚠️ Auth check timeout - forcing completion');
            setIsAuthLoading(false);
          }
        }, 5000);

        // Check for current session
        const user = await authService.getCurrentUser();
        
        clearTimeout(timeoutId);

        if (!isMounted) return;

        if (user) {
          console.log('✅ User session restored:', user.email);
          setCurrentUser(user);
        } else {
          console.log('ℹ️ No active session - showing login');
        }
        setIsAuthLoading(false);

      } catch (error) {
        console.error('❌ Auth initialization error:', error);
        if (isMounted) {
          setIsAuthLoading(false);
          setAuthError('Failed to load. Please try again.');
        }
      }
    };

    // Run auth check
    initAuth();

    // Setup auth state listener
    const setupAuthListener = async () => {
      authSubscription = authService.onAuthStateChange((user) => {
        if (!isMounted) return;
        
        console.log('🔄 Auth state changed:', user ? user.email : 'Logged out');
        setCurrentUser(user);
        
        if (!user) {
          setCurrentTrip(null);
          setAvailableTrip(null);
        }
      });
    };

    setupAuthListener();

    return () => {
      isMounted = false;
      if (authSubscription?.data?.subscription) {
        authSubscription.data.subscription.unsubscribe();
      }
    };
  }, []);

  // --- Driver Online Status & Trip Subscription ---
  useEffect(() => {
    if (!currentUser || currentUser.role !== UserRole.DRIVER) return;

    console.log('🚗 Setting up driver mode...');
    
    let subscription: { unsubscribe: () => void } | null = null;

    const setupDriver = async () => {
      try {
        await supabase.setDriverOnline(currentUser.id, true);

        subscription = supabase.subscribeToAvailableTrips((trip) => {
          console.log('📢 New trip available:', trip);
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

      supabase.subscribe(`trip-${trip.id}`, (data) => {
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
    if (!currentTrip || !currentUser) return;

    // Determine who we're calling
    const isRider = currentUser.role === UserRole.RIDER;
    const targetUserId = isRider ? currentTrip.driverId : currentTrip.riderId;

    if (!targetUserId) {
      console.error('Cannot start call: missing target user ID');
      return;
    }

    console.log('📞 Starting call...', {
      from: currentUser.id,
      to: targetUserId,
      tripId: currentTrip.id
    });

    setIsCallModalOpen(true);
    setIsCalling(true);

    // Create WebRTC service with proper user IDs
    const rtc = new WebRTCService(
      currentTrip.id,
      currentUser.id,
      targetUserId
    );
    rtcServiceRef.current = rtc;

    rtc.onRemoteStream((stream) => {
      console.log('✅ Remote stream received');
      setRemoteStream(stream);
      setIsCalling(false);
    });

    rtc.onCallEnd(() => {
      console.log('📞 Call ended');
      setIsCallModalOpen(false);
      setLocalStream(null);
      setRemoteStream(null);
    });

    try {
      const stream = await rtc.startCall(true);
      setLocalStream(stream);
      console.log('✅ Local stream started');
    } catch (err) {
      console.error("Failed to start call:", err);
      setIsCallModalOpen(false);
      setIsCalling(false);
      alert('Failed to access camera/microphone. Please check permissions.');
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
          <p className="text-zinc-500 text-sm">This shouldn't take long...</p>
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
            onClick={() => {
              setAuthError(null);
              setIsAuthLoading(true);
              window.location.reload();
            }}
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
    return <AuthModal onSuccess={() => {
      console.log('✅ Login successful');
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
