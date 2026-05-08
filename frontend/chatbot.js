/* ============================================================
   SPORTBOT — Lebanon Sports Hub AI Assistant v3.0
   ✅ Voice input  ✅ Map navigation  ✅ Backend events
   ✅ Per-mohafaza events  ✅ Full app Q&A  ✅ Personalized
============================================================ */

// ── Backend Event Cache ───────────────────────────────────────
const EventCache = {
    data: null, lastFetch: null, ttl: 5 * 60 * 1000,
    async fetch() {
        if (this.data && this.lastFetch && (Date.now() - this.lastFetch < this.ttl)) return this.data;
        try {
            const res = await fetch(`${API}/api/events`, { credentials: 'include' });
            if (res.ok) { this.data = await res.json(); this.lastFetch = Date.now(); return this.data; }
        } catch (e) {}
        return null;
    },
    async all() {
        const backend = await this.fetch();
        if (backend && backend.length > 0) return backend;
        return typeof EVENTS !== 'undefined' ? EVENTS : [];
    }
};

// ── Mohafaza Config ───────────────────────────────────────────
const MOHAFAZA_MAP = {
    'beirut':          { name:'Beirut',          flag:'🏙️', aliases:['beirut','capital'] },
    'mount lebanon':   { name:'Mount Lebanon',   flag:'⛰️', aliases:['mount lebanon','jounieh','byblos','jbeil','faraya','kesserwan','metn'] },
    'north lebanon':   { name:'North Lebanon',   flag:'🌲', aliases:['north lebanon','tripoli','north','bcharre','akkar','zgharta','minye'] },
    'south lebanon':   { name:'South Lebanon',   flag:'🌊', aliases:['south lebanon','sidon','saida','sour','tyre','south','nabatiyeh'] },
    'nabatieh':        { name:'Nabatieh',         flag:'🕌', aliases:['nabatieh','nabatiyeh','marjayoun','bint jbeil','hasbaya'] },
    'bekaa':           { name:'Bekaa',            flag:'🌾', aliases:['bekaa','beqaa','zahle','chtaura','anjar','west bekaa'] },
    'baalbek-hermel':  { name:'Baalbek-Hermel',   flag:'🏛️', aliases:['baalbek','hermel','baalbek-hermel','baalbeck'] },
    'akkar':           { name:'Akkar',            flag:'🌿', aliases:['akkar','halba','north akkar'] },
};

function detectMohafaza(msg) {
    const lower = msg.toLowerCase();
    for (const [key, config] of Object.entries(MOHAFAZA_MAP)) {
        if (config.aliases.some(a => lower.includes(a))) return config;
    }
    return null;
}

function detectSport(msg) {
    const lower = msg.toLowerCase();
    const sports = ['football','soccer','basketball','tennis','swimming','running','marathon',
                    'volleyball','cycling','boxing','skiing','snowboard','triathlon','martial arts',
                    'padel','trail run','water sport','equestrian','athletics','adventure','kayak'];
    const found = sports.find(s => lower.includes(s));
    if (found === 'soccer') return 'football';
    if (found === 'marathon') return 'running';
    if (found === 'snowboard') return 'skiing';
    return found || null;
}

function detectPriceQuery(msg) {
    const lower = msg.toLowerCase();
    if (lower.includes('free')) return 'free';
    if (lower.includes('cheap') || lower.includes('budget') || lower.includes('affordable')) return 'cheap';
    if (lower.includes('expensive') || lower.includes('premium')) return 'premium';
    if (lower.includes('price') || lower.includes('cost') || lower.includes('how much') || lower.includes('ticket')) return 'all';
    return null;
}

