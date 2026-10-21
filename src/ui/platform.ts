import { Capacitor } from '@capacitor/core';

/** True inside the iOS app (App Store build), false in a browser / home-screen web app. */
export const isNativeApp = () => Capacitor.isNativePlatform();
