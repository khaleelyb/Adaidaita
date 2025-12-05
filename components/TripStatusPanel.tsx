import React, { useState, useEffect } from 'react';
import { Phone, ShieldCheck, Navigation, ArrowRight, Star, Clock, MapPin, X, MessageSquare } from 'lucide-react';
import { Button } from './Button';
import { Trip, TripStatus, UserRole } from '../types';

interface TripStatusPanelProps {
  trip: Trip;
  userRole: UserRole;
  onStatusUpdate: (status: TripStatus) => void;
  onCall: () => void;
  disabled?: boolean;
}

export const TripStatusPanel: React.FC<TripStatusPanelProps> = ({
  trip,
  userRole,
  onStatusUpdate,
  onCall,
  disabled = false
}) => {
  const [elapsedTime, setElapsedTime] = useState(0);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const isDriver = userRole === UserRole.DRIVER;

  // Timer for trip duration
  useEffect(() => {
    if (trip.status === TripStatus.IN_PROGRESS) {
      const interval = setInterval(() => {
        setElapsedTime(prev => prev + 1);
      }, 1000);
      return () => clearInterval(interval);
    } else {
      setElapsedTime(0);
    }
  }, [trip.status]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Get dynamic display names
  const otherPartyName = isDriver 
    ? (trip.rider?.name || "Passenger") 
    : (trip.driver?.name || "Driver");
    
  const vehicleInfo = isDriver
    ? ""
    : (trip.driver?.vehicleModel || "Vehicle Info");

  const otherPartyRating = isDriver
    ? (trip.rider?.rating || 5.0).toFixed(1)
    : (trip.driver?.rating || 4.9).toFixed(1);

  // --- RENDER SEARCHING STATE ---
  if (trip.status === TripStatus.SEARCHING) {
    if (isDriver) {
      return (
        <div className="bg-white rounded-t-3xl shadow-[0_-8px_30px_rgba(0,0,0,0.12)] p-6 space-y-6 animate-in slide-in-from-bottom duration-300">
          <div className="w-12 h-1.5 bg-zinc-200 rounded-full mx-auto" />
          
          {/* Request Header */}
          <div className="flex items-center justify-between pb-4 border-b border-zinc-100">
            <div>
              <div className="bg-emerald-100 text-emerald-800 text-xs font-bold px-3 py-1.5 rounded-full mb-2 inline-flex items-center">
                <span className="w-2 h-2 bg-emerald-500 rounded-full mr-2 animate-pulse"></span>
                NEW REQUEST
              </div>
              <h3 className="text-3xl font-bold text-zinc-900">₦{trip.fare}</h3>
              <p className="text-zinc-500 text-sm mt-1">Cash Trip • 2.4 km away</p>
            </div>
            <div className="bg-emerald-50 p-4 rounded-2xl">
              <Navigation className="text-emerald-700" size={28} />
            </div>
          </div>

          {/* Trip Details */}
          <div className="space-y-4">
            <div className="flex items-start">
              <div className="w-3 h-3 bg-emerald-500 rounded-full mr-3 mt-1 flex-shrink-0" />
              <div className="flex-1">
                <p className="text-xs text-zinc-400 font-semibold uppercase">Pickup</p>
                <p className="font-semibold text-zinc-800">{trip.pickup}</p>
              </div>
            </div>
            <div className="flex items-start">
              <div className="w-3 h-3 bg-zinc-900 rounded-sm mr-3 mt-1 flex-shrink-0" />
              <div className="flex-1">
                <p className="text-xs text-zinc-400 font-semibold uppercase">Drop-off</p>
                <p className="font-semibold text-zinc-800">{trip.destination}</p>
              </div>
            </div>
            
             {/* Rider Name in Request (if available) */}
             {trip.rider && (
               <div className="flex items-center pt-2 border-t border-zinc-100 mt-2">
                 <div className="w-8 h-8 rounded-full bg-zinc-200 overflow-hidden mr-3">
                   {trip.rider.avatarUrl && <img src={trip.rider.avatarUrl} alt="Rider" className="w-full h-full object-cover" />}
                 </div>
                 <div>
                   <p className="text-sm font-bold text-zinc-800">{trip.rider.name}</p>
                   <div className="flex items-center text-xs text-zinc-500">
                     <Star size={10} className="fill-amber-400 text-amber-400 mr-1" />
                     {trip.rider.rating || 5.0}
                   </div>
                 </div>
               </div>
             )}
          </div>

          {/* Action Buttons */}
          <div className="grid grid-cols-2 gap-3 pt-2">
            <Button 
              onClick={() => onStatusUpdate(TripStatus.IDLE)} 
              variant="ghost"
              className="border-2 border-zinc-200 text-zinc-600 hover:bg-zinc-50"
            >
              Decline
            </Button>
            <Button 
              onClick={() => onStatusUpdate(TripStatus.ACCEPTED)} 
              className="h-14 text-lg"
              disabled={disabled}
            >
              Accept Ride
            </Button>
          </div>
        </div>
      );
    } 
    
    // Rider Searching
    return (
      <div className="bg-white rounded-t-3xl shadow-[0_-8px_30px_rgba(0,0,0,0.12)] p-8 text-center space-y-6 animate-in slide-in-from-bottom duration-300">
        <div className="w-12 h-1.5 bg-zinc-200 rounded-full mx-auto" />
        
        {/* Searching Animation */}
        <div className="relative w-24 h-24 mx-auto">
          <div className="absolute inset-0 border-4 border-emerald-100 rounded-full animate-ping"></div>
          <div className="absolute inset-0 border-4 border-emerald-500 rounded-full border-t-transparent animate-spin"></div>
          <div className="absolute inset-3 bg-gradient-to-br from-emerald-500 to-emerald-600 rounded-full flex items-center justify-center shadow-lg">
             <Navigation className="text-white" size={32} />
          </div>
        </div>

        {/* Status Text */}
        <div>
          <h3 className="text-2xl font-bold text-zinc-800 mb-2">Finding your driver</h3>
          <p className="text-zinc-500">Connecting you to the nearest available driver</p>
          <div className="flex items-center justify-center space-x-1 mt-3 text-emerald-600">
            <div className="w-2 h-2 bg-emerald-500 rounded-full animate-bounce"></div>
            <div className="w-2 h-2 bg-emerald-500 rounded-full animate-bounce delay-100"></div>
            <div className="w-2 h-2 bg-emerald-500 rounded-full animate-bounce delay-200"></div>
          </div>
        </div>

        {/* Trip Info */}
        <div className="bg-zinc-50 rounded-2xl p-4 space-y-2 text-left">
          <div className="flex items-center text-sm">
            <MapPin size={16} className="text-emerald-600 mr-2" />
            <span className="font-semibold text-zinc-700">Pickup:</span>
            <span className="text-zinc-600 ml-1">{trip.pickup}</span>
          </div>
          <div className="flex items-center text-sm">
            <MapPin size={16} className="text-zinc-600 mr-2" />
            <span className="font-semibold text-zinc-700">Drop-off:</span>
            <span className="text-zinc-600 ml-1">{trip.destination}</span>
          </div>
        </div>

        {/* Cancel Button */}
        {!showCancelConfirm ? (
          <Button 
            variant="ghost" 
            className="text-red-500 hover:bg-red-50 hover:text-red-600 w-full" 
            onClick={() => setShowCancelConfirm(true)}
          >
            Cancel Request
          </Button>
        ) : (
          <div className="space-y-2 animate-in fade-in slide-in-from-bottom duration-200">
            <p className="text-sm text-zinc-600">Are you sure you want to cancel?</p>
            <div className="grid grid-cols-2 gap-2">
              <Button 
                variant="ghost" 
                onClick={() => setShowCancelConfirm(false)}
                className="text-zinc-600"
              >
                No, Keep Searching
              </Button>
              <Button 
                variant="danger"
                onClick={() => onStatusUpdate(TripStatus.IDLE)}
              >
                Yes, Cancel
              </Button>
            </div>
          </div>
        )}
      </div>
    );
  }

  // --- RENDER ACTIVE TRIP STATE ---
  const statusConfig = {
    [TripStatus.ACCEPTED]: {
      label: isDriver ? "Pick up passenger" : "Driver is on the way",
      color: "bg-blue-100 text-blue-700",
      icon: <Navigation size={16} />
    },
    [TripStatus.ARRIVED]: {
      label: isDriver ? "Waiting for passenger" : "Driver has arrived!",
      color: "bg-amber-100 text-amber-700",
      icon: <Clock size={16} />
    },
    [TripStatus.IN_PROGRESS]: {
      label: "Trip in progress",
      color: "bg-emerald-100 text-emerald-700",
      icon: <ArrowRight size={16} />
    },
    [TripStatus.COMPLETED]: {
      label: "Trip Completed",
      color: "bg-green-100 text-green-700",
      icon: <Star size={16} />
    },
    [TripStatus.IDLE]: { label: "", color: "", icon: null }
  };

  const currentStatus = statusConfig[trip.status] || statusConfig[TripStatus.IDLE];

  return (
    <div className="bg-white rounded-t-3xl shadow-[0_-8px_30px_rgba(0,0,0,0.12)] p-6 space-y-6 animate-in slide-in-from-bottom duration-300">
       <div className="w-12 h-1.5 bg-zinc-200 rounded-full mx-auto" />
       
       {/* Status Header */}
       <div className="flex justify-between items-start">
         <div className="flex-1">
            <div className={`text-xs font-bold px-3 py-1.5 rounded-full mb-3 inline-flex items-center uppercase tracking-wide ${currentStatus.color}`}>
              {currentStatus.icon}
              <span className="ml-1.5">{currentStatus.label}</span>
            </div>
            
            <h3 className="text-xl font-bold text-zinc-900 mb-1">
              {isDriver ? `Passenger: ${otherPartyName}` : (vehicleInfo || otherPartyName)}
            </h3>
            
            <p className="text-zinc-500 text-sm flex items-center">
              {isDriver ? (
                <>
                  <Star size={14} className="fill-amber-400 text-amber-400 mr-1" />
                  {otherPartyRating} Rating
                </>
              ) : (
                <>
                  {trip.driver?.vehiclePlate ? `${trip.driver.vehiclePlate} • ` : ''} {otherPartyName}
                  <Star size={14} className="fill-amber-400 text-amber-400 ml-2 mr-1" />
                  {otherPartyRating}
                </>
              )}
            </p>
         </div>
         <div className="text-right">
            <p className="text-3xl font-bold text-zinc-900">₦{trip.fare}</p>
            {trip.status === TripStatus.IN_PROGRESS && (
              <p className="text-sm text-zinc-500 mt-1">{formatTime(elapsedTime)}</p>
            )}
         </div>
       </div>

       {/* Quick Actions */}
       <div className="grid grid-cols-3 gap-3">
          <Button 
            onClick={onCall} 
            className="col-span-2 bg-emerald-600 hover:bg-emerald-700 h-12" 
            icon={<Phone size={18} />}
            disabled={disabled}
          >
            Call {isDriver ? 'Rider' : 'Driver'}
          </Button>
          <button 
            className="col-span-1 bg-zinc-100 hover:bg-zinc-200 text-zinc-600 rounded-xl flex items-center justify-center transition-colors active:scale-95"
            disabled={disabled}
          >
            <MessageSquare size={22} />
          </button>
       </div>

       {/* Driver Controls */}
       {isDriver && (
         <div className="pt-2 border-t border-zinc-100 space-y-3">
            {trip.status === TripStatus.ACCEPTED && (
               <Button 
                 onClick={() => onStatusUpdate(TripStatus.ARRIVED)} 
                 variant="secondary" 
                 fullWidth 
                 icon={<MapPin size={18} />}
                 className="h-12"
                 disabled={disabled}
               >
                 I Have Arrived
               </Button>
            )}
            {trip.status === TripStatus.ARRIVED && (
               <Button 
                 onClick={() => onStatusUpdate(TripStatus.IN_PROGRESS)} 
                 fullWidth 
                 icon={<ArrowRight size={18} />}
                 className="h-12"
                 disabled={disabled}
               >
                 Start Trip
               </Button>
            )}
            {trip.status === TripStatus.IN_PROGRESS && (
               <Button 
                 onClick={() => onStatusUpdate(TripStatus.COMPLETED)} 
                 variant="danger" 
                 fullWidth
                 className="h-12"
                 disabled={disabled}
               >
                 Complete Trip
               </Button>
            )}
         </div>
       )}

       {/* Rider Safety Info */}
       {!isDriver && (
         <div className="flex items-center justify-center space-x-2 pt-2 text-zinc-500 text-sm">
           <ShieldCheck size={16} className="text-emerald-600" />
           <span>Your trip is protected</span>
         </div>
       )}
    </div>
  );
};

// Add delay utilities to styles
const style = document.createElement('style');
style.textContent = `
  .delay-100 { animation-delay: 100ms; }
  .delay-200 { animation-delay: 200ms; }
`;
document.head.appendChild(style);