// ── Event Helpers ─────────────────────────────────────────────
function filterEvents(events, { mohafaza, sport, priceType } = {}) {
    let list = [...events];
    if (mohafaza) {
        const mName = mohafaza.name.toLowerCase();
        list = list.filter(e => {
            const m = (e.mohafaza || e.venue_city || e.location || '').toLowerCase();
            return m.includes(mName) || mohafaza.aliases.some(a => m.includes(a));
        });
    }
    if (sport) {
        list = list.filter(e => (e.sport_category || e.sport || '').toLowerCase().includes(sport));
    }
    if (priceType === 'free')    list = list.filter(e => !e.price || e.price === 0);
    if (priceType === 'cheap')   list = list.filter(e => (e.price || 0) > 0 && (e.price || 0) < 30);
    if (priceType === 'premium') list = list.filter(e => (e.price || 0) > 60);
    return list;
}

function fmtEvent(e) {
    return {
        title:    e.title || 'Event',
        sport:    e.sport_category || e.sport || '',
        date:     e.event_date || e.date || '',
        time:     (e.event_time || e.time || '').toString().slice(0,5),
        location: e.venue_name || e.venue_city || (e.location||'').split(',')[0] || 'Lebanon',
        price:    e.price ? `$${e.price}` : (e.priceDisplay || 'Free'),
        capacity: e.max_participants || e.capacity || '',
        id:       e.id || e.ref || '',
        mohafaza: e.mohafaza || '',
    };
}

function buildEventList(events, title, limit=5) {
    if (events.length === 0) return null;
    const shown = events.slice(0, limit);
    let r = `**${title}** (${events.length} event${events.length>1?'s':''}):\n\n`;
    shown.forEach((e, i) => {
        const f = fmtEvent(e);
        r += `**${i+1}. ${f.title}**\n`;
        r += `   🏃 ${f.sport} | 📍 ${f.location}\n`;
        if (f.date) r += `   📅 ${typeof formatDate==='function' ? formatDate(f.date) : f.date}`;
        if (f.time) r += ` at ${f.time}`;
        r += `\n   💰 ${f.price}`;
        if (f.capacity) r += ` | 🏟️ ${f.capacity} spots`;
        r += '\n\n';
    });
    if (events.length > limit) r += `_...and ${events.length-limit} more. Visit the **Events** page!_\n`;
    return r;
}

// ── Map Navigation ────────────────────────────────────────────
const MAP_COORDS = {
    'Beirut':         [33.89, 35.50, 13], 'Mount Lebanon': [33.95, 35.58, 11],
    'North Lebanon':  [34.43, 35.85, 11], 'South Lebanon': [33.27, 35.20, 11],
    'Nabatieh':       [33.38, 35.48, 11], 'Bekaa':         [33.85, 35.90, 10],
    'Baalbek-Hermel': [34.00, 36.21, 11], 'Akkar':         [34.55, 36.10, 11],
    'Jounieh':        [33.98, 35.62, 13], 'Tripoli':       [34.44, 35.85, 13],
    'Sidon':          [33.56, 35.37, 13], 'Faraya':        [34.00, 35.80, 13],
    'Baalbek':        [34.00, 36.21, 13], 'Byblos':        [34.12, 35.65, 13],
};

function goToMap(region, sport, coords) {
    navigate('map');
    setTimeout(() => {
        if (coords) {
            if (map) map.setView([coords[0], coords[1]], coords[2] || 13, {animate:true});
            return;
        }
        if (region) {
            const c = MAP_COORDS[region];
            if (c && map) map.setView([c[0], c[1]], c[2], {animate:true, duration:1});
        }
        if (sport && typeof EVENTS !== 'undefined') {
            const evs = EVENTS.filter(e => (e.sport||'').toLowerCase().includes(sport));
            if (evs.length > 0) {
                const lat = evs.reduce((a,e)=>a+e.coordinates[0],0)/evs.length;
                const lng = evs.reduce((a,e)=>a+e.coordinates[1],0)/evs.length;
                if (map) map.setView([lat,lng], 10, {animate:true});
            }
        }
    }, 500);
}

