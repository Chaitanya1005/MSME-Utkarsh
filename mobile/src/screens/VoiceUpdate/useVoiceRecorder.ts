import { useCallback, useState } from 'react';
import { useAudioRecorder, useAudioRecorderState, RecordingPresets, requestRecordingPermissionsAsync } from 'expo-audio';
import { readAsStringAsync, EncodingType } from 'expo-file-system/legacy';

export interface RecordedAudio {
  base64: string;
  mimeType: string;
}

// The real Phase 5 audio-input capability (spec section 17: "do not
// design the architecture around pasted text only... do not fake
// microphone functionality"). Backed by expo-audio (recording) and
// expo-file-system (reading the recorded file into base64 for upload as
// JSON, consistent with this project's existing JSON-everywhere API
// convention rather than introducing multipart/form-data handling).
export function useVoiceRecorder() {
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recorderState = useAudioRecorderState(recorder, 250);
  const [permissionError, setPermissionError] = useState<string | null>(null);

  const startRecording = useCallback(async () => {
    setPermissionError(null);
    const permission = await requestRecordingPermissionsAsync();
    if (!permission.granted) {
      setPermissionError('Microphone permission is required to record a voice update.');
      return;
    }
    await recorder.prepareToRecordAsync();
    recorder.record();
  }, [recorder]);

  const stopRecording = useCallback(async (): Promise<RecordedAudio | null> => {
    await recorder.stop();
    if (!recorder.uri) return null;
    const base64 = await readAsStringAsync(recorder.uri, { encoding: EncodingType.Base64 });
    // expo-audio's HIGH_QUALITY preset records in the platform's default
    // container (m4a on iOS/Android) — matches what the backend's
    // TranscriptionProvider contract expects (audio/* MIME type, spec
    // Phase 5 section 17).
    return { base64, mimeType: 'audio/m4a' };
  }, [recorder]);

  return {
    isRecording: recorderState.isRecording,
    durationSeconds: recorderState.durationMillis / 1000,
    permissionError,
    startRecording,
    stopRecording,
  };
}
