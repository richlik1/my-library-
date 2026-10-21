import type { CapacitorConfig } from '@capacitor/cli';

// Native iOS shell for the App Store build. The web app in dist/ runs inside it.
const config: CapacitorConfig = {
  appId: 'com.maliklyons.mylibrary',
  appName: 'My Library',
  webDir: 'dist',
  ios: {
    contentInset: 'never',
    backgroundColor: '#0a0a0f',
    // Media playback (speech) without a tap on every resume.
    allowsLinkPreview: false,
  },
};

export default config;
