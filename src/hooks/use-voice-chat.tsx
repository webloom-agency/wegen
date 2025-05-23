import { useCallback, useEffect, useRef, useState } from "react";

import React from "react";
import { Mic, MicOff, Wifi } from "lucide-react";
import { fetcher } from "lib/utils";
import { VOICE_MODELS } from "lib/ai/realtime/open-ai/voice-models";
import { UIMessage } from "ai";

export interface VoiceChatAdapter {
  startSession: () => Promise<void>;
  stopSession: () => Promise<void>;
  startListening: () => Promise<void>;
  stopListening: () => Promise<void>;
  onMessage: (callback: (message: UIMessage) => void) => void;
}

export const useVoiceChat = (adapter: VoiceChatAdapter) => {
  const [messages, setMessages] = useState<UIMessage[]>([]);
  const [isActive, setIsActive] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const stop = useCallback(async () => {
    try {
      try {
        await adapter.stopListening();
      } catch (err) {
        console.error("Error stopping listening:", err);
      }
      await adapter.stopSession();
    } catch (err) {
      console.error("Error stopping session:", err);
    } finally {
      setIsActive(false);
      setIsListening(false);
    }
  }, [adapter]);

  const start = useCallback(async () => {
    setError(null);
    try {
      await adapter.startSession();
      setIsActive(true);
    } catch (err) {
      setError(err as Error);
      await stop();
    }
  }, [adapter, stop]);

  const startListening = useCallback(async () => {
    if (!isActive) return;
    setError(null);
    try {
      await adapter.startListening();
      setIsListening(true);
    } catch (err) {
      setError(err as Error);
      await stop();
    }
  }, [adapter, isActive, stop]);

  const stopListening = useCallback(async () => {
    if (!isActive) return;
    try {
      await adapter.stopListening();
    } catch (err) {
      console.error("Error stopping listening:", err);
    } finally {
      setIsListening(false);
    }
  }, [adapter, isActive]);

  useEffect(() => {
    adapter.onMessage((message) => {
      setMessages((prev) => [...prev, message]);
    });
  }, [adapter]);

  useEffect(() => {
    return () => {
      stop();
    };
  }, [stop]);

  return {
    messages,
    isActive,
    isListening,
    error,
    start,
    stop,
    startListening,
    stopListening,
  };
};