// ── Core Response Engine ──────────────────────────────────────
async function generateResponse(message) {
    const lower = message.toLowerCase();
    const allEvents = await EventCache.all();
    const user = Session.getUser();

    // ── 1. Map navigation ──
    const mapTriggers = ['show map','open map','view map','go to map','map view','display map','take me to map','navigate to map'];
    const showOnMapTriggers = ['on map','show me','take me to','navigate to','go to','where is','locate','find on map','show on map','map of'];

    if (mapTriggers.some(t => lower.includes(t))) {
        const moh = detectMohafaza(message);
        const spt = detectSport(message);
        goToMap(moh?.name, spt, null);
        return `🗺️ **Map opened!**\n\n${moh ? `Navigated to **${moh.flag} ${moh.name}**.` : 'Showing all events across Lebanon.'}\n\nTry:\n• "Show Beirut on map"\n• "Show football events on map"\n• "Take me to Baalbek"`;
    }

    if (showOnMapTriggers.some(t => lower.includes(t))) {
        const moh = detectMohafaza(message);
        const spt = detectSport(message);
        if (moh || spt) {
            goToMap(moh?.name, spt, null);
            const filtered = filterEvents(allEvents, { mohafaza: moh, sport: spt });
            const where = moh ? `${moh.flag} ${moh.name}` : spt;
            toast(`📍 Navigated to ${where}`, 'success', 2500);
            return `🗺️ **Navigated to ${where}!**\n\n` +
                (filtered.length > 0
                    ? `Found **${filtered.length} event${filtered.length>1?'s':''}** there:\n\n` +
                      filtered.slice(0,4).map(e => `• **${e.title}** — ${fmtEvent(e).sport} | 💰 ${fmtEvent(e).price}`).join('\n')
                    : `No events found in ${where} yet.`);
        }
        navigate('map');
        return `🗺️ **Map opened!** Try saying:\n• "Show Beirut on map"\n• "Show me football events"\n• "Take me to Faraya"`;
    }

    // ── 2. Sign out ──
    if (['sign out','signout','log out','logout','disconnect'].some(t => lower.includes(t))) {
        if (user) {
            await doLogout();
            return `👋 You've been signed out, **${user.name.split(' ')[0]}**. See you soon!\n\nSay "sign in" whenever you're ready to come back.`;
        }
        return "You're not signed in. Say **'sign in'** to log in!";
    }

    // ── 3. Sign in ──
    if (['sign in','signin','log in','login'].some(t => lower.includes(t))) {
        if (user) return `You're already signed in as **${user.name}**! Say "sign out" to log out.`;
        Chatbot.awaitingAction = 'signin';
        return `🔐 **Sign In**\n\nPlease type your credentials:\n\`\`\`\nemail: your@email.com\npassword: yourpassword\n\`\`\``;
    }

    // ── 4. Sign up ──
    if (['sign up','signup','register','create account','new account','join'].some(t => lower.includes(t))) {
        if (user) return "You're already signed in. Sign out first to create a new account.";
        Chatbot.awaitingAction = 'signup';
        return `📝 **Create Account**\n\nType your details:\n\`\`\`\nname: Your Full Name\nemail: your@email.com\npassword: yourpassword\n\`\`\``;
    }

    // ── 5. Forgot password ──
    if (['forgot','reset password','change password','recover'].some(t => lower.includes(t))) {
        Chatbot.awaitingAction = 'reset_password';
        return `🔑 **Reset Password**\n\nEnter your email:\n\`\`\`\nemail: your@email.com\n\`\`\``;
    }

    // ── 6. My events ──
    if (['my event','my registr','registered','my ticket','my booking'].some(t => lower.includes(t))) {
        if (!user) return "Please sign in to see your events. Say **'sign in'**!";
        const myRegs = Session.getUserRegistrations();
        const fn = user.name.split(' ')[0];
        if (myRegs.length === 0) return `Hi **${fn}**! You haven't registered for any events yet.\n\n💡 Say "show all events" or "events in Beirut" to browse!`;
        let r = `🎟️ **Your Registrations, ${fn}:**\n\n`;
        myRegs.slice(0,6).forEach((reg,i) => {
            const status = reg.status === 'approved' ? '✅' : reg.status === 'rejected' ? '❌' : '⏳';
            r += `${i+1}. **${reg.event_title||'Event'}** ${status} ${reg.status||'pending'}\n`;
        });
        if (myRegs.length > 6) r += `\n_...and ${myRegs.length-6} more. Visit **My Events** page._`;
        return r;
    }

    // ── 7. Profile ──
    if (['my profile','profile','account info','who am i','my account'].some(t => lower.includes(t))) {
        if (!user) return "You're not signed in.\n\nSay **'sign in'** to log in or **'sign up'** to create an account!";
        const favs = Session.get('favorites').length;
        const regs = Session.getUserRegistrations().length;
        return `👤 **${user.name}**\n\n📧 ${user.email}\n✅ Status: ${user.status === 'approved' ? 'Approved ✅' : user.status || 'Active'}\n⭐ Favorites: ${favs}\n🎟️ Registered: ${regs} event${regs!==1?'s':''}\n\n💡 Say "my events" to see registrations.`;
    }

    // ── 8. How to register ──
    if (['how to register','how do i register','how to join','how to sign up for event','register for'].some(t => lower.includes(t))) {
        return `🎟️ **How to Register for an Event:**\n\n1. Make sure you're signed in (say "sign in")\n2. Go to the **Events** page\n3. Click on any event card\n4. Click **"Register Now"** button\n5. Fill in your details and submit\n\nYour registration will be pending admin approval. You'll get an email once approved! ✅`;
    }

    // ── 9. Mohafaza-specific events (CORE FEATURE) ──
    const moh = detectMohafaza(message);
    const spt = detectSport(message);
    const priceQ = detectPriceQuery(message);

    if (moh) {
        const filtered = filterEvents(allEvents, { mohafaza: moh, sport: spt, priceType: priceQ });
        const contextParts = [spt, priceQ && priceQ !== 'all' ? priceQ : null].filter(Boolean);
        const context = contextParts.length > 0 ? ` (${contextParts.join(', ')})` : '';

        if (filtered.length === 0) {
            return `${moh.flag} No ${spt||''}events found in **${moh.name}**${context}.\n\nTry asking about another region or sport!\n\n${Object.values(MOHAFAZA_MAP).map(m => `${m.flag} ${m.name}`).join(' • ')}`;
        }

        const list = buildEventList(filtered, `${moh.flag} Events in ${moh.name}${context}`);
        return list + `\n💡 Say **"show ${moh.name} on map"** to see them on the map!`;
    }

    // ── 10. Sport-only filter ──
    if (spt && !moh) {
        const filtered = filterEvents(allEvents, { sport: spt });
        if (filtered.length === 0) return `😕 No **${spt}** events found currently.\n\nAvailable sports: Football, Basketball, Running, Tennis, Skiing, Triathlon, Boxing, Cycling...`;
        return buildEventList(filtered, `🏅 ${spt.charAt(0).toUpperCase()+spt.slice(1)} Events in Lebanon`);
    }

    // ── 11. Price queries ──
    if (priceQ) {
        const filtered = filterEvents(allEvents, { priceType: priceQ });
        if (priceQ === 'all') {
            const ranges = [
                { label:'🆓 Free', list: allEvents.filter(e => !e.price || e.price===0) },
                { label:'💚 Budget (under $30)', list: allEvents.filter(e => e.price>0 && e.price<30) },
                { label:'💛 Moderate ($30–$60)', list: allEvents.filter(e => e.price>=30 && e.price<=60) },
                { label:'💎 Premium ($60+)', list: allEvents.filter(e => e.price>60) },
            ];
            let r = '💰 **Event Prices:**\n\n';
            ranges.forEach(({ label, list }) => {
                if (list.length > 0) {
                    r += `${label} — ${list.length} event${list.length>1?'s':''}:\n`;
                    list.slice(0,3).forEach(e => { r += `  • ${e.title}: ${fmtEvent(e).price}\n`; });
                    r += '\n';
                }
            });
            return r;
        }
        const label = priceQ==='free'?'free':priceQ==='cheap'?'budget-friendly':'premium';
        if (filtered.length === 0) return `No ${label} events found currently.`;
        return buildEventList(filtered, `${priceQ==='free'?'🆓':priceQ==='cheap'?'💚':'💎'} ${label.charAt(0).toUpperCase()+label.slice(1)} Events`);
    }

    // ── 12. Upcoming / all events ──
    if (['upcoming','next event','soon','what.*on','all event','show event','list event','browse event'].some(t => lower.match(new RegExp(t)))) {
        const sorted = [...allEvents].sort((a,b) => new Date(a.event_date||a.date) - new Date(b.event_date||b.date));
        return buildEventList(sorted, '📅 Upcoming Events in Lebanon') || 'No upcoming events found.';
    }

    // ── 13. Stats / about the app ──
    if (['how many event','total event','how many sport','statistics','stats','about'].some(t => lower.includes(t))) {
        const sports = [...new Set(allEvents.map(e => e.sport_category || e.sport).filter(Boolean))];
        const mohs = [...new Set(allEvents.map(e => e.mohafaza).filter(Boolean))];
        return `📊 **Lebanon Sports Hub Stats:**\n\n` +
            `🎪 **${allEvents.length} Total Events**\n` +
            `🏅 **${sports.length} Sports:** ${sports.join(', ')}\n` +
            `🗺️ **${mohs.length} Regions covered**\n\n` +
            `🌍 Events span all 8 Lebanese mohafazat from Akkar to Tyre!\n\n` +
            `Say the name of any region to see its events.`;
    }

    // ── 14. Greetings ──
    if (['hi','hello','hey','welcome','greet','good morning','good afternoon','good evening','howdy','sup','what\'s up'].some(t => lower.includes(t))) {
        const fn = user ? ` **${user.name.split(' ')[0]}**` : '';
        const hour = new Date().getHours();
        const timeGreet = hour<12 ? 'Good morning' : hour<17 ? 'Good afternoon' : 'Good evening';
        return `${timeGreet}${fn}! 👋 I'm SportBot.\n\n` +
            `Here's what you can ask me:\n` +
            `📍 "Events in Beirut" / "Baalbek events"\n` +
            `🏅 "Football events" / "Skiing in Mount Lebanon"\n` +
            `🗺️ "Show Tripoli on map"\n` +
            `💰 "Free events" / "Cheap events"\n` +
            `🎟️ "How to register" / "My events"\n\n` +
            `What would you like to explore?`;
    }

    // ── 15. Help ──
    if (['help','what can you do','commands','features','capabilities','what do you'].some(t => lower.includes(t))) {
        return `🤖 **SportBot — Full Capabilities:**\n\n` +
            `📍 **Events by Region:**\n` +
            `  • "Events in Beirut / Tripoli / Sidon / Baalbek..."\n` +
            `  • "What's happening in Mount Lebanon?"\n\n` +
            `🏅 **Events by Sport:**\n` +
            `  • "Football events" / "Skiing in Faraya"\n` +
            `  • "Basketball in Beirut"\n\n` +
            `🗺️ **Map Navigation:**\n` +
            `  • "Show Baalbek on map"\n` +
            `  • "Take me to Jounieh"\n\n` +
            `💰 **By Price:**\n` +
            `  • "Free events" / "Cheap events" / "Premium events"\n\n` +
            `🔐 **Account:**\n` +
            `  • "Sign in" / "Sign up" / "Sign out"\n` +
            `  • "My profile" / "My events" / "Forgot password"\n\n` +
            `🎤 **Voice:** Tap the mic and speak!\n\n` +
            `💡 Just talk naturally — "What sports are near Tripoli?"`;
    }

    // ── 16. Specific event lookup ──
    const eventMatch = allEvents.find(e =>
        (e.title||'').toLowerCase().split(' ').slice(0,3).some(w => w.length > 3 && lower.includes(w))
    );
    if (eventMatch) {
        const f = fmtEvent(eventMatch);
        return `📅 **${f.title}**\n\n` +
            `🏃 **Sport:** ${f.sport}\n` +
            `📍 **Location:** ${f.location} (${f.mohafaza})\n` +
            `📆 **Date:** ${typeof formatDate==='function' ? formatDate(f.date) : f.date} at ${f.time}\n` +
            `💰 **Price:** ${f.price}\n` +
            `🏟️ **Capacity:** ${f.capacity} spots\n\n` +
            `💡 Say "show on map" to see its location or "how to register" to join!`;
    }

    // ── 17. Default — region overview ──
    const allMohs = Object.values(MOHAFAZA_MAP);
    return getBotReply(message) || 
        `I'm not sure about that, but here are all regions you can explore:\n\n` +
        allMohs.map(m => `${m.flag} **${m.name}**`).join(' • ') +
        `\n\nOr ask me: "events in [region]", "show me [sport] events", "open map"`;
}

