import { Events, VoiceState } from "discord.js";
import { BotEvent } from "../types";
import { handleVoiceStateUpdate } from "../services/voiceRewardManager";

const event: BotEvent = {
  name: Events.VoiceStateUpdate,
  async execute(oldState: VoiceState, newState: VoiceState) {
    handleVoiceStateUpdate(oldState, newState);
  }
};

export default event;
