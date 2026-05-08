/* ============================================================
   SPORTBOT — Lebanon Sports Hub AI Assistant
   Professional chatbot with voice, map nav, backend events
============================================================ */

// ── Backend Event Cache ───────────────────────────────────────
const EventCache = {
    data: null, lastFetch: null, ttl: 5 * 60 * 1000,
    async get() {
        if (this.data && this.lastFetch && (Date.now() - this.lastFetch < this.ttl)) return this.data;
        try {
            const res = await fetch(`${API}/api/events`, { credentials: 'include' });
            if (res.ok) { this.data = await res.json(); this.lastFetch = Date.now(); return this.data; }
        } catch (e) {}
        return null;
    },
    async getAll() {
        const backend = await this.get();
        if (backend && backend.length > 0) return backend;
        return typeof EVENTS !== 'undefined' ? EVENTS : [];
    }
};

// ── Smart Event Query Engine ──────────────────────────────────
const EventQuery = {
    CITIES: {
        'beirut': 'Beirut', 'tripoli': 'North Lebanon', 'jounieh': 'Mount Lebanon',
        'sidon': 'South Lebanon', 'saida': 'South Lebanon', 'tyre': 'South Lebanon',
        'sour': 'South Lebanon', 'zahle': 'Bekaa', 'byblos': 'Mount Lebanon',
        'faraya': 'Mount Lebanon', 'baalbek': 'Baalbek-Hermel', 'nabatieh': 'Nabatieh',
        'akkar': 'Akkar', 'bcharre': 'North Lebanon', 'jbeil': 'Mount Lebanon',
        'mount lebanon': 'Mount Lebanon', 'north lebanon': 'North Lebanon',
        'south lebanon': 'South Lebanon', 'bekaa': 'Bekaa'
    },
    SPORTS: ['football', 'soccer', 'basketball', 'tennis', 'swimming', 'running',
             'volleyball', 'cycling', 'boxing', 'skiing', 'triathlon', 'martial arts',
             'padel', 'trail running', 'water sports', 'equestrian', 'athletics', 'adventure'],

    detectLocation(msg) {
        const lower = msg.toLowerCase();
        for (const [city, region] of Object.entries(this.CITIES)) {
            if (lower.includes(city)) return { city, region };
        }
        return null;
    },
    detectSport(msg) {
        const lower = msg.toLowerCase();
        if (lower.includes('soccer')) return 'football';
        return this.SPORTS.find(s => lower.includes(s)) || null;
    },
    filterEvents(events, { location, sport } = {}) {
        let filtered = [...events];
        if (location) {
            const loc = (location.city || location.region || '').toLowerCase();
            filtered = filtered.filter(e => {
                const city = (e.venue_city || e.mohafaza || e.location || '').toLowerCase();
                return city.includes(loc);
            });
        }
        if (sport) {
            filtered = filtered.filter(e =>
                (e.sport_category || e.sport || '').toLowerCase().includes(sport)
            );
        }
        return filtered;
    },
    formatEvent(e) {
        return {
            title: e.title || 'Event',
            sport: e.sport_category || e.sport || '',
            date: e.event_date || e.date || '',
            time: (e.event_time || e.time || '').toString().slice(0, 5),
            location: e.venue_name || e.venue_city || (e.location || '').split(',')[0] || 'Lebanon',
            price: e.price ? `$${e.price}` : (e.priceDisplay || 'Free'),
            capacity: e.max_participants || e.capacity || ''
        };
    },
    buildResponse(events, context) {
        if (events.length === 0) {
            return `😕 No events found${context ? ` for **${context}**` : ''}.\n\nTry another region: Beirut, Tripoli, Jounieh, Sidon, Faraya, Baalbek...`;
        }
        const shown = events.slice(0, 5);
        let r = `🎯 **${events.length} event${events.length > 1 ? 's' : ''} found${context ? ` — ${context}` : ''}:**\n\n`;
        shown.forEach((e, i) => {
            const f = this.formatEvent(e);
            r += `**${i + 1}. ${f.title}**\n`;
            r += `   🏃 ${f.sport} | 📍 ${f.location}\n`;
            if (f.date) r += `   📅 ${typeof formatDate === 'function' ? formatDate(f.date) : f.date}`;
            if (f.time) r += ` at ${f.time}`;
            r += `\n   💰 ${f.price}`;
            if (f.capacity) r += ` | 🏟️ ${f.capacity} spots`;
            r += '\n\n';
        });
        if (events.length > 5) r += `_...and ${events.length - 5} more. Visit the Events page to see all!_\n`;
        return r;
    }
};

