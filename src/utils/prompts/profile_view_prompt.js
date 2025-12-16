export const PROFILE_VIEW_PROMPT = (name, headline) => `
    I saw that ${name} viewed my profile on LinkedIn.
    Their headline is: "${headline}".
    
    Generate a short, casual, and "cool" message to send them to start a conversation.
    Do not sound salesy. Be brief. Mention that I noticed they visited my profile.
    Max 2 sentences.
`;
