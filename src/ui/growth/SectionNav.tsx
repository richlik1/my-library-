/** Switches between the three parts of the app. */
export function SectionNav({ active }: { active: 'books' | 'growth' | 'mentor' }) {
  const items: Array<[typeof active, string, string]> = [
    ['books', 'Audiobooks', '#/'],
    ['growth', 'Growth Library', '#/growth'],
    ['mentor', 'Mentor', '#/mentor'],
  ];
  return (
    <nav className="seg-nav" aria-label="Sections">
      {items.map(([id, label, href]) => (
        <a key={id} href={href} className={active === id ? 'active' : ''} aria-current={active === id ? 'page' : undefined}>
          {label}
        </a>
      ))}
    </nav>
  );
}