// ── Chatbot State ─────────────────────────────────────────────
const Chatbot = {
    conversationHistory: [],
    awaitingAction: null,
    tempCredentials: {},
    resetTokens: {},
    lastMapQuery: null,
};

// ── Knowledge Base ────────────────────────────────────────────
const CHATBOT_KNOWLEDGE = {
    auth: {
        signIn: {
            keywords: ['sign in', 'login', 'log in', 'enter account', 'access account'],
            response: "To sign in, type your credentials like this:\n```\nemail: your@email.com\npassword: yourpassword\n```",
            action: 'awaiting_signin'
        },
        signUp: {
            keywords: ['sign up', 'register', 'create account', 'new account', 'join'],
            response: "To create an account, type:\n```\nname: John Doe\nemail: john@email.com\npassword: mypassword123\n```",
            action: 'awaiting_signup'
        },
        signOut: {
            keywords: ['sign out', 'log out', 'logout', 'signout', 'disconnect'],
            response: null, action: 'signout'
        },
        forgotPassword: {
            keywords: ['forgot password', 'reset password', 'change password', 'recover password'],
            response: "Please provide your email:\n```\nemail: your@email.com\n```",
            action: 'awaiting_reset_email'
        }
    },
    map: {
        openMap: {
            keywords: ['open map', 'show map', 'view map', 'go to map', 'display map', 'map view', 'interactive map'],
            action: 'open_map'
        },
        showLocation: {
            keywords: ['show me', 'take me to', 'navigate to', 'go to', 'where is', 'locate', 'find on map', 'show on map', 'map of'],
            action: 'show_on_map'
        },
        nearby: {
            keywords: ['nearby', 'near me', 'close to', 'around me', 'local events'],
            action: 'show_nearby'
        }
    },
    profile: {
        keywords: ['my profile', 'account info', 'who am i', 'my account', 'profile'],
        action: 'show_profile'
    },
    events: {
        all: {
            keywords: ['all events', 'show events', 'list events', 'what events', 'show all'],
            action: null
        },
        bySport: {
            keywords: ['football', 'soccer', 'basketball', 'tennis', 'skiing', 'swimming',
                       'running', 'cycling', 'volleyball', 'boxing', 'triathlon', 'padel'],
            action: 'filter_by_sport'
        },
        byRegion: {
            keywords: ['beirut', 'mount lebanon', 'north lebanon', 'south lebanon',
                       'nabatieh', 'bekaa', 'baalbek', 'akkar', 'tripoli', 'jounieh', 'sidon', 'faraya'],
            action: 'filter_by_region'
        },
        price: {
            keywords: ['price', 'cost', 'how much', 'ticket', 'fee', 'expensive', 'cheap', 'free', 'affordable'],
            action: 'show_prices'
        },
        date: {
            keywords: ['when', 'date', 'schedule', 'upcoming', 'next', 'calendar', 'soon'],
            action: 'show_dates'
        }
    },
    general: {
        help: {
            keywords: ['help', 'what can you do', 'commands', 'features', 'capabilities', 'assist'],
            response: "🤖 **SportBot — Here's what I can do:**\n\n" +
                "🗺️ **Map Navigation**\n" +
                "  • \"Open map\" or \"Show map\"\n" +
                "  • \"Show me Beirut on map\"\n" +
                "  • \"Take me to Faraya\"\n\n" +
                "📅 **Find Events**\n" +
                "  • \"Football events in Beirut\"\n" +
                "  • \"Upcoming events\" / \"Cheap events\"\n" +
                "  • \"Events in Tripoli\"\n\n" +
                "🔐 **Account**\n" +
                "  • \"Sign in\" / \"Sign up\" / \"Sign out\"\n" +
                "  • \"My profile\" / \"My events\"\n\n" +
                "🎤 **Voice** — Tap the mic to speak!\n\n" +
                "💡 Just ask naturally: \"What's happening in Baalbek?\"",
            action: null
        }
    }
};

