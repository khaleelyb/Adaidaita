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
  private onIncomingCallCallback: (() => void) | null = null;
  private candidateQueue: RTCIceCandidate[] = [];
  private channel: any = null;
  private isInitiator: boolean = false;
  private isChannelReady: boolean = false;
  private hasRemoteDescription: boolean = false;
  private isListening: boolean = false;
  
  // New properties for handling incoming call state
  private pendingOffer: any = null;
  private preAnswerCandidates: any[] = [];

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

  /**
   * Start listening for incoming calls
   * This should be called as soon as a trip is active
   */
  async startListening() {
    if (this.isListening) {
      console.log('[WebRTC] ⚠️ Already listening for calls');
      return;
    }

    console.log('[WebRTC] 👂 Starting to listen for incoming calls...');
    this.isListening = true;

    await this.setupSignalingChannel();
  }

  /**
   * Stop listening for calls
   */
  stopListening() {
    console.log('[WebRTC] 🔇 Stopping call listener...');
    this.isListening = false;
    this.pendingOffer = null;
    this.preAnswerCandidates = [];
    
    if (this.channel) {
      supabaseClient.removeChannel(this.channel);
      this.channel = null;
      this.isChannelReady = false;
    }
  }

  /**
   * Callback for when someone tries to call you
   */
  onIncomingCall(callback: () => void) {
    this.onIncomingCallCallback = callback;
  }

  /**
   * Answer an incoming call
   */
  async answerCall(): Promise<MediaStream> {
    console.log('[WebRTC] 📞 Answering incoming call...');
    this.isInitiator = false;
    return this.startCall(false);
  }

  /**
   * Initiate a call (caller)
   */
  async initiateCall(): Promise<MediaStream> {
    console.log('[WebRTC] 📞 Initiating outgoing call...');
    this.isInitiator = true;
    
    // Ensure we're listening first
    if (!this.isListening) {
      await this.startListening();
    }
    
    return this.startCall(true);
  }

  private async startCall(isCaller: boolean): Promise<MediaStream> {
    console.log(`[WebRTC] 📞 Starting call as ${isCaller ? 'CALLER' : 'RECEIVER'}`);

    // 1. Get Local Media FIRST
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

    // 2. Ensure Signaling Channel is ready
    if (!this.isChannelReady) {
      await this.waitForChannelReady();
    }

    // 3. Create Peer Connection
    console.log('[WebRTC] 🔗 Creating peer connection...');
    this.peerConnection = new RTCPeerConnection({ 
      iceServers: ICE_SERVERS,
      iceCandidatePoolSize: 10,
      bundlePolicy: 'max-bundle',
      rtcpMuxPolicy: 'require'
    });

    // 4. Add Local Tracks
    this.localStream.getTracks().forEach(track => {
      if (this.localStream && this.peerConnection) {
        this.peerConnection.addTrack(track, this.localStream);
        console.log(`[WebRTC] ➕ Added ${track.kind} track`);
      }
    });

    // 5. Handle Remote Stream
    this.remoteStream = new MediaStream();
    this.peerConnection.ontrack = (event) => {
      console.log('[WebRTC] 📥 Received remote track:', event.track.kind);
      
      if (this.remoteStream) {
        this.remoteStream.addTrack(event.track);
        
        // Notify when we have at least one track
        if (this.onRemoteStreamCallback && this.remoteStream.getTracks().length > 0) {
          console.log('[WebRTC] 🎉 Remote stream ready with', this.remoteStream.getTracks().length, 'tracks');
          this.onRemoteStreamCallback(this.remoteStream);
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
      } else {
        console.log('[WebRTC] ✅ ICE gathering complete');
      }
    };

    // 7. Monitor Connection States
    this.peerConnection.oniceconnectionstatechange = () => {
      const state = this.peerConnection?.iceConnectionState;
      console.log('[WebRTC] 🔌 ICE state:', state);
      
      if (state === 'connected' || state === 'completed') {
        console.log('[WebRTC] ✅ Peer-to-peer connection established!');
      } else if (state === 'disconnected') {
        console.warn('[WebRTC] ⚠️ Connection disconnected, waiting for reconnection...');
      } else if (state === 'failed') {
        console.error('[WebRTC] ❌ Connection failed');
        this.endCall();
      } else if (state === 'closed') {
        console.log('[WebRTC] 🔒 Connection closed');
      }
    };

    this.peerConnection.onconnectionstatechange = () => {
      const state = this.peerConnection?.connectionState;
      console.log('[WebRTC] 🔄 Connection state:', state);
      
      if (state === 'connected') {
        console.log('[WebRTC] 🎉 Fully connected!');
      }
    };

    // 8. If Caller, Create Offer
    if (isCaller) {
      console.log('[WebRTC] 📞 Caller initiating offer...');
      await this.createAndSendOffer();
    } else {
      console.log('[WebRTC] 📱 Receiver ready, waiting for offer...');
      
      // If we have a pending offer (received while phone was ringing), process it now
      if (this.pendingOffer) {
        console.log('[WebRTC] 📨 Processing pending offer...');
        await this.handleOffer(this.pendingOffer);
        this.pendingOffer = null;

        // Also process any pre-answer candidates
        if (this.preAnswerCandidates.length > 0) {
          console.log(`[WebRTC] 📦 Processing ${this.preAnswerCandidates.length} pre-answer candidates`);
          for (const candidateData of this.preAnswerCandidates) {
            await this.handleCandidate(candidateData);
          }
          this.preAnswerCandidates = [];
        }
      }
    }

    return this.localStream;
  }

  private async waitForChannelReady(timeout: number = 10000): Promise<void> {
    const startTime = Date.now();
    while (!this.isChannelReady) {
      if (Date.now() - startTime > timeout) {
        throw new Error('Signaling channel timeout');
      }
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    console.log('[WebRTC] ✅ Signaling channel ready!');
  }

  private async setupSignalingChannel() {
    const channelName = `webrtc-${this.tripId}`;
    console.log('[WebRTC] 📡 Setting up broadcast channel:', channelName);

    return new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Channel setup timeout'));
      }, 10000);

      this.channel = supabaseClient
        .channel(channelName, {
          config: {
            broadcast: { 
              self: false,
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
          const users = Object.keys(state).length;
          console.log('[WebRTC] 👥 Presence sync:', users, 'users');
          
          if (users >= 2) {
            console.log('[WebRTC] ✅ Both peers present!');
          }
        })
        .subscribe(async (status: string) => {
          console.log('[WebRTC] 📡 Channel status:', status);
          
          if (status === 'SUBSCRIBED') {
            clearTimeout(timeout);
            console.log('[WebRTC] ✅ Channel subscribed!');
            
            try {
              await this.channel.track({
                user_id: this.currentUserId,
                online_at: new Date().toISOString()
              });
              
              this.isChannelReady = true;
              resolve();
            } catch (error) {
              console.error('[WebRTC] ❌ Error tracking presence:', error);
              this.isChannelReady = true;
              resolve();
            }
          } else if (status === 'CHANNEL_ERROR') {
            clearTimeout(timeout);
            console.error('[WebRTC] ❌ Channel error!');
            reject(new Error('Channel error'));
          }
        });
    });
  }

  private sendSignal(type: string, data: any) {
    if (!this.channel || !this.isChannelReady) {
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

    // CASE 1: Incoming Offer while listening (Ringing state)
    // We store the offer and trigger the UI callback
    if (signal.type === 'offer' && !this.peerConnection && this.isListening) {
      console.log('[WebRTC] 🔔 Incoming call detected! Storing offer.');
      this.pendingOffer = signal.data;
      
      // Trigger incoming call callback
      if (this.onIncomingCallCallback) {
        this.onIncomingCallCallback();
      }
      return;
    }

    // CASE 2: Early Candidates (while ringing)
    // Store these to replay after we answer
    if (signal.type === 'candidate' && !this.peerConnection && this.isListening && this.pendingOffer) {
      console.log('[WebRTC] 📦 Storing pre-answer candidate');
      this.preAnswerCandidates.push(signal.data);
      return;
    }

    if (!this.peerConnection) {
      console.warn('[WebRTC] ⚠️ Received signal but peer connection not ready');
      return;
    }

    try {
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
    } catch (error) {
      console.error(`[WebRTC] ❌ Error handling ${signal.type}:`, error);
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
      this.hasRemoteDescription = true;
      console.log('[WebRTC] ✅ Remote description set (offer)');
      
      await this.processCandidateQueue();
      
      console.log('[WebRTC] 📝 Creating answer...');
      const answer = await this.peerConnection.createAnswer();
      
      await this.peerConnection.setLocalDescription(answer);
      console.log('[WebRTC] ✅ Local description set (answer)');
      
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
      this.hasRemoteDescription = true;
      console.log('[WebRTC] ✅ Remote description set (answer)');
      
      await this.processCandidateQueue();
    } catch (error) {
      console.error('[WebRTC] ❌ Error handling answer:', error);
    }
  }

  private async handleCandidate(data: any) {
    if (!this.peerConnection) return;

    try {
      const candidate = new RTCIceCandidate(data.candidate);
      
      if (this.hasRemoteDescription) {
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

    if (sendSignal && this.channel && this.isChannelReady) {
      this.sendSignal('end', {});
    }

    if (this.localStream) {
      this.localStream.getTracks().forEach(track => {
        track.stop();
      });
      this.localStream = null;
    }

    if (this.peerConnection) {
      this.peerConnection.close();
      this.peerConnection = null;
    }

    this.remoteStream = null;
    this.candidateQueue = [];
    this.preAnswerCandidates = [];
    this.pendingOffer = null;
    this.hasRemoteDescription = false;

    console.log('[WebRTC] ✅ Call cleanup complete');

    if (this.onCallEndCallback) {
      this.onCallEndCallback();
    }
    
    // Keep listening for new calls if we were listening before
    if (this.isListening && !this.isChannelReady) {
      console.log('[WebRTC] 🔄 Restarting listener...');
      this.setupSignalingChannel();
    }
  }

  /**
   * Complete cleanup - stops listening too
   */
  destroy() {
    console.log('[WebRTC] 💥 Destroying WebRTC service...');
    this.endCall(false);
    this.stopListening();
  }
}
