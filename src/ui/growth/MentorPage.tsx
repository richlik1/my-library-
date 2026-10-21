import { useState } from 'react';
import { catalogBook } from '../../growth/catalog';
import { MENTOR_FLOWS, buildPrompt, mentorFlow, planToText, type Answers, type MentorSection } from '../../growth/mentor';
import { saveNote, saveProfile } from '../../growth/store';
import type { BusinessProfile } from '../../growth/types';
import { Icon } from '../components/Icon';
import { Sheet } from '../components/Sheet';
import { useToast } from '../hooks/toast';
import { navigate } from '../hooks/useRoute';
import { SectionNav } from './SectionNav';
import { useGrowth, type GrowthData } from './useGrowth';

export function MentorPage({ flowId }: { flowId?: string }) {
  const g = useGrowth();
  const [editProfile, setEditProfile] = useState(false);
  const flow = flowId ? mentorFlow(flowId) : undefined;
  return (
    <div className="page" style={{ maxWidth: 820 }}>
      {flow ? (
        <header className="topbar">
          <button className="icon-btn" onClick={() => navigate('/mentor')} aria-label="Back to the mentor">
            <Icon name="chevronLeft" />
          </button>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="eyebrow">Mentor · {flow.area}</div>
            <h1 style={{ fontSize: 24 }}>{flow.title}</h1>
          </div>
        </header>
      ) : (
        <>
          <header className="topbar">
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="eyebrow">LYONS AI</div>
              <h1 style={{ fontSize: 28 }}>Mentor</h1>
            </div>
            <button className="btn" onClick={() => setEditProfile(true)}>
              Your profile
            </button>
          </header>
          <SectionNav active="mentor" />
        </>
      )}
      {flow ? <FlowRunner key={flow.id} flowId={flow.id} g={g} /> : <FlowList g={g} />}
      {editProfile && g.loaded && <ProfileSheet profile={g.profile} onClose={() => setEditProfile(false)} onSaved={g.refresh} />}
    </div>
  );
}

function FlowList({ g }: { g: GrowthData }) {
  return (
    <>
      <p className="muted" style={{ maxWidth: '68ch' }}>
        Pick a situation. Answer a few questions and get a step-by-step plan with exact words to use, built from the books in your library and
        tailored to {g.profile.lyons.split(' — ')[0]} and {g.profile.stayops.split(' — ')[0]}. It runs on this device for free. You can also
        copy a ready-made prompt into ChatGPT or Claude to go deeper.
      </p>
      <div className="g-cards" style={{ marginTop: 14 }}>
        {MENTOR_FLOWS.map((f) => (
          <button key={f.id} className="card flow-card" onClick={() => navigate(`/mentor/${f.id}`)}>
            <div className="eyebrow">{f.area}</div>
            <h3>{f.title}</h3>
            <p className="muted small">{f.blurb}</p>
            <p className="small" style={{ color: 'var(--text-3)' }}>
              From: {f.books.map((id) => catalogBook(id)?.title).join(' · ')}
            </p>
          </button>
        ))}
      </div>
    </>
  );
}

