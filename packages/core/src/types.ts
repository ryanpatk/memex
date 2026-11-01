// Domain types for memex's primitives (links, notes, tasks, jots, spaces,
// tags) and the Supabase schema they are stored in today. Spaces are still
// called profiles here, matching the database.

export interface Project {
  id: string
  user_id: string
  name: string
  description?: string
  is_starred: boolean
  created_at: string
  updated_at: string
  last_modified: string
}

export interface ProjectWithCounts extends Project {
  links: { count: number }[]
}

export interface Tag {
  id: string
  user_id: string
  name: string
  color: string
  created_at: string
  updated_at: string
}

export interface ApiToken {
  id: string
  user_id: string
  name: string
  token_hash: string
  created_at: string
  last_used_at: string | null
}

export interface LinkTag {
  id: string
  link_id: string
  tag_id: string
  created_at: string
}

export interface LinkTagWithTag extends LinkTag {
  tag?: Tag
}

export interface Link {
  id: string
  project_id: string
  user_id: string
  url: string
  title?: string
  description?: string
  favicon_url?: string
  preview_image_url?: string
  tag_id?: string
  is_super_favorite?: boolean
  /** Capture origin set by memex-api ('extension', 'x:bookmark', 'pinterest:save'); null = saved in the app. */
  source?: string | null
  created_at: string
  updated_at: string
  order_index: number
}

export interface LinkWithTag extends Link {
  tag?: Tag
  link_tags?: LinkTagWithTag[]
  tags?: Tag[]
  project?: {
    id: string
    name: string
  }
}

export interface Note {
  id: string
  user_id: string
  title?: string
  body: string
  order_index: number
  created_at: string
  updated_at: string
}

export interface NoteTag {
  id: string
  note_id: string
  tag_id: string
  created_at: string
}

export interface NoteTagWithTag extends NoteTag {
  tag?: Tag
}

export interface NoteWithTags extends Note {
  note_tags?: NoteTagWithTag[]
  tags?: Tag[]
}

export interface Task {
  id: string
  user_id: string
  title: string
  detail?: string
  is_done: boolean
  due_date?: string
  order_index: number
  created_at: string
  updated_at: string
}

export interface TaskTag {
  id: string
  task_id: string
  tag_id: string
  created_at: string
}

export interface TaskTagWithTag extends TaskTag {
  tag?: Tag
}

export interface TaskWithTags extends Task {
  task_tags?: TaskTagWithTag[]
  tags?: Tag[]
}

export interface Profile {
  id: string
  user_id: string
  name: string
  created_at: string
  updated_at: string
}

/** One "Notes to Self" message. profile_id null = the Home (general) feed. */
export interface SelfMessage {
  id: string
  user_id: string
  profile_id: string | null
  body: string
  legacy_id?: string | null
  created_at: string
  updated_at: string
}

export interface CreateSelfMessageData {
  body: string
  profile_id: string | null
}

export interface ProfileLink {
  id: string
  profile_id: string
  link_id: string
  order_index: number
  /** Pinned to the header while standing in this space (per-space super favorite). */
  is_super_favorite?: boolean
  created_at: string
}

/** Lightweight profile ↔ link membership row used for filtering and counts. */
export interface ProfileLinkMembership {
  profile_id: string
  link_id: string
  is_super_favorite?: boolean
}

export interface ProfileLinkWithLink extends ProfileLink {
  link?: LinkWithTag
}

export interface ProfileTask {
  id: string
  profile_id: string
  task_id: string
  order_index: number
  created_at: string
}

export interface ProfileNote {
  id: string
  profile_id: string
  note_id: string
  order_index: number
  created_at: string
}

// Form types for creating/updating entities
export interface CreateProjectData {
  name: string
  description?: string
  is_starred?: boolean
}

export interface UpdateProjectData {
  name?: string
  description?: string
  is_starred?: boolean
}

export interface CreateTagData {
  name: string
  color: string
}

export interface UpdateTagData {
  name?: string
  color?: string
}

export interface CreateProfileData {
  name: string
}

export interface UpdateProfileData {
  name?: string
}

export interface CreateLinkData {
  project_id?: string
  url: string
  title?: string
  description?: string
  favicon_url?: string
  preview_image_url?: string
  tag_id?: string
  order_index?: number
}

export interface UpdateLinkData {
  project_id?: string
  url?: string
  title?: string
  description?: string
  favicon_url?: string
  preview_image_url?: string
  tag_id?: string
  order_index?: number
  is_super_favorite?: boolean
}

export interface CreateNoteData {
  title?: string
  body?: string
  order_index?: number
}

