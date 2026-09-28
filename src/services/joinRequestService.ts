import axios from "axios";
import { MayaClient } from "../types";
import { logger } from "../utils/logger";

const DISCORD_API_BASE = "https://discord.com/api/v10";

export interface FormFieldResponse {
  field_type: "TERMS" | "TEXT_INPUT" | "PARAGRAPH" | "MULTIPLE_CHOICE" | string;
  label?: string;
  description?: string;
  required?: boolean;
  values?: string[];
  response?: string | boolean | number;
  choices?: string[];
}

export interface GuildJoinRequestUser {
  id: string;
  username: string;
  discriminator: string;
  global_name?: string | null;
  avatar?: string | null;
}

export interface GuildJoinRequest {
  id: string;
  created_at: string;
  reviewed_at?: string | null;
  application_status: "STARTED" | "SUBMITTED" | "APPROVED" | "REJECTED";
  rejection_reason?: string | null;
  guild_id: string;
  user_id: string;
  user?: GuildJoinRequestUser;
  form_responses?: FormFieldResponse[];
  actioned_by_user?: GuildJoinRequestUser;
}

export interface JoinRequestsResponse {
  total: number;
  requests: GuildJoinRequest[];
  hasFeature: boolean;
  error?: string;
}

/**
 * Fetch list of join requests for a guild from Discord REST API
 */
export async function getGuildJoinRequests(
  guildId: string,
  status: "SUBMITTED" | "APPROVED" | "REJECTED" = "SUBMITTED",
  limit: number = 100
): Promise<JoinRequestsResponse> {
  const token = process.env.DISCORD_TOKEN;
  if (!token) {
    throw new Error("DISCORD_TOKEN tidak dikonfigurasi.");
  }

  try {
    const response = await axios.get(`${DISCORD_API_BASE}/guilds/${guildId}/requests`, {
      headers: {
        Authorization: `Bot ${token}`,
        "Content-Type": "application/json",
      },
      params: {
        status,
        limit,
      },
    });

    const data = response.data;
    const requests: GuildJoinRequest[] = data.guild_join_requests || [];
    const total: number = typeof data.total === "number" ? data.total : requests.length;

    return {
      total,
      requests,
      hasFeature: true,
    };
  } catch (error: any) {
    const statusCode = error.response?.status;
    const errorData = error.response?.data;

    logger.warn(`JoinRequestService: Gagal mengambil join requests untuk guild ${guildId} [HTTP ${statusCode}]:`, errorData || error.message);

    if (statusCode === 403) {
      return {
        total: 0,
        requests: [],
        hasFeature: false,
        error: "Server belum mengaktifkan fitur Apply to Join (Manual Approval) di Discord, atau bot Maya belum memiliki izin 'Kick Members'.",
      };
    }

    if (statusCode === 404) {
      return {
        total: 0,
        requests: [],
        hasFeature: false,
        error: "Guild atau endpoint join requests tidak ditemukan di Discord.",
      };
    }

    return {
      total: 0,
      requests: [],
      hasFeature: false,
      error: errorData?.message || error.message || "Gagal menghubungi API Discord.",
    };
  }
}

/**
 * Action a guild join request (APPROVE or REJECT)
 */
export async function actionGuildJoinRequest(
  guildId: string,
  requestId: string,
  action: "APPROVED" | "REJECTED",
  rejectionReason?: string
): Promise<GuildJoinRequest> {
  const token = process.env.DISCORD_TOKEN;
  if (!token) {
    throw new Error("DISCORD_TOKEN tidak dikonfigurasi.");
  }

  try {
    const payload: { action: string; rejection_reason?: string } = { action };
    if (action === "REJECTED" && rejectionReason && rejectionReason.trim()) {
      payload.rejection_reason = rejectionReason.trim().slice(0, 160);
    }

    const response = await axios.patch(
      `${DISCORD_API_BASE}/guilds/${guildId}/requests/${requestId}`,
      payload,
      {
        headers: {
          Authorization: `Bot ${token}`,
          "Content-Type": "application/json",
        },
      }
    );

    logger.info(`JoinRequestService: Join request ${requestId} di guild ${guildId} berhasil di-${action}.`);
    return response.data;
  } catch (error: any) {
    const statusCode = error.response?.status;
    const errorData = error.response?.data;
    logger.error(`JoinRequestService: Gagal memproses action ${action} untuk request ${requestId}:`, errorData || error.message);

    if (statusCode === 403) {
      throw new Error("Bot tidak memiliki izin 'Kick Members' untuk menyetujui atau menolak permohonan anggota.");
    }
    if (statusCode === 404) {
      throw new Error("Permohonan bergabung sudah tidak ada atau telah diproses sebelumnya.");
    }

    throw new Error(errorData?.message || error.message || "Gagal memproses permohonan di Discord.");
  }
}

