import type { CommercialPlanId } from './plan.types';

export type GroupRole = 'owner' | 'member';
export type GroupStatus = 'active' | 'suspended' | 'cancelled';
export type GroupMemberStatus = 'active' | 'inactive';
export type GroupMemberLeftReason =
  | 'voluntary'
  | 'removed_by_owner'
  | 'group_suspended'
  | 'owner_downgraded'
  | 'group_dissolved';

export type GroupInvitationStatus =
  | 'pending'
  | 'accepted'
  | 'declined'
  | 'revoked'
  | 'expired';

export interface BillingGroup {
  id: string;
  ownerUserId: string;
  subscriptionId: string | null;
  planId: CommercialPlanId;
  name: string;
  maxMembers: number;
  status: GroupStatus;
  createdAt: Date;
  updatedAt: Date;
}

export interface BillingGroupMember {
  id: string;
  groupId: string;
  userId: string;
  role: GroupRole;
  status: GroupMemberStatus;
  joinedAt: Date;
  leftAt: Date | null;
  leftReason: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface BillingGroupInvitation {
  id: string;
  groupId: string;
  invitedByUserId: string;
  invitedEmail: string;
  tokenHash: string;
  status: GroupInvitationStatus;
  expiresAt: Date;
  acceptedByUserId: string | null;
  acceptedAt: Date | null;
  revokedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface GroupMemberItem {
  id: string;
  userId: string;
  name: string;
  email: string;
  role: GroupRole;
  status: GroupMemberStatus;
  joinedAt: Date;
  leftAt: Date | null;
}

export interface GroupInvitationItem {
  id: string;
  invitedEmail: string;
  status: GroupInvitationStatus;
  expiresAt: Date;
  createdAt: Date;
}

export interface BillingGroupOverview {
  hasGroup: boolean;
  group: {
    id: string;
    name: string;
    ownerUserId: string;
    status: GroupStatus;
    maxMembers: number;
    activeMembersCount: number;
    pendingInvitesCount: number;
    availableSlots: number;
  } | null;
  userRole: GroupRole | null;
  isOwner: boolean;
  isMember: boolean;
  isEligibleToCreate: boolean;
  ownerName: string | null;
  ownerEmail: string | null;
  members: GroupMemberItem[];
  invitations: GroupInvitationItem[];
  pendingInvitationForUser: {
    id: string;
    groupId: string;
    groupName: string;
    ownerName: string;
    invitedEmail: string;
    expiresAt: Date;
  } | null;
}