// ── Intent Understanding ──────────────────────────────────────
function understandIntent(message) {
    const lower = message.toLowerCase();

    // Map intents
    for (const [key, config] of Object.entries(CHATBOT_KNOWLEDGE.map)) {
        if (config.keywords && config.keywords.some(kw => lower.includes(kw))) {
            return { category: 'map', action: config.action };
        }
    }

    // Auth intents
    for (const [key, config] of Object.entries(CHATBOT_KNOWLEDGE.auth)) {
        if (config.keywords && config.keywords.some(kw => lower.includes(kw))) {
            return { category: 'auth', action: config.action, config };
        }
    }

    // Profile
    if (CHATBOT_KNOWLEDGE.profile.keywords.some(kw => lower.includes(kw))) {
        return { category: 'profile', action: 'show_profile' };
    }

    // My events / my registrations
    if (lower.includes('my event') || lower.includes('my registr') || lower.includes('registered')) {
        return { category: 'my_events' };
    }

    // Event intents
    for (const [key, config] of Object.entries(CHATBOT_KNOWLEDGE.events)) {
        if (config.keywords && config.keywords.some(kw => lower.includes(kw))) {
            return { category: 'events', action: config.action, subcategory: key };
        }
    }

    // General
    for (const [key, config] of Object.entries(CHATBOT_KNOWLEDGE.general)) {
        if (config.keywords && config.keywords.some(kw => lower.includes(kw))) {
            return { category: 'general', action: key, config };
        }
    }

    return { category: 'unknown' };
}

// ── Map Navigation ────────────────────────────────────────────
async function navigateToMap(options = {}) {
    const { coordinates, zoom, region, sport, venue } = options;
    navigate('map');
    await new Promise(r => setTimeout(r, 600));
    if (coordinates) {
        if (typeof focusMapCoordinates === 'function') focusMapCoordinates(coordinates, zoom || 14);
    } else if (region) {
        if (typeof focusMapRegion === 'function') focusMapRegion(region);
    } else if (sport) {
        if (typeof focusMapSport === 'function') focusMapSport(sport);
    } else if (venue) {
        if (typeof focusMapVenue === 'function') focusMapVenue(venue);
    }
    const name = venue || region || sport || 'Map';
    toast(`📍 Navigated to ${name}`, 'success', 2500);
}

function focusMapCoordinates(coords, zoom = 14) {
    if (!map) { setTimeout(() => focusMapCoordinates(coords, zoom), 400); return; }
    map.setView(coords, zoom, { animate: true, duration: 1 });
}
function focusMapRegion(regionName) {
    if (typeof MOHAFAZAT !== 'undefined') {
        const region = MOHAFAZAT.find(m => m.name.toLowerCase() === regionName.toLowerCase());
        if (region && typeof EVENTS !== 'undefined') {
            const evs = EVENTS.filter(e => e.mohafaza === region.name);
            if (evs.length > 0) {
                const lat = evs.reduce((a, e) => a + e.coordinates[0], 0) / evs.length;
                const lng = evs.reduce((a, e) => a + e.coordinates[1], 0) / evs.length;
                focusMapCoordinates([lat, lng], 11);
                return;
            }
        }
    }
    const defaults = { 'Beirut': [[33.89, 35.50], 13], 'Tripoli': [[34.43, 35.85], 12], 'Jounieh': [[33.98, 35.62], 12], 'Faraya': [[34.0, 35.8], 12], 'Baalbek': [[34.0, 36.21], 12], 'Sidon': [[33.56, 35.37], 12] };
    const d = defaults[regionName] || defaults[Object.keys(defaults).find(k => regionName.toLowerCase().includes(k.toLowerCase()))];
    if (d && map) map.setView(d[0], d[1], { animate: true });
}
function focusMapSport(sportName) {
    if (typeof EVENTS !== 'undefined') {
        const evs = EVENTS.filter(e => e.sport && e.sport.toLowerCase().includes(sportName));
        if (evs.length > 0) {
            const lat = evs.reduce((a, e) => a + e.coordinates[0], 0) / evs.length;
            const lng = evs.reduce((a, e) => a + e.coordinates[1], 0) / evs.length;
            focusMapCoordinates([lat, lng], 9);
        }
    }
}
function focusMapVenue(venueName) {
    if (typeof EVENTS !== 'undefined') {
        const ev = EVENTS.find(e => (e.location || '').toLowerCase().includes(venueName.toLowerCase()) || (e.title || '').toLowerCase().includes(venueName.toLowerCase()));
        if (ev && ev.coordinates) focusMapCoordinates(ev.coordinates, 15);
    }
}