// ── Awaiting Action Handler ───────────────────────────────────
function parseCredentials(msg) {
    const creds = {};
    const m = (str, re) => { const x = str.match(re); return x ? x[1].trim() : null; };
    creds.email    = m(msg, /email:\s*([^\s\n,]+)/i);
    creds.password = m(msg, /password:\s*([^\s\n]+)/i);
    creds.name     = m(msg, /name:\s*([^\n]+)/i);
    creds.phone    = m(msg, /phone:\s*([^\s\n]+)/i);
    return creds;
}

async function handleAwaitingAction(message) {
    const action = Chatbot.awaitingAction;
    const c = parseCredentials(message);

    if (action === 'signin') {
        if (!c.email || !c.password) { removeTyping(); addBotMsg("Need both email and password:\n```\nemail: your@email.com\npassword: yourpassword\n```"); return; }
        try {
            const res = await fetch(`${API}/api/login`, { method:'POST', credentials:'include', headers:{'Content-Type':'application/json'}, body:JSON.stringify({email:c.email, password:c.password}) });
            const data = await res.json();
            removeTyping(); Chatbot.awaitingAction = null;
            if (data.user) {
                Session.setUser(data.user); updateNav();
                const fn = data.user.name.split(' ')[0];
                addBotMsg(`✅ Welcome back, **${fn}**! You're now signed in.\n\n💡 Say "my events" to see registrations or "open map" to explore!`);
                setSuggestions(['📅 My events','🗺️ Open map','📍 Events in Beirut','👤 My profile']);
            } else { addBotMsg(`❌ ${data.error || 'Invalid credentials. Try again.'}`); }
        } catch (e) { removeTyping(); Chatbot.awaitingAction = null; addBotMsg("❌ Connection error. Try again."); }
        return;
    }

    if (action === 'signup') {
        if (!c.name || !c.email || !c.password) { removeTyping(); addBotMsg("Need name, email and password:\n```\nname: Your Name\nemail: your@email.com\npassword: yourpassword\n```"); return; }
        if (c.password.length < 6) { removeTyping(); addBotMsg("Password must be at least 6 characters. Try again."); return; }
        try {
            const res = await fetch(`${API}/api/register`, { method:'POST', credentials:'include', headers:{'Content-Type':'application/json'}, body:JSON.stringify({full_name:c.name, email:c.email, password:c.password, phone:c.phone||''}) });
            const data = await res.json();
            removeTyping(); Chatbot.awaitingAction = null;
            if (res.ok) { addBotMsg(`✅ Account created for **${c.name}**! Your account is pending admin approval. You'll receive an email once approved. 🎉`); }
            else { addBotMsg(`❌ ${data.error || 'Registration failed. Try again.'}`); }
        } catch (e) { removeTyping(); Chatbot.awaitingAction = null; addBotMsg("❌ Connection error. Try again."); }
        return;
    }

    if (action === 'reset_password') {
        if (!c.email) { removeTyping(); addBotMsg("Please enter your email:\n```\nemail: your@email.com\n```"); return; }
        try {
            const res = await fetch(`${API}/api/forgot-password`, { method:'POST', credentials:'include', headers:{'Content-Type':'application/json'}, body:JSON.stringify({email:c.email}) });
            removeTyping(); Chatbot.awaitingAction = null;
            addBotMsg(res.ok ? `✅ Reset link sent to **${c.email}**! Check your inbox.` : "❌ Email not found. Please check and try again.");
        } catch (e) { removeTyping(); Chatbot.awaitingAction = null; addBotMsg("❌ Connection error. Try again."); }
        return;
    }

    Chatbot.awaitingAction = null;
    removeTyping();
    addBotMsg("Sorry, something went wrong. How can I help you?");
}

