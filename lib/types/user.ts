/** System user (staff/owner) who can access the business panel. */
export interface SystemUser {
  id: string;
  email: string;
  role: "owner" | "staff";
  is_active: boolean;
}
