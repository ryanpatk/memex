import type {
  AgentToken,
  ApiToken,
  CreateLinkData,
  CreateNoteData,
  CreateProfileData,
  CreateProjectData,
  CreateSavedViewData,
  CreateSelfMessageData,
  CreateTagData,
  CreateTaskData,
  InboxProposal,
  Link,
  LinkWithTag,
  Note,
  NoteWithTags,
  Profile,
  ProfileLinkMembership,
  ProfileLinkWithLink,
  Project,
  ProjectWithCounts,
  SavedView,
  SelfMessage,
  Tag,
  Task,
  TaskWithTags,
  UpdateLinkData,
  UpdateNoteData,
  UpdateProfileData,
  UpdateSelfMessageData,
  UpdateProjectData,
  UpdateSavedViewData,
  UpdateTagData,
  UpdateTaskData,
} from './types';

/*
 * The Repository: everything a memex client reads and writes, as one
 * interface (ROADMAP.md §3.1, Phase 2). Clients code against this, never
 * against a database client, so the backend can change underneath them.
 *
 * v1 has one adapter, `createSupabaseRepository` (`@memex/core/supabase`),
 * used by the web app and, per decision 20 (2026-11-01), by the Expo app
 * too: both talk to Supabase directly and rely on RLS for per-user access.
 * v2's vault backend (Phase 4) becomes a second adapter behind the same
 * interface.
 *
 * Every user-scoped read returns only the signed-in user's rows; creates
 * stamp the current user. Spaces are stored as `profiles` and jots as
 * `self_messages` today; the interface uses the domain words (CONTEXT.md).
 * Methods throw on failure unless noted.
 */

/** The signed-in user, as much of it as memex reads. */
export interface AuthUser {
  id: string;
  email?: string;
  user_metadata: {
    full_name?: string;
    name?: string;
    avatar_url?: string;
    [key: string]: unknown;
  };
}

export interface AuthSession {
  user: AuthUser;
  access_token: string;
  expires_at?: number;
}

/** Auth calls report failure as a message instead of throwing, so forms can show it. */
export type AuthResult = { error: { message: string } | null };

export type OAuthProvider = 'github';

/** Starting OAuth: on native, `url` is the provider page to open in an auth browser session. */
export type OAuthStartResult = AuthResult & { url?: string };

export interface AuthRepository {
  /** The stored session, or null when signed out. */
  getSession(): Promise<AuthSession | null>;
  /** Calls `listener` on every sign-in, sign-out and token refresh. Returns an unsubscribe function. */
  onAuthStateChange(listener: (session: AuthSession | null) => void): () => void;
  signInWithPassword(credentials: { email: string; password: string }): Promise<AuthResult>;
  signUp(credentials: { email: string; password: string }): Promise<AuthResult>;
  /**
   * Starts an OAuth redirect; on web the page navigates away. Native apps pass
   * `skipBrowserRedirect: true`, open the returned `url` in an auth browser
   * session, then hand the `code` from the redirect to `exchangeCodeForSession`
   * (needs a client created with `flowType: 'pkce'`).
   */
  signInWithOAuth(
    provider: OAuthProvider,
    options: { redirectTo: string; skipBrowserRedirect?: boolean },
  ): Promise<OAuthStartResult>;
  /** Finishes a PKCE OAuth sign-in with the `code` from the redirect URL. */
  exchangeCodeForSession(code: string): Promise<AuthResult>;
  /**
   * Native apps pause token refresh while backgrounded and resume it in the
   * foreground (browsers handle this themselves). No-op where unsupported.
   */
  setAutoRefresh(active: boolean): void;
  signOut(): Promise<AuthResult>;
}

export interface LinksRepository {
  /** Every link, newest first, with tags and project. */
  getAll(): Promise<LinkWithTag[]>;
  getById(id: string): Promise<LinkWithTag | null>;
  /** Links carrying the legacy single tag, in manual order. */
  getByTag(tagId: string): Promise<LinkWithTag[]>;
  /** Legacy (pre-spaces) project views, in manual order. */
  getByProject(projectId: string): Promise<LinkWithTag[]>;
  /** Legacy: links in any of these projects; every link when the list is empty. */
  getByProjects(projectIds: string[]): Promise<LinkWithTag[]>;
  /** Saves a link at the top of its project's order (the hidden "Library" project by default). */
  create(data: CreateLinkData): Promise<Link>;
  update(id: string, updates: UpdateLinkData): Promise<Link>;
  delete(id: string): Promise<void>;
  reorder(links: { id: string; order_index: number }[]): Promise<void>;
  /** Replaces the link's tags; the first also becomes its legacy single tag. */
  setTags(linkId: string, tagIds: string[]): Promise<void>;
}

export interface NotesRepository {
  /** Every note, most recently edited first. Empty if notes aren't migrated yet. */
  getAll(): Promise<NoteWithTags[]>;
  create(data: CreateNoteData): Promise<Note>;
  update(id: string, updates: UpdateNoteData): Promise<Note>;
  delete(id: string): Promise<void>;
  setTags(noteId: string, tagIds: string[]): Promise<void>;
}

export interface TasksRepository {
  /** Every task in manual order. Empty if tasks aren't migrated yet. */
  getAll(): Promise<TaskWithTags[]>;
  /** Saves a task at the top of the order. */
  create(data: CreateTaskData): Promise<Task>;
  update(id: string, updates: UpdateTaskData): Promise<Task>;
  delete(id: string): Promise<void>;
  setTags(taskId: string, tagIds: string[]): Promise<void>;
}

