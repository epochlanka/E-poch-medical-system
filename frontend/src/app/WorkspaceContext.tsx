import { createContext, useContext, useMemo } from 'react';
import type { ComponentProps, ReactNode } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import type { NavigateOptions } from 'react-router-dom';
import type { Workspace } from './workspaces';

/**
 * Tells the code inside a workspace which prefix it is mounted under.
 *
 * Every workspace was written as a standalone app with its pages at the root ('/dashboard',
 * '/patients', ...). Rather than rewriting each of those paths as the workspaces move in here,
 * pages keep using their own paths and the shell prefixes them. That keeps the four migrations
 * mechanical and means a page never has to know its workspace's route prefix.
 */
const WorkspaceCtx = createContext<Workspace | undefined>(undefined);

export const WorkspaceProvider = ({ workspace, children }: { workspace: Workspace; children: ReactNode }) => (
  <WorkspaceCtx.Provider value={workspace}>{children}</WorkspaceCtx.Provider>
);

export const useWorkspace = (): Workspace => {
  const ctx = useContext(WorkspaceCtx);
  if (!ctx) throw new Error('useWorkspace must be used inside a WorkspaceProvider');
  return ctx;
};

/** Turns a workspace-local path ('/patients') into a full app path ('/admin/patients'). */
export const useWorkspacePath = () => {
  const workspace = useWorkspace();
  return useMemo(
    () => (path: string) => `${workspace.base}${path.startsWith('/') ? path : `/${path}`}`,
    [workspace]
  );
};

/** navigate(), but taking workspace-local paths. Drop-in replacement for useNavigate in a workspace. */
export const useWorkspaceNavigate = () => {
  const navigate = useNavigate();
  const toPath = useWorkspacePath();
  return useMemo(
    () => (to: string | number, options?: NavigateOptions) =>
      typeof to === 'number' ? navigate(to) : navigate(toPath(to), options),
    [navigate, toPath]
  );
};

/**
 * Link and NavLink that take workspace-local paths, so a page written for a standalone portal keeps
 * its own hrefs. A path that already names another workspace ('/pharmacy/queue' from reception) is
 * passed through untouched — see the front desk, where one menu spans two workspaces.
 */
const passThrough = (to: string) => /^(https?:|mailto:|tel:|#)/.test(to);

export const WsLink = ({ to, ...rest }: ComponentProps<typeof Link> & { to: string }) => {
  const toPath = useWorkspacePath();
  return <Link to={passThrough(to) ? to : toPath(to)} {...rest} />;
};

export const WsNavLink = ({ to, ...rest }: ComponentProps<typeof NavLink> & { to: string }) => {
  const toPath = useWorkspacePath();
  return <NavLink to={passThrough(to) ? to : toPath(to)} {...rest} />;
};
