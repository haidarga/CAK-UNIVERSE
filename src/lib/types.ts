// ============================================================
// Domain types — mirror the Supabase schema (001_initial_schema.sql).
// ============================================================
import type {
  WarmupPhase,
  PipelineStage,
  AlertPriority,
  TeamRole,
  TaskStatus,
  TaskType,
  DevIssueStatus,
  DevSeverity,
  DevArea,
} from "./constants";

export interface Brand {
  id: string;
  name: string;
  slug: string;
  platform: "tiktok" | "instagram" | "both";
  campaign_tagline: string | null;
  emotional_pillars: string[];
  content_formats: string[];
  posting_sweet_spot: { day?: string; hour?: string } | null;
  guidelines: string | null;
  guardrails: string[];
  approved_claims: string[];
  script_format: string | null;
  cta_rules: string | null;
  hashtag_sets: string[];
  products: string[];
  hero_products: string[];
  kpi_targets: Record<string, number> | null;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface Persona {
  id: string;
  brand_id: string;
  name: string;
  platform_username: string | null;
  archetype: string | null;
  tone_of_voice: string | null;
  background: string | null;
  language: string;
  content_style: Record<string, unknown> | null;
  pain_points: string[];
  emotional_clusters: string[];
  created_at: string;
}

export interface Account {
  id: string;
  brand_id: string;
  persona_id: string | null;
  platform: "tiktok" | "instagram";
  username: string;
  account_url: string | null;
  warmup_phase: WarmupPhase;
  warmup_started_at: string | null;
  phase_changed_at: string | null;
  warmup_notes: string | null;
  daily_post_limit: number;
  min_hours_between_posts: number;
  follower_count: number;
  following_count: number;
  engagement_rate: number;
  avg_views_last_7d: number;
  total_posts: number;
  last_post_engagement: number;
  status: "active" | "paused" | "banned" | "flagged";
  last_posted_at: string | null;
  last_scraped_at: string | null;
  anomaly_flags: string[];
  anomaly_flagged_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ContentDirection {
  title: string;
  place?: string;
  format?: string;
  emotional_angle?: string;
  emotional_pillar?: string;
  hook?: string;
  reference_url?: string;
  product_featured?: string;
  week_number?: number;
  narrative_theme?: string;
  research_notes?: string;
}

export interface Script {
  text: string;
  version: number;
}

export interface QCReport {
  passed: boolean;
  score: number;
  hook_strength?: number;
  brand_voice_match?: number;
  visual_quality?: number;
  issues: string[];
  recommendations: string[];
  creator_feedback?: string;
  guardrail_flag?: boolean;
  needs_review?: boolean;
  violations?: string[];
}

export interface Shot {
  shot_number: number;
  duration_seconds: number;
  cakai_prompt: string;
  persona_voice_line: string;
  visual_notes: string;
  capcut_transition: string;
  audio_notes: string;
}

export interface ContentPipeline {
  id: string;
  brand_id: string;
  account_id: string | null;
  persona_id: string | null;
  stage: PipelineStage;
  stage_history: { stage: string; changed_at: string; changed_by: string }[];
  content_type: string | null;
  emotional_pillar: string | null;
  content_format: string | null;
  content_direction: ContentDirection | null;
  script: Script | null;
  script_version: number;
  production_params: { shots: Shot[]; raw_output: string } | null;
  production_url: string | null;
  qc_report: QCReport | null;
  scheduled_at: string | null;
  posted_at: string | null;
  performance: Record<string, number> | null;
  performance_score: number | null;
  week_number: number | null;
  priority: number;
  created_at: string;
  updated_at: string;
}

export interface Hook {
  id: string;
  brand_id: string;
  hook_text: string;
  emotional_pillar: string;
  hook_type: string | null;
  language: string;
  performance_score: number;
  usage_count: number;
  last_used_at: string | null;
  sourced_from: string | null;
  created_at: string;
}

export interface KpiMetric {
  id: string;
  brand_id: string;
  account_id: string;
  date: string;
  followers_start: number;
  followers_end: number;
  followers_gained: number;
  total_views: number;
  total_likes: number;
  total_comments: number;
  total_shares: number;
  total_saves: number;
  posts_published: number;
  engagement_rate: number | null;
  avg_views_per_post: number | null;
  warmup_phase: string | null;
  recorded_at: string;
}

export interface Trend {
  id: string;
  brand_id: string | null;
  platform: string;
  content_url: string | null;
  thumbnail_url: string | null;
  views: number;
  likes: number;
  shares: number;
  engagement_rate: number;
  content_category: string | null;
  emotional_angle: string | null;
  hook_pattern: string | null;
  format_type: string | null;
  replication_difficulty: string | null;
  relevance_score: number;
  status: string;
  fetched_at: string;
}

export interface AnomalyAnalysis {
  account_id: string;
  current_phase: WarmupPhase;
  recommended_phase: WarmupPhase;
  should_upgrade: boolean;
  anomalies: string[];
  daily_post_limit: number;
  action_required: string;
  alert_priority: AlertPriority;
}

// ============================================================
// Work OS entities (migration 002)
// ============================================================

export interface TeamMember {
  id: string;
  name: string;
  email: string | null;
  role: TeamRole;
  avatar_url: string | null;
  status: "active" | "away" | "inactive";
  created_at: string;
  updated_at: string;
}

export interface Task {
  id: string;
  brand_id: string | null;
  pipeline_id: string | null;
  title: string;
  description: string | null;
  type: TaskType;
  status: TaskStatus;
  priority: number; // 1=urgent .. 4=low
  progress: number; // 0..100
  assignee_id: string | null;
  created_by: string | null;
  due_date: string | null;
  started_at: string | null;
  completed_at: string | null;
  depends_on: string[];
  labels: string[];
  ai_generated: boolean;
  created_at: string;
  updated_at: string;
  // joined (optional)
  assignee?: TeamMember | null;
  brands?: Brand | null;
}

export interface TaskComment {
  id: string;
  task_id: string;
  author_id: string | null;
  body: string;
  created_at: string;
  author?: TeamMember | null;
}

export interface DevIssue {
  id: string;
  title: string;
  description: string | null;
  severity: DevSeverity;
  status: DevIssueStatus;
  area: DevArea;
  reported_by: string | null;
  assignee_id: string | null;
  task_id: string | null;
  github_issue_number: number | null;
  github_url: string | null;
  github_state: string | null;
  created_at: string;
  updated_at: string;
  reporter?: TeamMember | null;
  assignee?: TeamMember | null;
}

export interface ActivityLog {
  id: string;
  actor_id: string | null;
  entity_type: "task" | "dev_issue" | "pipeline" | "account" | "comment";
  entity_id: string | null;
  action: string;
  summary: string | null;
  brand_id: string | null;
  created_at: string;
  actor?: TeamMember | null;
}

export interface Notification {
  id: string;
  recipient_id: string;
  type: "info" | "assignment" | "mention" | "alert";
  title: string;
  body: string | null;
  link: string | null;
  read: boolean;
  created_at: string;
}

// ============================================================
// Integration layer (migration 003)
// ============================================================

export interface IntegrationConnection {
  id: string;
  provider: string;
  display_name: string | null;
  status: "connected" | "disconnected" | "error";
  account_label: string | null;
  config: Record<string, unknown>;
  last_synced_at: string | null;
  last_error: string | null;
  connected_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface EmbeddedResource {
  id: string;
  provider: string;
  kind: "doc" | "sheet" | "drive_file" | "video" | "post" | "profile" | "board";
  title: string | null;
  external_url: string;
  external_id: string | null;
  thumbnail_url: string | null;
  brand_id: string | null;
  task_id: string | null;
  pipeline_id: string | null;
  created_by: string | null;
  created_at: string;
}
