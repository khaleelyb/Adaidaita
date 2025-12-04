import React, { useState, useEffect, useRef, useCallback } from 'react';
import { UserRole, Trip, TripStatus, User } from './types';
import { supabase } from './services/Supabase';
import { authService } from './services/auth';
import { WebRTCService } from './services/webrtcService';
import { Button } from './components/Button';
import { MapVisualizer } from './components/MapVisualizer';
import { CallModal } from './components/CallModal';
import { Header } from './components/Header';
import { RideRequestPanel } from './components/RideRequestPanel';
import { TripStatusPanel } from './components/TripStatusPanel';
import { AuthModal } from './components/AuthModal';
import { OfflineIndicator } from './components/OfflineIndicator';
import { LoadingScreen } from './components/LoadingScreen';
import { ErrorBoundary } from './components/ErrorBoundary';
import { Car, Wifi, WifiOff } from 'lucide-react';

const App: React.FC = () => {
  // Global State
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [currentTrip, setCurrentTrip] = useState<Trip | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  
  // UI State
  const [pickupInput, setPickupInput] = useState('Central Market');
  const [destinationInput, setDestinationInput] = useState('');
  const [isRequesting, setIsRequesting] = useState(false);
  const [requestError, setRequestError] = useState('');
  const [isCallModalOpen, setIsCallModalOpen] = useState(false);
  const [isCalling, setIsCalling] = useState(false);
  
  // WebRTC State
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const rtcServiceRef = useRef<WebRTCService | null>(null);
  
  // Refs for cleanup
  const subscriptionRef = useRef<any>(null);
  const isMountedRef = useRef(true);

  // Online/Offline Detection
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      if (currentUser) {
        checkSession(); // Refresh session when back online
      }
    };
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [currentUser]);

  // Auth Handlers with improved error handling
  useEffect(() => {
    isMountedRef.current = true;
    
    const timeoutId = setTimeout(() => {
      if (isMountedRef.current && isAuthLoading) {
        console.warn('Auth check timed out, showing login screen');
        setIsAuthLoading(false);
        setCurrentUser(null);
      }
    }, 8000); // Increased to 8 seconds for slower connections

    checkSession();
    
    subscriptionRef.current = authService.onAuthStateChange((user) => {
      if (isMountedRef.current) {
        clearTimeout(timeoutId);
        setCurrentUser(user);
        setIsAuthLoading(false);
      }
    });

    return () => {
      isMountedRef.current = false;
      clearTimeout(timeoutId);
      if (subscriptionRef.current) {
        subscriptionRef.current.data.subscription.unsubscribe();
      }
    };
  }, []);

  const checkSession = async () => {
    if (!isOnline) {
      setIsAuthLoading(false);
      return;
    }

    try {
      console.log('Checking session...');
      const user = await authService.getCurrentUser();
      if (isMountedRef.current) {
        console.log('Current user:', user);
        setCurrentUser(user);
      }
    } catch (error) {
      console.error('Error checking session:', error);
      if (isMountedRef.current) {
        setCurrentUser(null);
      }
    } finally {
      if (isMountedRef.current) {
        setIsAuthLoading(false);
      }
    }
  };

  const logout = useCallback(async () => {
    try {
      await authService.signOut();
      if (isMountedRef.current) {
        setCurrentUser(null);
        setCurrentTrip(null);
        setIsCallModalOpen(false);
        setRequestError('');
        setPickupInput('Central Market');
        setDestinationInput('');
      }
    } catch (error) {
      console.error('Error logging out:', error);
    }
  }, []);

  // Trip Handlers with retry logic
  const requestTrip = async () => {
    if (!currentUser || !isOnline) {
      setRequestError('No internet connection. Please try again when online.');
      return;
    }

    if (!destinationInput.trim()) {
      setRequestError('Please enter a destination');
      return;
    }

    setIsRequesting(true);
    setRequestError('');
    
    let retries = 0;
    const maxRetries = 3;

    while (retries < maxRetries) {
      try {
        const trip = await supabase.createTrip(currentUser.id, pickupInput, destinationInput);
        
        if (isMountedRef.current) {
          setCurrentTrip(trip);

          // Listen for updates with error handling
          supabase.subscribe(`trip-${trip.id}`, (data) => {
            if (!isMountedRef.current) return;

            try {
              if (data.event === 'trip_accepted') {
                setCurrentTrip(prev => ({ ...data.payload.trip }));
              } else if (data.event === 'location_update') {
                setCurrentTrip(prev => prev ? ({ ...prev, driverLocation: data.payload }) : null);
              } else if (data.event === 'status_change') {
                setCurrentTrip(prev => prev ? ({ ...prev, status: data.payload.status }) : null);
              }
            } catch (err) {
              console.error('Error processing trip update:', err);
            }
          });
        }
        
        break; // Success, exit retry loop
      } catch (error: any) {
        console.error(`Trip request attempt ${retries + 1} failed:`, error);
        retries++;
        
        if (retries >= maxRetries) {
          if (isMountedRef.current) {
            setRequestError(error.message || 'Failed to request trip. Please check your connection and try again.');
          }
        } else {
          // Wait before retrying (exponential backoff)
          await new Promise(resolve => setTimeout(resolve, 1000 * retries));
        }
      }
    }
    
    if (isMountedRef.current) {
      setIsRequesting(false);
    }
  };

  const updateTripStatus = useCallback(async (status: TripStatus) => {
    if (!currentTrip) return;

    if (status === TripStatus.IDLE || status === TripStatus.COMPLETED) {
      setCurrentTrip(null);
      setPickupInput('Central Market');
      setDestinationInput('');
      return;
    }

    try {
      await supabase.updateTripStatus(currentTrip.id, status);
      if (isMountedRef.current) {
        setCurrentTrip(prev => prev ? ({ ...prev, status }) : null);
      }
    } catch (error) {
      console.error('Error updating trip status:', error);
      if (isMountedRef.current) {
        setRequestError('Failed to update trip status. Please check your connection.');
      }
    }
  }, [currentTrip]);

  // WebRTC Handlers with improved error handling
  const startCall = async () => {
    if (!currentTrip || !isOnline) {
      setRequestError('Cannot start call without internet connection');
      return;
    }

    setIsCallModalOpen(true);
    setIsCalling(true);

    const rtc = new WebRTCService(currentTrip.id);
    rtcServiceRef.current = rtc;

    rtc.onRemoteStream((stream) => {
      if (isMountedRef.current) {
        setRemoteStream(stream);
        setIsCalling(false);
      }
    });

    rtc.onCallEnd(() => {
      if (isMountedRef.current) {
        setIsCallModalOpen(false);
        setLocalStream(null);
        setRemoteStream(null);
      }
    });

    try {
      const stream = await rtc.startCall(true);
      if (isMountedRef.current) {
        setLocalStream(stream);
      }
    } catch (err) {
      console.error("Failed to start call", err);
      if (isMountedRef.current) {
        setIsCallModalOpen(false);
        setIsCalling(false);
        setRequestError('Failed to start call. Please check camera/microphone permissions.');
      }
    }
  };

  const endCall = useCallback(() => {
    rtcServiceRef.current?.endCall();
    if (isMountedRef.current) {
      setIsCallModalOpen(false);
      setLocalStream(null);
      setRemoteStream(null);
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (rtcServiceRef.current) {
        rtcServiceRef.current.endCall();
      }
      if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
      }
    };
  }, [localStream]);

  // Loading State
  if (isAuthLoading) {
    return <LoadingScreen />;
  }

  // Unauthenticated State
  if (!currentUser) {
    return <AuthModal onSuccess={checkSession} />;
  }

  // Main App
  return (
    <ErrorBoundary>
      <div className="flex flex-col h-screen bg-white relative overflow-hidden font-sans touch-pan-y">
        
        {/* Offline Indicator */}
        {!isOnline && <OfflineIndicator />}

        {/* Header */}
        <Header user={currentUser} onLogout={logout} />

        {/* Map Background */}
        <div className="absolute inset-0 z-0">
          <MapVisualizer 
            role={currentUser.role} 
            driverLocation={currentTrip?.driverLocation}
            pickup={currentTrip?.pickup || (pickupInput && isRequesting ? pickupInput : pickupInput)}
            isSearching={currentTrip?.status === TripStatus.SEARCHING}
            onLocationSelect={setPickupInput}
          />
        </div>

        {/* Bottom Sheet / Control Layer */}
        <div className="absolute bottom-0 left-0 right-0 z-30 p-4 pb-safe md:max-w-md md:mx-auto md:bottom-8">
          
          {/* Rider - No Trip */}
          {currentUser.role === UserRole.RIDER && !currentTrip && (
            <RideRequestPanel 
              pickup={pickupInput}
              setPickup={setPickupInput}
              destination={destinationInput}
              setDestination={setDestinationInput}
              onRequest={requestTrip}
              isLoading={isRequesting}
              error={requestError}
              disabled={!isOnline}
            />
          )}

          {/* Active Trip */}
          {currentTrip && (
            <TripStatusPanel 
              trip={currentTrip}
              userRole={currentUser.role}
              onStatusUpdate={updateTripStatus}
              onCall={startCall}
              disabled={!isOnline}
            />
          )}

          {/* Driver - Idle */}
          {currentUser.role === UserRole.DRIVER && !currentTrip && (
            <div className="bg-white rounded-2xl shadow-xl p-6 text-center border border-zinc-100">
              <div className="w-16 h-16 bg-emerald-50 rounded-full flex items-center justify-center mx-auto mb-4 animate-pulse">
                <Car size={32} className="text-emerald-600" />
              </div>
              <h3 className="text-xl font-bold text-zinc-900">You are Online</h3>
              <p className="text-zinc-500 mt-1">Waiting for nearby ride requests...</p>
              {!isOnline && (
                <div className="mt-3 flex items-center justify-center text-amber-600 text-sm">
                  <WifiOff size={16} className="mr-1" />
                  <span>No internet connection</span>
                </div>
              )}
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
    </ErrorBoundary>
  );
};

export default App;