// ── Chatbot State ─────────────────────────────────────────────
const Chatbot = { awaitingAction: null, tempCredentials: {}, lastMapQuery: null };

// ── Main processor ────────────────────────────────────────────
async function processMessage(message) {
    showTyping();
    if (Chatbot.awaitingAction) { await handleAwaitingAction(message); return; }
    const response = await generateResponse(message);
    const user = Session.getUser();
    const lower = message.toLowerCase();
    const moh = detectMohafaza(message);
    const spt = detectSport(message);
    let suggestions;
    if (lower.includes('map') || lower.includes('navigate')) {
        suggestions = moh ? [`Events in ${moh.name}`, 'Show all events', 'Football events', 'Help']
                         : ['Show Beirut on map', 'Show Tripoli on map', 'Events in Bekaa', 'Help'];
    } else if (moh) {
        suggestions = [`Show ${moh.name} on map`, `Football in ${moh.name}`, 'Events in Beirut', 'All events'];
    } else if (spt) {
        suggestions = [`${spt} in Beirut`, `${spt} in Tripoli`, 'Show on map', 'All events'];
    } else {
        suggestions = user
            ? ['📅 Upcoming events', '🗺️ Open map', '🏅 Football events', '👤 My profile']
            : ['📅 Upcoming events', '🗺️ Open map', '🔐 Sign in', '❓ Help'];
    }
    setTimeout(() => { removeTyping(); addBotMsg(response); setSuggestions(suggestions); }, 500);
}

