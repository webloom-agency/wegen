"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import {
  DEFAULT_VOICE_TOOLS,
  UIMessageWithCompleted,
  VoiceChatSession,
} from "..";
import { useLatest } from "@/hooks/use-latest";
import { generateUUID } from "lib/utils";
import { TextPart } from "ai";
import {
  OpenAIRealtimeServerEvent,
  OpenAIRealtimeSession,
} from "./openai-realtime-event";

import { ToolInvocationUIPart } from "app-types/chat";
import { appStore } from "@/app/store";
import { useShallow } from "zustand/shallow";
import { callMcpToolAction } from "@/app/api/mcp/actions";
import { extractMCPToolId } from "../../mcp/mcp-tool-id";
import { useTheme } from "next-themes";

export const OPENAI_VOICE = {
  Alloy: "alloy",
  Nova: "nova",
  Sage: "sage",
  Shimmer: "shimmer",
  Verse: "verse",
  Onyx: "onyx",
  Coral: "coral",
  Fable: "fable",
  Ash: "ash",
};

interface UseOpenAIVoiceChatProps {
  model?: string;
  voice?: string;
}

type Content =
  | {
      type: "text";
      text: string;
    }
  | {
      type: "tool-invocation";
      name: string;
      arguments: any;
      state: "call" | "result";
      toolCallId: string;
      result?: any;
    };

const createUIPart = (content: Content): TextPart | ToolInvocationUIPart => {
  if (content.type == "tool-invocation") {
    return {
      type: "tool-invocation",
      toolInvocation: {
        args: content.arguments,
        state: content.state,
        result: content.result,
        step: 0,
        toolName: content.name,
        toolCallId: content.toolCallId,
      },
    };
  }
  return {
    type: "text",
    text: content.text,
  };
};

const createUIMessage = (m: {
  id?: string;
  role: "user" | "assistant";
  content: Content;
}): UIMessageWithCompleted => {
  const id = m.id ?? generateUUID();
  return {
    id,
    role: m.role,
    content: "",
    parts: [createUIPart(m.content)],
    completed: false,
  };
};

