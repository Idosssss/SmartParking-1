/** Spoken directions through the browser's own speech engine. Silent where the browser has none. */

export const speechSupported = () => typeof window !== 'undefined' && 'speechSynthesis' in window && typeof SpeechSynthesisUtterance !== 'undefined';

export function speak(text: string) {
  if (!speechSupported()) return;
  try {
    window.speechSynthesis.cancel(); // a newer direction replaces one still being read
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'en-US';
    utterance.rate = 1.05;
    window.speechSynthesis.speak(utterance);
  } catch {
    // some browsers refuse to speak before the page was clicked: the directions are still on screen
  }
}

export function stopSpeaking() {
  if (speechSupported()) window.speechSynthesis.cancel();
}
