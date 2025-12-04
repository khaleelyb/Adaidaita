import React, { useState, useEffect, useRef } from 'react';
import { UserRole, Trip, TripStatus, User } from './types';
import { supabase } from './services/supabase';
import { authService } from './services/auth';
import { WebRTCService } from './services/webrtcService';
import { Button } from './components/Button';
import { MapVisualizer } from './components/MapVisualizer';
import { CallModal } from './components/CallModal';
import { Header } from './components/Header';
import { RideRequestPanel } from './components/RideRequestPanel';
import { TripStatusPanel } from './components/TripStatusPanel';
import { AuthModal } from './components/AuthModal';
import { Car } from 'lucide-react';

const App: React.FC = () => {
  // Global State
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [currentTrip, setCurrentTrip] = useState<Trip | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  
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
    checkSession();
    
    // Listen for auth changes
    const { data: { subscription } } = authService.onAuthStateChange((user) => {
      setCurrentUser(user);
      setIsAuthLoading(false);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const checkSession = async () => {
    try {
      const user = await authService.getCurrentUser();
      setCurrentUser(user);
    } catch (error) {
      console.error('Error checking session:', error);
    } finally {
      setIsAuthLoading(false);
    }
  };

  const logout = async () => {
    try {
      await authService.signOut();
      setCurrentUser(null);
      setCurrentTrip(null);
      setIsCallModalOpen(false);
    } catch (error) {
      console.error('Error logging out:', error);
    }
  };

  // --- Trip Handlers ---
  const requestTrip = async () => {
    if (!currentUser) return;
    setIsRequesting(true);
    
    try {
      // Create trip in Supabase
      const trip = await supabase.createTrip(currentUser.id, pickupInput, destinationInput);
      setCurrentTrip(trip);

      // Listen for updates
      supabase.subscribe(`trip-${trip.id}`, (data) => {
        if (data.event === 'trip_accepted') {
          setCurrentTrip(prev => ({ ...data.payload.trip }));
        } else if (data.event === 'location_update') {
          setCurrentTrip(prev => prev ? ({ ...prev, driverLocation: data.payload }) : null);
        } else if (data.event === 'status_change') {
          setCurrentTrip(prev => prev ? ({ ...prev, status: data.payload.status }) : null);
        }
      });
    } catch (error) {
      console.error('Error requesting trip:', error);
    } finally {
      setIsRequesting(false);
    }
  };

  const updateTripStatus = async (status: TripStatus) => {
    if (!currentTrip) return;

    if (status === TripStatus.IDLE) {
      setCurrentTrip(null);
      return;
    }
    
    if (status === TripStatus.COMPLETED) {
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
      const stream = await rtc.startCall(true); // true = initiator
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

  // --- Render Unauthenticated (Show Auth Modal) ---
  if (!currentUser) {
    return <AuthModal onSuccess={checkSession} />;
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

      {/* 3. Bottom Sheet / Control Layer */}
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
        {currentUser.role === UserRole.DRIVER && !currentTrip && (
           <div className="bg-white rounded-2xl shadow-xl p-6 text-center border border-zinc-100">
              <div className="w-16 h-16 bg-emerald-50 rounded-full flex items-center justify-center mx-auto mb-4 animate-pulse">
                <Car size={32} className="text-emerald-600" />
              </div>
              <h3 className="text-xl font-bold text-zinc-900">You are Online</h3>
              <p className="text-zinc-500 mt-1">Waiting for nearby ride requests...</p>
           </div>
        )}
      </div>

      {/* 4. Full Screen Modal Layer */}
      {isCallModalOpen && (
        <CallModal 
          localStream={localStream}
          remoteStream={remoteStream}
          onEndCall={endCall}
          isConnecting={isCalling}
          remoteUserName={currentUser.role === UserRole.RIDER ? "Bob Driver" : "Alice Rider"}
        />
      )}
    </div>
  );
};

export default App;
