import { Events, VoiceState } from "discord.js";
import { BotEvent } from "../types";
import { handleVoiceStateUpdate } from "../services/voiceRewardManager";
import { voiceChatManager } from "../services/voiceChatManager";
import { broadcastLandingActivity } from "../services/dashboard";
import { bonfireManager } from "../services/bonfireManager";

const event: BotEvent = {
  name: Events.VoiceStateUpdate,
  async execute(oldState: VoiceState, newState: VoiceState) {
    handleVoiceStateUpdate(oldState, newState);
    voiceChatManager.handleMemberJoin(oldState, newState);
    bonfireManager.handleVoiceEvent(oldState, newState);

    try {
      const member = newState.member || oldState.member;
      if (member && !member.user.bot) {
        if (!oldState.channelId && newState.channelId) {
          const wasExtinguished = bonfireManager.getState().isExtinguished;
          broadcastLandingActivity({
            username: member.displayName || member.user.username,
            avatar: member.user.displayAvatarURL({ extension: "png", size: 64 }),
            action: wasExtinguished
              ? `menyalakan kembali lentera di Voice 🎙️ ${newState.channel?.name || ""}`
              : `istirahat di Voice Lounge 🎙️ ${newState.channel?.name || ""}`,
            type: "voice"
          });
        }
      }
    } catch (_) {}
  }
};

export default event;
