import type { SpeechEngine } from '../core/speech/engine';
import { NativeSpeechEngine } from '../core/speech/nativeSpeechEngine';
import { WebSpeechEngine } from '../core/speech/webSpeechEngine';
import { isNativeApp } from './platform';

/**
 * The single place that picks the speech engine: native iOS voices with
 * background audio in the App Store app, browser voices on the web.
 */
export const speechEngine: SpeechEngine = isNativeApp() ? new NativeSpeechEngine() : new WebSpeechEngine();
