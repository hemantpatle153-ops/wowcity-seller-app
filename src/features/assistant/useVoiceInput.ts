import { ExpoSpeechRecognitionModule, useSpeechRecognitionEvent } from "expo-speech-recognition";
import { useRef, useState } from "react";
import { joinSpeech, voiceErrorMessage, type VoiceLang } from "./chat";

function recognitionAvailable() {
  try {
    return ExpoSpeechRecognitionModule.isRecognitionAvailable();
  } catch {
    return false;
  }
}

/**
 * Voice typing with the phone's own speech recogniser (Google on Android, Apple on iOS): free, no audio
 * goes to our servers. What you say is written into the message box; you still tap Send.
 */
export function useVoiceInput(onText: (text: string) => void) {
  const [available] = useState(recognitionAvailable);
  const [listening, setListening] = useState(false);
  const [lang, setLang] = useState<VoiceLang>("en-IN");
  const [error, setError] = useState<string | null>(null);
  const before = useRef("");

  useSpeechRecognitionEvent("start", () => setListening(true));
  useSpeechRecognitionEvent("end", () => setListening(false));
  useSpeechRecognitionEvent("result", (event) => onText(joinSpeech(before.current, event.results[0]?.transcript ?? "")));
  useSpeechRecognitionEvent("error", (event) => {
    setListening(false);
    setError(voiceErrorMessage(event.error));
  });

  async function start(current: string) {
    setError(null);
    const permission = await ExpoSpeechRecognitionModule.requestPermissionsAsync().catch(() => null);
    if (!permission?.granted) {
      setError(voiceErrorMessage("not-allowed"));
      return;
    }
    before.current = current;
    ExpoSpeechRecognitionModule.start({ lang, interimResults: true, continuous: false, addsPunctuation: true });
  }

  function stop() {
    ExpoSpeechRecognitionModule.stop();
  }

  return { available, listening, lang, setLang, error, start, stop };
}
