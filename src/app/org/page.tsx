"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { trpc } from "@/lib/trpc";
import { useConfirm } from "@/components/confirm-dialog";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Building2,
  Plus,
  Users,
  Crown,
  Shield,
  User,
  Eye,
  Mail,
  Trash2,
  Copy,
  Check,
  ChevronDown,
  ChevronUp,
  LogOut,
  Pencil,
  ArrowRightLeft,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const ROLE_ICONS: Record<string, typeof Crown> = {
  owner: Crown,
  admin: Shield,
  member: User,
  viewer: Eye,
};

const ROLE_COLORS: Record<string, string> = {
  owner: "bg-amber-500/15 text-amber-500",
  admin: "bg-blue-500/15 text-blue-500",
  member: "bg-emerald-500/15 text-emerald-500",
  viewer: "bg-muted text-muted-foreground",
};

export default function OrgPage() {
  const confirm = useConfirm();
  const [createOpen, setCreateOpen] = useState(false);
  const [orgName, setOrgName] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("member");
  const [inviteOrgId, setInviteOrgId] = useState<string | null>(null);
  const [expandedOrgId, setExpandedOrgId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState<string | null>(null);
  const [editNameValue, setEditNameValue] = useState("");

  const router = useRouter();
  const orgsQuery = trpc.org.list.useQuery();

  const detailQuery = trpc.org.get.useQuery(expandedOrgId!, {
    enabled: !!expandedOrgId,
  });

  const createOrg = trpc.org.create.useMutation({
    onSuccess: () => {
      toast.success("Organization created!");
      orgsQuery.refetch();
      setCreateOpen(false);
      setOrgName("");
    },
    onError: (err) => toast.error(err.message),
  });
  const inviteMutation = trpc.org.invite.useMutation({
    onSuccess: () => {
      toast.success("Invite sent!");
      setInviteEmail("");
      setInviteRole("member");
      setInviteOrgId(null);
      detailQuery.refetch();
    },
    onError: (err) => toast.error(err.message),
  });

  const leaveMutation = trpc.org.leave.useMutation({
    onSuccess: () => {
      toast.success("Left organization");
      setExpandedOrgId(null);
      orgsQuery.refetch();
    },
    onError: (err) => toast.error(err.message),
  });

  const deleteOrgMutation = trpc.org.deleteOrg.useMutation({
    onSuccess: () => {
      toast.success("Organization deleted");
      setExpandedOrgId(null);
      orgsQuery.refetch();
    },
    onError: (err) => toast.error(err.message),
  });

  const updateRoleMutation = trpc.org.updateRole.useMutation({
    onSuccess: () => {
      toast.success("Role updated");
      detailQuery.refetch();
    },
    onError: (err) => toast.error(err.message),
  });

  const removeMemberMutation = trpc.org.removeMember.useMutation({
    onSuccess: () => {
      toast.success("Member removed");
      detailQuery.refetch();
      orgsQuery.refetch();
    },
    onError: (err) => toast.error(err.message),
  });

  const transferMutation = trpc.org.transferOwnership.useMutation({
    onSuccess: () => {
      toast.success("Ownership transferred");
      detailQuery.refetch();
      orgsQuery.refetch();
    },
    onError: (err) => toast.error(err.message),
  });

  const updateOrgMutation = trpc.org.updateOrg.useMutation({
    onSuccess: () => {
      toast.success("Organization updated");
      setEditingName(null);
      detailQuery.refetch();
      orgsQuery.refetch();
    },
    onError: (err) => toast.error(err.message),
  });

  const orgs = orgsQuery.data ?? [];
  const detail = detailQuery.data;
  const myRole = detail?.role;

  return (
    <div className="mx-auto w-full max-w-5xl space-y-8 p-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            <Building2 className="size-6" />
            Organizations
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Create teams to share skills and collaborate.
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="size-4" />
          Create Organization
        </Button>
      </div>

      {orgs.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <Building2 className="size-12 text-muted-foreground/30 mb-4" />
            <h3 className="text-lg font-medium">No organizations yet</h3>
            <p className="text-sm text-muted-foreground mt-1">
              Create an organization to share skills with your team.
            </p>
            <Button className="mt-4" onClick={() => setCreateOpen(true)}>
              <Plus className="size-4" />
              Create your first organization
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {orgs.map((org) => {
            const RoleIcon = ROLE_ICONS[org.role] || User;
            const isExpanded = expandedOrgId === org.id;
            return (
              <Card key={org.id} className="hover:shadow-sm transition-shadow">
                <CardHeader
                  className="cursor-pointer"
                  onClick={() => setExpandedOrgId(isExpanded ? null : org.id)}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="size-10 rounded-lg bg-primary/10 flex items-center justify-center">
                        {org.imageUrl ? (
                          <img src={org.imageUrl} className="size-10 rounded-lg object-cover" alt={org.name} />
                        ) : (
                          <Building2 className="size-5 text-primary" />
                        )}
                      </div>
                      <div>
                        <CardTitle className="text-base">{org.name}</CardTitle>
                        <CardDescription className="flex items-center gap-2 mt-0.5">
                          <Users className="size-3" />
                          {org.memberCount} member{org.memberCount !== 1 ? "s" : ""}
                          <span className="text-muted-foreground/40">·</span>
                          <Badge className={`text-[10px] ${ROLE_COLORS[org.role]}`}>
                            <RoleIcon className="size-3 mr-0.5" />
                            {org.role}
                          </Badge>
                        </CardDescription>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {(org.role === "owner" || org.role === "admin") && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            setInviteOrgId(org.id);
                          }}
                        >
                          <Mail className="size-3.5" />
                          Invite
                        </Button>
                      )}
                      {isExpanded ? (
                        <ChevronUp className="size-4 text-muted-foreground" />
                      ) : (
                        <ChevronDown className="size-4 text-muted-foreground" />
                      )}
                    </div>
                  </div>
                </CardHeader>

                {isExpanded && detail && (
                  <CardContent className="pt-0 space-y-6">
                    <Separator />

                    {/* Org Name (editable for owner/admin) */}
                    {(myRole === "owner" || myRole === "admin") ? (
                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground">Organization Name</Label>
                        {editingName === org.id ? (
                          <div className="flex items-center gap-2">
                            <Input
                              value={editNameValue}
                              onChange={(e) => setEditNameValue(e.target.value)}
                              className="h-8 text-sm max-w-xs"
                              onKeyDown={(e) => {
                                if (e.key === "Enter" && editNameValue.trim()) {
                                  updateOrgMutation.mutate({ orgId: org.id, name: editNameValue.trim() });
                                }
                                if (e.key === "Escape") setEditingName(null);
                              }}
                            />
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-8"
                              disabled={!editNameValue.trim() || updateOrgMutation.isPending}
                              onClick={() => updateOrgMutation.mutate({ orgId: org.id, name: editNameValue.trim() })}
                            >
                              <Check className="size-3.5" />
                            </Button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-medium">{detail.name}</p>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-6 w-6 p-0"
                              onClick={() => {
                                setEditingName(org.id);
                                setEditNameValue(detail.name);
                              }}
                            >
                              <Pencil className="size-3" />
                            </Button>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground">Organization Name</Label>
                        <p className="text-sm font-medium">{detail.name}</p>
                      </div>
                    )}

                    {/* Members */}
                    <div className="space-y-3">
                      <Label className="text-xs text-muted-foreground">Members ({detail.members.length})</Label>
                      <div className="space-y-0 rounded-md border">
                        {detail.members.map((member) => {
                          const MemberRoleIcon = ROLE_ICONS[member.role] || User;
                          const canManage = (myRole === "owner" || myRole === "admin") && member.role !== "owner";
                          const isOwner = myRole === "owner";

                          return (
                            <div key={member.id} className="flex items-center justify-between py-2 px-3 border-b last:border-b-0">
                              <div className="flex items-center gap-3">
                                {member.imageUrl ? (
                                  <img src={member.imageUrl} className="size-8 rounded-full object-cover" alt="" />
                                ) : (
                                  <div className="size-8 rounded-full bg-muted flex items-center justify-center">
                                    <User className="size-4 text-muted-foreground" />
                                  </div>
                                )}
                                <div>
                                  <p className="text-sm font-medium">{member.name || member.email}</p>
                                  <p className="text-xs text-muted-foreground">{member.email}</p>
                                </div>
                              </div>
                              <div className="flex items-center gap-2">
                                <Badge variant="outline" className={`text-[10px] ${ROLE_COLORS[member.role]}`}>
                                  <MemberRoleIcon className="size-3 mr-0.5" />
                                  {member.role}
                                </Badge>

                                {/* Role change dropdown (owner only, not for self/other owners) */}
                                {isOwner && member.role !== "owner" && (
                                  <DropdownMenu>
                                    <DropdownMenuTrigger
                                      render={<Button variant="ghost" size="sm" className="h-7 text-xs px-2" />}
                                    >
                                      <ChevronDown className="size-3" />
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="end">
                                      {(["admin", "member", "viewer"] as const).map((role) => (
                                        <DropdownMenuItem
                                          key={role}
                                          disabled={member.role === role}
                                          onClick={() =>
                                            updateRoleMutation.mutate({
                                              orgId: org.id,
                                              memberId: member.id,
                                              role,
                                            })
                                          }
                                        >
                                          Set as {role}
                                        </DropdownMenuItem>
                                      ))}
                                      <Separator className="my-1" />
                                      <DropdownMenuItem
                                        onClick={async () => {
                                          const ok = await confirm({ title: "Transfer ownership", description: `Transfer ownership to ${member.name || member.email}? You will become an admin.`, confirmLabel: "Transfer" });
                                          if (ok) transferMutation.mutate({ orgId: org.id, newOwnerId: member.userId });
                                        }}
                                      >
                                        <ArrowRightLeft className="size-3 mr-1.5" />
                                        Transfer ownership
                                      </DropdownMenuItem>
                                    </DropdownMenuContent>
                                  </DropdownMenu>
                                )}

                                {/* Remove button (owner/admin can remove non-owners) */}
                                {canManage && (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                                    onClick={async () => {
                                      const ok = await confirm({ title: "Remove member", description: `Remove ${member.name || member.email} from the organization?`, confirmLabel: "Remove", variant: "destructive" });
                                      if (ok) removeMemberMutation.mutate({ orgId: org.id, memberId: member.id });
                                    }}
                                  >
                                    <Trash2 className="size-3" />
                                  </Button>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Leave / Delete actions */}
                    <div className="flex items-center gap-2 pt-2">
                      {myRole !== "owner" && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-xs text-destructive hover:text-destructive"
                          disabled={leaveMutation.isPending}
                          onClick={async () => {
                            const ok = await confirm({ title: "Leave organization", description: "Leave this organization? You will lose access to shared skills.", confirmLabel: "Leave", variant: "destructive" });
                            if (ok) leaveMutation.mutate({ orgId: org.id });
                          }}
                        >
                          <LogOut className="size-3 mr-1" />
                          Leave organization
                        </Button>
                      )}

                      {myRole === "owner" && (
                        <Button
                          variant="destructive"
                          size="sm"
                          className="text-xs"
                          disabled={deleteOrgMutation.isPending}
                          onClick={async () => {
                            const ok = await confirm({ title: "Delete organization", description: "Delete this organization? Skills will be unlinked but not deleted.", confirmLabel: "Delete", variant: "destructive" });
                            if (ok) deleteOrgMutation.mutate({ orgId: org.id });
                          }}
                        >
                          <Trash2 className="size-3 mr-1" />
                          Delete organization
                        </Button>
                      )}
                    </div>
                  </CardContent>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {/* Create Org Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Create Organization</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Organization name</Label>
              <Input
                placeholder="e.g. My Team"
                value={orgName}
                onChange={(e) => setOrgName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && orgName.trim() && createOrg.mutate({ name: orgName.trim() })}
              />
            </div>
            <Button
              className="w-full"
              disabled={!orgName.trim() || createOrg.isPending}
              onClick={() => createOrg.mutate({ name: orgName.trim() })}
            >
              {createOrg.isPending ? "Creating..." : "Create Organization"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Invite Dialog */}
      <Dialog open={!!inviteOrgId} onOpenChange={() => { setInviteOrgId(null); setInviteRole("member"); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Invite Member</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Email address</Label>
              <Input
                type="email"
                placeholder="colleague@example.com"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                onKeyDown={(e) =>
                  e.key === "Enter" &&
                  inviteEmail.trim() &&
                  inviteOrgId &&
                  inviteMutation.mutate({
                    orgId: inviteOrgId,
                    email: inviteEmail.trim(),
                    role: inviteRole as "admin" | "member" | "viewer",
                  })
                }
              />
            </div>
            <div className="space-y-2">
              <Label>Role</Label>
              <Select value={inviteRole} onValueChange={(v) => v && setInviteRole(v)}>
                <SelectTrigger className="w-28 h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="member">Member</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                  <SelectItem value="viewer">Viewer</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button
              className="w-full"
              disabled={!inviteEmail.trim() || inviteMutation.isPending}
              onClick={() =>
                inviteOrgId &&
                inviteMutation.mutate({
                  orgId: inviteOrgId,
                  email: inviteEmail.trim(),
                  role: inviteRole as "admin" | "member" | "viewer",
                })
              }
            >
              {inviteMutation.isPending ? "Sending..." : "Send Invite"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
