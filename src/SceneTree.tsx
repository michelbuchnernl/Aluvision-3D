import { useState } from "react";
import {
  Box,
  Folder,
  ChevronDown,
  ChevronRight,
  Eye,
  EyeOff,
  LockKeyhole,
  LockKeyholeOpen,
} from "lucide-react";
import { clone, groupObjectIds, isLocked } from "./model";
import type { Project } from "./model";
interface Props {
  project: Project;
  selected: string[];
  contextId: string | null;
  search: string;
  readOnly: boolean;
  onPick: (ids: string[], add: boolean, context: string | null) => void;
  onEnter: (id: string) => void;
  onChange: (p: Project) => void;
}
export function SceneTree({
  project: p,
  selected,
  contextId,
  search,
  readOnly,
  onPick,
  onEnter,
  onChange,
}: Props) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const term = search.toLowerCase();
  const toggle = (id: string) =>
    setCollapsed((old) => {
      const next = new Set(old);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  const nodes = (parent: string | null, depth: number): React.ReactNode => {
    if (depth > 32) return null;
    return (
      <>
        {p.groups
          .filter((g) => (g.parentId ?? null) === parent)
          .map((g) => {
            const members = groupObjectIds(p, g.id),
              matches =
                !term ||
                g.name.toLowerCase().includes(term) ||
                p.objects.some(
                  (o) =>
                    members.includes(o.id) &&
                    o.name.toLowerCase().includes(term),
                );
            if (!matches) return null;
            const full =
                members.length > 0 &&
                members.every((id) => selected.includes(id)),
              closed = collapsed.has(g.id) && !term;
            return (
              <div key={g.id} className="tree-branch">
                <div
                  className={
                    "object-row group-row " +
                    (full ? "selected " : "") +
                    (contextId === g.id ? "editing" : "")
                  }
                  style={{ paddingLeft: 6 + depth * 12 }}
                >
                  <button
                    className="tree-expander"
                    aria-label={`${closed ? "Open" : "Sluit"} ${g.name}`}
                    onClick={() => toggle(g.id)}
                  >
                    {closed ? (
                      <ChevronRight size={12} />
                    ) : (
                      <ChevronDown size={12} />
                    )}
                  </button>
                  <button
                    className="object-name"
                    onClick={(e) =>
                      onPick(members, e.shiftKey, g.parentId ?? null)
                    }
                    onDoubleClick={() => onEnter(g.id)}
                  >
                    <Folder size={14} />
                    <span>{g.name}</span>
                    <small>{members.length}</small>
                  </button>
                  <button
                    disabled={readOnly}
                    aria-label={`Groep ${g.name} tonen/verbergen`}
                    onClick={() => {
                      const n = clone(p);
                      n.groups.find((v) => v.id === g.id)!.visible =
                        g.visible === false;
                      onChange(n);
                    }}
                  >
                    {g.visible !== false ? (
                      <Eye size={13} />
                    ) : (
                      <EyeOff size={13} />
                    )}
                  </button>
                  <button
                    disabled={readOnly}
                    aria-label={`Groep ${g.name} vergrendelen`}
                    onClick={() => {
                      const n = clone(p);
                      n.groups.find((v) => v.id === g.id)!.locked = !g.locked;
                      onChange(n);
                    }}
                  >
                    {g.locked ? (
                      <LockKeyhole size={13} />
                    ) : (
                      <LockKeyholeOpen size={13} />
                    )}
                  </button>
                </div>
                {!closed && nodes(g.id, depth + 1)}
              </div>
            );
          })}
        {p.objects
          .filter(
            (o) =>
              (o.groupId ?? null) === parent &&
              (!term ||
                o.name.toLowerCase().includes(term) ||
                p.groups
                  .find((g) => g.id === parent)
                  ?.name.toLowerCase()
                  .includes(term)),
          )
          .map((o) => (
            <div
              key={o.id}
              className={
                "object-row " + (selected.includes(o.id) ? "selected" : "")
              }
              style={{ paddingLeft: 6 + depth * 12 + 16 }}
            >
              <button
                className="object-name"
                onClick={(e) => onPick([o.id], e.shiftKey, o.groupId ?? null)}
              >
                <Box size={13} />
                <span>{o.name}</span>
              </button>
              <button
                disabled={readOnly}
                aria-label={`Zichtbaarheid ${o.name}`}
                onClick={() => {
                  const n = clone(p);
                  n.objects.find((v) => v.id === o.id)!.visible = !o.visible;
                  onChange(n);
                }}
              >
                {o.visible ? <Eye size={13} /> : <EyeOff size={13} />}
              </button>
              <button
                disabled={readOnly}
                aria-label={`Vergrendeling ${o.name}`}
                onClick={() => {
                  const n = clone(p);
                  n.objects.find((v) => v.id === o.id)!.locked = !o.locked;
                  onChange(n);
                }}
              >
                {isLocked(p, o) ? (
                  <LockKeyhole size={13} />
                ) : (
                  <LockKeyholeOpen size={13} />
                )}
              </button>
            </div>
          ))}
      </>
    );
  };
  return <div className="objects-list scene-tree">{nodes(null, 0)}</div>;
}
