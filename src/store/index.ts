import { create } from 'zustand';
import { subscribeWithSelector, persist } from 'zustand/middleware';
import { useMemo } from 'react';
import { Project, Link } from '@memex/core';

interface AppState {
  // Projects
  projects: Project[];
  currentProject: Project | null;

  // Links
  links: Link[];

  // UI State
  searchQuery: string;
  selectedProjectIds: string[];
  selectedLinkIds: string[];

  // Stream selection (shared between the stream page and the sidebar so
  // spaces can act as bulk-assign targets). Keys are `${type}:${id}`.
  selectionMode: boolean;
  selectedItemKeys: string[];
  setSelectionMode: (on: boolean) => void;
  toggleItemSelection: (key: string) => void;
  /** Replace the selection (range select, select all). */
  setItemSelection: (keys: string[]) => void;
  clearItemSelection: () => void;

  // An item drag in progress (utils/itemDrag.ts): the keys it carries, so
  // sidebar spaces can show themselves as drop targets. Not persisted.
  itemDrag: { keys: string[] } | null;
  setItemDrag: (drag: { keys: string[] } | null) => void;

  // Actions
  setProjects: (projects: Project[]) => void;
  setCurrentProject: (project: Project | null) => void;
  addProject: (project: Project) => void;
  updateProject: (id: string, updates: Partial<Project>) => void;
  removeProject: (id: string) => void;

  setLinks: (links: Link[]) => void;
  addLink: (link: Link) => void;
  updateLink: (id: string, updates: Partial<Link>) => void;
  removeLink: (id: string) => void;

  setSearchQuery: (query: string) => void;
  setSelectedProjectIds: (ids: string[]) => void;
  toggleProject: (projectId: string) => void;
  clearSelectedProjects: () => void;
  setSelectedLinkIds: (ids: string[]) => void;
  toggleLinkSelection: (linkId: string) => void;
  clearSelectedLinks: () => void;
}

export const useAppStore = create<AppState>()(
  persist(
    subscribeWithSelector((set) => ({
      // Initial state
      projects: [],
      currentProject: null,
      links: [],
      searchQuery: '',
      selectedProjectIds: [],
      selectedLinkIds: [],
      selectionMode: false,
      selectedItemKeys: [],

      // Stream selection actions
      setSelectionMode: (on) =>
        set((state) => ({
          selectionMode: on,
          selectedItemKeys: on ? state.selectedItemKeys : [],
        })),
      toggleItemSelection: (key) =>
        set((state) => ({
          selectedItemKeys: state.selectedItemKeys.includes(key)
            ? state.selectedItemKeys.filter((k) => k !== key)
            : [...state.selectedItemKeys, key],
        })),
      setItemSelection: (keys) => set({ selectedItemKeys: Array.from(new Set(keys)) }),
      clearItemSelection: () => set({ selectedItemKeys: [] }),
      itemDrag: null,
      setItemDrag: (drag) => set({ itemDrag: drag }),

      // Project actions
      setProjects: (projects) => set({ projects }),
      setCurrentProject: (project) => set({ currentProject: project }),
      addProject: (project) =>
        set((state) => ({
          projects: [project, ...state.projects],
        })),
      updateProject: (id, updates) =>
        set((state) => ({
          projects: state.projects.map((p) =>
            p.id === id ? { ...p, ...updates } : p,
          ),
          currentProject:
            state.currentProject?.id === id
              ? { ...state.currentProject, ...updates }
              : state.currentProject,
        })),
      removeProject: (id) =>
        set((state) => ({
          projects: state.projects.filter((p) => p.id !== id),
          currentProject:
            state.currentProject?.id === id ? null : state.currentProject,
        })),

      // Link actions
      setLinks: (links) => set({ links }),
      addLink: (link) =>
        set((state) => ({
          links: [link, ...state.links],
        })),
      updateLink: (id, updates) =>
        set((state) => ({
          links: state.links.map((l) =>
            l.id === id ? { ...l, ...updates } : l,
          ),
        })),
      removeLink: (id) =>
        set((state) => ({
          links: state.links.filter((l) => l.id !== id),
        })),

      // UI actions
      setSearchQuery: (query) => set({ searchQuery: query }),
      setSelectedProjectIds: (ids) => set({ selectedProjectIds: ids }),
      toggleProject: (projectId) =>
        set((state) => {
          if (state.selectedProjectIds.includes(projectId)) {
            return {
              selectedProjectIds: state.selectedProjectIds.filter(
                (id) => id !== projectId,
              ),
            };
          } else {
            return {
              selectedProjectIds: [...state.selectedProjectIds, projectId],
            };
          }
        }),
      clearSelectedProjects: () => set({ selectedProjectIds: [] }),
      setSelectedLinkIds: (ids) => set({ selectedLinkIds: ids }),
      toggleLinkSelection: (linkId) =>
        set((state) => {
          if (state.selectedLinkIds.includes(linkId)) {
            return {
              selectedLinkIds: state.selectedLinkIds.filter(
                (id) => id !== linkId,
              ),
            };
          } else {
            return {
              selectedLinkIds: [...state.selectedLinkIds, linkId],
            };
          }
        }),
      clearSelectedLinks: () => set({ selectedLinkIds: [] }),
    })),
    {
      name: 'ex-p02-storage',
      // Only persist selectedProjectIds and searchQuery, not the full projects/links arrays
      partialize: (state) => ({
        selectedProjectIds: state.selectedProjectIds,
        searchQuery: state.searchQuery,
      }),
    },
  ),
);

// Selectors

export const useStarredProjects = () => {
  const projects = useAppStore((state) => state.projects);
  return useMemo(
    () =>
      projects
        .filter((p) => p.is_starred)
        .sort(
          (a, b) =>
            new Date(b.last_modified).getTime() -
            new Date(a.last_modified).getTime(),
        ),
    [projects],
  );
};

export const useUnstarredProjects = () => {
  const projects = useAppStore((state) => state.projects);
  return useMemo(
    () =>
      projects
        .filter((p) => !p.is_starred)
        .sort(
          (a, b) =>
            new Date(b.last_modified).getTime() -
            new Date(a.last_modified).getTime(),
        ),
    [projects],
  );
};
