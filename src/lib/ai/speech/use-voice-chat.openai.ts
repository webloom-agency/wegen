import { useState, useCallback, useRef, useEffect } from "react";
import { VoiceChatSession } from ".";
import { useLatest } from "@/hooks/use-latest";

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

// 대화 종료용 end_conversation tool과 테스트용 console_log tool 정의
const TOOLS = [
  {
    type: "function",
    name: "end_conversation",
    description: "Ends the conversation when the user says goodbye or similar.",
    parameters: {
      type: "object",
      properties: {},
    },
  },
  {
    type: "function",
    name: "console_log",
    description: "Logs a message to the console for testing purposes.",
    parameters: {
      type: "object",
      properties: {
        message: { type: "string", description: "Message to log" },
      },
      required: ["message"],
    },
  },
];

/**
 * OpenAI 음성 채팅 세션을 관리하는 커스텀 훅
 * - WebRTC 연결, 데이터 채널, 오디오 스트림, 툴콜 이벤트 등 전체 음성 대화 세션을 관리
 * @param props model, voice 등 옵션
 * @returns VoiceChatSession 인터페이스 (상태, 제어 함수 등)
 */
export function useOpenAIVoiceChat(
  props?: UseOpenAIVoiceChatProps,
): VoiceChatSession {
  const {
    model = "gpt-4o-mini-realtime-preview-2024-12-17",
    voice = OPENAI_VOICE.Ash,
  } = props || {};

  // 현재 음성 채팅 세션이 활성화되어 있는지 여부
  const [isActive, setIsActive] = useState(false);
  // 마이크가 켜져 있는지 여부
  const [isListening, setIsListening] = useState(false);
  // 세션 연결/초기화 중인지 여부
  const [isLoading, setIsLoading] = useState(false);
  // 에러 상태
  const [error, setError] = useState<Error | null>(null);
  // 수신된 모든 이벤트/메시지 로그
  const [messages, setMessages] = useState<any[]>([]);

  // WebRTC PeerConnection 인스턴스 (음성/데이터 채널 관리)
  const peerConnection = useRef<RTCPeerConnection | null>(null);
  // 데이터 채널 인스턴스 (이벤트 송수신)
  const dataChannel = useRef<RTCDataChannel | null>(null);
  // 원격 오디오 재생용 <audio> 엘리먼트
  const audioElement = useRef<HTMLAudioElement | null>(null);
  // 로컬 마이크 오디오 스트림
  const audioStream = useRef<MediaStream | null>(null);
  // 현재 연결된 오디오 트랙 목록
  const tracks = useRef<RTCRtpSender[]>([]);
  // 최신 messages 상태를 항상 참조하기 위한 커스텀 훅
  const latest = useLatest(messages);

  /**
   * 음성 채팅 세션을 시작(연결)하는 함수
   * - 세션 토큰 발급, PeerConnection/데이터 채널 생성, 오디오 트랙 추가, SDP 교환 등 전체 초기화
   * - 데이터 채널 open 시 툴 정보 전달
   */
  const start = useCallback(async () => {
    if (isActive || isLoading) return;
    setIsLoading(true);
    try {
      // 세션 토큰 발급 (백엔드 프록시 API)
      const session = await fetch(
        `/api/chat/openai-realtime?model=${model}&voice=${voice}`,
      ).then((res) => res.json());
      const sessionToken = session.client_secret.value;
      console.log({ session });
      // WebRTC PeerConnection 생성
      const pc = new RTCPeerConnection();

      // 오디오 엘리먼트 준비 (원격 오디오 재생)
      if (!audioElement.current) {
        audioElement.current = document.createElement("audio");
      }
      audioElement.current.autoplay = true;
      pc.ontrack = (e) => {
        if (audioElement.current) {
          audioElement.current.srcObject = e.streams[0];
        }
      };

      // 마이크 오디오 스트림 준비 및 트랙 추가
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

      // 데이터 채널 생성 및 이벤트 핸들러 등록
      const dc = pc.createDataChannel("oai-events");
      dataChannel.current = dc;
      dc.addEventListener("message", (e) => {
        try {
          const event = JSON.parse(e.data);
          // 메시지 저장
          setMessages((prev) => [...prev, event]);
          // function_call, tool_call 등 다양한 툴콜 이벤트 처리 및 로깅
          if (event.type === "function_call") {
            console.log("[FUNCTION_CALL] function_call 이벤트:", event);
            if (event.name === "console_log" && event.arguments?.message) {
              console.log("[CONSOLE_LOG TOOL]", event.arguments.message);
            }
            if (event.name === "end_conversation") {
              console.log("[FUNCTION_CALL] end_conversation 감지, 세션 종료");
              stop();
            }
          }
          if (event.type === "tool_call") {
            console.log("[TOOL_CALL] 단일 tool_call 이벤트:", event);
            if (event.name === "end_conversation") {
              console.log("[TOOL_CALL] end_conversation 감지, 세션 종료");
              stop();
            }
            if (event.name === "console_log" && event.arguments?.message) {
              console.log("[CONSOLE_LOG TOOL]", event.arguments.message);
            }
          } else if (
            event.type === "tool_calls" &&
            Array.isArray(event.tool_calls)
          ) {
            console.log("[TOOL_CALLS] 복수 tool_calls 이벤트:", event);
            if (
              event.tool_calls.some((call) => call.name === "end_conversation")
            ) {
              console.log("[TOOL_CALLS] end_conversation 감지, 세션 종료");
              stop();
            }
            event.tool_calls.forEach((call) => {
              if (call.name === "console_log" && call.arguments?.message) {
                console.log("[CONSOLE_LOG TOOL]", call.arguments.message);
              }
            });
          } else {
            // 기타 tool 관련 이벤트 로깅
            if (event.type && String(event.type).includes("tool")) {
              console.log("[TOOL_EVENT] 기타 tool 관련 이벤트:", event);
            }
          }
          // 일반 이벤트 로깅
          console.log("[VOICE-CHAT-EVENT]", event);
        } catch (err) {
          console.warn("[VOICE-CHAT-EVENT] 파싱 오류:", e.data, err);
        }
      });
      dc.addEventListener("open", () => {
        setIsActive(true);
        setIsListening(true); // 세션 시작 시 마이크 자동 활성화
        setIsLoading(false);
        // 세션 시작 시 툴 정보 전달
        const sessionUpdate = {
          type: "session.update",
          session: {
            tools: TOOLS,
          },
        };
        dc.send(JSON.stringify(sessionUpdate));
        console.log("[VOICE-CHAT] session.update sent:", sessionUpdate);
      });
      dc.addEventListener("close", () => {
        setIsActive(false);
        setIsListening(false);
        setIsLoading(false);
      });
      dc.addEventListener("error", () => {
        setError(new Error("데이터 채널 오류"));
        setIsActive(false);
        setIsListening(false);
      });

      // SDP 교환 (Offer/Answer)
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      const sdpResponse = await fetch(
        `https://api.openai.com/v1/realtime?model=${model}`,
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
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
      setIsActive(false);
      setIsListening(false);
      setIsLoading(false);
    }
  }, [isActive, isLoading]);

  /**
   * 세션 종료 및 리소스 정리 함수
   * - 데이터 채널, PeerConnection, 오디오 스트림 등 모든 리소스 해제
   * - 상태값 초기화
   */
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
      if (audioStream.current) {
        audioStream.current.getTracks().forEach((track) => track.stop());
        audioStream.current = null;
      }
      tracks.current = [];
      setIsActive(false);
      setIsListening(false);
      setIsLoading(false);
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
    }
    console.log(latest.current);
  }, []);

  /**
   * 마이크 켜기 (오디오 트랙 교체)
   * - 마이크 스트림이 없으면 새로 요청
   * - 기존 트랙이 있으면 교체
   */
  const startListening = useCallback(async () => {
    if (!isActive) return;
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
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
    }
  }, [isActive]);

  /**
   * 마이크 끄기 (무음 트랙으로 교체)
   * - 기존 마이크 트랙을 무음 트랙으로 교체
   */
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
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
    }
  }, []);

  // 컴포넌트 언마운트 시 리소스 정리
  useEffect(() => {
    return () => {
      stop();
    };
  }, [stop]);

  /**
   * 무음 오디오 트랙 생성 유틸리티
   * - 마이크를 끌 때 사용
   */
  function createEmptyAudioTrack(): MediaStreamTrack {
    const audioContext = new AudioContext();
    const destination = audioContext.createMediaStreamDestination();
    return destination.stream.getAudioTracks()[0];
  }

  return {
    isActive, // 세션 활성화 여부
    isListening, // 마이크 활성화 여부
    isLoading, // 세션 연결/초기화 중 여부
    error, // 에러 상태
    messages, // 수신된 이벤트/메시지 로그
    start, // 세션 시작 함수
    stop, // 세션 종료 함수
    startListening, // 마이크 켜기 함수
    stopListening, // 마이크 끄기 함수
  };
}