// ── Handle Map Intent ─────────────────────────────────────────
async function handleMapIntent(message) {
    const lower = message.toLowerCase();
    const loc = EventQuery.detectLocation(message);
    const sport = EventQuery.detectSport(message);

    if (loc) {
        const cityName = loc.city || loc.region;
        await navigateToMap({ region: cityName });
        const allEvs = await EventCache.getAll();
        const filtered = EventQuery.filterEvents(allEvs, { location: loc });
        return `🗺️ Navigated to **${cityName}** on the map!\n\n` +
            (filtered.length > 0
                ? `Found **${filtered.length} event${filtered.length > 1 ? 's' : ''}** there:\n\n` +
                  filtered.slice(0, 3).map(e => `• **${e.title}** — ${EventQuery.formatEvent(e).sport}`).join('\n') +
                  (filtered.length > 3 ? `\n...and ${filtered.length - 3} more` : '')
                : `No events found in ${cityName} yet.`);
    }

    if (sport) {
        await navigateToMap({ sport });
        const allEvs = await EventCache.getAll();
        const filtered = EventQuery.filterEvents(allEvs, { sport });
        return `🗺️ Showing all **${sport}** events on the map!\n\n` +
            EventQuery.buildResponse(filtered, sport);
    }

    // Generic open map
    navigate('map');
    toast('🗺️ Map opened!', 'info', 2000);
    return `🗺️ **Map opened!** I've navigated you to the interactive map.\n\nTry saying:\n• "Show Beirut on map"\n• "Take me to Faraya"\n• "Show football events on map"`;
}

// ── Event Responses (backend-powered) ────────────────────────
async function getEventResponse(action, message) {
    const lower = message.toLowerCase();
    const allEvents = await EventCache.getAll();

    switch (action) {
        case 'filter_by_sport': {
            const sport = EventQuery.detectSport(lower);
            const location = EventQuery.detectLocation(lower);
            const filtered = EventQuery.filterEvents(allEvents, { sport, location });
            const ctx = [sport, location ? (location.city || location.region) : null].filter(Boolean).join(' in ');
            return EventQuery.buildResponse(filtered, ctx || sport);
        }
        case 'filter_by_region': {
            const location = EventQuery.detectLocation(lower);
            if (location) {
                const filtered = EventQuery.filterEvents(allEvents, { location });
                return EventQuery.buildResponse(filtered, location.city || location.region);
            }
            return '📍 Which region? Try: Beirut, Tripoli, Jounieh, Sidon, Faraya, Baalbek...';
        }
        case 'show_prices': {
            const ranges = [
                { label: 'Free', evs: allEvents.filter(e => !e.price || e.price === 0) },
                { label: 'Budget (under $20)', evs: allEvents.filter(e => e.price > 0 && e.price < 20) },
                { label: 'Moderate ($20–$50)', evs: allEvents.filter(e => e.price >= 20 && e.price <= 50) },
                { label: 'Premium ($50+)', evs: allEvents.filter(e => e.price > 50) },
            ];
            let r = '💰 **Events by Price:**\n\n';
            ranges.forEach(({ label, evs }) => {
                if (evs.length > 0) {
                    r += `**${label}** (${evs.length}):\n`;
                    evs.slice(0, 3).forEach(e => { r += `  • ${e.title}: ${EventQuery.formatEvent(e).price}\n`; });
                    if (evs.length > 3) r += `  ...and ${evs.length - 3} more\n`;
                    r += '\n';
                }
            });
            return r;
        }
        case 'show_dates': {
            const location = EventQuery.detectLocation(lower);
            let evs = location ? EventQuery.filterEvents(allEvents, { location }) : allEvents;
            evs = [...evs].sort((a, b) => new Date(a.event_date || a.date) - new Date(b.event_date || b.date)).slice(0, 5);
            if (evs.length === 0) return '📅 No upcoming events found.';
            let r = `📅 **Upcoming Events${location ? ' in ' + (location.city || location.region) : ''}:**\n\n`;
            evs.forEach((e, i) => {
                const f = EventQuery.formatEvent(e);
                r += `${i + 1}. **${f.title}**\n   📆 ${typeof formatDate === 'function' ? formatDate(f.date) : f.date} | 📍 ${f.location}\n\n`;
            });
            return r;
        }
        default:
            return null;
    }
}

