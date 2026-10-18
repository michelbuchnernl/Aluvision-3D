import { useEffect, useRef, useSyncExternalStore } from "react";
import type { Project } from "./model";
import { ProjectConnection } from "./serverClient";
export function useProjectServer(
  project: Project,
  onLoad: (p: Project) => void,
) {
  const onLoadRef = useRef(onLoad);
  onLoadRef.current = onLoad;
  const ref = useRef<ProjectConnection | null>(null);
  if (!ref.current)
    ref.current = new ProjectConnection(project, (p) => onLoadRef.current(p));
  const connection = ref.current;
  const state = useSyncExternalStore(
    connection.subscribe,
    connection.getSnapshot,
    connection.getSnapshot,
  );
  useEffect(() => {
    connection.setCurrent(project);
  }, [connection, project]);
  // Both timers also run in "offline" so a transient failure can heal itself.
  // Gating them on "connected" alone meant error() permanently stopped the
  // heartbeat and autosave, and nothing ever set the mode back.
  const live = state.mode === "connected" || state.mode === "offline";
  useEffect(() => {
    if (!live) return;
    const timer = setInterval(() => connection.heartbeat(), 10000);
    return () => clearInterval(timer);
  }, [connection, live]);
  useEffect(() => {
    if (!live || !state.dirty || state.saving) return;
    const timer = setTimeout(() => {
      connection.save().catch(() => {});
    }, 1200);
    return () => clearTimeout(timer);
  }, [connection, live, state.dirty, state.saving, project]);
  useEffect(
    () => () => {
      connection.disconnect();
    },
    [connection],
  );
  return { connection, state };
}
