/*
 * React Query keys, one per Repository resource (the web's hooks use the
 * same split). Every screen reads these; writes update them optimistically.
 */
export const keys = {
  jots: ['jots'],
  links: ['links'],
  notes: ['notes'],
  tasks: ['tasks'],
  spaces: ['spaces'],
  linkMembership: ['space-links', 'membership'],
  noteMembership: ['space-notes', 'membership'],
  taskMembership: ['space-tasks', 'membership'],
} as const;
