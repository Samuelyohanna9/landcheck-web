import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import toast from "react-hot-toast";
import { api, extractApiErrorMessage } from "../../api/client";
import EstateShell from "../../components/estates/EstateShell";
import EstateIcon from "../../components/estates/EstateIcon";
import EstateModal from "../../components/estates/EstateModal";
import { getEstateAuthSession } from "../../auth/estateAuth";

type PermissionItem = { key: string; label: string };
type PermissionGroup = { group: string; items: PermissionItem[] };
type StaffRole = { id: number; name: string; permissions: string[] };
type StaffMember = {
  member_id: number;
  account_id: number | null;
  full_name: string;
  email: string | null;
  phone: string | null;
  role_id: number | null;
  role_name: string | null;
  permissions: string[];
  permission_labels: string[];
  is_active: boolean;
  must_change_password: boolean;
  last_login_at: string | null;
  created_at: string | null;
};

function PermissionChecklist({
  groups,
  selected,
  onToggle,
}: {
  groups: PermissionGroup[];
  selected: Set<string>;
  onToggle: (key: string) => void;
}) {
  return (
    <div className="edash-permission-checklist">
      {groups.map((group) => (
        <div key={group.group} className="edash-permission-group">
          <p className="edash-permission-group-title">{group.group}</p>
          <div className="edash-permission-group-items">
            {group.items.map((item) => (
              <label key={item.key} className="edash-checkbox-row">
                <input type="checkbox" checked={selected.has(item.key)} onChange={() => onToggle(item.key)} />
                <span>{item.label}</span>
              </label>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export default function EstateStaffAccessPage() {
  const { estateId } = useParams();
  const session = getEstateAuthSession();
  const organizationId = session?.user.organization_id;
  const isOwner = String(session?.user.role_key || "").toLowerCase() === "owner";

  const [activity, setActivity] = useState<any[]>([]);
  const [groups, setGroups] = useState<PermissionGroup[]>([]);
  const [roles, setRoles] = useState<StaffRole[]>([]);
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [loading, setLoading] = useState(true);

  const [roleModalOpen, setRoleModalOpen] = useState<StaffRole | null | "new">(null);
  const [roleName, setRoleName] = useState("");
  const [rolePermissions, setRolePermissions] = useState<Set<string>>(new Set());
  const [roleBusy, setRoleBusy] = useState(false);

  const [staffModalOpen, setStaffModalOpen] = useState<StaffMember | null | "new">(null);
  const [staffName, setStaffName] = useState("");
  const [staffEmail, setStaffEmail] = useState("");
  const [staffPhone, setStaffPhone] = useState("");
  const [staffRoleId, setStaffRoleId] = useState<number | "">("");
  const [staffPermissions, setStaffPermissions] = useState<Set<string>>(new Set());
  const [staffBusy, setStaffBusy] = useState(false);

  const load = () => {
    if (!estateId) return;
    api.get(`/estates/${estateId}/activity`).then((response) => setActivity(response.data || [])).catch(() => setActivity([]));
    if (!organizationId) { setLoading(false); return; }
    setLoading(true);
    Promise.all([
      api.get(`/estates/organizations/${organizationId}/permission-catalog`).then((r) => r.data?.groups || []),
      api.get(`/estates/organizations/${organizationId}/staff-roles`).then((r) => r.data || []),
      api.get(`/estates/organizations/${organizationId}/staff`).then((r) => r.data || []),
    ])
      .then(([catalogGroups, roleRows, staffRows]) => {
        setGroups(catalogGroups);
        setRoles(roleRows);
        setStaff(staffRows);
      })
      .catch(async (error) => toast.error(await extractApiErrorMessage(error, "Team & Access could not be loaded.")))
      .finally(() => setLoading(false));
  };
  useEffect(load, [estateId, organizationId]);

  const openNewRole = () => { setRoleName(""); setRolePermissions(new Set()); setRoleModalOpen("new"); };
  const openEditRole = (role: StaffRole) => { setRoleName(role.name); setRolePermissions(new Set(role.permissions)); setRoleModalOpen(role); };
  const toggleRolePermission = (key: string) => {
    setRolePermissions((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const saveRole = async () => {
    if (!organizationId || !roleName.trim()) return;
    setRoleBusy(true);
    try {
      const body = { name: roleName.trim(), permissions: Array.from(rolePermissions) };
      if (roleModalOpen === "new") {
        const response = await api.post(`/estates/organizations/${organizationId}/staff-roles`, body);
        setRoles((current) => [...current, response.data]);
        toast.success("Role created.");
      } else if (roleModalOpen) {
        const response = await api.patch(`/estates/organizations/${organizationId}/staff-roles/${roleModalOpen.id}`, body);
        setRoles((current) => current.map((role) => (role.id === response.data.id ? response.data : role)));
        toast.success("Role updated.");
      }
      setRoleModalOpen(null);
    } catch (error) {
      toast.error(await extractApiErrorMessage(error, "Role could not be saved."));
    } finally {
      setRoleBusy(false);
    }
  };

  const deleteRole = async (role: StaffRole) => {
    if (!organizationId) return;
    if (!window.confirm(`Delete the "${role.name}" role? Staff already assigned to it keep their current access.`)) return;
    try {
      await api.delete(`/estates/organizations/${organizationId}/staff-roles/${role.id}`);
      setRoles((current) => current.filter((item) => item.id !== role.id));
      toast.success("Role deleted.");
    } catch (error) {
      toast.error(await extractApiErrorMessage(error, "Role could not be deleted."));
    }
  };

  const openNewStaff = () => {
    setStaffName(""); setStaffEmail(""); setStaffPhone(""); setStaffRoleId(""); setStaffPermissions(new Set());
    setStaffModalOpen("new");
  };
  const openEditStaff = (member: StaffMember) => {
    setStaffName(member.full_name); setStaffEmail(member.email || ""); setStaffPhone(member.phone || "");
    setStaffRoleId(member.role_id || ""); setStaffPermissions(new Set(member.permissions));
    setStaffModalOpen(member);
  };
  const toggleStaffPermission = (key: string) => {
    setStaffPermissions((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };
  const applyRoleTemplate = (roleId: number | "") => {
    setStaffRoleId(roleId);
    if (roleId === "") return;
    const role = roles.find((item) => item.id === roleId);
    if (role) setStaffPermissions(new Set(role.permissions));
  };

  const saveStaff = async () => {
    if (!organizationId) return;
    if (staffModalOpen === "new" && (!staffName.trim() || !staffEmail.trim())) {
      toast.error("Name and email are required.");
      return;
    }
    setStaffBusy(true);
    try {
      if (staffModalOpen === "new") {
        const response = await api.post(`/estates/organizations/${organizationId}/staff`, {
          full_name: staffName.trim(),
          email: staffEmail.trim(),
          phone: staffPhone.trim() || null,
          role_id: staffRoleId || null,
          permissions: Array.from(staffPermissions),
        });
        setStaff((current) => [...current, response.data]);
        toast.success(response.data.email_sent ? `Welcome email sent to ${staffEmail.trim()}.` : "Staff added, but the welcome email could not be sent.");
      } else if (staffModalOpen) {
        const response = await api.patch(`/estates/organizations/${organizationId}/staff/${staffModalOpen.member_id}`, {
          role_id: staffRoleId || null,
          permissions: Array.from(staffPermissions),
          phone: staffPhone.trim() || null,
        });
        setStaff((current) => current.map((item) => (item.member_id === response.data.member_id ? response.data : item)));
        toast.success("Access updated.");
      }
      setStaffModalOpen(null);
    } catch (error) {
      toast.error(await extractApiErrorMessage(error, "Staff member could not be saved."));
    } finally {
      setStaffBusy(false);
    }
  };

  const toggleStaffActive = async (member: StaffMember) => {
    if (!organizationId) return;
    try {
      const response = await api.patch(`/estates/organizations/${organizationId}/staff/${member.member_id}`, { is_active: !member.is_active });
      setStaff((current) => current.map((item) => (item.member_id === response.data.member_id ? response.data : item)));
      toast.success(member.is_active ? "Access revoked." : "Access restored.");
    } catch (error) {
      toast.error(await extractApiErrorMessage(error, "Could not update this staff member."));
    }
  };

  const resendInvite = async (member: StaffMember) => {
    if (!organizationId) return;
    try {
      const response = await api.post(`/estates/organizations/${organizationId}/staff/${member.member_id}/resend-invite`);
      toast.success(response.data.email_sent ? `Invite re-sent to ${member.email}.` : "A new temporary password was set, but the email could not be sent.");
    } catch (error) {
      toast.error(await extractApiErrorMessage(error, "Invite could not be re-sent."));
    }
  };

  const allPermissionCount = useMemo(() => groups.reduce((total, group) => total + group.items.length, 0), [groups]);

  if (!estateId) return null;

  return (
    <EstateShell estateId={estateId} activeKey="access" recentActivity={activity} pageTitle="Team & Access">
      {!isOwner && !loading && (
        <div className="edash-card" style={{ marginBottom: 16, borderColor: "var(--edash-warn)" }}>
          <div className="edash-card-inner">
            <p className="edash-status-row-desc">Only the organization owner can manage staff access. You can view this page, but changes are disabled.</p>
          </div>
        </div>
      )}
      <div className="edash-card" style={{ marginBottom: 16 }}>
        <div className="edash-card-inner">
          <div className="edash-card-head">
            <h3 className="edash-card-title">Roles</h3>
            {isOwner && <button type="button" className="edash-btn-outline" onClick={openNewRole}><EstateIcon name="plus" /> New role</button>}
          </div>
          <p className="edash-field-note" style={{ marginBottom: 14 }}>
            A role is a named checklist of dashboard sections - build one once, then assign it to any staff member below. Each staff member's actual access can still be fine-tuned individually.
          </p>
          {loading ? (
            <p className="edash-field-note">Loading...</p>
          ) : roles.length ? (
            <div className="edash-role-list">
              {roles.map((role) => (
                <div key={role.id} className="edash-role-row">
                  <div>
                    <strong>{role.name}</strong>
                    <p className="edash-field-note" style={{ margin: "2px 0 0" }}>
                      {role.permissions.length} of {allPermissionCount} sections
                    </p>
                  </div>
                  {isOwner && (
                    <div style={{ display: "flex", gap: 8 }}>
                      <button type="button" className="edash-btn-outline" onClick={() => openEditRole(role)}>Edit</button>
                      <button type="button" className="edash-btn-outline" onClick={() => void deleteRole(role)}>Delete</button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="edash-field-note">No roles yet - create one, or assign individual access directly when adding a staff member.</p>
          )}
        </div>
      </div>

      <div className="edash-card">
        <div className="edash-card-inner">
          <div className="edash-card-head">
            <h3 className="edash-card-title">Staff</h3>
            {isOwner && <button type="button" className="edash-btn-primary" onClick={openNewStaff}><EstateIcon name="plus" /> Add staff</button>}
          </div>
          <p className="edash-field-note" style={{ marginBottom: 14 }}>
            Each staff member gets their own dashboard login and receives a welcome email with a temporary password - they set their own password the first time they sign in. Anything not checked below is greyed out for them in the sidebar.
          </p>
          {loading ? (
            <p className="edash-field-note">Loading...</p>
          ) : staff.length ? (
            <table className="edash-mini-table">
              <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Access</th><th>Status</th><th /></tr></thead>
              <tbody>
                {staff.map((member) => (
                  <tr key={member.member_id}>
                    <td data-label="Name">{member.full_name}</td>
                    <td data-label="Email">{member.email}</td>
                    <td data-label="Role">{member.role_name || "Custom"}</td>
                    <td data-label="Access">{member.permission_labels.length ? `${member.permission_labels.length} sections` : "None"}</td>
                    <td data-label="Status">
                      {!member.is_active ? (
                        <span className="edash-status-pill tone-danger">Revoked</span>
                      ) : member.must_change_password ? (
                        <span className="edash-status-pill tone-warn">Invited - pending first login</span>
                      ) : (
                        <span className="edash-status-pill tone-good">Active</span>
                      )}
                    </td>
                    <td data-label="" style={{ whiteSpace: "nowrap" }}>
                      {isOwner && (
                        <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                          <button type="button" className="edash-btn-outline" onClick={() => openEditStaff(member)}>Edit</button>
                          {member.must_change_password && member.is_active && (
                            <button type="button" className="edash-btn-outline" onClick={() => void resendInvite(member)}>Resend invite</button>
                          )}
                          <button type="button" className="edash-btn-outline" onClick={() => void toggleStaffActive(member)}>
                            {member.is_active ? "Revoke" : "Restore"}
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="edash-field-note">No staff added yet.</p>
          )}
        </div>
      </div>

      {roleModalOpen && (
        <EstateModal
          title={roleModalOpen === "new" ? "New role" : `Edit role - ${roleModalOpen.name}`}
          subtitle="Choose which dashboard sections this role can see."
          onClose={() => setRoleModalOpen(null)}
        >
          <label className="edash-field" style={{ marginBottom: 14 }}>
            <span>Role name</span>
            <input value={roleName} maxLength={120} autoFocus onChange={(event) => setRoleName(event.target.value)} placeholder="e.g. Sales lead, Site manager" />
          </label>
          <PermissionChecklist groups={groups} selected={rolePermissions} onToggle={toggleRolePermission} />
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 16 }}>
            <button type="button" className="edash-btn-outline" disabled={roleBusy} onClick={() => setRoleModalOpen(null)}>Cancel</button>
            <button type="button" className="edash-btn-primary" disabled={roleBusy || !roleName.trim()} onClick={() => void saveRole()}>{roleBusy ? "Saving..." : "Save role"}</button>
          </div>
        </EstateModal>
      )}

      {staffModalOpen && (
        <EstateModal
          title={staffModalOpen === "new" ? "Add staff" : `Edit access - ${staffModalOpen.full_name}`}
          subtitle={staffModalOpen === "new" ? "They'll get a welcome email with a temporary password and a login link." : "Update their role or fine-tune individual access."}
          onClose={() => setStaffModalOpen(null)}
        >
          {staffModalOpen === "new" && (
            <>
              <label className="edash-field" style={{ marginBottom: 14 }}>
                <span>Full name</span>
                <input value={staffName} maxLength={255} autoFocus onChange={(event) => setStaffName(event.target.value)} />
              </label>
              <label className="edash-field" style={{ marginBottom: 14 }}>
                <span>Email</span>
                <input type="email" value={staffEmail} maxLength={255} onChange={(event) => setStaffEmail(event.target.value)} />
              </label>
              <label className="edash-field" style={{ marginBottom: 14 }}>
                <span>Phone (optional)</span>
                <input value={staffPhone} maxLength={64} onChange={(event) => setStaffPhone(event.target.value)} />
              </label>
            </>
          )}
          {staffModalOpen !== "new" && (
            <label className="edash-field" style={{ marginBottom: 14 }}>
              <span>Phone (optional)</span>
              <input value={staffPhone} maxLength={64} onChange={(event) => setStaffPhone(event.target.value)} />
            </label>
          )}
          <label className="edash-field" style={{ marginBottom: 14 }}>
            <span>Role</span>
            <select value={staffRoleId} onChange={(event) => applyRoleTemplate(event.target.value ? Number(event.target.value) : "")}>
              <option value="">Custom (pick access below)</option>
              {roles.map((role) => (
                <option key={role.id} value={role.id}>{role.name}</option>
              ))}
            </select>
          </label>
          <p className="edash-field-note" style={{ marginBottom: 6 }}>Access (starts from the role above, editable):</p>
          <PermissionChecklist groups={groups} selected={staffPermissions} onToggle={toggleStaffPermission} />
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 16 }}>
            <button type="button" className="edash-btn-outline" disabled={staffBusy} onClick={() => setStaffModalOpen(null)}>Cancel</button>
            <button type="button" className="edash-btn-primary" disabled={staffBusy} onClick={() => void saveStaff()}>
              {staffBusy ? "Saving..." : staffModalOpen === "new" ? "Add staff" : "Save access"}
            </button>
          </div>
        </EstateModal>
      )}
    </EstateShell>
  );
}
