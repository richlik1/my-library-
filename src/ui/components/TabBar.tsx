import type { Route } from '../hooks/useRoute';
import { Icon } from './Icon';

const TABS = [
  { id: 'home', label: 'Home', href: '#/', icon: 'home' },
  { id: 'library', label: 'Library', href: '#/library', icon: 'library' },
  { id: 'discover', label: 'Discover', href: '#/discover', icon: 'compass' },
  { id: 'progress', label: 'Progress', href: '#/progress', icon: 'chart' },
] as const;

/** Which tab a screen belongs to (sub-pages keep their tab highlighted). */
export function tabFor(route: Route): (typeof TABS)[number]['id'] | null {
  switch (route.name) {
    case 'home':
    case 'settings':
      return 'home';
    case 'library':
      return 'library';
    case 'discover':
    case 'growth':
    case 'growth-book':
    case 'growth-today':
    case 'growth-review':
    case 'growth-notes':
    case 'mentor':
      return 'discover';
    case 'progress':
    case 'quotes':
      return 'progress';
    default:
      return null;
  }
}

export function TabBar({ active }: { active: ReturnType<typeof tabFor> }) {
  return (
    <nav className="tabbar" aria-label="Main">
      {TABS.map((t) => (
        <a key={t.id} href={t.href} className={active === t.id ? 'active' : ''} aria-current={active === t.id ? 'page' : undefined}>
          <Icon name={t.icon} size={24} />
          <span>{t.label}</span>
        </a>
      ))}
    </nav>
  );
}
