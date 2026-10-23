import { useEffect } from 'react';
import { GrowthBook } from './growth/GrowthBook';
import { GrowthHome } from './growth/GrowthHome';
import { NotesPage, ReviewPage, TodayPage } from './growth/GrowthPages';
import { MentorPage } from './growth/MentorPage';
import { DiscoverPage } from './components/DiscoverPage';
import { HomePage } from './components/HomePage';
import { Library } from './components/Library';
import { MiniPlayer } from './components/MiniPlayer';
import { Player } from './components/Player';
import { ProgressPage } from './components/ProgressPage';
import { QuotesPage } from './components/QuotesPage';
import { ClubPage } from './components/ClubPage';
import { SettingsPage } from './components/SettingsPage';
import { TabBar, tabFor } from './components/TabBar';
import { UpdatePrompt } from './components/UpdatePrompt';
import { speechEngine } from './engine';
import { PlaybackProvider } from './hooks/playbackSession';
import { SettingsProvider, useSettings } from './hooks/settings';
import { ToastProvider } from './hooks/toast';
import { useRoute } from './hooks/useRoute';
import { isNativeApp } from './platform';
import { warmUpFastVoice } from './narration';

/** Applies the chosen colour theme ('system' follows the device). */
function ThemeSync() {
  const { settings } = useSettings();
  useEffect(() => {
    const root = document.documentElement;
    if (settings.theme === 'system') delete root.dataset.theme;
    else root.dataset.theme = settings.theme;
    const meta = document.querySelector('meta[name="theme-color"]');
    const light = settings.theme === 'light' || (settings.theme === 'system' && window.matchMedia?.('(prefers-color-scheme: light)').matches);
    meta?.setAttribute('content', light ? '#f7f4ee' : '#0b0b10');
  }, [settings.theme]);
  return null;
}

export function App() {
  const route = useRoute();
  const routeKey = JSON.stringify(route);
  useEffect(() => window.scrollTo(0, 0), [routeKey]);
  // Get the fast natural voice ready in the background, so Play starts quickly.
  useEffect(() => {
    const t = setTimeout(warmUpFastVoice, 800);
    return () => clearTimeout(t);
  }, []);
  const tab = tabFor(route);
  return (
    <ToastProvider>
      <SettingsProvider>
        <ThemeSync />
        <PlaybackProvider>
          {/* The App Store app updates through the App Store, not a service worker. */}
          {!isNativeApp() && <UpdatePrompt />}
          {!speechEngine.isSupported() && (
            <div className="banner warn" style={{ margin: 12 }}>
              <div className="banner-body">
                <strong>Speech is not available in this browser.</strong> You can still import and read books, and use Natural voice.
              </div>
            </div>
          )}
          <main className={tab ? 'with-tabs' : undefined}>
            {route.name === 'home' && <HomePage />}
            {route.name === 'library' && <Library />}
            {route.name === 'discover' && <DiscoverPage />}
            {route.name === 'progress' && <ProgressPage />}
            {route.name === 'settings' && <SettingsPage />}
            {route.name === 'quotes' && <QuotesPage />}
            {route.name === 'club' && <ClubPage />}
            {route.name === 'book' && <Player key={route.id} id={route.id} autoplay={route.autoplay} at={route.at} />}
            {route.name === 'growth' && <GrowthHome />}
            {route.name === 'growth-book' && <GrowthBook key={route.id} id={route.id} />}
            {route.name === 'growth-today' && <TodayPage />}
            {route.name === 'growth-review' && <ReviewPage />}
            {route.name === 'growth-notes' && <NotesPage />}
            {route.name === 'mentor' && <MentorPage key={route.flow ?? ''} flowId={route.flow} />}
          </main>
          {tab && (
            <div className="bottom-bar">
              <MiniPlayer />
              <TabBar active={tab} />
            </div>
          )}
        </PlaybackProvider>
      </SettingsProvider>
    </ToastProvider>
  );
}