export const AutoVoice = () => {
  const [logs, setLogs] = useState<any[]>([]);
  const [isSessionActive, setIsSessionActive] = useState(false);
  const [isListening, setIsListening] = useState(false);

  const [dataChannel, setDataChannel] = useState<RTCDataChannel | null>(null);
  const peerConnection = useRef<RTCPeerConnection | null>(null);
  const audioElement = useRef<HTMLAudioElement | null>(null);
  const [audioStream, setAudioStream] = useState<MediaStream | null>(null);
  const audioTransceiver = useRef<RTCRtpTransceiver | null>(null);
  const tracks = useRef<RTCRtpSender[] | null>(null);

  const startSession = async () => {
    const session = await fetcher("/api/chat/openai-realtime");
    const sessionToken = session.client_secret.value;

    const pc = new RTCPeerConnection();

    if (!audioElement.current) {
      audioElement.current = document.createElement("audio");
    }
    audioElement.current.autoplay = true;
    pc.ontrack = (e) => {
      if (audioElement.current) {
        audioElement.current.srcObject = e.streams[0];
      }
    };

    const stream = await navigator.mediaDevices.getUserMedia({
      audio: true,
    });

    stream.getTracks().forEach((track) => {
      const sender = pc.addTrack(track, stream);
      if (sender) {
        tracks.current = [...(tracks.current || []), sender];
      }
    });

    // Set up data channel for sending and receiving events
    const dc = pc.createDataChannel("oai-events");
    setDataChannel(dc);

    // Start the session using the Session Description Protocol (SDP)
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

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
    await pc.setRemoteDescription(answer);

    peerConnection.current = pc;
  };

  function stopSession() {
    if (dataChannel) {
      dataChannel.close();
    }
    if (peerConnection.current) {
      peerConnection.current.close();
    }

    setIsSessionActive(false);
    setDataChannel(null);
    peerConnection.current = null;
    if (audioStream) {
      audioStream.getTracks().forEach((track) => track.stop());
    }
    setAudioStream(null);
    setIsListening(false);
    audioTransceiver.current = null;
  }

  // Grabs a new mic track and replaces the placeholder track in the transceiver
  async function startRecording() {
    try {
      const newStream = await navigator.mediaDevices.getUserMedia({
        audio: true,
      });
      setAudioStream(newStream);

      // If we already have an audioSender, just replace its track:
      if (tracks.current) {
        const micTrack = newStream.getAudioTracks()[0];
        tracks.current.forEach((sender) => {
          sender.replaceTrack(micTrack);
        });
      } else if (peerConnection.current) {
        // Fallback if audioSender somehow didn't get set
        newStream.getTracks().forEach((track) => {
          const sender = peerConnection.current?.addTrack(track, newStream);
          if (sender) {
            tracks.current = [...(tracks.current || []), sender];
          }
        });
      }

      setIsListening(true);
      console.log("Microphone started.");
    } catch (error) {
      console.error("Error accessing microphone:", error);
    }
  }
  // Replaces the mic track with a placeholder track
  function stopRecording() {
    setIsListening(false);

    // Stop existing mic tracks so the user's mic is off
    if (audioStream) {
      audioStream.getTracks().forEach((track) => track.stop());
    }
    setAudioStream(null);

    // Replace with a placeholder (silent) track
    if (tracks.current) {
      const placeholderTrack = createEmptyAudioTrack();
      tracks.current.forEach((sender) => {
        sender.replaceTrack(placeholderTrack);
      });
    }
  }

  // Creates a placeholder track that is silent
  function createEmptyAudioTrack(): MediaStreamTrack {
    const audioContext = new AudioContext();
    const destination = audioContext.createMediaStreamDestination();
    return destination.stream.getAudioTracks()[0];
  }

  // Send a message to the model
  const sendClientEvent = useCallback(
    (message: any) => {
      if (dataChannel) {
        message.event_id = message.event_id || crypto.randomUUID();
        dataChannel.send(JSON.stringify(message));
      } else {
        console.error(
          "Failed to send message - no data channel available",
          message,
        );
      }
    },
    [dataChannel],
  );
  // Attach event listeners to the data channel when a new one is created
  useEffect(() => {
    if (!dataChannel) return;

    // Append new server events to the list
    dataChannel.addEventListener("message", (e) => {
      const event = JSON.parse(e.data);
      if (event.type === "response.done") {
        const output = event.response.output[0];
        setLogs((prev) => [output, ...prev]);
        if (output?.type === "function_call") {
          console.log("Function call:", output);
        }
      }
    });

    // Set session active when the data channel is opened
    dataChannel.addEventListener("open", () => {
      setIsSessionActive(true);
      setIsListening(true);
      setLogs([]);
      // Send session config
      const sessionUpdate = {
        type: "session.update",
        session: {
          // tools: TOOLS,
          // instructions: INSTRUCTIONS,
        },
      };
      sendClientEvent(sessionUpdate);
      console.log("Session update sent:", sessionUpdate);
    });
  }, [dataChannel, sendClientEvent]);

  const handleConnectClick = async () => {
    if (isSessionActive) {
      console.log("Stopping session.");
      stopSession();
    } else {
      console.log("Starting session.");
      startSession();
    }
  };

  const handleMicToggleClick = async () => {
    if (isListening) {
      console.log("Stopping microphone.");
      stopRecording();
    } else {
      console.log("Starting microphone.");
      startRecording();
    }
  };

  return (
    <>
      <Controls
        handleConnectClick={handleConnectClick}
        handleMicToggleClick={handleMicToggleClick}
        isConnected={isSessionActive}
        isListening={isListening}
      />
      <div className="mt-4 p-4 bg-slate-800 rounded overflow-auto max-h-64">
        {logs.map((log, idx) => (
          <div key={idx} className="text-white text-sm mb-2">
            {JSON.stringify(log)}
          </div>
        ))}
      </div>
    </>
  );
};

interface ControlsProps {
  isConnected: boolean;
  isListening: boolean;
  handleConnectClick: () => void;
  handleMicToggleClick: () => void;
}

const Controls: React.FC<ControlsProps> = ({
  isConnected,
  isListening,
  handleConnectClick,
  handleMicToggleClick,
}) => {
  return (
    <div className="absolute top-4 right-4 flex items-center z-10">
      <div
        className="flex bg-slate-800 p-2.5 items-center rounded-full mr-2 cursor-pointer"
        onClick={handleConnectClick}
      >
        <Wifi
          className={`h-6 w-6 ${
            isConnected ? "text-green-500" : "text-red-500"
          }`}
        />
      </div>
      <div
        className={`flex bg-slate-800 p-2.5 items-center rounded-full ${
          isConnected ? "cursor-pointer" : "cursor-not-allowed"
        }`}
        onClick={handleMicToggleClick}
      >
        {isListening ? (
          <Mic className="h-6 w-6 text-green-500" />
        ) : (
          <MicOff className="h-6 w-6 text-red-500" />
        )}
      </div>
    </div>
  );
};

export default Controls;