export interface UpdateNoteData {
  title?: string | null
  body?: string
  order_index?: number
}

export interface CreateTaskData {
  title: string
  detail?: string
  due_date?: string
  order_index?: number
}

export interface UpdateTaskData {
  title?: string
  detail?: string
  is_done?: boolean
  due_date?: string | null
  order_index?: number
}

// Supabase database schema type
export interface Database {
  public: {
    Tables: {
      projects: {
        Row: Project
        Insert: Omit<Project, 'id' | 'created_at' | 'updated_at' | 'last_modified'> & {
          id?: string
          created_at?: string
          updated_at?: string
          last_modified?: string
        }
        Update: Partial<Omit<Project, 'id' | 'user_id' | 'created_at' | 'updated_at' | 'last_modified'>>
      }
      tags: {
        Row: Tag
        Insert: Omit<Tag, 'id' | 'created_at' | 'updated_at'> & {
          id?: string
          created_at?: string
          updated_at?: string
        }
        Update: Partial<Omit<Tag, 'id' | 'user_id' | 'created_at' | 'updated_at'>>
      }
      link_tags: {
        Row: LinkTag
        Insert: Omit<LinkTag, 'id' | 'created_at'> & {
          id?: string
          created_at?: string
        }
        Update: Partial<Omit<LinkTag, 'id' | 'created_at'>>
      }
      links: {
        Row: Link
        Insert: Omit<Link, 'id' | 'created_at' | 'updated_at'> & {
          id?: string
          created_at?: string
          updated_at?: string
        }
        Update: Partial<Omit<Link, 'id' | 'user_id' | 'created_at' | 'updated_at'>>
      }
      profiles: {
        Row: Profile
        Insert: Omit<Profile, 'id' | 'created_at' | 'updated_at'> & {
          id?: string
          created_at?: string
          updated_at?: string
        }
        Update: Partial<Omit<Profile, 'id' | 'user_id' | 'created_at' | 'updated_at'>>
      }
      profile_links: {
        Row: ProfileLink
        Insert: Omit<ProfileLink, 'id' | 'created_at'> & {
          id?: string
          created_at?: string
        }
        Update: Partial<Omit<ProfileLink, 'id' | 'created_at'>>
      }
      notes: {
        Row: Note
        Insert: Omit<Note, 'id' | 'created_at' | 'updated_at'> & {
          id?: string
          created_at?: string
          updated_at?: string
        }
        Update: Partial<Omit<Note, 'id' | 'user_id' | 'created_at' | 'updated_at'>>
      }
      note_tags: {
        Row: NoteTag
        Insert: Omit<NoteTag, 'id' | 'created_at'> & {
          id?: string
          created_at?: string
        }
        Update: Partial<Omit<NoteTag, 'id' | 'created_at'>>
      }
      profile_notes: {
        Row: ProfileNote
        Insert: Omit<ProfileNote, 'id' | 'created_at'> & {
          id?: string
          created_at?: string
        }
        Update: Partial<Omit<ProfileNote, 'id' | 'created_at'>>
      }
      tasks: {
        Row: Task
        Insert: Omit<Task, 'id' | 'created_at' | 'updated_at'> & {
          id?: string
          created_at?: string
          updated_at?: string
        }
        Update: Partial<Omit<Task, 'id' | 'user_id' | 'created_at' | 'updated_at'>>
      }
      task_tags: {
        Row: TaskTag
        Insert: Omit<TaskTag, 'id' | 'created_at'> & {
          id?: string
          created_at?: string
        }
        Update: Partial<Omit<TaskTag, 'id' | 'created_at'>>
      }
      profile_tasks: {
        Row: ProfileTask
        Insert: Omit<ProfileTask, 'id' | 'created_at'> & {
          id?: string
          created_at?: string
        }
        Update: Partial<Omit<ProfileTask, 'id' | 'created_at'>>
      }
      self_messages: {
        Row: SelfMessage
        Insert: Omit<SelfMessage, 'id' | 'created_at' | 'updated_at'> & {
          id?: string
          created_at?: string
          updated_at?: string
        }
        Update: Partial<Omit<SelfMessage, 'id' | 'user_id' | 'created_at' | 'updated_at'>>
      }
      api_tokens: {
        Row: ApiToken
        Insert: Omit<ApiToken, 'id' | 'created_at' | 'last_used_at'> & {
          id?: string
          created_at?: string
          last_used_at?: string | null
        }
        Update: Partial<Omit<ApiToken, 'id' | 'user_id' | 'created_at'>>
      }
    }
  }
}
