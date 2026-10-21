import { useEffect } from 'react';
import { GrowthBook } from './growth/GrowthBook';
import { GrowthHome } from './growth/GrowthHome';
import { NotesPage, ReviewPage, TodayPage } from './growth/GrowthPages';
import { MentorPage } from './growth/MentorPage';
import { Library } from './components/Library';
import { Player } from './components/Player';
import { SettingsPage } from './components/SettingsPage';
import { UpdatePrompt } from './components/UpdatePrompt';
import { speechEngine } from './engine';
import { SettingsProvider } from './hooks/settings';
import { ToastProvider } from './hooks/toast';
import { useRoute } from './hooks/useRoute';
import { isNativeApp } from './platform';

export function App() {
  const route = useRoute();
  const routeKey = JSON.stringify(route);
  useEffect(() => window.scrollTo(0, 0), [routeKey]);
  return (
    <ToastProvider>
      <SettingsProvider>
        {/* The App Store app updates through the App Store, not a service worker. */}
        {!isNativeApp() && <UpdatePrompt />}
        {!speechEngine.isSupported() && (
          <div className="banner warn" style={{ margin: 12 }}>
            <div className="banner-body">
              <strong>Speech is not available in this browser.</strong> You can still import and read books. Use Safari on iPhone, or Chrome,
              Edge or Safari on a computer, to listen.
            </div>
          </div>
        )}
        {route.name === 'library' && <Library />}
        {route.name === 'settings' && <SettingsPage />}
        {route.name === 'book' && <Player key={route.id} id={route.id} autoplay={route.autoplay} />}
        {route.name === 'growth' && <GrowthHome />}
        {route.name === 'growth-book' && <GrowthBook key={route.id} id={route.id} />}
        {route.name === 'growth-today' && <TodayPage />}
        {route.name === 'growth-review' && <ReviewPage />}
        {route.name === 'growth-notes' && <NotesPage />}
        {route.name === 'mentor' && <MentorPage key={route.flow ?? ''} flowId={route.flow} />}
      </SettingsProvider>
    </ToastProvider>
  );
}
