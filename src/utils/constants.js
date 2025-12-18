/**
 * Centralized Constants for LinkBee Extension
 */

export const SELECTORS = {
    // Containers
    FULL_PAGE_CONTAINER: ".msg-s-message-list-content",
    OVERLAY_CONTAINER: ".msg-overlay-conversation-bubble__content-wrapper",
    OVERLAY_BUBBLE: ".msg-overlay-conversation-bubble",
    OVERLAY_HEADER: ".msg-overlay-bubble-header__title",
    OVERLAY_LIST_CONTENT: ".msg-s-message-list-content",

    // Sidebar
    SIDEBAR_CONTAINER: ".msg-conversations-container__conversations-list",
    SIDEBAR_LIST_ITEM: ".msg-conversation-listitem",
    SIDEBAR_PARTICIPANT: ".msg-conversation-listitem__participant-names",
    SIDEBAR_TIMESTAMP: ".msg-conversation-listitem__time-stamp",
    SIDEBAR_CARD_TIMESTAMP: ".msg-conversation-card__time-stamp",
    SIDEBAR_LINK: ".msg-conversation-listitem__link",
    SIDEBAR_LINK_ACTIVE: ".msg-conversation-listitem__link--active",
    SIDEBAR_ACTIVE_CARD: ".msg-conversation-card__content--active",
    SIDEBAR_SELECTABLE: ".msg-conversation-card__content--selectable",

    // Chat Content
    LIST_ITEM: "li",
    DATE_HEADER: ".msg-s-message-list__time-heading",
    MESSAGE_BUBBLE: ".msg-s-event-listitem",
    MESSAGE_BODY: ".msg-s-event-listitem__body",
    SENDER_NAME: ".msg-s-message-group__name",
    SENDER_LINK: ".msg-s-message-group__profile-link",
    TIMESTAMP_GROUP: ".msg-s-message-group__timestamp",
    TIMESTAMP_EXACT: ".msg-s-event-with-indicator__sending-indicator",
    IS_OTHER: ".msg-s-event-listitem--other",
    CONVERSATION_TITLE: ".msg-entity-lockup__entity-title",
    LINK_TO_PROFILE: ".msg-thread__link-to-profile",

    // Profile Views Selectors
    PV_CARD: "li.member-analytics-addon-entity-list__item, li.nt-card, .feed-shared-update-v2",
    PV_NAME: ".artdeco-entity-lockup__title, .nt-card__headline, .update-components-actor__name",
    PV_HEADLINE: ".artdeco-entity-lockup__subtitle, .nt-card__subtext, .update-components-actor__description",
    PV_TIME: ".artdeco-entity-lockup__caption, .nt-card__time-text, .update-components-actor__sub-description",
    PV_LINK: "a.member-analytics-addon-entity-list__link, .nt-card__image-link, .update-components-actor__container-link",
    PV_LOAD_MORE: ".scaffold-finite-scroll__load-button",

    // Facepile / Other Profile Links
    FACEPILE_IMG: ".msg-facepile-grid__img",
    IVM_LINK: "a.ivm-image-view-model__link",

    // Generic
    MSG_LIST_EVENT: ".msg-s-message-list__event"
};

export const APP_CONSTANTS = {
    DEFAULT_PROFILE_VIEWS_LOOKBACK: 14,
    DEFAULT_SYNC_DAYS: 30,
    SCROLL_DELAY: 1500,
    NAVIGATE_TIMEOUT: 20000,
    TOAST_DURATION: 3000
};