// ── Profile Response ──────────────────────────────────────────
function getProfileResponse() {
    const user = Session.getUser();
    if (user) {
        const favCount = Session.get('favorites').length;
        const regCount = Session.getUserRegistrations().length;
        const firstName = (user.name || '').split(' ')[0];
        return `👤 **${user.name || 'Your Profile'}**\n\n` +
            `📧 **Email:** ${user.email}\n` +
            `✅ **Status:** ${user.status === 'approved' ? '✅ Approved' : user.status || 'Active'}\n` +
            `⭐ **Favorites:** ${favCount} event${favCount !== 1 ? 's' : ''}\n` +
            `🎟️ **Registered:** ${regCount} event${regCount !== 1 ? 's' : ''}\n\n` +
            `💡 Say "my events" to see registrations or "sign out" to log out.`;
    }
    return "You're not signed in.\n\nSay **'sign in'** to log in or **'sign up'** to create an account!";
}

// ── Main Message Processor ────────────────────────────────────
async function processMessage(message) {
    showTyping();

    if (Chatbot.awaitingAction) {
        await handleAwaitingAction(message);
        return;
    }

    const intent = understandIntent(message);
    let response;

    switch (intent.category) {
        case 'map':
            response = await handleMapIntent(message);
            break;

        case 'auth':
            response = await handleAuthIntent(intent, message);
            break;

        case 'profile':
            response = getProfileResponse();
            break;

        case 'my_events': {
            const user = Session.getUser();
            if (!user) { response = "Please sign in first to see your events. Say 'sign in'!"; break; }
            const myRegs = Session.getUserRegistrations();
            const firstName = user.name.split(' ')[0];
            if (myRegs.length === 0) {
                response = `Hi ${firstName}! You haven't registered for any events yet.\n\nSay "show all events" to browse events! 🎉`;
            } else {
                response = `🎟️ **Your Registrations, ${firstName}:**\n\n`;
                myRegs.slice(0, 5).forEach((r, i) => {
                    response += `${i + 1}. **${r.event_title || r.title || 'Event'}**\n   Status: ${r.status || 'pending'}\n\n`;
                });
                if (myRegs.length > 5) response += `_...and ${myRegs.length - 5} more. Visit My Events page._`;
            }
            break;
        }

        case 'events': {
            response = await getEventResponse(intent.action, message);
            if (!response && intent.subcategory === 'all') {
                const allEvs = await EventCache.getAll();
                response = EventQuery.buildResponse(allEvs, 'all events');
            }
            if (!response) {
                const loc = EventQuery.detectLocation(message);
                const spt = EventQuery.detectSport(message);
                if (loc || spt) {
                    const allEvs = await EventCache.getAll();
                    const filtered = EventQuery.filterEvents(allEvs, { location: loc, sport: spt });
                    const ctx = [spt, loc ? (loc.city || loc.region) : null].filter(Boolean).join(' in ');
                    response = EventQuery.buildResponse(filtered, ctx);
                } else {
                    response = "I can help find events! Try:\n• \"Football events in Beirut\"\n• \"Upcoming events\"\n• \"Cheap events\"";
                }
            }
            break;
        }

        case 'general':
            response = intent.config?.response || CHATBOT_KNOWLEDGE.general[intent.action]?.response;
            break;

        default: {
            // Try smart detection
            const loc = EventQuery.detectLocation(message);
            const spt = EventQuery.detectSport(message);
            if (loc || spt) {
                const allEvs = await EventCache.getAll();
                const filtered = EventQuery.filterEvents(allEvs, { location: loc, sport: spt });
                const ctx = [spt, loc ? (loc.city || loc.region) : null].filter(Boolean).join(' in ');
                response = EventQuery.buildResponse(filtered, ctx);
            } else {
                const allEvs = await EventCache.getAll();
                const eventMatch = allEvs.find(e =>
                    message.toLowerCase().includes((e.title || '').toLowerCase().split(' ').slice(0, 2).join(' '))
                );
                if (eventMatch) {
                    const f = EventQuery.formatEvent(eventMatch);
                    response = `📅 **${f.title}**\n\n🏃 **Sport:** ${f.sport}\n📆 **Date:** ${typeof formatDate === 'function' ? formatDate(f.date) : f.date}\n📍 **Location:** ${f.location}\n💰 **Price:** ${f.price}\n\n💡 Say "show on map" to see its location!`;
                } else {
                    response = getBotReply(message);
                }
            }
        }
    }

    setTimeout(() => {
        removeTyping();
        if (response) addBotMsg(response);
        setSuggestions(getSmartSuggestions(message, intent));
    }, 600);
}

