import React, { useEffect, useRef, useState } from 'react';
import { Mic, MicOff, Video, VideoOff, PhoneOff } from 'lucide-react';

interface CallModalProps {
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  onEndCall: () => void;
  isConnecting: boolean;
  remoteUserName: string;
}

export const CallModal: React.FC<CallModalProps> = ({ 
  localStream, 
  remoteStream, 
  onEndCall, 
  isConnecting,
  remoteUserName
}) => {
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);

  useEffect(() => {
    if (localVideoRef.current && localStream) {
      localVideoRef.current.srcObject = localStream;
    }
  }, [localStream]);

  useEffect(() => {
    if (remoteVideoRef.current && remoteStream) {
      remoteVideoRef.current.srcObject = remoteStream;
    }
  }, [remoteStream]);

  const toggleMute = () => {
    if (localStream) {
      localStream.getAudioTracks().forEach(track => track.enabled = !track.enabled);
      setIsMuted(!isMuted);
    }
  };

  const toggleVideo = () => {
    if (localStream) {
      localStream.getVideoTracks().forEach(track => track.enabled = !track.enabled);
      setIsVideoOff(!isVideoOff);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col">
      {/* Remote Video (Full Screen) */}
      <div className="flex-1 relative bg-zinc-900 overflow-hidden">
        {remoteStream ? (
          <video 
            ref={remoteVideoRef} 
            autoPlay 
            playsInline 
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <div className="w-24 h-24 bg-zinc-800 rounded-full flex items-center justify-center mb-4 animate-pulse">
               <span className="text-4xl">👤</span>
            </div>
            <h3 className="text-zinc-300 text-xl font-medium">
              {isConnecting ? `Calling ${remoteUserName}...` : 'Connecting...'}
            </h3>
            <p className="text-zinc-500 mt-2">Secured by WebRTC & Median.co</p>
          </div>
        )}

        {/* Local Video (PIP) */}
        <div className="absolute top-4 right-4 w-32 h-48 bg-black rounded-xl border border-zinc-700 shadow-2xl overflow-hidden">
          {localStream ? (
             <video 
               ref={localVideoRef} 
               autoPlay 
               playsInline 
               muted 
               className="w-full h-full object-cover transform -scale-x-100" // Mirror local view
             />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-zinc-800">
              <span className="text-zinc-500 text-xs">No Video</span>
            </div>
          )}
        </div>
      </div>

      {/* Controls */}
      <div className="h-32 bg-zinc-900/90 backdrop-blur-md pb-8 pt-4 px-8 flex items-center justify-center space-x-8 rounded-t-3xl border-t border-zinc-800">
        <button 
          onClick={toggleMute}
          className={`p-4 rounded-full ${isMuted ? 'bg-white text-black' : 'bg-zinc-800 text-white'} transition-all`}
        >
          {isMuted ? <MicOff size={24} /> : <Mic size={24} />}
        </button>

        <button 
          onClick={onEndCall}
          className="p-5 bg-red-500 rounded-full text-white shadow-lg shadow-red-500/30 hover:bg-red-600 transition-all active:scale-95"
        >
          <PhoneOff size={32} />
        </button>

        <button 
          onClick={toggleVideo}
          className={`p-4 rounded-full ${isVideoOff ? 'bg-white text-black' : 'bg-zinc-800 text-white'} transition-all`}
        >
          {isVideoOff ? <VideoOff size={24} /> : <Video size={24} />}
        </button>
      </div>
    </div>
  );
};