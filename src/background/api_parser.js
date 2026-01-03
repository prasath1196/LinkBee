// src/background/api_parser.js

// Helper: Extract valid Profile ID (ACoAA...) from various URN formats
function extractProfileId(urn) {
    if (!urn) return null;
    const match = urn.match(/fsd_profile:([^,)]+)/);
    return match ? match[1] : null;
}

// Helper: Determine the best storage key (Legacy Compat)
// Now runs in Background context
function resolveConversationKey(conversationUrn, participants, userProfile) {
    // 1. Try to find the Partner (1:1 Chat)

    let partner = null;

    if (participants && participants.length > 0) {
        // Filter valid participants
        const validParticipants = participants.filter(p => p.urn && p.urn.includes("fsd_profile"));

        // Find Partner (Not Me)
        // distance: 'SELF' is reliable in the payload I saw.
        const other = validParticipants.find(p => p.distance !== 'SELF' && p.distance !== 'You');

        if (other) {
            partner = other;
        } else if (validParticipants.length === 2) {
            // 1:1 Chat - One is Me, One is Partner.
            // We rely on the passed 'userProfile' name to identify "Me"
            if (userProfile && userProfile.name) {
                const myName = userProfile.name;
                partner = validParticipants.find(p => p.name !== myName);
            }
        } else if (validParticipants.length === 1) {
            // Just one person? (Self chat or deleted?)
            partner = validParticipants[0];
        }
    }

    if (partner) {
        const profileId = extractProfileId(partner.urn);
        if (profileId) return profileId; // Legacy Key (ACoAA...)
    }

    // 2. Fallback: Use Thread URN (Group chats, or if we failed to ID partner)
    return conversationUrn;
}

function getParticipantDetails(participant) {
    if (!participant) return null;
    let name = "Member";
    let headline = "";
    let distance = "";
    let urn = participant.entityUrn || participant.urn?.toString() || participant.string;
    let imgUrl = "";

    // 1. Try messagingMember (Standard)
    if (participant.messagingMember) {
        const mini = participant.messagingMember.miniProfile;
        if (mini) {
            name = `${mini.firstName} ${mini.lastName}`.trim();
            headline = mini.occupation || "";
            // Extract Distance
            if (participant.messagingMember.distance) {
                distance = participant.messagingMember.distance;
            }
            // Picture
            if (mini.picture && mini.picture['com.linkedin.common.VectorImage']) {
                const root = mini.picture['com.linkedin.common.VectorImage'].rootUrl;
                const artifact = mini.picture['com.linkedin.common.VectorImage'].artifacts?.[0]?.fileIdentifyingUrlPathSegment;
                if (root && artifact) imgUrl = root + artifact;
            }
        }
    }
    // 2. Try company/sponsored (Ads)
    else if (participant.sponsoredParticipant) {
        name = participant.sponsoredParticipant.companyName || "Sponsored";
        headline = "Sponsored Message";
    }

    // Check top level distance if not in messagingMember (API variance)
    if (!distance && participant.participantType?.member?.distance) {
        distance = participant.participantType.member.distance;
    }

    return { name, urn, headline, distance, imgUrl };
}

