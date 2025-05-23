"use client";

import { VoiceChatAdapter } from "@/hooks/use-voice-chat";
import { VOICE_MODELS } from "./voice-models";
import { UIMessage } from "ai";

import { fetcher } from "lib/utils";

export function createOpenAIVoiceChatAdapter(): VoiceChatAdapter {
  // Internal state
  let peerConnection: RTCPeerConnection | null = null;
  let dataChannel: RTCDataChannel | null = null;
  let audioElement: HTMLAudioElement | null = null;
  let audioStream: MediaStream | null = null;
  let tracks: RTCRtpSender[] = [];
  let onMessageCallback: ((message: UIMessage) => void) | null = null;

  async function startSession() {
    const session = await fetcher("/api/chat/openai-realtime");
    const sessionToken = session.client_secret.value;

    peerConnection = new RTCPeerConnection();

    if (!audioElement) {
      audioElement = document.createElement("audio");
    }
    audioElement.autoplay = true;
    peerConnection.ontrack = (e) => {
      if (audioElement) {
        audioElement.srcObject = e.streams[0];
      }
    };

    audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    audioStream.getTracks().forEach((track) => {
      const sender = peerConnection!.addTrack(track, audioStream!);
      if (sender) {
        tracks.push(sender);
      }
    });

    dataChannel = peerConnection.createDataChannel("oai-events");
    // Attach event listeners
    dataChannel.addEventListener("message", (e) => {
      if (onMessageCallback) {
        try {
          const event = JSON.parse(e.data);
          // You may want to transform event to UIMessage here
          onMessageCallback(event);
        } catch {
          // Ignore parse errors
        }
      }
    });

    // Start the session using the Session Description Protocol (SDP)
    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);

    const sdpResponse = await fetch(
      `https://api.openai.com/v1/realtime?model=${VOICE_MODELS[1].id}`,
      {
        method: "POST",
        body: offer.sdp,
        headers: {
          Authorization: `Bearer ${sessionToken}`,
          "Content-Type": "application/sdp",
        },
      },
    );

    const answer: RTCSessionDescriptionInit = {
      type: "answer",
      sdp: await sdpResponse.text(),
    };
    await peerConnection.setRemoteDescription(answer);
  }

  async function stopSession() {
    if (dataChannel) {
      dataChannel.close();
      dataChannel = null;
    }
    if (peerConnection) {
      peerConnection.close();
      peerConnection = null;
    }
    if (audioStream) {
      audioStream.getTracks().forEach((track) => track.stop());
      audioStream = null;
    }
    tracks = [];
    audioElement = null;
  }

  async function startListening() {
    // Grabs a new mic track and replaces the placeholder track in the transceiver
    if (!peerConnection) return;
    const newStream = await navigator.mediaDevices.getUserMedia({
      audio: true,
    });
    audioStream = newStream;
    if (tracks.length) {
      const micTrack = newStream.getAudioTracks()[0];
      tracks.forEach((sender) => {
        sender.replaceTrack(micTrack);
      });
    } else {
      newStream.getTracks().forEach((track) => {
        const sender = peerConnection!.addTrack(track, newStream);
        if (sender) {
          tracks.push(sender);
        }
      });
    }
    // TODO: Optionally notify server/client of mic start
  }

  async function stopListening() {
    // Stop existing mic tracks so the user's mic is off
    if (audioStream) {
      audioStream.getTracks().forEach((track) => track.stop());
      audioStream = null;
    }
    // Replace with a placeholder (silent) track
    if (tracks.length) {
      const placeholderTrack = createEmptyAudioTrack();
      tracks.forEach((sender) => {
        sender.replaceTrack(placeholderTrack);
      });
    }
    // TODO: Optionally notify server/client of mic stop
  }

  function createEmptyAudioTrack(): MediaStreamTrack {
    const audioContext = new AudioContext();
    const destination = audioContext.createMediaStreamDestination();
    return destination.stream.getAudioTracks()[0];
  }

  function onMessage(cb: (message: UIMessage) => void) {
    onMessageCallback = cb;
  }

  return {
    startSession,
    stopSession,
    startListening,
    stopListening,
    onMessage,
  };
}