// ── Send function ─────────────────────────────────────────────
async function sendChat() {
    const input = document.getElementById('chatInput');
    if (!input) return;
    const message = input.value.trim();
    if (!message) return;
    input.value = '';
    addUserMsg(message);
    await processMessage(message);
}

// ── Override initChat with personalized greeting ──────────────
initChat = function() {
    const msgs = document.getElementById('chatMessages');
    if (!msgs) return;
    msgs.innerHTML = '';
    const user = Session.getUser();
    const hour = new Date().getHours();
    const tg = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

    if (user) {
        const fn = (user.name || 'there').split(' ')[0];
        addBotMsg(`${tg}, **${fn}**! 👋 I'm SportBot.\n\n` +
            `📍 Try: "Events in Beirut" or "Baalbek events"\n` +
            `🏅 Try: "Football events" or "Skiing in Faraya"\n` +
            `🗺️ Try: "Show Tripoli on map"\n` +
            `🎤 Or tap the **mic** to speak!\n\n` +
            `What would you like to explore?`);
        setSuggestions(['📅 Events in Beirut','🗺️ Open map','🏅 Football events','👤 My profile']);
    } else {
        addBotMsg(`${tg}! 👋 I'm **SportBot**, your Lebanon Sports Hub assistant.\n\n` +
            `📍 "Events in Beirut" — see Beirut's events\n` +
            `🗺️ "Open map" — explore all Lebanon\n` +
            `🔐 "Sign in" — access your account\n` +
            `🎤 Tap the **mic** to speak!\n\n` +
            `Which region's events would you like to explore?`);
        setSuggestions(['📅 Events in Beirut','🗺️ Open map','🔐 Sign in','❓ Help']);
    }
};