export function transformApiData(apiData, userProfile) {
    // 1. Normalize Input (List vs Delta Sync vs History)
    let elements = [];

    // Case A: Full Conversation List
    if (apiData.elements) {
        elements = apiData.elements;
    }
    // Case B: GraphQL Data Wrappers
    else if (apiData.data) {
        // Helper to extract list from wrapper
        const extractList = (obj) => obj?.elements || obj?.events;

        // 1. Delta Sync
        if (apiData.data.messengerMessagesBySyncToken) {
            elements = extractList(apiData.data.messengerMessagesBySyncToken);
        }
        // 2. History/Scroll (Anchor Timestamp)
        else if (apiData.data.messengerMessagesByAnchorTimestamp) {
            elements = extractList(apiData.data.messengerMessagesByAnchorTimestamp);
        }
        // 3. Generic/Search (messengerMessages)
        else if (apiData.data.messengerMessages) {
            elements = extractList(apiData.data.messengerMessages);
        }
        // 4. Conversation List (messengerConversationsByCategoryQuery)
        else if (apiData.data.messengerConversationsByCategoryQuery) {
            console.log("LinkBee: [PARSER] Found messengerConversationsByCategoryQuery");
            elements = extractList(apiData.data.messengerConversationsByCategoryQuery);
            return parseMessengerConversations(elements, userProfile);
        }
    }

    // 4. Fallback: Check 'included' array (Side-loaded data)
    if ((!elements || elements.length === 0) && apiData.included) {
        // If we have included entities, they might be the messages themselves
        elements = apiData.included;
    }

    if (!elements || elements.length === 0) {
        return null;
    }

    const conversations = [];

    elements.forEach(element => {
        try {
            // A. Conversations Endpoint (List)
            if (element.entityUrn && element.entityUrn.includes("fs_conversation")) {
                const conversationUrn = element.entityUrn;

                // Identify "Them" (Non-Me Participant)
                const participants = (element.participants || []).map(getParticipantDetails);

                // HYBRID ID STRATEGY: Resolve legacy key (Profile ID) if possible
                let legacyKey = resolveConversationKey(conversationUrn, participants, userProfile);

                const title = participants[0]?.name || "Unknown";

                // Get Last Message
                const events = element.events || [];
                const lastEvent = events[0];

                if (lastEvent) {
                    let lastMessageText = "[Media/Attachment]";
                    let lastMessageTimestamp = lastEvent.createdAt;
                    let lastSenderUrn = lastEvent.from?.string;

                    if (lastEvent.eventContent && lastEvent.eventContent.string) {
                        lastMessageText = lastEvent.eventContent.string;
                    } else if (lastEvent.eventContent && lastEvent.eventContent.attributedBody) {
                        lastMessageText = lastEvent.eventContent.attributedBody.text;
                    }

                    conversations.push({
                        urn: legacyKey || conversationUrn, // Use Legacy Key (ACoAA...) if found, else Thread URN
                        threadUrn: conversationUrn, // Keep reference to real API Thread URN
                        title: element.title || "New Conversation",
                        participants: participants,
                        text: lastMessageText,
                        timestamp: lastMessageTimestamp,
                        senderUrn: lastSenderUrn,
                        isDelta: false
                    });
                }
            }
            // B. Messages Endpoint (Delta) - It returns Events directly
            else if ((element.entityUrn && element.entityUrn.includes("fs_event")) ||
                (element._type && element._type === "com.linkedin.messenger.Message") ||
                (element.entityUrn && element.entityUrn.includes("msg_message"))) {

                const conversationUrn = element.backendConversationUrn || element.conversationUrn;

                if (conversationUrn) {
                    let text = "[New Message]";

                    // 1. Try 'body' (Message format)
                    if (element.body && element.body.text) {
                        text = element.body.text;
                    }
                    // 2. Try 'eventContent' (Event format)
                    else if (element.eventContent) {
                        if (element.eventContent.attributedBody && element.eventContent.attributedBody.text) {
                            text = element.eventContent.attributedBody.text;
                        } else if (element.eventContent.string) {
                            text = element.eventContent.string;
                        }
                    }

                    // Sender Extraction (Enhanced with User Schema)
                    let senderUrn = null;
                    let senderProfile = null;
                    const actor = element.sender || element.actor || element.from;

                    if (actor) {
                        // A. Rich Object (com.linkedin.messenger.Message format)
                        if (actor.participantType && actor.participantType.member) {
                            const member = actor.participantType.member;
                            const firstName = member.firstName?.text || "";
                            const lastName = member.lastName?.text || "";

                            senderProfile = {
                                name: `${firstName} ${lastName}`.trim(),
                                headline: member.headline?.text || "",
                                distance: member.distance || "",
                                urn: actor.entityUrn || actor.backendUrn,
                                imgUrl: "",
                                isPremium: actor.memberBadgeType === "PREMIUM_PROFILE"
                            };

                            // Image Extraction
                            if (member.profilePicture && member.profilePicture.rootUrl) {
                                const root = member.profilePicture.rootUrl;
                                const artifacts = member.profilePicture.artifacts;
                                if (artifacts && artifacts.length > 0) {
                                    // Pick 100x100 or first available
                                    const artifact = artifacts.find(a => a.width === 100) || artifacts[0];
                                    senderProfile.imgUrl = root + artifact.fileIdentifyingUrlPathSegment;
                                }
                            }
                            senderUrn = senderProfile.urn;
                        }
                        // B. Simple Object (Event format)
                        else if (actor.entityUrn || actor.string) {
                            senderUrn = actor.entityUrn || actor.string; // Message vs Event format fallback
                        }
                    }

                    // Construct 'participants' array FIRST
                    let participants = [];
                    let title = "Unknown (Update)";
                    let headline = "";
                    let networkDistance = "";
                    let imgUrl = "";

                    if (senderProfile) {
                        participants.push(senderProfile);

                        // Heuristic: If I am identifying the partner, populate metadata
                        const isMe = userProfile && userProfile.name === senderProfile.name;

                        if (!isMe) {
                            title = senderProfile.name;
                            headline = senderProfile.headline;
                            networkDistance = senderProfile.distance;
                            imgUrl = senderProfile.imgUrl;
                        } else {
                            title = "Unknown (Update)";
                        }
                    }

                    // RESOLVE KEY - Now we have participants (likely the sender)
                    // If the sender is the partner, this will return their Profile ID (ACoAA...)
                    // If the sender is Me, it will return conversationUrn (Thread ID), which is correct behavior for 'Me' messages (consolidation handles the rest)
                    const finalKey = resolveConversationKey(conversationUrn.toString(), participants, userProfile);

                    conversations.push({
                        urn: finalKey,
                        threadUrn: conversationUrn.toString(),
                        title: title,
                        participants: participants,
                        text: text,
                        timestamp: element.createdAt || element.deliveredAt,
                        senderUrn: senderUrn,
                        headline: headline,
                        networkDistance: networkDistance,
                        imgUrl: imgUrl,
                        isSponsored: element.subtype === "SPONSORED_MESSAGE",
                        isDelta: true
                    });
                }
            }

        } catch (err) {
            console.warn("LinkBee: Error parsing item:", err);
        }
    });

    return conversations;
}