// ── Auth Handler ──────────────────────────────────────────────
async function handleAuthIntent(intent, message) {
    const user = Session.getUser();
    switch (intent.action) {
        case 'signout':
            if (user) {
                await doLogout();
                return `👋 You've been signed out, **${user.name.split(' ')[0]}**. See you soon!`;
            }
            return "You're not signed in. Say 'sign in' to log in!";
        case 'awaiting_signin':
            if (user) return `You're already signed in as **${user.name}**! Say 'sign out' to log out.`;
            Chatbot.awaitingAction = 'signin'; Chatbot.tempCredentials = {};
            return intent.config.response;
        case 'awaiting_signup':
            if (user) return "You're already signed in. Sign out first to create a new account.";
            Chatbot.awaitingAction = 'signup'; Chatbot.tempCredentials = {};
            return intent.config.response;
        case 'awaiting_reset_email':
            Chatbot.awaitingAction = 'reset_password'; Chatbot.tempCredentials = {};
            return intent.config.response;
        case 'show_profile':
            return getProfileResponse();
    }
    return intent.config?.response || "How can I help with your account?";
}

// ── Awaiting Action Handler ───────────────────────────────────
async function handleAwaitingAction(message) {
    const action = Chatbot.awaitingAction;
    const credentials = parseCredentials(message);

    switch (action) {
        case 'signin':
            if (credentials.email && credentials.password) {
                await performSignIn(credentials);
            } else {
                removeTyping();
                addBotMsg("I need your email and password:\n```\nemail: your@email.com\npassword: yourpassword\n```");
            }
            return;
        case 'signup':
            if (credentials.email && credentials.password && credentials.name) {
                if (credentials.password.length < 8) { removeTyping(); addBotMsg("Password must be at least 8 characters. Please try again."); return; }
                await performSignUp(credentials);
            } else {
                removeTyping();
                addBotMsg("I need your name, email and password:\n```\nname: Your Name\nemail: your@email.com\npassword: yourpassword\n```");
            }
            return;
        case 'reset_password':
            if (credentials.email) { await handlePasswordReset(credentials.email); }
            else { removeTyping(); addBotMsg("Please provide your email:\n```\nemail: your@email.com\n```"); }
            return;
    }
    Chatbot.awaitingAction = null; Chatbot.tempCredentials = {};
    removeTyping();
    addBotMsg("I didn't understand that. How can I help you?");
}

// ── Parse Credentials ─────────────────────────────────────────
function parseCredentials(message) {
    const creds = {};
    const emailMatch = message.match(/email:\s*([^\s\n]+)/i);
    const passMatch = message.match(/password:\s*([^\s\n]+)/i);
    const nameMatch = message.match(/name:\s*([^\n]+)/i);
    const phoneMatch = message.match(/phone:\s*([^\s\n]+)/i);
    if (emailMatch) creds.email = emailMatch[1].trim();
    if (passMatch) creds.password = passMatch[1].trim();
    if (nameMatch) creds.name = nameMatch[1].trim();
    if (phoneMatch) creds.phone = phoneMatch[1].trim();
    return creds;
}

// ── Perform Sign In ───────────────────────────────────────────
async function performSignIn(credentials) {
    try {
        const res = await fetch(`${API}/api/login`, {
            method: 'POST', credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: credentials.email, password: credentials.password })
        });
        const data = await res.json();
        removeTyping();
        if (data.user) {
            Session.setUser(data.user);
            Chatbot.awaitingAction = null;
            const firstName = data.user.name.split(' ')[0];
            updateNav();
            addBotMsg(`✅ Welcome back, **${firstName}**! You're now signed in.\n\nWhat would you like to do?\n• "Show events" — browse upcoming events\n• "Open map" — explore the map\n• "My events" — see your registrations`);
        } else {
            addBotMsg(`❌ ${data.error || 'Invalid credentials. Please try again.'}`);
        }
    } catch (e) {
        removeTyping();
        addBotMsg("❌ Connection error. Please try again.");
    }
}

