import React from 'react';
import { Car, Package, Bike, Truck, ChevronRight } from 'lucide-react';

export const Services: React.FC = () => {
  const services = [
    { id: 'ride', name: 'Ride', icon: <Car size={28} />, color: 'bg-emerald-100 text-emerald-600', desc: 'Get a ride nearby' },
    { id: 'package', name: 'Package', icon: <Package size={28} />, color: 'bg-blue-100 text-blue-600', desc: 'Send packages fast' },
    { id: 'bike', name: 'Bike', icon: <Bike size={28} />, color: 'bg-orange-100 text-orange-600', desc: 'Beat the traffic' },
    { id: 'freight', name: 'Freight', icon: <Truck size={28} />, color: 'bg-purple-100 text-purple-600', desc: 'Move heavy items' },
  ];

  return (
    <div className="flex-1 bg-zinc-50 min-h-screen pt-20 px-4 pb-24 overflow-y-auto">
      <h2 className="text-2xl font-bold text-zinc-900 mb-6">Services</h2>
      
      <div className="grid grid-cols-2 gap-4">
        {services.map((service) => (
          <button 
            key={service.id}
            className="bg-white p-4 rounded-2xl shadow-sm border border-zinc-100 flex flex-col items-start hover:shadow-md transition-all active:scale-95"
          >
            <div className={`w-12 h-12 ${service.color} rounded-full flex items-center justify-center mb-3`}>
              {service.icon}
            </div>
            <h3 className="font-bold text-zinc-900 text-lg">{service.name}</h3>
            <p className="text-xs text-zinc-500 mt-1 text-left">{service.desc}</p>
          </button>
        ))}
      </div>

      <div className="mt-8">
        <h3 className="text-lg font-bold text-zinc-900 mb-4">Promotions</h3>
        <div className="bg-gradient-to-r from-emerald-500 to-emerald-700 rounded-2xl p-5 text-white shadow-lg relative overflow-hidden">
          <div className="relative z-10">
            <h4 className="font-bold text-xl mb-1">30% OFF</h4>
            <p className="text-emerald-100 text-sm mb-3">On your next 5 package deliveries</p>
            <button className="bg-white text-emerald-600 text-xs font-bold px-3 py-2 rounded-lg">
              Claim Now
            </button>
          </div>
          <div className="absolute right-0 bottom-0 opacity-20 transform translate-x-1/4 translate-y-1/4">
             <Package size={120} />
          </div>
        </div>
      </div>
    </div>
  );
};
