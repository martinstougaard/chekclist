import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import * as api from '../lib/api';
import { useAuth } from '../lib/auth';
import { useToast } from '../lib/toast';
import { buildTree, siteStats, withSiteTasks } from '../lib/progress';
import { daysUntil, formatDate } from '../lib/format';
import ProgressBar from '../components/ProgressBar';
import Modal from '../components/Modal';
import SiteForm from '../components/SiteForm';

function DeadlineCell({ deadline, complete }) {
  if (!deadline) return <span className="muted">Ingen deadline</span>;
  const days = daysUntil(deadline);
  let badge = null;
  if (!complete && days < 0) badge = <span className="badge badge-danger">Overskredet</span>;
  else if (!complete && days <= 7) badge = <span className="badge badge-warn">{days === 0 ? 'I dag' : `${days} dg.`}</span>;
  return (
    <span>
      {formatDate(deadline)} {badge}
    </span>
  );
}

export default function Sites() {
  const { user, nameOf } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [sites, setSites] = useState(null);
  const [structure, setStructure] = useState(null);
  const [progress, setProgress] = useState([]);
  const [siteTasks, setSiteTasks] = useState([]);
  const [creating, setCreating] = useState(false);
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState('deadline');
  const [hideDone, setHideDone] = useState(false);

  const load = useCallback(async () => {
    try {
      const [s, st, p, x] = await Promise.all([
        api.loadSites(),
        api.loadStructure(),
        api.loadProgress(),
        api.loadAllSiteTasks(),
      ]);
      setSites(s);
      setStructure(st);
      setProgress(p);
      setSiteTasks(x);
    } catch (e) {
      toast.error(e);
      setSites((cur) => cur || []);
    }
  }, [toast]);

  useEffect(() => {
    load();
    const onVisible = () => document.visibilityState === 'visible' && load();
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [load]);

  const rows = useMemo(() => {
    if (!sites || !structure) return [];
    const tree = buildTree(structure);
    const bySite = new Map();
    for (const r of progress) {
      if (!bySite.has(r.site_id)) bySite.set(r.site_id, []);
      bySite.get(r.site_id).push(r);
    }
    const extrasBySite = new Map();
    for (const t of siteTasks) {
      if (!extrasBySite.has(t.site_id)) extrasBySite.set(t.site_id, []);
      extrasBySite.get(t.site_id).push(t);
    }
    const q = search.trim().toLowerCase();
    const list = sites
      .map((site) => ({
        site,
        stats: siteStats(withSiteTasks(tree, extrasBySite.get(site.id) || []), bySite.get(site.id) || []),
      }))
      .filter(({ site, stats }) => {
        if (q && !site.name.toLowerCase().includes(q) && !(nameOf(site.responsible_id) || '').toLowerCase().includes(q)) return false;
        if (hideDone && stats.total.total > 0 && stats.total.pct === 100) return false;
        return true;
      });
    const cmp = {
      deadline: (a, b) => (a.site.deadline || '9999').localeCompare(b.site.deadline || '9999'),
      newest: (a, b) => b.site.created_at.localeCompare(a.site.created_at),
      name: (a, b) => a.site.name.localeCompare(b.site.name, 'da'),
      progress: (a, b) => a.stats.total.pct - b.stats.total.pct,
    }[sort];
    return list.sort(cmp);
  }, [sites, structure, progress, siteTasks, search, sort, hideDone, nameOf]);

  const create = async (values) => {
    try {
      const site = await api.createSite({ ...values, created_by: user.id });
      navigate(`/sites/${site.id}`);
    } catch (e) {
      toast.error(e);
    }
  };

  return (
    <div>
      <div className="page-head">
        <h1>Sites</h1>
        <button className="btn btn-primary" onClick={() => setCreating(true)}>+ Nyt site</button>
      </div>

      <div className="toolbar">
        <input type="search" placeholder="Søg på site eller ansvarlig…" value={search} onChange={(e) => setSearch(e.target.value)} />
        <label className="inline">
          Sortér
          <select value={sort} onChange={(e) => setSort(e.target.value)}>
            <option value="deadline">Deadline</option>
            <option value="newest">Nyeste først</option>
            <option value="name">Navn</option>
            <option value="progress">Mindst færdige først</option>
          </select>
        </label>
        <label className="inline check">
          <input type="checkbox" checked={hideDone} onChange={(e) => setHideDone(e.target.checked)} />
          Skjul færdige
        </label>
      </div>

      {sites === null && <p className="muted">Indlæser sites…</p>}
      {sites && sites.length === 0 && (
        <div className="card empty">
          <p>Der er ingen sites endnu.</p>
          <button className="btn btn-primary" onClick={() => setCreating(true)}>Opret det første site</button>
        </div>
      )}
      {sites && sites.length > 0 && rows.length === 0 && <p className="muted">Ingen sites matcher.</p>}

      {rows.length > 0 && (
        <div className="site-list">
          <div className="site-row site-head" aria-hidden="true">
            <span>Site</span>
            <span>Ansvarlig</span>
            <span>Oprettet</span>
            <span>Deadline</span>
            <span>Fremskridt</span>
          </div>
          {rows.map(({ site, stats }) => (
            <Link to={`/sites/${site.id}`} className="site-row card" key={site.id}>
              <span className="site-name">{site.name}</span>
              <span data-label="Ansvarlig">{nameOf(site.responsible_id) || <span className="muted">Ingen</span>}</span>
              <span data-label="Oprettet">{formatDate(site.created_at)}</span>
              <span data-label="Deadline">
                <DeadlineCell deadline={site.deadline} complete={stats.total.total > 0 && stats.total.pct === 100} />
              </span>
              <span className="site-progress">
                <ProgressBar label="Samlet" stat={stats.total} tone="total" />
                <span className="site-progress-env">
                  <ProgressBar label="Test" stat={stats.test} tone="test" size="sm" />
                  <ProgressBar label="Produktion" stat={stats.prod} tone="prod" size="sm" />
                </span>
              </span>
            </Link>
          ))}
        </div>
      )}

      {creating && (
        <Modal title="Nyt site" onClose={() => setCreating(false)}>
          <SiteForm submitLabel="Opret site" onSubmit={create} onCancel={() => setCreating(false)} />
        </Modal>
      )}
    </div>
  );
}