export function useOpenAIVoiceChat(
  props?: UseOpenAIVoiceChatProps,
): VoiceChatSession {
  const {
    model = "gpt-4o-mini-realtime-preview-2024-12-17",
    voice = OPENAI_VOICE.Ash,
  } = props || {};

  const [
    currentThreadId,
    allowedAppDefaultToolkit,
    allowedMcpServers,
    toolChoice,
  ] = appStore(
    useShallow((state) => [
      state.currentThreadId,
      state.allowedAppDefaultToolkit,
      state.allowedMcpServers,
      state.toolChoice,
    ]),
  );

  const [isActive, setIsActive] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [messages, setMessages] = useState<UIMessageWithCompleted[]>([]);
  const [micVolume, setMicVolume] = useState<number>(0);
  const peerConnection = useRef<RTCPeerConnection | null>(null);
  const dataChannel = useRef<RTCDataChannel | null>(null);
  const audioElement = useRef<HTMLAudioElement | null>(null);
  const audioStream = useRef<MediaStream | null>(null);
  const { setTheme } = useTheme();

  const tracks = useRef<RTCRtpSender[]>([]);
  const latest = useLatest(messages);

  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  const measureMicVolume = useCallback(() => {
    if (!analyserRef.current) return;
    const bufferLength = analyserRef.current.fftSize;
    const dataArray = new Uint8Array(bufferLength);
    analyserRef.current.getByteTimeDomainData(dataArray);
    let sum = 0;
    for (let i = 0; i < bufferLength; i++) {
      const value = (dataArray[i] - 128) / 128;
      sum += value * value;
    }
    const rms = Math.sqrt(sum / bufferLength);
    const volume = Math.min(100, Math.max(0, Math.round(rms * 100)));
    setMicVolume(volume);
    animationFrameRef.current = requestAnimationFrame(measureMicVolume);
  }, []);

  const setupMicAnalyser = useCallback(() => {
    if (audioStream.current && !audioContextRef.current) {
      const audioContext = new (
        window.AudioContext || (window as any).webkitAudioContext
      )();
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      const source = audioContext.createMediaStreamSource(audioStream.current);
      source.connect(analyser);
      audioContextRef.current = audioContext;
      analyserRef.current = analyser;
      measureMicVolume();
    }
  }, []);

  const cleanupMicAnalyser = useCallback(() => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    analyserRef.current = null;
    setMicVolume(0);
  }, []);

  const startListening = useCallback(async () => {
    try {
      if (!audioStream.current) {
        audioStream.current = await navigator.mediaDevices.getUserMedia({
          audio: true,
        });
      }
      if (tracks.current.length) {
        const micTrack = audioStream.current.getAudioTracks()[0];
        tracks.current.forEach((sender) => {
          sender.replaceTrack(micTrack);
        });
      }
      setIsListening(true);
      setupMicAnalyser();
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
    }
  }, []);

  const stopListening = useCallback(async () => {
    try {
      if (audioStream.current) {
        audioStream.current.getTracks().forEach((track) => track.stop());
        audioStream.current = null;
      }
      if (tracks.current.length) {
        const placeholderTrack = createEmptyAudioTrack();
        tracks.current.forEach((sender) => {
          sender.replaceTrack(placeholderTrack);
        });
      }
      setIsListening(false);
      cleanupMicAnalyser();
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
    }
  }, []);

  const createSession =
    useCallback(async (): Promise<OpenAIRealtimeSession> => {
      const response = await fetch(
        `/api/chat/openai-realtime?model=${model}&voice=${voice}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model,
            voice,
            allowedAppDefaultToolkit,
            allowedMcpServers,
            threadId: currentThreadId,
            toolChoice,
          }),
        },
      );
      return response.json();
    }, [
      model,
      voice,
      allowedAppDefaultToolkit,
      allowedMcpServers,
      currentThreadId,
      toolChoice,
    ]);

  const updateUIMessage = useCallback(
    (
      id: string,
      action:
        | Partial<UIMessageWithCompleted>
        | ((
            message: UIMessageWithCompleted,
          ) => Partial<UIMessageWithCompleted>),
    ) => {
      setMessages((prev) => {
        if (prev.length) {
          const lastMessage = prev.find((m) => m.id == id);
          if (!lastMessage) return prev;
          const nextMessage =
            typeof action === "function" ? action(lastMessage) : action;
          if (lastMessage == nextMessage) return prev;
          return prev.map((m) => (m.id == id ? { ...m, ...nextMessage } : m));
        }
        return prev;
      });
    },
    [],
  );

  const clientFunctionCall = useCallback(
    async ({
      callId,
      toolName,
      args,
      id,
    }: { callId: string; toolName: string; args: string; id: string }) => {
      let toolResult: any = "success";
      stopListening();

      if (DEFAULT_VOICE_TOOLS.some((t) => t.name === toolName)) {
        switch (toolName) {
          case "toggleBrowserTheme":
            setTheme((prev) => (prev === "dark" ? "light" : "dark"));
            break;
          case "endConversation":
            stop();
            break;
        }
      } else {
        const toolId = extractMCPToolId(toolName);
        const toolArgs = JSON.parse(args);
        toolResult = await callMcpToolAction(
          toolId.serverName,
          toolId.toolName,
          toolArgs,
        );
      }
      startListening();
      const resultText = JSON.stringify(toolResult).trim();

      const event = {
        type: "conversation.item.create",
        previous_item_id: id,
        item: {
          type: "function_call_output",
          call_id: callId,
          output: resultText.slice(0, 15000),
        },
      };
      updateUIMessage(id, (prev) => {
        const prevPart = prev.parts.find((p) => p.type == "tool-invocation");
        if (!prevPart) return prev;
        const nextPart: ToolInvocationUIPart = {
          ...prevPart,
          toolInvocation: {
            ...prevPart.toolInvocation,
            result: toolResult,
            state: "result",
          },
        };
        return {
          parts: [nextPart],
        };
      });
      dataChannel.current?.send(JSON.stringify(event));
      dataChannel.current?.send(JSON.stringify({ type: "response.create" }));
    },
    [updateUIMessage],
  );

  const handleServerEvent = useCallback(
    (event: OpenAIRealtimeServerEvent) => {
      switch (event.type) {
        case "input_audio_buffer.speech_started": {
          const message = createUIMessage({
            role: "user",
            id: event.item_id,
            content: {
              type: "text",
              text: "",
            },
          });
          setMessages((prev) => [...prev, message]);
          break;
        }
        case "input_audio_buffer.committed": {
          updateUIMessage(event.item_id, {
            parts: [
              {
                type: "text",
                text: "...speaking",
              },
            ],
            completed: true,
          });
          break;
        }
        case "conversation.item.input_audio_transcription.completed": {
          updateUIMessage(event.item_id, {
            parts: [
              {
                type: "text",
                text: event.transcript || "...speaking",
              },
            ],
            completed: true,
          });
          break;
        }
        case "response.audio_transcript.delta": {
          const message = latest.current.findLast(
            (m) => m.id == event.item_id,
          )!;
          if (!message) {
            setMessages((prev) => [
              ...prev,
              createUIMessage({
                role: "assistant",
                id: event.item_id,
                content: {
                  type: "text",
                  text: "",
                },
              }),
            ]);
          }
          break;
        }
        case "response.audio_transcript.done": {
          updateUIMessage(event.item_id, (prev) => {
            const textPart = prev.parts.find((p) => p.type == "text");
            if (!textPart) return prev;
            textPart.text = event.transcript || "";
            return prev;
          });
          break;
        }
        case "response.function_call_arguments.done": {
          const message = createUIMessage({
            role: "assistant",
            id: event.item_id,
            content: {
              type: "tool-invocation",
              name: event.name,
              arguments: JSON.parse(event.arguments),
              state: "call",
              toolCallId: event.call_id,
            },
          });
          setMessages((prev) => [...prev, message]);
          clientFunctionCall({
            callId: event.call_id,
            toolName: event.name,
            args: event.arguments,
            id: event.item_id,
          });
          break;
        }
      }
    },
    [clientFunctionCall, updateUIMessage],
  );

  const start = useCallback(async () => {
    if (isActive || isLoading) return;
    setIsLoading(true);
    setError(null);
    try {
      const session = await createSession();
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
      if (!audioStream.current) {
        audioStream.current = await navigator.mediaDevices.getUserMedia({
          audio: true,
        });
      }
      tracks.current = [];
      audioStream.current.getTracks().forEach((track) => {
        const sender = pc.addTrack(track, audioStream.current!);
        if (sender) tracks.current.push(sender);
      });

      const dc = pc.createDataChannel("oai-events");
      dataChannel.current = dc;
      dc.addEventListener("message", async (e) => {
        try {
          const event = JSON.parse(e.data) as OpenAIRealtimeServerEvent;
          handleServerEvent(event);
        } catch (err) {
          console.error({
            data: e.data,
            error: err,
          });
        }
      });
      dc.addEventListener("open", () => {
        setIsActive(true);
        setIsListening(true);
        setIsLoading(false);
      });
      dc.addEventListener("close", () => {
        setIsActive(false);
        setIsListening(false);
        setIsLoading(false);
      });
      dc.addEventListener("error", (errorEvent) => {
        console.error(errorEvent);
        setError(errorEvent.error);
        setIsActive(false);
        setIsListening(false);
      });
      const offer = await pc.createOffer();
      console.log(session);
      await pc.setLocalDescription(offer);
      const sdpResponse = await fetch(`https://api.openai.com/v1/realtime`, {
        method: "POST",
        body: offer.sdp,
        headers: {
          Authorization: `Bearer ${sessionToken}`,
          "Content-Type": "application/sdp",
        },
      });
      const answer: RTCSessionDescriptionInit = {
        type: "answer",
        sdp: await sdpResponse.text(),
      };
      await pc.setRemoteDescription(answer);
      peerConnection.current = pc;
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
      setIsActive(false);
      setIsListening(false);
      setIsLoading(false);
    }
  }, [isActive, isLoading, createSession, handleServerEvent]);

  const stop = useCallback(async () => {
    try {
      if (dataChannel.current) {
        dataChannel.current.close();
        dataChannel.current = null;
      }
      if (peerConnection.current) {
        peerConnection.current.close();
        peerConnection.current = null;
      }
      tracks.current = [];
      stopListening();
      setIsActive(false);
      setIsListening(false);
      setIsLoading(false);
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
    }
  }, [stopListening]);

  useEffect(() => {
    return () => {
      stop();
      cleanupMicAnalyser();
    };
  }, [stop]);

  function createEmptyAudioTrack(): MediaStreamTrack {
    const audioContext = new AudioContext();
    const destination = audioContext.createMediaStreamDestination();
    return destination.stream.getAudioTracks()[0];
  }

  return {
    isActive,
    isListening,
    isLoading,
    error,
    messages,
    start,
    stop,
    startListening,
    stopListening,
    micVolume,
  };
}
