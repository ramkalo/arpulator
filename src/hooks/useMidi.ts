import { useEffect } from 'react';
import { useMidiStore } from '../stores/midiStore';
import { useTransportStore } from '../stores/transportStore';
import { initMidi } from '../engine/midiEngine';

export function useMidi() {
  const { setSupported, setAccessGranted, setDevices, supported } = useMidiStore();
  const { setExternalClock } = useTransportStore();

  useEffect(() => {
    if (!supported) return;

    initMidi(
      (inputs, outputs) => setDevices(inputs, outputs),
      (bpm) => setExternalClock(true, bpm),
      // Note callbacks are handled per-component (KeyboardView)
      () => {}
    )
      .then(({ inputs, outputs }) => {
        setAccessGranted(true);
        setDevices(inputs, outputs);
      })
      .catch(() => {
        setAccessGranted(false);
        setSupported(false);
      });
  }, [supported, setSupported, setAccessGranted, setDevices, setExternalClock]);
}
