import { useState } from "react";
import { Boxes, Plus, Trash2 } from "lucide-react";
import type { Group, Project } from "./model";
import {
  applyInstance,
  assemblyStatus,
  assemblyUsers,
  makeAssemblyUnique,
  placeAssembly,
  removeAssembly,
  resetInstance,
  saveAssembly,
} from "./assemblies";
type Change = (next: Project) => void;
/** Runs a pure assembly operation on the current project; errors become messages, never half-applied edits. */
const attempt = (
  p: Project,
  change: Change,
  message: (m: string) => void,
  run: (p: Project) => Project | { project: Project; note: string },
) => {
  try {
    const out = run(p);
    if ("project" in out) {
      change(out.project);
      message(out.note);
    } else change(out);
  } catch (e) {
    message(e instanceof Error ? e.message : "Actie mislukt.");
  }
};
export function AssemblyInspector({
  project: p,
  group,
  readOnly,
  onChange,
  onMessage,
  onSelect,
}: {
  project: Project;
  group: Group;
  readOnly: boolean;
  onChange: Change;
  onMessage: (m: string) => void;
  /** Re-selects the group's members: recreated members get new ids, so the old selection would vanish. */
  onSelect: (ids: string[]) => void;
}) {
  const [name, setName] = useState(group.name);
  const status = group.assemblyId ? assemblyStatus(p, group.id) : undefined;
  const users = group.assemblyId ? assemblyUsers(p, group.assemblyId) : [];
  const run = (
    fn: (q: Project) => Project | { project: Project; note: string },
  ) =>
    attempt(
      p,
      (next) => {
        onChange(next);
        onSelect(
          next.objects.filter((o) => o.groupId === group.id).map((o) => o.id),
        );
      },
      onMessage,
      fn,
    );
  return (
    <div className="property-section assembly-section">
      <h4>ASSEMBLY</h4>
      {!status && (
        <>
          <p className="fine-print">
            Sla deze groep op als gedeelde definitie. Daarna kun je hem meerdere
            keren plaatsen en wijzigingen aan alle exemplaren tegelijk
            doorvoeren.
          </p>
          <label className="media-field">
            Naam van de assembly
            <input
              value={name}
              maxLength={80}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <button
            className="button full"
            disabled={readOnly || !name.trim()}
            onClick={() =>
              run((q) => ({
                project: saveAssembly(q, group.id, name).project,
                note: `Assembly "${name.trim()}" opgeslagen; deze groep is het eerste exemplaar.`,
              }))
            }
          >
            <Boxes size={14} /> Opslaan als assembly
          </button>
        </>
      )}
      {status && (
        <>
          <p className="fine-print">
            <strong>{status.assembly.name}</strong> ·{" "}
            {status.assembly.members.length} onderdelen · {users.length}{" "}
            exemplaar{users.length === 1 ? "" : "en"} delen deze definitie
            {status.assembly.unique ? " (uniek)" : ""}.
          </p>
          <p
            className={
              "media-issue " + (status.state === "in-sync" ? "" : "warning")
            }
          >
            {status.state === "in-sync"
              ? "Gelijk aan de definitie. Het hele exemplaar verplaatsen of draaien telt niet als afwijking."
              : "Wijkt af van de definitie:"}
          </p>
          {status.diffs.slice(0, 6).map((d, i) => (
            <p className="fine-print" key={i}>
              · {d.message}
            </p>
          ))}
          {status.diffs.length > 6 && (
            <p className="fine-print">+ {status.diffs.length - 6} meer</p>
          )}
          <button
            className="button full"
            disabled={readOnly || status.state !== "drift"}
            title="Maakt dit exemplaar de nieuwe definitie. Gelijke exemplaren volgen; afwijkende worden overgeslagen."
            onClick={() =>
              run((q) => {
                const r = applyInstance(q, group.id);
                return {
                  project: r.project,
                  note:
                    `Definitie bijgewerkt; ${r.updated.length} exemplaar${r.updated.length === 1 ? "" : "en"} volgen.` +
                    (r.skipped.length
                      ? ` Overgeslagen: ${r.skipped.map((s) => `${r.project.groups.find((g) => g.id === s.groupId)?.name} (${s.reason})`).join(", ")}.`
                      : ""),
                };
              })
            }
          >
            Toepassen op definitie
          </button>
          <button
            className="button full"
            disabled={readOnly || status.state === "in-sync"}
            onClick={() => run((q) => resetInstance(q, group.id))}
          >
            Terugzetten naar definitie
          </button>
          <button
            className="button full"
            disabled={
              readOnly || (users.length < 2 && !!status.assembly.unique)
            }
            onClick={() =>
              run((q) => ({
                project: makeAssemblyUnique(q, group.id),
                note: "Dit exemplaar heeft nu een eigen assembly-definitie.",
              }))
            }
          >
            Uniek maken
          </button>
        </>
      )}
    </div>
  );
}
export function AssemblyLibrary({
  project: p,
  readOnly,
  onChange,
  onMessage,
  onPlaced,
}: {
  project: Project;
  readOnly: boolean;
  onChange: Change;
  onMessage: (m: string) => void;
  onPlaced: (objectIds: string[]) => void;
}) {
  const list = p.assemblies ?? [];
  return (
    <>
      <div className="section-heading">
        ASSEMBLY&apos;S <span>{list.length}</span>
      </div>
      {!list.length && (
        <p className="fine-print" style={{ padding: "0 14px" }}>
          Groepeer onderdelen, selecteer de groep en kies &ldquo;Opslaan als
          assembly&rdquo;.
        </p>
      )}
      <div className="catalog-list">
        {list.map((a) => {
          const used = assemblyUsers(p, a.id).length;
          return (
            <div
              className="catalog-card"
              key={a.id}
              style={{ cursor: "default" }}
            >
              <span className="part-copy">
                <strong>{a.name}</strong>
                <small>
                  {a.members.length} onderdelen · {used} geplaatst
                </small>
                <span>{a.unique ? "Uniek" : "Gedeeld"}</span>
              </span>
              <button
                className="add-part"
                aria-label={`Plaats ${a.name}`}
                title="Plaats in het midden van de ruimte"
                disabled={readOnly}
                onClick={() => {
                  try {
                    const r = placeAssembly(p, a.id, { x: 0, z: 0 }, 0);
                    onChange(r.project);
                    onPlaced(r.objectIds);
                  } catch (e) {
                    onMessage(
                      e instanceof Error ? e.message : "Plaatsen mislukt.",
                    );
                  }
                }}
              >
                <Plus size={15} />
              </button>
              {!used && (
                <button
                  className="add-part"
                  aria-label={`Verwijder ${a.name}`}
                  title="Ongebruikte definitie verwijderen"
                  disabled={readOnly}
                  onClick={() =>
                    attempt(p, onChange, onMessage, (q) =>
                      removeAssembly(q, a.id),
                    )
                  }
                >
                  <Trash2 size={14} />
                </button>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}