// ── Perform Sign Up ───────────────────────────────────────────
async function performSignUp(credentials) {
    try {
        const res = await fetch(`${API}/api/register`, {
            method: 'POST', credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                full_name: credentials.name, email: credentials.email,
                password: credentials.password, phone: credentials.phone || ''
            })
        });
        const data = await res.json();
        removeTyping(); Chatbot.awaitingAction = null;
        if (res.ok) {
            addBotMsg(`✅ Account created for **${credentials.name}**!\n\nYour account is pending admin approval. You'll receive an email once approved. 🎉`);
        } else {
            addBotMsg(`❌ ${data.error || 'Registration failed. Please try again.'}`);
        }
    } catch (e) {
        removeTyping();
        addBotMsg("❌ Connection error. Please try again.");
    }
}

// ── Password Reset ────────────────────────────────────────────
async function handlePasswordReset(email) {
    try {
        const res = await fetch(`${API}/api/forgot-password`, {
            method: 'POST', credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email })
        });
        removeTyping(); Chatbot.awaitingAction = null;
        addBotMsg(res.ok
            ? `✅ Reset link sent to **${email}**! Check your inbox.`
            : "❌ Email not found. Please check and try again.");
    } catch (e) {
        removeTyping();
        addBotMsg("❌ Connection error. Please try again.");
    }
}

// ── Smart Suggestions ─────────────────────────────────────────
function getSmartSuggestions(message, intent) {
    const lower = (message || '').toLowerCase();
    const user = Session.getUser();

    if (intent?.category === 'map') return ['Events in Beirut', 'Football events', 'Show Tripoli', 'Upcoming events'];
    if (intent?.category === 'auth') return ['My profile', 'Open map', 'Upcoming events', 'Help'];
    if (lower.includes('beirut')) return ['Show Beirut on map', 'Football in Beirut', 'Tripoli events', 'All events'];
    if (lower.includes('event') || lower.includes('sport')) return ['Show on map', 'Beirut events', 'Football events', 'Upcoming events'];
    if (lower.includes('map')) return ['Events in Beirut', 'Skiing events', 'Show Tripoli', 'Open map'];

    return user
        ? ['📅 Upcoming events', '🗺️ Open map', '🏅 Football events', '👤 My profile']
        : ['📅 Upcoming events', '🗺️ Open map', '🏅 Football events', '🔐 Sign in'];
}

// ── Send Function ─────────────────────────────────────────────
async function sendChat() {
    const input = document.getElementById('chatInput');
    if (!input) return;
    const message = input.value.trim();
    if (!message) return;
    input.value = '';
    addUserMsg(message);
    await processMessage(message);
}

// ── Override initChat for personalized greeting ───────────────
const _originalInitChat = typeof initChat === 'function' ? initChat : null;
initChat = function() {
    const msgs = document.getElementById('chatMessages');
    if (!msgs) return;
    msgs.innerHTML = '';
    const user = Session.getUser();
    const hour = new Date().getHours();
    const timeGreet = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

    if (user) {
        const firstName = user.name ? user.name.split(' ')[0] : 'there';
        addBotMsg(`${timeGreet}, **${firstName}**! 👋 I'm SportBot.\n\n` +
            `🗺️ **Map** — "Show Beirut on map"\n` +
            `📅 **Events** — "Football in Tripoli"\n` +
            `🔐 **Account** — "Sign out" / "My profile"\n` +
            `🎤 **Voice** — Tap the 🎤 mic to speak!\n\n` +
            `What would you like to explore?`);
    } else {
        addBotMsg(`👋 Welcome to **Lebanon Sports Hub**! I'm SportBot.\n\n` +
            `📅 **Explore Events** — "Show me Beirut events"\n` +
            `🗺️ **Open Map** — "Show map"\n` +
            `🔐 **Sign In** — Say "sign in"\n` +
            `🎤 **Voice** — Tap the 🎤 mic to speak!\n\n` +
            `How can I help you today?`);
    }
    setSuggestions(user
        ? ['🗺️ Open map', '📅 Upcoming events', '🏅 Football events', '👤 My profile']
        : ['📅 Upcoming events', '🗺️ Open map', '🔐 Sign in', '❓ Help']);
};

