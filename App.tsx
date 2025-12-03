
import React, { useState, useEffect, useRef } from 'react';
import { UserRole, Trip, TripStatus, User } from './types';
import { MOCK_DRIVER_USER, MOCK_RIDER_USER } from './constants';
import { supabase } from './services/Supabase';
import { WebRTCService } from './services/webrtcService';
import { Button } from './components/Button';
import { MapVisualizer } from './components/MapVisualizer';
import { CallModal } from './components/CallModal';
import { Header } from './components/Header';
import { RideRequestPanel } from './components/RideRequestPanel';
import { TripStatusPanel } from './components/TripStatusPanel';
import { Car, User as UserIcon } from 'lucide-react';

const App: React.FC = () => {
  // Global State
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [currentTrip, setCurrentTrip] = useState<Trip | null>(null);
  
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
  const login = (role: UserRole) => {
    setCurrentUser(role === UserRole.RIDER ? MOCK_RIDER_USER : MOCK_DRIVER_USER);
  };

  const logout = () => {
    setCurrentUser(null);
    setCurrentTrip(null);
    setIsCallModalOpen(false);
  };

  // --- Trip Handlers ---
  const requestTrip = async () => {
    if (!currentUser) return;
    setIsRequesting(true);
    
    // Simulate API call
    const trip = await supabase.createTrip(currentUser.id, pickupInput, destinationInput);
    setCurrentTrip(trip);
    setIsRequesting(false);

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
  };

  const updateTripStatus = async (status: TripStatus) => {
    if (currentTrip) {
      if (status === TripStatus.IDLE) {
         setCurrentTrip(null);
         return;
      }
      if (status === TripStatus.COMPLETED) {
        // Simple completion logic
        setCurrentTrip(null);
        return;
      }
      await supabase.updateTripStatus(currentTrip.id, status);
      setCurrentTrip(prev => prev ? ({ ...prev, status }) : null);
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
    }
  };

  const endCall = () => {
    rtcServiceRef.current?.endCall();
    setIsCallModalOpen(false);
  };

  // --- Render Unauthenticated ---
  if (!currentUser) {
    return (
      <div className="min-h-screen bg-zinc-900 flex flex-col items-center justify-center p-6 text-white relative overflow-hidden font-sans">
        <div className="absolute top-0 left-0 w-full h-full opacity-10 bg-[radial-gradient(#22c55e_1px,transparent_1px)] [background-size:20px_20px]"></div>
        <div className="absolute w-[500px] h-[500px] bg-emerald-600 rounded-full blur-[150px] -top-32 -left-32 opacity-30 animate-pulse"></div>
        
        <div className="z-10 w-full max-w-sm space-y-10">
          <div className="text-center space-y-2">
            <h1 className="text-6xl font-bold tracking-tighter bg-gradient-to-br from-white to-emerald-200 bg-clip-text text-transparent">
              Adaidaita
            </h1>
            <p className="text-zinc-400 font-medium tracking-wide">Secure Rides. Private Calls.</p>
          </div>

          <div className="space-y-4">
             <Button onClick={() => login(UserRole.RIDER)} fullWidth className="h-16 text-lg bg-white text-zinc-900 hover:bg-zinc-100 shadow-xl shadow-white/5 border-0">
               <UserIcon className="w-5 h-5 mr-3" /> Rider Login
             </Button>
             <Button onClick={() => login(UserRole.DRIVER)} fullWidth className="h-16 text-lg bg-emerald-900/50 text-white hover:bg-emerald-900 border border-emerald-700/50">
               <Car className="w-5 h-5 mr-3" /> Driver Login
             </Button>
          </div>
        </div>
      </div>
    );
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
