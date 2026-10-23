/**
 * Compact prompt for on-device Gemini Nano.
 * Nano has a small context window and weaker reasoning than cloud models,
 * so this keeps instructions short and lets the JSON schema enforce structure.
 */

export const TRIAGE_SYSTEM_PROMPT = `You help a software engineer decide whether to send a LinkedIn follow-up message.
"Me" is the engineer. "Them" is the other person.

Say YES when:
- A recruiter or hiring contact went quiet after showing interest.
- Them agreed to help (referral, advice, intro) but has not delivered.
- Them asked to be contacted later and that time has now arrived.
- Them asked a question or shared an opportunity that Me has not answered.
- A warm connection (several real exchanges) has been quiet for over 90 days.

Say NO when:
- The last message is only a pleasantry ("thanks", "ok", "sounds good", "congrats").
- Them clearly rejected Me or said the role is filled.
- Them asked to wait and that time has not arrived yet.
- Me already followed up recently with no new context.

If YES, write a short follow-up (max 2 sentences) written AS Me, TO Them. Never mention AI.
Only set a reminder date if Them named a specific future time.`;

export const TRIAGE_SCHEMA = {
    type: 'object',
    properties: {
        decision: { type: 'string', enum: ['YES', 'NO'] },
        confidence_score: { type: 'integer', minimum: 0, maximum: 100 },
        category: { type: 'string', enum: ['Recruiter', 'Engineering Leader', 'Peer/Alumni', 'Other'] },
        scenario_type: {
            type: 'string',
            enum: ['Inbound Recovery', 'Cold Follow-up', 'Casual Intel', 'Senior Ask', 'Strategic Pivot', 'Timed Deferral', 'Dormant Revival', 'None']
        },
        reason: { type: 'string' },
        sample_follow_up_message: { type: 'string' },
        reminder_text: { type: 'string' },
        reminder_date: { type: 'string', description: 'YYYY-MM-DD, or empty string if no reminder' }
    },
    required: ['decision', 'confidence_score', 'category', 'scenario_type', 'reason', 'sample_follow_up_message', 'reminder_text', 'reminder_date']
};

const MAX_MESSAGE_CHARS = 400;

export function TRIAGE_PROMPT(messages, context) {
    const transcript = messages
        .map(m => `[${m.isMe ? 'Me' : 'Them'}]: ${(m.text || '').slice(0, MAX_MESSAGE_CHARS)}`)
        .join('\n');

    return `Today: ${new Date().toISOString().split('T')[0]}
Days since last message: ${context.daysSince}
Last message sent by: ${context.lastSenderIsMe ? 'Me' : 'Them'}
Follow-ups Me already sent without reply: ${(context.previous_followups || []).length}
Conversation length: ${(context.history || []).length} messages

Conversation (oldest first):
${transcript}

Should Me send a follow-up now?`;
}