/**
 * Parses the rich messengerConversations structure (Inbox List)
 * @param {Array} elements - The 'elements' array from the API response
 * @param {Object} userProfile - The current user's profile for 'Me' detection
 */
function parseMessengerConversations(elements, userProfile) {
    const conversations = [];

    elements.forEach(conv => {
        try {
            // 1. Basic Metadata
            const conversationUrn = conv.entityUrn; // "urn:li:fsd_messengerConversation:..."
            const lastActivityAt = conv.lastActivityAt;
            // const unreadCount = conv.unreadCount || 0; 
            const categories = conv.categories || [];

            // FILTER: Ignore Ads/Sponsored if category dictates
            if (categories.includes("SPONSORED") || categories.includes("INMAIL")) {
                // Determine if strictly sponsored or just labeled. 
                // Usually we want to capture InMails but maybe flag them?
                // For now, let's capture but mark isSponsored.
            }
            const isSponsored = categories.includes("SPONSORED_MESSAGE");

            // 2. Participants (Rich Data)
            const rawParticipants = conv.conversationParticipants || [];
            const participants = rawParticipants.map(p => {
                let name = "Unknown";
                let headline = "";
                let distance = "";
                let imgUrl = "";
                let urn = p.hostIdentityUrn || p.entityUrn;
                let isPremium = false;
                let profileUrl = "";

                if (p.participantType && p.participantType.member) {
                    const m = p.participantType.member;
                    name = `${m.firstName?.text || ""} ${m.lastName?.text || ""}`.trim();
                    headline = m.headline?.text || "";
                    distance = m.distance || "";
                    profileUrl = m.profileUrl || "";
                    isPremium = p.memberBadgeType === "PREMIUM_PROFILE";

                    // Image
                    if (m.profilePicture && m.profilePicture.rootUrl) {
                        const root = m.profilePicture.rootUrl;
                        const artifacts = m.profilePicture.artifacts || [];
                        const art = artifacts.find(a => a.width === 100) || artifacts[0];
                        if (art) imgUrl = root + art.fileIdentifyingUrlPathSegment;
                    }
                }

                return { name, headline, distance, imgUrl, urn, isPremium, profileUrl };
            });

            // 3. Last Message (Nested)
            let lastMessageText = "[No Content]";
            let lastSenderUrn = null;
            let lastMessageTimestamp = lastActivityAt;

            if (conv.messages && conv.messages.elements && conv.messages.elements.length > 0) {
                const msg = conv.messages.elements[0];
                lastMessageTimestamp = msg.deliveredAt || lastActivityAt; // Prefer message time

                // Text
                if (msg.body && msg.body.text) {
                    lastMessageText = msg.body.text;
                } else if (msg.renderContent && msg.renderContent.length > 0) {
                    lastMessageText = "[Attachment/Rich Content]";
                }

                // Sender
                if (msg.actor) {
                    lastSenderUrn = msg.actor.entityUrn;
                }
            }

            // 4. Resolve Key (Hybrid)
            // conversationUrn from this API is usually "urn:li:fsd_messengerConversation:2-..."
            // We need to clean it to just the URN part if needed, OR relies on resolveConversationKey logic
            // But resolveConversationKey expects "urn:li:messagingThread:..." usually. 
            // Let's standardise: 
            // The API gives: urn:li:fsd_messengerConversation:2-ZT...
            // Legacy was: urn:li:messagingThread:2-ZT...
            // They share the ID part. 

            // Note: The payload sends 'entityUrn' like 'urn:li:fsd_messengerConversation:...'
            // We should strip the prefix for safety or handle it. 

            // Fix: Construct a standard thread ID for fallback
            let threadUrn = conversationUrn;
            if (conversationUrn.includes("fsd_messengerConversation")) {
                threadUrn = conversationUrn.replace("fsd_messengerConversation", "messagingThread");
            }

            const legacyKey = resolveConversationKey(threadUrn, participants, userProfile);

            // 5. Metadata for Partner
            let partnerHeadline = "";
            let partnerDistance = "";
            let partnerImg = "";
            let partnerName = "Unknown";

            // Find partner used for ID
            const partner = participants.find(p => p.urn && p.urn.includes(legacyKey)) || participants[0];
            if (partner) {
                if (partner.name !== "Unknown") partnerName = partner.name;
                partnerHeadline = partner.headline;
                partnerDistance = partner.distance;
                partnerImg = partner.imgUrl;
            }

            conversations.push({
                urn: legacyKey, // The Profile ID if 1:1
                threadUrn: threadUrn,
                title: partnerName,
                participants: participants,
                text: lastMessageText,
                timestamp: lastMessageTimestamp,
                senderUrn: lastSenderUrn,
                headline: partnerHeadline,
                networkDistance: partnerDistance,
                imgUrl: partnerImg,
                isSponsored: isSponsored,
                isDelta: false // This is a full state load
            });

        } catch (err) {
            console.warn("LinkBee: Error parsing inbox item", err);
        }
    });

    console.log(`LinkBee: [PARSER] Output ${conversations.length} conversations from ${elements.length} raw elements.`);
    return conversations;
}
