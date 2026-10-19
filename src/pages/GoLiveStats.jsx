import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import * as api from '../lib/api';
import { useAuth } from '../lib/auth';
import { useToast } from '../lib/toast';
import { formatDuration, goLiveStats } from '../lib/golive';
import { formatDate } from '../lib/format';

/** Hurtigere/langsommere i forhold til et sammenligningstal. */
function Delta({ value, base }) {
  if (base == null || value == null || base === 0) return <span className="muted">–</span>;
  const diff = value - base;
  if (Math.abs(diff) < 1000) return <span className="muted">som gns.</span>;
  const faster = diff < 0;
  return (
    <span className={faster ? 'delta-good' : 'delta-bad'}>
      {faster ? '▼' : '▲'} {formatDuration(Math.abs(diff))} {faster ? 'hurtigere' : 'langsommere'}
    </span>
  );
}

export default function GoLiveStats() {
  const toast = useToast();
  const { nameOf } = useAuth();
  const [data, setData] = useState(null);

  useEffect(() => {
    api.loadGoLiveOverview().then(setData).catch((e) => toast.error(e));
  }, [toast]);

  const stats = useMemo(() => (data ? goLiveStats(data.runs, data.steps) : null), [data]);
  if (!data || !stats) return <p className="muted">Indlæser…</p>;

  const siteName = (siteId) => data.sites.find((s) => s.id === siteId)?.name || 'Slettet site';
  const live = data.runs.filter((r) => !r.finished_at);
  const durations = stats.runs.map((r) => r.duration);
  const avg = durations.length ? durations.reduce((a, b) => a + b, 0) / durations.length : null;
  const best = durations.length ? Math.min(...durations) : null;
  const latest = stats.runs[stats.runs.length - 1];
  const prev = stats.runs.slice(0, -1).map((r) => r.duration);
  const prevAvg = prev.length ? prev.reduce((a, b) => a + b, 0) / prev.length : null;
  const longest = durations.length ? Math.max(...durations) : 1;

  return (
    <div>
      <div className="page-head"><h1>Go-live</h1></div>
      <p className="muted">
        Tider fra de gennemførte go-lives, så vi kan se, om vi bliver hurtigere over tid. Et go-live startes fra det enkelte site.
      </p>

      {live.length > 0 && (
        <div className="card pad">
          <h3>I gang nu</h3>
          <ul className="plain-list">
            {live.map((r) => (
              <li key={r.id}>
                <Link to={`/sites/${r.site_id}/go-live`}>{siteName(r.site_id)}</Link>
                <span className="muted small"> · startet {formatDate(r.started_at)} af {r.started_by ? nameOf(r.started_by) : 'ukendt'}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {stats.runs.length === 0 ? (
        <div className="card empty">
          <p>Der er ingen gennemførte go-lives endnu. Åbn et site og tryk på Go-live for at starte det første.</p>
        </div>
      ) : (
        <>
          <div className="stat-tiles">
            <div className="card pad stat-tile"><span className="muted small">Gennemførte</span><strong>{stats.runs.length}</strong></div>
            <div className="card pad stat-tile"><span className="muted small">Gennemsnit</span><strong>{formatDuration(avg)}</strong></div>
            <div className="card pad stat-tile"><span className="muted small">Hurtigste</span><strong>{formatDuration(best)}</strong></div>
            <div className="card pad stat-tile">
              <span className="muted small">Seneste</span>
              <strong>{formatDuration(latest.duration)}</strong>
              <span className="small"><Delta value={latest.duration} base={prevAvg} /></span>
            </div>
          </div>

          <div className="card pad">
            <h3>Samlet tid pr. go-live</h3>
            <p className="muted small">Ældste øverst. Sammenligningen er mod gennemsnittet af de tidligere.</p>
            <div className="run-bars">
              {stats.runs.map((r) => (
                <Link key={r.id} to={`/sites/${r.site_id}/go-live`} className="run-bar-row">
                  <span className="run-bar-name">{siteName(r.site_id)}<small>{formatDate(r.finished_at)}</small></span>
                  <span className="run-bar-track"><span style={{ width: `${Math.max(2, (r.duration / longest) * 100)}%` }} /></span>
                  <span className="run-bar-value">{formatDuration(r.duration)}</span>
                </Link>
              ))}
            </div>
          </div>

          <div className="card pad">
            <h3>Tid pr. handling</h3>
            <div className="table-wrap">
              <table className="stat-table">
                <thead>
                  <tr><th>Handling</th><th>Antal</th><th>Gennemsnit</th><th>Hurtigste</th><th>Langsomste</th><th>Seneste</th></tr>
                </thead>
                <tbody>
                  {stats.actions.map((a) => (
                    <tr key={a.title}>
                      <td>{a.title}{a.parallel && <span className="tag"> Sideløbende</span>}</td>
                      <td>{a.count}</td>
                      <td>{formatDuration(a.avg)}</td>
                      <td>{formatDuration(a.min)}</td>
                      <td>{formatDuration(a.max)}</td>
                      <td>{formatDuration(a.last)} {a.count > 1 && <small><Delta value={a.last} base={a.avg} /></small>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
