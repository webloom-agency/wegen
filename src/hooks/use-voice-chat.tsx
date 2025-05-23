import React from "react";
import { Mic, MicOff, Wifi } from "lucide-react";
import { useOpenAIVoiceChat } from "lib/ai/speech/use-voice-chat.openai";
import JsonView from "ui/json-view";

export const AutoVoice = () => {
  const {
    isActive,
    isListening,
    messages,
    start,
    startListening,
    stopListening,
    isLoading,
    error,
    stop,
  } = useOpenAIVoiceChat();

  return (
    <>
      <Controls
        handleConnectClick={isActive ? stop : start}
        handleMicToggleClick={isListening ? stopListening : startListening}
        isConnected={isActive}
        isListening={isListening}
      />
      {error && <div className="text-red-500">{error.message}</div>}
      {isLoading && <div className="text-white">Loading...</div>}
      <div className="mt-4 p-4 bg-slate-800 rounded overflow-auto max-h-64">
        {messages.map((message, idx) => (
          <div key={idx} className="text-white text-sm mb-2">
            <JsonView data={message} />
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
