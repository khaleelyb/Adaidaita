
import React from 'react';
import { Phone, ShieldCheck, Navigation, ArrowRight, Star } from 'lucide-react';
import { Button } from './Button';
import { Trip, TripStatus, UserRole } from '../types';

interface TripStatusPanelProps {
  trip: Trip;
  userRole: UserRole;
  onStatusUpdate: (status: TripStatus) => void;
  onCall: () => void;
}

export const TripStatusPanel: React.FC<TripStatusPanelProps> = ({
  trip,
  userRole,
  onStatusUpdate,
  onCall
}) => {
  const isDriver = userRole === UserRole.DRIVER;

  // --- RENDER DRIVER SEARCHING STATE ---
  if (trip.status === TripStatus.SEARCHING) {
    if (isDriver) {
      return (
        <div className="bg-white rounded-t-3xl shadow-[0_-8px_30px_rgba(0,0,0,0.12)] p-6 space-y-6">
          <div className="w-12 h-1.5 bg-zinc-200 rounded-full mx-auto" />
          <div className="flex items-center justify-between pb-4 border-b border-zinc-100">
            <div>
              <div className="bg-emerald-100 text-emerald-800 text-xs font-bold px-2 py-1 rounded mb-1 inline-block">NEW REQUEST</div>
              <h3 className="text-2xl font-bold text-zinc-900">₦{trip.fare}</h3>
              <p className="text-zinc-500 text-sm">Cash Trip • 2.4 km</p>
            </div>
            <div className="bg-zinc-100 p-3 rounded-2xl">
              <Navigation className="text-zinc-700" size={24} />
            </div>
          </div>
          <div className="space-y-4">
            <div className="flex items-center">
              <div className="w-2 h-2 bg-emerald-500 rounded-full mr-3" />
              <p className="font-medium text-zinc-700">{trip.pickup}</p>
            </div>
            <div className="flex items-center">
              <div className="w-2 h-2 bg-zinc-900 rounded-sm mr-3" />
              <p className="font-medium text-zinc-700">{trip.destination}</p>
            </div>
          </div>
          <Button onClick={() => onStatusUpdate(TripStatus.ACCEPTED)} fullWidth className="h-14 text-lg">
            Accept Ride
          </Button>
        </div>
      );
    } 
    
    // Rider Searching
    return (
      <div className="bg-white rounded-t-3xl shadow-[0_-8px_30px_rgba(0,0,0,0.12)] p-8 text-center space-y-4">
        <div className="relative w-20 h-20 mx-auto">
          <div className="absolute inset-0 border-4 border-emerald-100 rounded-full animate-ping"></div>
          <div className="absolute inset-0 border-4 border-emerald-500 rounded-full border-t-transparent animate-spin"></div>
          <div className="absolute inset-2 bg-emerald-50 rounded-full flex items-center justify-center">
             <Navigation className="text-emerald-600" size={24} />
          </div>
        </div>
        <div>
          <h3 className="text-xl font-bold text-zinc-800">Finding your driver...</h3>
          <p className="text-zinc-500">Connecting you to the nearest Adaidaita</p>
        </div>
        <Button variant="ghost" className="text-red-500 hover:bg-red-50 hover:text-red-600" onClick={() => onStatusUpdate(TripStatus.IDLE)}>
          Cancel Request
        </Button>
      </div>
    );
  }

  // --- RENDER ACTIVE TRIP STATE (ACCEPTED, ARRIVED, IN_PROGRESS) ---
  
  const statusLabels = {
    [TripStatus.ACCEPTED]: isDriver ? "Pick up passenger" : "Driver is on the way",
    [TripStatus.ARRIVED]: isDriver ? "Waiting for passenger" : "Driver has arrived",
    [TripStatus.IN_PROGRESS]: "Heading to destination",
    [TripStatus.COMPLETED]: "Trip Completed",
    [TripStatus.IDLE]: ""
  };

  const getStatusColor = () => {
    switch (trip.status) {
      case TripStatus.ARRIVED: return "bg-blue-100 text-blue-700";
      case TripStatus.IN_PROGRESS: return "bg-orange-100 text-orange-700";
      default: return "bg-emerald-100 text-emerald-700";
    }
  };

  return (
    <div className="bg-white rounded-t-3xl shadow-[0_-8px_30px_rgba(0,0,0,0.12)] p-6 space-y-6">
       <div className="w-12 h-1.5 bg-zinc-200 rounded-full mx-auto" />
       
       {/* Status Header */}
       <div className="flex justify-between items-start">
         <div>
            <div className={`text-xs font-bold px-2 py-1 rounded mb-2 inline-block uppercase tracking-wide ${getStatusColor()}`}>
              {statusLabels[trip.status]}
            </div>
            <h3 className="text-xl font-bold text-zinc-900">
              {isDriver ? "Rider: Alice" : "Toyota Corolla • KAN-552"}
            </h3>
            <p className="text-zinc-500 text-sm">
              {isDriver ? "4.9 Rating" : "Bob Driver"}
            </p>
         </div>
         <div className="text-right">
            <p className="text-2xl font-bold text-zinc-900">₦{trip.fare}</p>
            <div className="flex items-center justify-end text-amber-500 text-sm font-bold">
              <Star size={14} className="fill-current mr-1" /> 4.8
            </div>
         </div>
       </div>

       {/* Actions Grid */}
       <div className="grid grid-cols-4 gap-3">
          <Button onClick={onCall} className="col-span-3 bg-emerald-600 hover:bg-emerald-700" icon={<Phone size={18} />}>
            Call {isDriver ? 'Rider' : 'Driver'}
          </Button>
          <button className="col-span-1 bg-zinc-100 hover:bg-zinc-200 text-zinc-600 rounded-xl flex items-center justify-center transition-colors">
            <ShieldCheck size={24} />
          </button>
       </div>

       {/* Driver Specific Controls */}
       {isDriver && (
         <div className="pt-2 border-t border-zinc-100">
            {trip.status === TripStatus.ACCEPTED && (
               <Button onClick={() => onStatusUpdate(TripStatus.ARRIVED)} variant="secondary" fullWidth icon={<Navigation size={18} />}>
                 I Have Arrived
               </Button>
            )}
            {trip.status === TripStatus.ARRIVED && (
               <Button onClick={() => onStatusUpdate(TripStatus.IN_PROGRESS)} fullWidth icon={<ArrowRight size={18} />}>
                 Start Trip
               </Button>
            )}
            {trip.status === TripStatus.IN_PROGRESS && (
               <Button onClick={() => onStatusUpdate(TripStatus.COMPLETED)} variant="danger" fullWidth>
                 End Trip & Collect Cash
               </Button>
            )}
         </div>
       )}
    </div>
  );
};
