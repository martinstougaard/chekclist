import { useCallback, useEffect, useState } from 'react';
import * as api from '../lib/api';
import { useToast } from '../lib/toast';
import { AddForm, ItemRow, nextPosition } from '../components/AdminParts';

/** Administration af go-live-handlingerne: den liste af store kort, man arbejder igennem ved go-live. */
export default function AdminGoLive() {
  const toast = useToast();
  const [actions, setActions] = useState(null);

  const load = useCallback(async () => {
    try {
      setActions(await api.loadGoLiveActions());
    } catch (e) {
      toast.error(e);
    }
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  const run = async (fn) => {
    try {
      await fn();
    } catch (e) {
      toast.error(e);
    }
    await load();
  };

  const save = (table, id, patch) => run(() => api.updateRow('golive_actions', id, patch));

  const add = async (title) => {
    await run(() => api.insertRow('golive_actions', { title, position: nextPosition(actions) }));
    toast.success(`Tilføjet: "${title}" (nederst på listen)`);
  };

  const remove = (table, item) => {
    if (!window.confirm(`Slet handlingen "${item.title}"?\n\nGo-lives, der allerede er startet eller gennemført, beholder deres egen kopi og tider.`)) return;
    return run(() => api.deleteRow('golive_actions', item.id));
  };

  const move = (index, dir) => {
    const next = [...actions];
    const target = index + dir;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    return run(() =>
      Promise.all(next.map((a, i) => (a.position === i + 1 ? null : api.updateRow('golive_actions', a.id, { position: i + 1 }))))
    );
  };

  if (!actions) return <p className="muted">Indlæser go-live-handlinger…</p>;

  return (
    <div>
      <p className="muted">
        Det er de store kort, man arbejder igennem, når et site går live. Kortene køres i den rækkefølge, de står i her:
        når man afslutter ét kort, starter det næste automatisk. Et kort, der er markeret <strong>sideløbende</strong>,
        kan en anden person starte og afslutte uafhængigt af rækkefølgen (fx en opgave, der løses samtidig med den første).
        Tiderne for start og afslutning gemmes for hvert kort. Ændringer påvirker kun go-lives, der startes bagefter.
      </p>

      <div className="card pad">
        <h3>Ny handling</h3>
        <AddForm placeholder="fx Sæt integrationer til produktion" onAdd={add} buttonLabel="Tilføj handling" />
      </div>

      {actions.length === 0 ? (
        <div className="card empty">
          <p>Der er ingen handlinger endnu. Tilføj den første ovenfor.</p>
        </div>
      ) : (
        <section className="card admin-section">
          <div className="admin-section-body">
            {actions.map((a, i) => (
              <ItemRow
                key={a.id}
                item={a}
                table="golive_actions"
                index={i}
                count={actions.length}
                onMove={(dir) => move(i, dir)}
                onSave={save}
                onDelete={remove}
                extra={
                  <label className="inline check parallel-check" title="Kan startes og afsluttes uafhængigt af rækkefølgen">
                    <input
                      type="checkbox"
                      checked={a.parallel}
                      onChange={(e) => save('golive_actions', a.id, { parallel: e.target.checked })}
                    />
                    Sideløbende
                  </label>
                }
              />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