// ── Voice Input ───────────────────────────────────────────────
(function addVoiceInput() {
    const style = document.createElement('style');
    style.textContent = `
        .chat-mic-btn {
            width:36px;height:36px;flex-shrink:0;border-radius:50%;border:none;cursor:pointer;
            display:flex;align-items:center;justify-content:center;font-size:.9rem;
            transition:all .2s ease;background:var(--gray-200,#e5e7eb);color:var(--gray-600,#4b5563);
        }
        .chat-mic-btn:hover{background:var(--gray-300,#d1d5db);color:var(--gray-900,#111);}
        .chat-mic-btn.listening{background:#ef4444;color:#fff;animation:mic-pulse 1s ease-in-out infinite;}
        .chat-mic-btn.no-support{opacity:.3;cursor:not-allowed;}
        @keyframes mic-pulse{0%,100%{box-shadow:0 0 0 0 rgba(239,68,68,.5);}50%{box-shadow:0 0 0 8px rgba(239,68,68,0);}}
    `;
    document.head.appendChild(style);

    function injectMicButton() {
        const inputArea = document.querySelector('.chat-input-area');
        if (!inputArea || document.getElementById('voiceMicBtn')) return;

        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        const btn = document.createElement('button');
        btn.id = 'voiceMicBtn';
        btn.className = 'chat-mic-btn';
        btn.title = 'Tap to speak';
        btn.innerHTML = '<i class="fas fa-microphone"></i>';

        // Insert BEFORE the send button
        const sendBtn = inputArea.querySelector('.chat-send');
        if (sendBtn) {
            inputArea.insertBefore(btn, sendBtn);
        } else {
            inputArea.appendChild(btn);
        }

        if (!SpeechRecognition) {
            btn.classList.add('no-support');
            btn.title = 'Voice not supported in this browser';
            return;
        }

        const recognition = new SpeechRecognition();
        recognition.lang = 'en-US';
        recognition.continuous = false;
        recognition.interimResults = true;
        let listening = false;

        btn.addEventListener('click', () => {
            if (listening) recognition.stop();
            else { const inp = document.getElementById('chatInput'); if (inp) inp.value = ''; recognition.start(); }
        });

        recognition.onstart = () => {
            listening = true;
            btn.classList.add('listening');
            btn.innerHTML = '<i class="fas fa-stop"></i>';
            btn.title = 'Listening… tap to stop';
            const inp = document.getElementById('chatInput');
            if (inp) inp.placeholder = '🎙 Listening…';
        };

        recognition.onresult = (e) => {
            const transcript = Array.from(e.results).map(r => r[0].transcript).join('');
            const inp = document.getElementById('chatInput');
            if (inp) inp.value = transcript;
        };

        recognition.onend = () => {
            listening = false;
            btn.classList.remove('listening');
            btn.innerHTML = '<i class="fas fa-microphone"></i>';
            btn.title = 'Tap to speak';
            const inp = document.getElementById('chatInput');
            if (inp) inp.placeholder = 'Ask me anything… or tap 🎤 to speak';
            const msg = document.getElementById('chatInput')?.value?.trim();
            if (msg) sendChat();
        };

        recognition.onerror = (e) => {
            listening = false;
            btn.classList.remove('listening');
            btn.innerHTML = '<i class="fas fa-microphone"></i>';
            const inp = document.getElementById('chatInput');
            if (inp) inp.placeholder = 'Ask me anything…';
            if (e.error !== 'no-speech' && e.error !== 'aborted') {
                toast('🎤 ' + (e.error === 'not-allowed'
                    ? 'Microphone access denied. Allow mic in browser settings.'
                    : 'Voice error: ' + e.error), 'error', 3000);
            }
        };
    }

    // Inject now if DOM is ready, or observe for chat window opening
    function tryInject() {
        if (document.querySelector('.chat-input-area')) {
            injectMicButton();
        } else {
            const observer = new MutationObserver(() => {
                if (document.querySelector('.chat-input-area')) {
                    injectMicButton();
                    observer.disconnect();
                }
            });
            observer.observe(document.body, { childList: true, subtree: true });
        }
    }

    // Also re-inject whenever toggleChat is called (chat might have been rebuilt)
    const _origToggle = typeof toggleChat === 'function' ? toggleChat : null;
    if (_origToggle) {
        toggleChat = function() {
            _origToggle.apply(this, arguments);
            setTimeout(injectMicButton, 200);
        };
    }

    tryInject();
})();

// ── Keyboard shortcut Ctrl+M to open map ─────────────────────
document.addEventListener('keydown', function(e) {
    if ((e.ctrlKey || e.metaKey) && e.key === 'm') {
        e.preventDefault();
        navigate('map');
        toast('🗺️ Map opened!', 'info', 2000);
    }
});

console.log('🤖 SportBot initialized — voice, map nav, backend events ready');