export interface TagsRepository {
  /** Every tag by name. */
  getAll(): Promise<Tag[]>;
  getById(id: string): Promise<Tag | null>;
  create(data: CreateTagData): Promise<Tag>;
  update(id: string, updates: UpdateTagData): Promise<Tag>;
  /** Deletes the tag after detaching it from every link. */
  delete(id: string): Promise<void>;
  /** How many links carry it as their legacy single tag. */
  getUsageCount(tagId: string): Promise<number>;
}

export interface SpacesRepository {
  /** Every space, oldest first. */
  getAll(): Promise<Profile[]>;
  getById(id: string): Promise<Profile | null>;
  create(data: CreateProfileData): Promise<Profile>;
  update(id: string, updates: UpdateProfileData): Promise<Profile>;
  delete(id: string): Promise<void>;
}

export interface JotsRepository {
  /** Every jot, oldest first. Scope (Home or a space) is applied by the caller. */
  getAll(): Promise<SelfMessage[]>;
  create(data: CreateSelfMessageData): Promise<SelfMessage>;
  /**
   * Edit a jot's text or move it: `profile_id` set to a space files it there,
   * null takes it out to the Journal. Fields left out stay as they are.
   * Resolves to the updated row.
   */
  update(id: string, updates: UpdateSelfMessageData): Promise<SelfMessage>;
  delete(id: string): Promise<void>;
}

/** Which links are filed in which spaces, plus per-space pins. */
export interface SpaceLinksRepository {
  listMembership(): Promise<ProfileLinkMembership[]>;
  /** Pin or unpin a link to the header inside one space. */
  setSuperFavorite(spaceId: string, linkId: string, isSuperFavorite: boolean): Promise<void>;
  /** One space's links with their link rows, in the space's order. */
  getBySpace(spaceId: string): Promise<ProfileLinkWithLink[]>;
  /** Files links in a space, after its existing ones; already-filed ids are skipped. */
  addLinks(spaceId: string, linkIds: string[]): Promise<void>;
  removeLink(spaceId: string, linkId: string): Promise<void>;
}

export interface SpaceNotesRepository {
  listMembership(): Promise<{ profile_id: string; note_id: string }[]>;
  addNotes(spaceId: string, noteIds: string[]): Promise<void>;
  removeNote(spaceId: string, noteId: string): Promise<void>;
}

export interface SpaceTasksRepository {
  listMembership(): Promise<{ profile_id: string; task_id: string }[]>;
  addTasks(spaceId: string, taskIds: string[]): Promise<void>;
  removeTask(spaceId: string, taskId: string): Promise<void>;
}

/** Access tokens for memex-api (extension, MCP). Only the hash is ever stored. */
export interface ApiTokensRepository {
  /** Newest first. */
  getAll(): Promise<ApiToken[]>;
  create(data: { name: string; token_hash: string }): Promise<ApiToken>;
  delete(id: string): Promise<void>;
}

/**
 * MCP agent tokens (`agent_tokens`, docs/mcp.md). The app lists and revokes
 * them; creating one goes through memex-api (`POST /agent-tokens`), which
 * generates the token server-side and shows it once. Extension tokens
 * (`apiTokens`) are separate and untouched by anything here.
 */
export interface AgentTokensRepository {
  /** Every agent token, newest first, never the hash. Empty if the table isn't there yet. */
  getAll(): Promise<AgentToken[]>;
  /** Revoke one token; memex-api refuses it on its next request. */
  revoke(id: string): Promise<void>;
  /** The kill switch: revoke every agent token that isn't revoked yet. Returns how many. */
  revokeAll(): Promise<number>;
}

/**
 * Inbox proposals from agents (`inbox_proposals`): changes to existing items
 * waiting for the user. Applying one is `applyProposal` (@memex/core/agent),
 * which writes through the other Repository areas and then calls `decide`.
 */
export interface ProposalsRepository {
  /** Pending proposals, oldest first. Empty if the table isn't there yet. */
  getPending(): Promise<InboxProposal[]>;
  /** Record the decision on a pending proposal; the row stays. */
  decide(id: string, status: 'applied' | 'rejected'): Promise<void>;
}

/**
 * Saved Library views (decision 15A): named filters with a layout and sort.
 * The built-in tabs (Everything, Unfiled, From X…) live in code, not here.
 */
export interface SavedViewsRepository {
  /** Every saved view, in tab order (position, then oldest first). Empty if the table isn't there yet. */
  getAll(): Promise<SavedView[]>;
  create(data: CreateSavedViewData): Promise<SavedView>;
  update(id: string, updates: UpdateSavedViewData): Promise<SavedView>;
  delete(id: string): Promise<void>;
}

/** Legacy pre-spaces projects (original PRD); slated for retirement. */
export interface ProjectsRepository {
  getAll(): Promise<ProjectWithCounts[]>;
  getById(id: string): Promise<Project | null>;
  create(data: CreateProjectData): Promise<Project>;
  update(id: string, updates: UpdateProjectData): Promise<Project>;
  delete(id: string): Promise<void>;
}

export interface Repository {
  auth: AuthRepository;
  links: LinksRepository;
  notes: NotesRepository;
  tasks: TasksRepository;
  tags: TagsRepository;
  spaces: SpacesRepository;
  jots: JotsRepository;
  spaceLinks: SpaceLinksRepository;
  spaceNotes: SpaceNotesRepository;
  spaceTasks: SpaceTasksRepository;
  apiTokens: ApiTokensRepository;
  agentTokens: AgentTokensRepository;
  proposals: ProposalsRepository;
  views: SavedViewsRepository;
  projects: ProjectsRepository;
}
