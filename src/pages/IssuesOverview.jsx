import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import * as api from '../lib/api';
import { useToast } from '../lib/toast';
import { IssueCard } from '../components/Issues';

const FILTERS = [
  { id: 'alle', label: 'Alle', test: () => true },
  { id: 'aabne', label: 'Åbne', test: (i) => i.status === 'open' },
  { id: 'forebyg', label: 'Forebyggelse mangler', test: (i) => !!i.prevention.trim() && !i.prevention_done },
  { id: 'uden', label: 'Uden forebyggende handling', test: (i) => !i.prevention.trim() },
];

/** Alle spørgsmål efter go-live på tværs af sites: her ser man, hvad vi kan lære til næste gang. */
export default function IssuesOverview() {
  const toast = useToast();
  const [issues, setIssues] = useState(null);
  const [sites, setSites] = useState([]);
  const [filter, setFilter] = useState('aabne');
  const [query, setQuery] = useState('');

  const load = useCallback(async () => {
    try {
      const [i, s] = await Promise.all([api.loadAllIssues(), api.loadSites()]);
      setIssues(i);
      setSites(s);
    } catch (e) {
      toast.error(e);
      setIssues((cur) => cur || []);
    }
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  const change = async (issue, patch) => {
    setIssues((cur) => cur.map((i) => (i.id === issue.id ? { ...i, ...patch } : i)));
    try {
      await api.updateIssue(issue.id, patch);
    } catch (e) {
      toast.error(e);
    }
    await load();
  };
  const remove = async (issue) => {
    if (!window.confirm('Slet spørgsmålet?')) return;
    try {
      await api.deleteIssue(issue.id);
    } catch (e) {
      toast.error(e);
    }
    await load();
  };

  const shown = useMemo(() => {
    if (!issues) return [];
    const test = FILTERS.find((f) => f.id === filter).test;
    const q = query.trim().toLowerCase();
    return issues
      .filter(test)
      .filter((i) => !q || [i.question, i.answer, i.prevention, i.asked_by].some((t) => t.toLowerCase().includes(q)))
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
  }, [issues, filter, query]);

  if (!issues) return <p className="muted">Indlæser…</p>;
  const siteOf = (id) => sites.find((s) => s.id === id);
  const count = (id) => issues.filter(FILTERS.find((f) => f.id === id).test).length;

  return (
    <div>
      <div className="page-head"><h1>Spørgsmål efter go-live</h1></div>
      <p className="muted">
        Spørgsmål fra brugerne på sitene efter go-live, løsningen og en handling, der kan forhindre det næste gang.
        Nye spørgsmål registreres på det enkelte site under fanen <em>Spørgsmål efter go-live</em>.
      </p>
      <div className="toolbar issue-toolbar">
        <div className="chip-row" role="group" aria-label="Filter">
          {FILTERS.map((f) => (
            <button key={f.id} type="button" className={`btn btn-sm${filter === f.id ? ' btn-primary' : ''}`} aria-pressed={filter === f.id} onClick={() => setFilter(f.id)}>
              {f.label} ({count(f.id)})
            </button>
          ))}
        </div>
        <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Søg i spørgsmål, løsninger og handlinger…" aria-label="Søg" />
      </div>
      {shown.length === 0 && (
        <div className="card empty"><p>{issues.length === 0 ? 'Der er endnu ikke registreret nogen spørgsmål.' : 'Ingen spørgsmål passer til filteret.'}</p></div>
      )}
      {shown.map((i) => (
        <IssueCard
          key={i.id}
          issue={i}
          siteName={siteOf(i.site_id) ? <Link to={`/sites/${i.site_id}?fane=spoergsmaal`}>{siteOf(i.site_id).name}</Link> : 'Slettet site'}
          onChange={(patch) => change(i, patch)}
          onDelete={() => remove(i)}
        />
      ))}
    </div>
  );
}