function FlowRunner({ flowId, g }: { flowId: string; g: GrowthData }) {
  const flow = mentorFlow(flowId)!;
  const toast = useToast();
  const [answers, setAnswers] = useState<Answers>(() => Object.fromEntries(flow.fields.filter((f) => f.options).map((f) => [f.id, f.options![0]])));
  const [plan, setPlan] = useState<MentorSection[] | null>(null);
  const [promptText, setPromptText] = useState<string | null>(null);
  const titles = flow.books.map((id) => catalogBook(id)?.title ?? id);

  const copyPrompt = async () => {
    const text = buildPrompt(flow, answers, g.profile, titles);
    try {
      await navigator.clipboard.writeText(text);
      toast('Prompt copied. Paste it into ChatGPT or Claude.');
    } catch {
      setPromptText(text);
    }
  };

  return (
    <>
      <p className="muted">{flow.blurb}</p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          setPlan(flow.compose(answers, g.profile));
          setTimeout(() => document.getElementById('mentor-plan')?.scrollIntoView({ behavior: 'smooth' }), 50);
        }}
      >
        {flow.fields.map((f) => (
          <label key={f.id} className="field">
            <span>
              {f.label}
              {f.optional ? ' (optional)' : ''}
            </span>
            {f.options ? (
              <select id={`m-${f.id}`} value={answers[f.id] ?? ''} onChange={(e) => setAnswers({ ...answers, [f.id]: e.target.value })}>
                {f.options.map((o) => (
                  <option key={o}>{o}</option>
                ))}
              </select>
            ) : f.long ? (
              <textarea id={`m-${f.id}`} value={answers[f.id] ?? ''} placeholder={f.placeholder} onChange={(e) => setAnswers({ ...answers, [f.id]: e.target.value })} style={{ minHeight: 80 }} />
            ) : (
              <input id={`m-${f.id}`} value={answers[f.id] ?? ''} placeholder={f.placeholder} onChange={(e) => setAnswers({ ...answers, [f.id]: e.target.value })} />
            )}
          </label>
        ))}
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button type="submit" className="btn btn-primary">
            Build my plan
          </button>
          <button type="button" className="btn" onClick={copyPrompt}>
            Copy prompt for ChatGPT / Claude
          </button>
        </div>
      </form>

      {promptText && (
        <div className="card" style={{ marginTop: 16 }}>
          <h3>Copy this prompt</h3>
          <p>Copying was blocked here. Select the text below and copy it.</p>
          <textarea readOnly value={promptText} className="input" style={{ minHeight: 220 }} onFocus={(e) => e.currentTarget.select()} />
        </div>
      )}

      {plan && (
        <section id="mentor-plan" className="card" style={{ marginTop: 20 }}>
          <h3 style={{ marginBottom: 14 }}>Your plan</h3>
          {plan.map((s) => (
            <div key={s.title} className="plan-section">
              <h4>
                {s.title}
                {s.source && <span className="src">{s.source}</span>}
              </h4>
              <ul>
                {s.lines.map((l, i) => (
                  <li key={i}>{l}</li>
                ))}
              </ul>
            </div>
          ))}
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button
              className="btn btn-primary"
              onClick={async () => {
                await saveNote({ bookId: null, kind: 'action', text: planToText(flow, plan), area: answers.context === 'StayOps' ? 'stayops' : answers.context === 'Family' || flow.area === 'Fatherhood' ? 'family' : answers.context === 'Lyons Cleaning Solutions' ? 'lyons' : 'personal' });
                await g.refresh();
                toast('Plan saved to Notes & Action Plans');
              }}
            >
              Save to action plans
            </button>
            <button className="btn" onClick={() => navigate('/growth/notes')}>
              Open action plans
            </button>
          </div>
        </section>
      )}
    </>
  );
}

function ProfileSheet({ profile, onClose, onSaved }: { profile: BusinessProfile; onClose(): void; onSaved(): void }) {
  const [p, setP] = useState(profile);
  const field = (key: keyof BusinessProfile, label: string, long = false) => (
    <label className="field">
      <span>{label}</span>
      {long ? (
        <textarea id={`p-${key}`} value={p[key]} onChange={(e) => setP({ ...p, [key]: e.target.value })} style={{ minHeight: 80 }} />
      ) : (
        <input id={`p-${key}`} value={p[key]} onChange={(e) => setP({ ...p, [key]: e.target.value })} />
      )}
    </label>
  );
  return (
    <Sheet title="Your profile" onClose={onClose}>
      <p className="muted small" style={{ marginTop: 0 }}>
        The mentor uses this to tailor plans and prompts. It stays on this device.
      </p>
      {field('name', 'Your name')}
      {field('role', 'Your role')}
      {field('lyons', 'Lyons Cleaning Solutions — what it does', true)}
      {field('stayops', 'StayOps — what it does', true)}
      {field('family', 'Family', true)}
      {field('goals', 'Goals for this year', true)}
      <button
        className="btn btn-primary btn-block"
        onClick={async () => {
          await saveProfile(p);
          onSaved();
          onClose();
        }}
      >
        Save profile
      </button>
    </Sheet>
  );
}
