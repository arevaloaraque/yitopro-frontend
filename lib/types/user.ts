/** System user (staff/owner) who can access the business panel. */
export interface SystemUser {
  id: string;
  email: string;
  role: "owner" | "staff";
  is_active: boolean;
  /** Sign-up instant (ISO 8601). A plan downgrade deactivates newest-first. */
  created_at: string;
  /** True when the PLAN (not the owner) deactivated this seat — an upgrade restores it. */
  deactivated_by_plan: boolean;
}
