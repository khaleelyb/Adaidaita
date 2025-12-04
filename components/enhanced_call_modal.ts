import React, { useEffect, useRef, useState } from 'react';
import { Mic, MicOff, Video, VideoOff, PhoneOff, SwitchCamera, Maximize2, Minimize2 } from 'lucide-react';

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
  const [isLocalVideoMinimized, setIsLocalVideoMinimized] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [callDuration, setCallDuration] = useState(0);
  const controlsTimeoutRef = useRef<NodeJS.Timeout>();

  // Setup video streams
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

  // Call duration timer
  useEffect(() => {
    if (remoteStream && !isConnecting) {
      const interval = setInterval(() => {
        setCallDuration(prev => prev + 1);
      }, 1000);
      return () => clearInterval(interval);
    }
  }, [remoteStream, isConnecting]);

  // Auto-hide controls after 3 seconds
  useEffect(() => {
    if (showControls) {
      controlsTimeoutRef.current = setTimeout(() => {
        setShowControls(false);
      }, 3000);
    }
    return () => {
      if (controlsTimeoutRef.current) {
        clearTimeout(controlsTimeoutRef.current);
      }
    };
  }, [showControls]);

  const handleScreenTap = () => {
    setShowControls(true);
  };

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

  const switchCamera = async () => {
    if (!localStream) return;
    
    try {
      const videoTrack = localStream.getVideoTracks()[0];
      const currentFacingMode = videoTrack.getSettings().facingMode;
      const newFacingMode = currentFacingMode === 'user' ? 'environment' : 'user';
      
      videoTrack.stop();
      
      const newStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: newFacingMode },
        audio: true
      });
      
      const newVideoTrack = newStream.getVideoTracks()[0];
      const sender = (window as any).peerConnection?.getSenders().find((s: any) => s.track?.kind === 'video');
      
      if (sender) {
        sender.replaceTrack(newVideoTrack);
      }
      
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = newStream;
      }
    } catch (err) {
      console.error('Error switching camera:', err);
    }
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col" onClick={handleScreenTap}>
      
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
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-gradient-to-br from-zinc-900 via-zinc-800 to-zinc-900">
            {/* Connection animation */}
            <div className="relative w-32 h-32 mb-6">
              <div className="absolute inset-0 bg-emerald-500/20 rounded-full animate-ping"></div>
              <div className="absolute inset-0 bg-emerald-600/30 rounded-full animate-pulse"></div>
              <div className="absolute inset-4 bg-zinc-800 rounded-full flex items-center justify-center border-4 border-emerald-500/50">
                <span className="text-5xl">👤</span>
              </div>
            </div>
            
            <h3 className="text-white text-2xl font-semibold mb-2">
              {isConnecting ? `Calling ${remoteUserName}...` : 'Connecting...'}
            </h3>
            <p className="text-zinc-400 text-sm">Please wait</p>
            
            {/* Connection dots */}
            <div className="flex space-x-2 mt-4">
              <div className="w-2 h-2 bg-emerald-500 rounded-full animate-bounce"></div>
              <div className="w-2 h-2 bg-emerald-500 rounded-full animate-bounce delay-100"></div>
              <div className="w-2 h-2 bg-emerald-500 rounded-full animate-bounce delay-200"></div>
            </div>
          </div>
        )}

        {/* Top Info Bar (with fade effect) */}
        <div className={`absolute top-0 left-0 right-0 bg-gradient-to-b from-black/70 to-transparent p-6 pb-12 transition-opacity duration-300 ${showControls ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="w-12 h-12 bg-zinc-800 rounded-full flex items-center justify-center border-2 border-white/20">
                <span className="text-xl">👤</span>
              </div>
              <div>
                <p className="text-white font-semibold text-lg">{remoteUserName}</p>
                {remoteStream ? (
                  <div className="flex items-center text-sm text-emerald-400">
                    <div className="w-2 h-2 bg-emerald-400 rounded-full mr-2 animate-pulse"></div>
                    {formatDuration(callDuration)}
                  </div>
                ) : (
                  <p className="text-zinc-400 text-sm">Connecting...</p>
                )}
              </div>
            </div>
            
            {/* End call mini button */}
            <button 
              onClick={(e) => { e.stopPropagation(); onEndCall(); }}
              className="w-10 h-10 bg-red-500 rounded-full flex items-center justify-center shadow-lg active:scale-95 transition-transform"
            >
              <PhoneOff size={20} className="text-white" />
            </button>
          </div>
        </div>

        {/* Local Video (PIP) */}
        <div className={`absolute transition-all duration-300 ${
          isLocalVideoMinimized 
            ? 'top-20 right-4 w-20 h-28' 
            : 'top-20 right-4 w-32 h-48'
        } bg-black rounded-2xl border-2 border-white/20 shadow-2xl overflow-hidden ${showControls ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
          {localStream && !isVideoOff ? (
             <video 
               ref={localVideoRef} 
               autoPlay 
               playsInline 
               muted 
               className="w-full h-full object-cover transform -scale-x-100"
             />
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center bg-zinc-800">
              <VideoOff size={24} className="text-zinc-500 mb-1" />
              <span className="text-zinc-500 text-xs">Video Off</span>
            </div>
          )}
          
          {/* Minimize button */}
          <button 
            onClick={(e) => { e.stopPropagation(); setIsLocalVideoMinimized(!isLocalVideoMinimized); }}
            className="absolute top-1 right-1 w-6 h-6 bg-black/50 rounded-full flex items-center justify-center"
          >
            {isLocalVideoMinimized ? <Maximize2 size={12} className="text-white" /> : <Minimize2 size={12} className="text-white" />}
          </button>
        </div>

        {/* Quality indicator */}
        {remoteStream && (
          <div className="absolute top-24 left-4 bg-black/50 backdrop-blur-md px-3 py-1.5 rounded-full text-xs text-white flex items-center space-x-1.5">
            <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
            <span>HD</span>
          </div>
        )}
      </div>

      {/* Bottom Controls */}
      <div className={`bg-gradient-to-t from-black via-black/95 to-transparent pb-8 pt-12 px-6 transition-all duration-300 ${showControls ? 'translate-y-0' : 'translate-y-full'}`}>
        <div className="max-w-md mx-auto">
          {/* Primary Controls */}
          <div className="flex items-center justify-center space-x-6 mb-4">
            {/* Mute Button */}
            <button 
              onClick={(e) => { e.stopPropagation(); toggleMute(); }}
              className={`w-16 h-16 rounded-full transition-all active:scale-95 shadow-lg ${
                isMuted 
                  ? 'bg-white text-zinc-900' 
                  : 'bg-zinc-800 text-white border-2 border-zinc-700'
              }`}
            >
              {isMuted ? <MicOff size={28} /> : <Mic size={28} />}
            </button>

            {/* End Call Button */}
            <button 
              onClick={(e) => { e.stopPropagation(); onEndCall(); }}
              className="w-20 h-20 bg-red-500 rounded-full text-white shadow-2xl shadow-red-500/40 hover:bg-red-600 transition-all active:scale-95 flex items-center justify-center"
            >
              <PhoneOff size={36} />
            </button>

            {/* Video Toggle Button */}
            <button 
              onClick={(e) => { e.stopPropagation(); toggleVideo(); }}
              className={`w-16 h-16 rounded-full transition-all active:scale-95 shadow-lg ${
                isVideoOff 
                  ? 'bg-white text-zinc-900' 
                  : 'bg-zinc-800 text-white border-2 border-zinc-700'
              }`}
            >
              {isVideoOff ? <VideoOff size={28} /> : <Video size={28} />}
            </button>
          </div>

          {/* Secondary Controls */}
          <div className="flex items-center justify-center space-x-3">
            <button 
              onClick={(e) => { e.stopPropagation(); switchCamera(); }}
              className="w-12 h-12 bg-zinc-800 rounded-full text-white transition-all active:scale-95 border-2 border-zinc-700 flex items-center justify-center"
              title="Switch Camera"
            >
              <SwitchCamera size={20} />
            </button>
          </div>

          {/* Tap to show controls hint */}
          {!showControls && (
            <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 text-zinc-400 text-xs animate-pulse">
              Tap to show controls
            </div>
          )}
        </div>
      </div>
    </div>
  );
};