/**
 * Fetch members inside the guild who have pending status (Membership Screening)
 */
export async function getPendingGuildMembers(client: MayaClient, guildId: string) {
  const guild = client.guilds.cache.get(guildId) || (await client.guilds.fetch(guildId).catch(() => null));
  if (!guild) {
    throw new Error("Guild tidak ditemukan di cache bot.");
  }

  // Ensure member cache is loaded
  await guild.members.fetch().catch(() => {});

  const pendingMembers = guild.members.cache.filter((m) => m.pending === true);

  return {
    total: pendingMembers.size,
    members: pendingMembers.map((m) => ({
      id: m.id,
      username: m.user.username,
      displayName: m.displayName || m.user.globalName || m.user.username,
      tag: m.user.tag,
      avatar: m.user.displayAvatarURL({ size: 128 }),
      joinedAt: m.joinedAt?.toISOString() || null,
      createdAt: m.user.createdAt.toISOString(),
      roles: m.roles.cache
        .filter((r) => r.id !== guild.id)
        .map((r) => ({ id: r.id, name: r.name, color: r.hexColor })),
    })),
  };
}

/**
 * Approve a pending guild member by granting them the verified role (e.g., 'Rotasi' or specified role)
 * Assigning a role bypasses Discord's membership screening immediately.
 */
export async function approvePendingMember(
  client: MayaClient,
  guildId: string,
  userId: string,
  roleId?: string
) {
  const guild = client.guilds.cache.get(guildId) || (await client.guilds.fetch(guildId).catch(() => null));
  if (!guild) {
    throw new Error("Guild tidak ditemukan.");
  }

  const member = await guild.members.fetch(userId).catch(() => null);
  if (!member) {
    throw new Error("Member tidak ditemukan di server ini.");
  }

  let targetRole = null;
  if (roleId) {
    targetRole = guild.roles.cache.get(roleId) || (await guild.roles.fetch(roleId).catch(() => null));
  }

  if (!targetRole) {
    // Fallback to role named 'rotasi' or first assignable role
    const roles = await guild.roles.fetch().catch(() => guild.roles.cache);
    targetRole = roles.find((r) => r.name.toLowerCase() === "rotasi") || null;
  }

  if (targetRole) {
    await member.roles.add(targetRole);
    logger.info(`JoinRequestService: Member pending ${member.user.tag} berhasil diapprove dengan role ${targetRole.name}`);
    return {
      success: true,
      message: `Member ${member.user.tag} berhasil disetujui dan diberikan role ${targetRole.name}.`,
      roleGiven: targetRole.name,
    };
  } else {
    // If no role found, notify user to specify a role
    throw new Error("Tidak menemukan role 'Rotasi' atau role valid untuk diberikan ke member.");
  }
}

/**
 * Reject / kick a pending guild member
 */
export async function kickPendingMember(
  client: MayaClient,
  guildId: string,
  userId: string,
  reason?: string
) {
  const guild = client.guilds.cache.get(guildId) || (await client.guilds.fetch(guildId).catch(() => null));
  if (!guild) {
    throw new Error("Guild tidak ditemukan.");
  }

  const member = await guild.members.fetch(userId).catch(() => null);
  if (!member) {
    throw new Error("Member tidak ditemukan di server ini.");
  }

  if (!member.kickable) {
    throw new Error("Bot tidak memiliki hak untuk menendang member ini (posisi role bot lebih rendah).");
  }

  const kickReason = reason || "Ditolak dari Web Dashboard Maya";
  await member.kick(kickReason);
  logger.info(`JoinRequestService: Member pending ${member.user.tag} berhasil dikick dengan alasan: ${kickReason}`);

  return {
    success: true,
    message: `Member ${member.user.tag} berhasil dikeluarkan dari server.`,
  };
}