// ── Voice Input ───────────────────────────────────────────────
(function initVoice() {
    const style = document.createElement('style');
    style.textContent = `
        #voiceMicBtn {
            width:38px;height:38px;flex-shrink:0;border-radius:50%;border:none;cursor:pointer;
            display:flex;align-items:center;justify-content:center;font-size:.9rem;
            background:#f3f4f6;color:#374151;transition:all .2s;
        }
        #voiceMicBtn:hover { background:#e5e7eb; }
        #voiceMicBtn.listening {
            background:#ef4444;color:#fff;
            animation:mic-pulse 1s ease-in-out infinite;
        }
        #voiceMicBtn.disabled { opacity:.35;cursor:not-allowed; }
        @keyframes mic-pulse {
            0%,100%{box-shadow:0 0 0 0 rgba(239,68,68,.45);}
            50%{box-shadow:0 0 0 9px rgba(239,68,68,0);}
        }
    `;
    document.head.appendChild(style);

    function injectMic() {
        if (document.getElementById('voiceMicBtn')) return;
        const area = document.querySelector('.chat-input-area');
        if (!area) return;

        const btn = document.createElement('button');
        btn.id = 'voiceMicBtn';
        btn.title = 'Tap to speak';
        btn.type = 'button';
        btn.innerHTML = '<i class="fas fa-microphone"></i>';

        const sendBtn = area.querySelector('.chat-send');
        sendBtn ? area.insertBefore(btn, sendBtn) : area.appendChild(btn);

        const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SR) { btn.classList.add('disabled'); btn.title='Voice not supported in this browser'; return; }

        const rec = new SR();
        rec.lang = 'en-US'; rec.continuous = false; rec.interimResults = true;
        let active = false;

        btn.addEventListener('click', () => { active ? rec.stop() : rec.start(); });

        rec.onstart = () => {
            active = true; btn.classList.add('listening');
            btn.innerHTML = '<i class="fas fa-stop"></i>'; btn.title = 'Tap to stop';
            const inp = document.getElementById('chatInput');
            if (inp) { inp.value = ''; inp.placeholder = '🎙️ Listening…'; }
        };

        rec.onresult = (e) => {
            const t = Array.from(e.results).map(r => r[0].transcript).join('');
            const inp = document.getElementById('chatInput');
            if (inp) inp.value = t;
        };

        rec.onend = () => {
            active = false; btn.classList.remove('listening');
            btn.innerHTML = '<i class="fas fa-microphone"></i>'; btn.title = 'Tap to speak';
            const inp = document.getElementById('chatInput');
            if (inp) inp.placeholder = 'Ask me anything… or tap 🎤 to speak';
            const msg = document.getElementById('chatInput')?.value?.trim();
            if (msg) { setTimeout(() => sendChat(), 100); }
        };

        rec.onerror = (e) => {
            active = false; btn.classList.remove('listening');
            btn.innerHTML = '<i class="fas fa-microphone"></i>';
            const inp = document.getElementById('chatInput');
            if (inp) inp.placeholder = 'Ask me anything…';
            if (e.error === 'not-allowed') toast('🎤 Please allow microphone access in your browser settings.','error',4000);
        };
    }

    // Watch for chat window opening
    const obs = new MutationObserver(() => { if (document.querySelector('.chat-input-area')) injectMic(); });
    obs.observe(document.body, { childList: true, subtree: true });
    injectMic();

    // Re-inject after toggleChat
    const _orig = typeof toggleChat === 'function' ? toggleChat : null;
    if (_orig) toggleChat = function() { _orig.apply(this, arguments); setTimeout(injectMic, 250); };
})();

console.log('🤖 SportBot v3.0 ready — voice ✅ map ✅ backend events ✅ all 8 mohafazat ✅');
