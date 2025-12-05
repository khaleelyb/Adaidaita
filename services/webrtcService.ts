import { ICE_SERVERS } from '../constants';
import { supabaseClient } from './supabaseClient';

export class WebRTCService {
  private peerConnection: RTCPeerConnection | null = null;
  private localStream: MediaStream | null = null;
  private remoteStream: MediaStream | null = null;
  private tripId: string;
  private currentUserId: string;
  private targetUserId: string;
  private onRemoteStreamCallback: ((stream: MediaStream) => void) | null = null;
  private onCallEndCallback: (() => void) | null = null;
  private candidateQueue: RTCIceCandidate[] = [];
  private signalQueue: any[] = [];
  private channel: any = null;
  private isInitiator: boolean = false;
  private isReady: boolean = false;

  constructor(tripId: string, currentUserId: string, targetUserId: string) {
    this.tripId = tripId;
    this.currentUserId = currentUserId;
    this.targetUserId = targetUserId;
    
    console.log('[WebRTC] 🚀 Initialized', {
      tripId,
      currentUserId: currentUserId.substring(0, 8),
      targetUserId: targetUserId.substring(0, 8)
    });
  }

  async startCall(isCaller: boolean): Promise<MediaStream> {
    this.isInitiator = isCaller;
    console.log(`[WebRTC] 📞 Starting call as ${isCaller ? 'CALLER' : 'RECEIVER'}`);

    // 1. Setup Signaling Channel FIRST
    await this.setupSignalingChannel();

    // 2. Get Local Media
    try {
      console.log('[WebRTC] 🎥 Requesting media devices...');
      this.localStream = await navigator.mediaDevices.getUserMedia({ 
        video: { 
          width: { ideal: 1280 },
          height: { ideal: 720 },
          facingMode: 'user'
        }, 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });
      console.log('[WebRTC] ✅ Local stream obtained');
    } catch (e: any) {
      console.error('[WebRTC] ❌ Media access error:', e);
      throw new Error('Cannot access camera/microphone. Please grant permissions and try again.');
    }

    // 3. Create Peer Connection
    console.log('[WebRTC] 🔗 Creating peer connection...');
    this.peerConnection = new RTCPeerConnection({ 
      iceServers: ICE_SERVERS,
      iceCandidatePoolSize: 10
    });
    
    this.isReady = true;

    // 4. Add Local Tracks
    this.localStream.getTracks().forEach(track => {
      if (this.localStream && this.peerConnection) {
        this.peerConnection.addTrack(track, this.localStream);
        console.log(`[WebRTC] ➕ Added ${track.kind} track`);
      }
    });

    // 5. Handle Remote Stream
    this.peerConnection.ontrack = (event) => {
      console.log('[WebRTC] 📥 Received remote track:', event.track.kind);
      
      if (event.streams && event.streams[0]) {
        if (!this.remoteStream) {
          console.log('[WebRTC] 🎉 Remote stream established!');
          this.remoteStream = event.streams[0];
          if (this.onRemoteStreamCallback) {
            this.onRemoteStreamCallback(this.remoteStream);
          }
        }
      }
    };

    // 6. Handle ICE Candidates
    this.peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        console.log('[WebRTC] 📤 Sending ICE candidate');
        this.sendSignal('candidate', {
          candidate: event.candidate.toJSON()
        });
      }
    };

    // 7. Monitor Connection States
    this.peerConnection.oniceconnectionstatechange = () => {
      const state = this.peerConnection?.iceConnectionState;
      console.log('[WebRTC] 🔌 ICE state:', state);
      
      if (state === 'connected') {
        console.log('[WebRTC] ✅ Peer-to-peer connection established!');
      } else if (state === 'disconnected' || state === 'failed' || state === 'closed') {
        console.warn('[WebRTC] ⚠️ Connection lost:', state);
        if (state === 'failed') {
          this.endCall();
        }
      }
    };

    this.peerConnection.onconnectionstatechange = () => {
      console.log('[WebRTC] 🔄 Connection state:', this.peerConnection?.connectionState);
    };

    // 8. Process any queued signals
    await this.processSignalQueue();

    // 9. Wait a moment for channel to be ready
    await new Promise(resolve => setTimeout(resolve, 1000));

    // 10. If Caller, Create Offer
    if (isCaller) {
      await this.createAndSendOffer();
    } else {
      console.log('[WebRTC] ⏳ Waiting for offer from caller...');
    }

    return this.localStream;
  }

  private async setupSignalingChannel() {
    const channelName = `webrtc-${this.tripId}`;
    console.log('[WebRTC] 📡 Setting up broadcast channel:', channelName);

    this.channel = supabaseClient
      .channel(channelName, {
        config: {
          broadcast: { 
            self: false, // Don't receive our own messages
            ack: false 
          },
          presence: { key: this.currentUserId }
        }
      })
      .on('broadcast', { event: 'signal' }, ({ payload }) => {
        this.handleSignal(payload);
      })
      .on('presence', { event: 'sync' }, () => {
        const state = this.channel.presenceState();
        console.log('[WebRTC] 👥 Presence sync:', Object.keys(state).length, 'users');
      })
      .subscribe(async (status: string) => {
        console.log('[WebRTC] 📡 Channel status:', status);
        
        if (status === 'SUBSCRIBED') {
          console.log('[WebRTC] ✅ Signaling channel ready!');
          
          // Track presence
          await this.channel.track({
            user_id: this.currentUserId,
            online_at: new Date().toISOString()
          });
        }
        
        if (status === 'CHANNEL_ERROR') {
          console.error('[WebRTC] ❌ Channel error!');
        }
      });
  }

  private sendSignal(type: string, data: any) {
    if (!this.channel) {
      console.error('[WebRTC] ❌ Cannot send signal: channel not ready');
      return;
    }

    const signal = {
      type,
      data,
      from: this.currentUserId,
      to: this.targetUserId,
      timestamp: Date.now()
    };

    console.log(`[WebRTC] 📤 Sending signal: ${type}`);
    
    this.channel.send({
      type: 'broadcast',
      event: 'signal',
      payload: signal
    });
  }

  private async handleSignal(signal: any) {
    // Only process signals meant for us
    if (signal.to !== this.currentUserId) {
      return;
    }

    console.log(`[WebRTC] 📨 Received signal: ${signal.type} from ${signal.from.substring(0, 8)}`);

    if (!this.isReady || !this.peerConnection) {
      console.warn('[WebRTC] ⚠️ Received signal but peer connection not ready, queueing...');
      this.signalQueue.push(signal);
      return;
    }

    try {
      await this.processSignal(signal);
    } catch (error) {
      console.error(`[WebRTC] ❌ Error handling ${signal.type}:`, error);
    }
  }

  private async processSignalQueue() {
    if (this.signalQueue.length === 0) return;
    
    console.log(`[WebRTC] 📦 Processing ${this.signalQueue.length} queued signals`);
    
    const queue = [...this.signalQueue];
    this.signalQueue = [];
    
    for (const signal of queue) {
      try {
        await this.processSignal(signal);
      } catch (error) {
        console.error(`[WebRTC] ❌ Error processing queued signal ${signal.type}:`, error);
      }
    }
  }

  private async processSignal(signal: any) {
    if (signal.type === 'offer' && !this.isInitiator) {
      await this.handleOffer(signal.data);
    } else if (signal.type === 'answer' && this.isInitiator) {
      await this.handleAnswer(signal.data);
    } else if (signal.type === 'candidate') {
      await this.handleCandidate(signal.data);
    } else if (signal.type === 'end') {
      console.log('[WebRTC] 📞 Call ended by remote peer');
      this.endCall(false);
    }
  }

  private async createAndSendOffer() {
    if (!this.peerConnection) return;

    try {
      console.log('[WebRTC] 📝 Creating offer...');
      const offer = await this.peerConnection.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: true
      });
      
      await this.peerConnection.setLocalDescription(offer);
      console.log('[WebRTC] ✅ Local description set (offer)');
      
      this.sendSignal('offer', { sdp: offer });
      console.log('[WebRTC] ✅ Offer sent to remote peer');
    } catch (error) {
      console.error('[WebRTC] ❌ Error creating offer:', error);
      throw error;
    }
  }

  private async handleOffer(data: any) {
    if (!this.peerConnection) return;

    try {
      console.log('[WebRTC] 📥 Processing offer...');
      
      await this.peerConnection.setRemoteDescription(
        new RTCSessionDescription(data.sdp)
      );
      console.log('[WebRTC] ✅ Remote description set (offer)');
      
      // Process queued candidates
      await this.processCandidateQueue();
      
      // Create answer
      console.log('[WebRTC] 📝 Creating answer...');
      const answer = await this.peerConnection.createAnswer();
      await this.peerConnection.setLocalDescription(answer);
      console.log('[WebRTC] ✅ Local description set (answer)');
      
      // Send answer
      this.sendSignal('answer', { sdp: answer });
      console.log('[WebRTC] ✅ Answer sent to remote peer');
    } catch (error) {
      console.error('[WebRTC] ❌ Error handling offer:', error);
    }
  }

  private async handleAnswer(data: any) {
    if (!this.peerConnection) return;

    try {
      console.log('[WebRTC] 📥 Processing answer...');
      
      await this.peerConnection.setRemoteDescription(
        new RTCSessionDescription(data.sdp)
      );
      console.log('[WebRTC] ✅ Remote description set (answer)');
      
      // Process queued candidates
      await this.processCandidateQueue();
    } catch (error) {
      console.error('[WebRTC] ❌ Error handling answer:', error);
    }
  }

  private async handleCandidate(data: any) {
    if (!this.peerConnection) return;

    try {
      const candidate = new RTCIceCandidate(data.candidate);
      
      if (this.peerConnection.remoteDescription && 
          this.peerConnection.remoteDescription.type) {
        await this.peerConnection.addIceCandidate(candidate);
        console.log('[WebRTC] ✅ ICE candidate added');
      } else {
        console.log('[WebRTC] 📦 Queueing ICE candidate');
        this.candidateQueue.push(candidate);
      }
    } catch (error) {
      console.error('[WebRTC] ❌ Error adding candidate:', error);
    }
  }

  private async processCandidateQueue() {
    if (!this.peerConnection || this.candidateQueue.length === 0) return;
    
    console.log(`[WebRTC] 📦 Processing ${this.candidateQueue.length} queued candidates`);

    const queue = [...this.candidateQueue];
    this.candidateQueue = [];

    for (const candidate of queue) {
      try {
        await this.peerConnection.addIceCandidate(candidate);
        console.log('[WebRTC] ✅ Queued candidate added');
      } catch (error) {
        console.error('[WebRTC] ❌ Error adding queued candidate:', error);
      }
    }
  }

  onRemoteStream(callback: (stream: MediaStream) => void) {
    this.onRemoteStreamCallback = callback;
  }

  onCallEnd(callback: () => void) {
    this.onCallEndCallback = callback;
  }

  endCall(sendSignal: boolean = true) {
    console.log('[WebRTC] 📵 Ending call...', { sendSignal });

    this.isReady = false;

    // Send end signal to remote peer
    if (sendSignal && this.channel) {
      this.sendSignal('end', {});
    }

    // Stop local stream
    if (this.localStream) {
      this.localStream.getTracks().forEach(track => {
        track.stop();
        console.log(`[WebRTC] 🛑 Stopped ${track.kind} track`);
      });
      this.localStream = null;
    }

    // Close peer connection
    if (this.peerConnection) {
      this.peerConnection.close();
      this.peerConnection = null;
      console.log('[WebRTC] 🔒 Peer connection closed');
    }

    // Unsubscribe from channel
    if (this.channel) {
      supabaseClient.removeChannel(this.channel);
      this.channel = null;
      console.log('[WebRTC] 📡 Channel unsubscribed');
    }

    // Clear state
    this.remoteStream = null;
    this.candidateQueue = [];
    this.signalQueue = [];

    console.log('[WebRTC] ✅ Call cleanup complete');

    // Trigger callback
    if (this.onCallEndCallback) {
      this.onCallEndCallback();
    }
  }
}
