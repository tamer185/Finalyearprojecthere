/* ============================================================
   SMART CHATBOT - Lebanon Sports Hub
   Handles authentication, event queries, map navigation & more
============================================================ */

// Chatbot State
const Chatbot = {
    conversationHistory: [],
    awaitingAction: null,
    tempCredentials: {},
    resetTokens: {},
    lastMapQuery: null,
};

// Enhanced Chatbot Responses Database
const CHATBOT_KNOWLEDGE = {
    // Authentication related responses
    auth: {
        signIn: {
            keywords: ['sign in', 'login', 'log in', 'enter', 'access account'],
            response: "To sign in, I'll need your email and password. Type them like this:\n```\nemail: your@email.com\npassword: yourpassword\n```",
            action: 'awaiting_signin'
        },
        signUp: {
            keywords: ['sign up', 'register', 'create account', 'new account', 'join'],
            response: "Great! To create a new account, I'll need:\n- Full name\n- Email\n- Password (min 8 characters)\n- Phone (optional)\n- City (optional)\n- Favorite sport (optional)\n\nType them like this:\n```\nname: John Doe\nemail: john@email.com\npassword: mypassword123\nphone: +961 70 123456\ncity: Beirut\nsport: Football\n```",
            action: 'awaiting_signup'
        },
        signOut: {
            keywords: ['sign out', 'log out', 'logout', 'exit', 'leave'],
            response: null,
            action: 'signout'
        },
        forgotPassword: {
            keywords: ['forgot password', 'reset password', 'change password', 'lost password', 'recover password'],
            response: "I can help you reset your password. Please provide your email address:\n```\nemail: your@email.com\n```",
            action: 'awaiting_reset_email'
        }
    },
    
    // Map & Location Navigation
    map: {
        openMap: {
            keywords: ['open map', 'show map', 'view map', 'go to map', 'display map', 'map view', 'interactive map'],
            response: null,
            action: 'open_map'
        },
        showLocation: {
            keywords: ['show me', 'take me to', 'navigate to', 'go to', 'where is', 'locate', 'find on map', 'map of', 'show on map'],
            response: null,
            action: 'show_on_map'
        },
        nearby: {
            keywords: ['nearby', 'near me', 'close to', 'around', 'in my area', 'local events'],
            response: null,
            action: 'show_nearby'
        }
    },
    
    // Profile related
    profile: {
        keywords: ['my profile', 'account info', 'who am i', 'my account', 'profile'],
        response: null,
        action: 'show_profile'
    },
    
    // Event queries
    events: {
        all: {
            keywords: ['events', 'all events', 'show events', 'what events', 'list events'],
            response: `Lebanon Sports Hub has 22 exciting events across 8 mohafazat! Here's a quick overview:\n\n🏙️ **Beirut**: 3 events (Football, Running, Padel)\n⛰️ **Mount Lebanon**: 4 events (Skiing, Triathlon, Tennis, Swimming)\n🌲 **North Lebanon**: 3 events (Boxing, Trail Running, Volleyball)\n🌊 **South Lebanon**: 3 events (Water Sports, Cycling, Women's Sports)\n🕌 **Nabatieh**: 2 events (Martial Arts, Football)\n🌾 **Bekaa**: 2 events (Cycling, Athletics)\n🏛️ **Baalbek-Hermel**: 2 events (Running, Equestrian)\n🌿 **Akkar**: 2 events (Adventure, Basketball)\n\nType a sport, region, or location to filter! You can also say 'show me [event] on map'!`,
            action: null
        },
        bySport: {
            keywords: ['football', 'soccer', 'basketball', 'tennis', 'skiing', 'swimming', 'running', 'cycling', 'volleyball', 'boxing', 'martial', 'athletics', 'equestrian', 'padel', 'adventure', 'triathlon'],
            response: null,
            action: 'filter_by_sport'
        },
        byRegion: {
            keywords: ['beirut', 'mount lebanon', 'north lebanon', 'south lebanon', 'nabatieh', 'bekaa', 'baalbek', 'akkar'],
            response: null,
            action: 'filter_by_region'
        },
        price: {
            keywords: ['price', 'cost', 'how much', 'ticket', 'fee', 'expensive', 'cheap', 'affordable'],
            response: null,
            action: 'show_prices'
        },
        date: {
            keywords: ['when', 'date', 'schedule', 'upcoming', 'next', 'calendar', 'time'],
            response: null,
            action: 'show_dates'
        }
    },
    
    // General queries
    general: {
        help: {
            keywords: ['help', 'what can you do', 'commands', 'features', 'capabilities'],
            response: "🤖 **I can help you with:**\n\n" +
                     "🗺️ **Map Navigation**: Open map, show locations, find events near you\n" +
                     "🔐 **Authentication**: Sign in, sign up, sign out, reset password\n" +
                     "📅 **Events**: Find events by sport, region, price, or date\n" +
                     "💰 **Pricing**: Check ticket prices for any event\n" +
                     "📍 **Locations**: Navigate to specific venues on the map\n" +
                     "👤 **Profile**: View your account information\n\n" +
                     "Try saying: 'show me Beirut events on map' or 'take me to skiing events'!",
            action: null
        },
        mapHelp: {
            keywords: ['map help', 'how to use map', 'map features', 'map commands'],
            response: "🗺️ **Map Navigation Commands:**\n\n" +
                     "• **'open map'** - Opens the full interactive map\n" +
                     "• **'show me [event name]'** - Navigates to specific event location\n" +
                     "• **'show [region] on map'** - Displays all events in a region\n" +
                     "• **'take me to [sport] events'** - Shows sport events on map\n" +
                     "• **'find [venue/city] on map'** - Locates specific venue\n" +
                     "• **'show nearby events'** - Shows events in your area\n\n" +
                     "I'll automatically navigate you to the map with the right view!",
            action: null
        }
    }
};

/* ============================================================
   MAP NAVIGATION FUNCTIONS
============================================================ */

// Navigate to map with specific view
async function navigateToMap(options = {}) {
    const { coordinates, zoom, eventId, region, sport, venue } = options;
    
    // Switch to map page
    navigate('map');
    
    // Wait for map to initialize
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // Handle different navigation scenarios
    if (coordinates && zoom) {
        focusMapCoordinates(coordinates, zoom);
    } else if (eventId) {
        focusMapEvent(eventId);
    } else if (region) {
        focusMapRegion(region);
    } else if (sport) {
        focusMapSport(sport);
    } else if (venue) {
        focusMapVenue(venue);
    }
    
    // Show confirmation toast
    const locationName = venue || region || sport || 'Map';
    toast(`📍 Navigated to ${locationName}`, 'success', 3000);
}

// Focus map on specific coordinates
function focusMapCoordinates(coordinates, zoom = 14) {
    if (!map) {
        setTimeout(() => focusMapCoordinates(coordinates, zoom), 300);
        return;
    }
    
    map.setView(coordinates, zoom, {
        animate: true,
        duration: 1
    });
    
    // Find nearest marker and open popup
    setTimeout(() => {
        const nearest = findNearestMarker(coordinates);
        if (nearest) {
            nearest.marker.openPopup();
        }
    }, 1000);
}

// Focus map on a specific region
function focusMapRegion(regionName) {
    const region = MOHAFAZAT.find(m => 
        m.name.toLowerCase() === regionName.toLowerCase()
    );
    
    if (!region) return;
    
    const regionEvents = EVENTS.filter(e => e.mohafaza === region.name);
    if (regionEvents.length === 0) return;
    
    // Calculate center of all events in region
    const lats = regionEvents.map(e => e.coordinates[0]);
    const lngs = regionEvents.map(e => e.coordinates[1]);
    const centerLat = lats.reduce((a, b) => a + b) / lats.length;
    const centerLng = lngs.reduce((a, b) => a + b) / lngs.length;
    
    focusMapCoordinates([centerLat, centerLng], getRegionZoom(region.name));
    
    // Highlight all markers in region
    setTimeout(() => {
        highlightRegionMarkers(region.name);
    }, 800);
}

// Focus map on specific sport events
function focusMapSport(sportName) {
    const sportEvents = EVENTS.filter(e => 
        e.sport.toLowerCase().includes(sportName.toLowerCase())
    );
    
    if (sportEvents.length === 0) return;
    
    // Find center of all sport events
    const lats = sportEvents.map(e => e.coordinates[0]);
    const lngs = sportEvents.map(e => e.coordinates[1]);
    const centerLat = lats.reduce((a, b) => a + b) / lats.length;
    const centerLng = lngs.reduce((a, b) => a + b) / lngs.length;
    
    focusMapCoordinates([centerLat, centerLng], 8);
    
    // Highlight sport markers
    setTimeout(() => {
        highlightSportMarkers(sportName);
    }, 800);
}

// Focus map on specific venue
function focusMapVenue(venueName) {
    const venueEvent = EVENTS.find(e => 
        e.location.toLowerCase().includes(venueName.toLowerCase()) ||
        e.title.toLowerCase().includes(venueName.toLowerCase())
    );
    
    if (venueEvent) {
        focusMapCoordinates(venueEvent.coordinates, 15);
    }
}

// Find nearest marker to coordinates
function findNearestMarker(coordinates) {
    if (!markers || markers.length === 0) return null;
    
    let nearest = null;
    let minDistance = Infinity;
    
    markers.forEach(m => {
        const distance = calculateDistance(
            coordinates[0], coordinates[1],
            m.event.coordinates[0], m.event.coordinates[1]
        );
        if (distance < minDistance) {
            minDistance = distance;
            nearest = m;
        }
    });
    
    return nearest;
}

// Calculate distance between two coordinates (Haversine formula)
function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // Earth's radius in km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
}

// Get appropriate zoom level for region
function getRegionZoom(regionName) {
    const zoomLevels = {
        'Beirut': 13,
        'Mount Lebanon': 11,
        'North Lebanon': 10,
        'South Lebanon': 10,
        'Nabatieh': 11,
        'Bekaa': 10,
        'Baalbek-Hermel': 10,
        'Akkar': 11
    };
    return zoomLevels[regionName] || 10;
}

// Highlight markers for a specific region
function highlightRegionMarkers(regionName) {
    if (!markers) return;
    
    markers.forEach(m => {
        const icon = m.marker.getIcon();
        if (m.event.mohafaza === regionName) {
            m.marker.setIcon(createHighlightedMarker(m.event.sportIcon, true));
        } else {
            m.marker.setIcon(createHighlightedMarker(m.event.sportIcon, false));
        }
    });
}

// Highlight markers for a specific sport
function highlightSportMarkers(sportName) {
    if (!markers) return;
    
    markers.forEach(m => {
        const icon = m.marker.getIcon();
        if (m.event.sport.toLowerCase().includes(sportName.toLowerCase())) {
            m.marker.setIcon(createHighlightedMarker(m.event.sportIcon, true));
        } else {
            m.marker.setIcon(createHighlightedMarker(m.event.sportIcon, false));
        }
    });
}

// Create highlighted marker
function createHighlightedMarker(sportIcon, highlighted) {
    return L.divIcon({
        className: '',
        html: `<div class="custom-marker" style="
            ${highlighted ? 'transform: scale(1.2); box-shadow: 0 6px 18px rgba(26,86,219,.6);' : ''}
            transition: all 0.3s ease;
        ">
            <span style="font-size:1rem">${sportIcon}</span>
        </div>`,
        iconSize: [36, 36],
        iconAnchor: [18, 36]
    });
}

/* ============================================================
   LOCATION PARSING & UNDERSTANDING
============================================================ */

// Parse location query from message
function parseLocationQuery(message) {
    const lower = message.toLowerCase();
    
    // Check for specific event names
    for (const event of EVENTS) {
        const eventKeywords = event.title.toLowerCase().split(' ').slice(0, 3);
        if (eventKeywords.some(kw => lower.includes(kw))) {
            return {
                type: 'event',
                eventId: event.id,
                coordinates: event.coordinates,
                name: event.title,
                venue: event.location
            };
        }
    }
    
    // Check for venues
    const venues = [
        { name: 'camille chamoun', match: 'camille chamoun sports city', event: 'ev-001' },
        { name: 'martyrs square', match: 'martyrs square downtown', event: 'ev-002' },
        { name: 'aub', match: 'aub sports complex', event: 'ev-003' },
        { name: 'faraya', match: 'faraya mzaar ski resort', event: 'ev-004' },
        { name: 'jounieh', match: 'jounieh bay', event: 'ev-005' },
        { name: 'byblos', match: 'byblos tennis', event: 'ev-006' },
        { name: 'tripoli sports', match: 'tripoli sports complex', event: 'ev-007' },
        { name: 'cedars', match: 'cedars bcharre', event: 'ev-008' },
        { name: 'sidon', match: 'sidon seafront', event: 'ev-010' },
        { name: 'tyre', match: 'tyre sour corniche', event: 'ev-011' },
        { name: 'zahle', match: 'zahle city center', event: 'ev-014' },
        { name: 'baalbek', match: 'baalbek temples', event: 'ev-016' }
    ];
    
    for (const venue of venues) {
        if (lower.includes(venue.name)) {
            const event = EVENTS.find(e => e.id === venue.event);
            if (event) {
                return {
                    type: 'venue',
                    eventId: event.id,
                    coordinates: event.coordinates,
                    name: venue.name,
                    venue: event.location
                };
            }
        }
    }
    
    // Check for regions
    for (const region of MOHAFAZAT) {
        if (lower.includes(region.name.toLowerCase())) {
            return {
                type: 'region',
                region: region.name,
                name: region.name
            };
        }
    }
    
    // Check for sports
    for (const sport of SPORT_TYPES) {
        if (lower.includes(sport.toLowerCase())) {
            return {
                type: 'sport',
                sport: sport,
                name: sport
            };
        }
    }
    
    return null;
}

/* ============================================================
   MESSAGE PARSING & UNDERSTANDING
============================================================ */

// Parse credentials from user message
function parseCredentials(message) {
    const credentials = {};
    const patterns = {
        email: /(?:email|e-mail|mail):\s*([^\s\n]+@[^\s\n]+)/i,
        password: /(?:password|pass|pwd):\s*([^\s\n]+)/i,
        name: /(?:name|full name|fullname):\s*([^\n]+)/i,
        phone: /(?:phone|tel|mobile):\s*([^\n]+)/i,
        city: /(?:city|location):\s*([^\n]+)/i,
        sport: /(?:sport|favorite sport|sports):\s*([^\n]+)/i
    };
    
    for (const [key, pattern] of Object.entries(patterns)) {
        const match = message.match(pattern);
        if (match) {
            credentials[key] = match[1].trim();
        }
    }
    
    if (!credentials.email) {
        const emailMatch = message.match(/([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9_-]+)/);
        if (emailMatch) credentials.email = emailMatch[1];
    }
    
    return credentials;
}

// Understand user intent
function understandIntent(message) {
    const lower = message.toLowerCase().trim();
    
    // Check map/location intents FIRST (high priority)
    if (lower.includes('on map') || lower.includes('show me') || 
        lower.includes('take me to') || lower.includes('navigate to') ||
        lower.includes('find on map') || lower.includes('show on map') ||
        lower.includes('locate')) {
        return { category: 'map', action: 'show_on_map' };
    }
    
    if (CHATBOT_KNOWLEDGE.map.openMap.keywords.some(kw => lower.includes(kw))) {
        return { category: 'map', action: 'open_map' };
    }
    
    if (CHATBOT_KNOWLEDGE.map.nearby.keywords.some(kw => lower.includes(kw))) {
        return { category: 'map', action: 'show_nearby' };
    }
    
    // Check authentication intents
    for (const [key, config] of Object.entries(CHATBOT_KNOWLEDGE.auth)) {
        if (config.keywords.some(kw => lower.includes(kw))) {
            return { category: 'auth', action: config.action, config };
        }
    }
    
    // Check profile intents
    if (CHATBOT_KNOWLEDGE.profile.keywords.some(kw => lower.includes(kw))) {
        return { category: 'profile', action: 'show_profile' };
    }
    
    // Check event intents
    for (const [key, config] of Object.entries(CHATBOT_KNOWLEDGE.events)) {
        if (config.keywords.some(kw => lower.includes(kw))) {
            return { category: 'events', action: config.action, subcategory: key };
        }
    }
    
    // Check general intents
    for (const [key, config] of Object.entries(CHATBOT_KNOWLEDGE.general)) {
        if (config.keywords.some(kw => lower.includes(kw))) {
            return { category: 'general', action: key };
        }
    }
    
    return { category: 'unknown' };
}

/* ============================================================
   RESPONSE GENERATION
============================================================ */

// Handle map intents
async function handleMapIntent(message) {
    const locationQuery = parseLocationQuery(message);
    
    if (locationQuery) {
        Chatbot.lastMapQuery = locationQuery;
        
        switch (locationQuery.type) {
            case 'event':
                await navigateToMap({
                    eventId: locationQuery.eventId,
                    coordinates: locationQuery.coordinates,
                    zoom: 15
                });
                return `🗺️ Showing **${locationQuery.name}** on the map! I've zoomed in to show you the exact location.\n\n📍 **Venue:** ${locationQuery.venue}\n\nYou can click the marker for more details!`;
                
            case 'venue':
                await navigateToMap({
                    coordinates: locationQuery.coordinates,
                    zoom: 15,
                    venue: locationQuery.venue
                });
                return `🗺️ Navigated to **${locationQuery.venue}**! The marker shows the event location with all details.`;
                
            case 'region':
                await navigateToMap({
                    region: locationQuery.region,
                    zoom: getRegionZoom(locationQuery.region)
                });
                const regionEvents = EVENTS.filter(e => e.mohafaza === locationQuery.region);
                return `🗺️ Showing all events in **${locationQuery.region}** (${regionEvents.length} events)!\n\nI've highlighted all event locations in this region. Click any marker to see details!`;
                
            case 'sport':
                await navigateToMap({
                    sport: locationQuery.sport
                });
                const sportEvents = EVENTS.filter(e => e.sport.toLowerCase().includes(locationQuery.sport.toLowerCase()));
                return `🗺️ Showing all **${locationQuery.sport}** events across Lebanon (${sportEvents.length} events)!\n\nI've highlighted the relevant markers. Click any to view event details!`;
        }
    }
    
    // Generic map open
    await navigateToMap({ zoom: 8 });
    return "🗺️ **Map opened!** I've loaded the interactive map with all 22 events across Lebanon.\n\nTry saying:\n• 'Show me Beirut on map'\n• 'Take me to Faraya'\n• 'Show football events on map'\n• 'Find Baalbek on map'";
}

// Generate event-related responses
function getEventResponse(action, message) {
    const lower = message.toLowerCase();
    
    switch (action) {
        case 'filter_by_sport':
            const sport = CHATBOT_KNOWLEDGE.events.bySport.keywords.find(s => lower.includes(s));
            if (sport) {
                const events = EVENTS.filter(e => e.sport.toLowerCase().includes(sport));
                if (events.length > 0) {
                    let response = `🏅 **${events[0].sport} Events in Lebanon:**\n\n`;
                    events.forEach(e => {
                        response += `📌 **${e.title}**\n`;
                        response += `   📍 ${e.location.split(',')[0]} | 📅 ${formatDate(e.date)}\n`;
                        response += `   💰 ${e.priceDisplay || 'Free'} | 🏟️ Capacity: ${e.capacity}\n`;
                        response += `   🗺️ Say "show ${e.title.split(' ').slice(0,2).join(' ')} on map" to see location!\n\n`;
                    });
                    response += `Click on any event card to view details and register! Or ask me to show them on the map.`;
                    return response;
                }
                return `I couldn't find any ${sport} events. Try a different sport!`;
            }
            break;
            
        case 'filter_by_region':
            const region = MOHAFAZAT.find(m => lower.includes(m.name.toLowerCase()));
            if (region) {
                const events = EVENTS.filter(e => e.mohafaza === region.name);
                if (events.length > 0) {
                    let response = `${region.flag} **Events in ${region.name}:**\n\n`;
                    events.forEach(e => {
                        response += `📌 **${e.title}**\n`;
                        response += `   🏃 ${e.sport} | 📅 ${formatDate(e.date)}\n`;
                        response += `   💰 ${e.priceDisplay || 'Free'}\n`;
                        response += `   🗺️ Say "show on map" to see all ${region.name} events!\n\n`;
                    });
                    return response;
                }
            }
            break;
            
        case 'show_prices':
            const priceRanges = {
                'Free/Cheap (< $20)': EVENTS.filter(e => !e.price || e.price < 20),
                'Moderate ($20-$50)': EVENTS.filter(e => e.price >= 20 && e.price <= 50),
                'Premium ($50+)': EVENTS.filter(e => e.price > 50)
            };
            
            let priceResponse = "💰 **Event Pricing Guide:**\n\n";
            for (const [range, events] of Object.entries(priceRanges)) {
                if (events.length > 0) {
                    priceResponse += `**${range}:**\n`;
                    events.slice(0, 3).forEach(e => {
                        priceResponse += `  • ${e.title}: ${e.priceDisplay || 'Free'}\n`;
                    });
                    if (events.length > 3) priceResponse += `  ...and ${events.length - 3} more\n`;
                    priceResponse += '\n';
                }
            }
            priceResponse += "💡 Tip: Say 'show me [event] on map' to see its location!";
            return priceResponse;
            
        case 'show_dates':
            const upcoming = EVENTS
                .sort((a, b) => new Date(a.date) - new Date(b.date))
                .slice(0, 5);
            
            let dateResponse = "📅 **Upcoming Events:**\n\n";
            upcoming.forEach((e, i) => {
                dateResponse += `${i + 1}. **${e.title}**\n`;
                dateResponse += `   📆 ${formatDate(e.date)} at ${formatTime(e.time)}\n`;
                dateResponse += `   📍 ${e.location.split(',')[0]}\n`;
                dateResponse += `   🗺️ Say "show on map" to see location!\n\n`;
            });
            return dateResponse;
    }
    
    return null;
}

// Generate profile response
function getProfileResponse() {
    const user = Session.getUser();
    if (user) {
        const favCount = Session.get('favorites').length;
        const regCount = Session.getUserRegistrations().length;
        return `👤 **Your Profile:**\n\n` +
               `**Name:** ${user.name}\n` +
               `**Email:** ${user.email}\n` +
               `**Status:** ${user.status || 'Active'}\n` +
               `**Favorites:** ${favCount} events\n` +
               `**Registered:** ${regCount} events\n\n` +
               `Type 'my events' to see your registrations or ask me to show events on the map!`;
    }
    return "You're not signed in. Would you like to sign in or create an account?";
}

/* ============================================================
   MAIN CHATBOT HANDLER
============================================================ */

// Enhanced send function that integrates with chatbot
async function sendChat() {
    const input = document.getElementById('chatInput');
    if (!input) return;
    
    const message = input.value.trim();
    if (!message) return;
    
    input.value = '';
    
    // Add user message to chat
    addUserMsg(message);
    
    // Process the message
    await processMessage(message);
}

// Process user message
async function processMessage(message) {
    showTyping();
    
    // Check if we're awaiting a specific action response
    if (Chatbot.awaitingAction) {
        await handleAwaitingAction(message);
        return;
    }
    
    // Parse intent
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
            
        case 'events':
            response = getEventResponse(intent.action, message);
            if (!response) {
                response = CHATBOT_KNOWLEDGE.events[intent.subcategory]?.response;
            }
            if (!response) {
                response = "I can help you find events! Try asking about a specific sport, region, or say 'show me events on map'!";
            }
            break;
            
        case 'general':
            response = CHATBOT_KNOWLEDGE.general[intent.action]?.response;
            break;
            
        default:
            // Try to find specific event by name
            const eventMatch = EVENTS.find(e => 
                message.toLowerCase().includes(e.title.toLowerCase().split(' ').slice(0, 2).join(' '))
            );
            if (eventMatch) {
                response = `📅 **${eventMatch.title}**\n\n` +
                          `🏃 **Sport:** ${eventMatch.sport}\n` +
                          `📆 **Date:** ${formatDate(eventMatch.date)} at ${formatTime(eventMatch.time)}\n` +
                          `📍 **Location:** ${eventMatch.location}\n` +
                          `💰 **Price:** ${eventMatch.priceDisplay || 'Free'}\n` +
                          `🏟️ **Capacity:** ${eventMatch.capacity} attendees\n` +
                          `👤 **Organizer:** ${eventMatch.organizer}\n\n` +
                          `${eventMatch.description}\n\n` +
                          `💡 Say "show on map" to see this event's location!`;
            } else {
                response = getBotReply(message);
            }
    }
    
    setTimeout(() => {
        removeTyping();
        if (response) addBotMsg(response);
        setSuggestions(getContextualSuggestions(message, intent));
    }, 800);
}

// Handle authentication intents
async function handleAuthIntent(intent, message) {
    const user = Session.getUser();
    
    switch (intent.action) {
        case 'signout':
            if (user) {
                await doLogout();
                return "You've been signed out successfully! 👋\n\nIs there anything else I can help you with?";
            }
            return "You're not currently signed in. Would you like to sign in?";
            
        case 'awaiting_signin':
            if (user) return `You're already signed in as ${user.name}! Type 'sign out' to logout first.`;
            Chatbot.awaitingAction = 'signin';
            Chatbot.tempCredentials = {};
            return intent.config.response;
            
        case 'awaiting_signup':
            if (user) return "You're already signed in. Sign out first to create a new account.";
            Chatbot.awaitingAction = 'signup';
            Chatbot.tempCredentials = {};
            return intent.config.response;
            
        case 'awaiting_reset_email':
            Chatbot.awaitingAction = 'reset_password';
            Chatbot.tempCredentials = {};
            return intent.config.response;
            
        case 'show_profile':
            return getProfileResponse();
    }
    
    return intent.config.response || "How can I help you with authentication?";
}

// Handle responses when chatbot is awaiting specific input
async function handleAwaitingAction(message) {
    const action = Chatbot.awaitingAction;
    const credentials = parseCredentials(message);
    
    switch (action) {
        case 'signin':
            if (credentials.email && credentials.password) {
                await performSignIn(credentials);
            } else {
                addBotMsg("I need both your email and password. Please type them like this:\n```\nemail: your@email.com\npassword: yourpassword\n```");
            }
            return;
            
        case 'signup':
            if (credentials.email && credentials.password && credentials.name) {
                if (credentials.password.length < 8) {
                    removeTyping();
                    addBotMsg("Password must be at least 8 characters. Please try again with a stronger password.");
                    return;
                }
                await performSignUp(credentials);
            } else {
                removeTyping();
                addBotMsg("I need your name, email, and password at minimum. Please try again:\n```\nname: Your Name\nemail: your@email.com\npassword: yourpassword\n```");
            }
            return;
            
        case 'reset_password':
            if (credentials.email) {
                await handlePasswordReset(credentials.email);
            } else {
                removeTyping();
                addBotMsg("Please provide your email address:\n```\nemail: your@email.com\n```");
            }
            return;
    }
    
    // Reset awaiting state
    Chatbot.awaitingAction = null;
    Chatbot.tempCredentials = {};
    removeTyping();
    addBotMsg("I didn't quite understand that. How else can I help you?");
}

// Perform sign in through chatbot
async function performSignIn(credentials) {
    Chatbot.awaitingAction = null;
    Chatbot.tempCredentials = {};
    
    try {
        const res = await fetch(`${API}/api/login`, {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: credentials.email, password: credentials.password })
        });
        
        const data = await res.json();
        
        if (res.status === 403 && data.error?.includes('pending')) {
            removeTyping();
            Session.setUser({ name: data.name || credentials.email, email: credentials.email, status: 'pending' });
            addBotMsg(`Your account is still pending approval. You'll be notified once an admin approves it.`);
            navigate('pending');
            return;
        }
        
        if (!res.ok) {
            removeTyping();
            addBotMsg(`❌ ${data.error || 'Invalid email or password. Please try again.'}`);
            return;
        }
        
        const user = {
            id: data.user.id,
            name: data.user.full_name,
            email: data.user.email,
            sport: data.user.sport_interest,
            status: 'approved',
            isAdmin: false
        };
        
        Session.setUser(user);
        await _loadUserRegs();
        
        removeTyping();
        addBotMsg(`✅ Welcome back, ${user.name.split(' ')[0]}! 🎉\n\nYou're now signed in. How can I help you today?\n\nTry: 'show me events on map', 'upcoming events', or 'my profile'!`);
        updateNav();
        navigate('home');
        
    } catch (e) {
        removeTyping();
        addBotMsg(`❌ Connection error: ${e.message}. Please try again.`);
    }
}

// Perform sign up through chatbot
async function performSignUp(credentials) {
    Chatbot.awaitingAction = null;
    Chatbot.tempCredentials = {};
    
    try {
        const res = await fetch(`${API}/api/register`, {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                full_name: credentials.name,
                email: credentials.email,
                password: credentials.password,
                phone: credentials.phone || '',
                sport_interest: credentials.sport || 'All Sports'
            })
        });
        
        const data = await res.json();
        
        if (!res.ok) {
            removeTyping();
            addBotMsg(`❌ ${data.error || 'Registration failed. Please try again.'}`);
            return;
        }
        
        Session.setUser({ name: credentials.name, email: credentials.email, status: 'pending' });
        
        removeTyping();
        addBotMsg(`🎉 Registration successful, ${credentials.name.split(' ')[0]}!\n\nYour account has been created and is pending admin approval. You'll be notified once approved.\n\nIn the meantime, you can browse events! Try saying 'show me events on map'!`);
        navigate('pending');
        
    } catch (e) {
        removeTyping();
        addBotMsg(`❌ Connection error: ${e.message}. Please try again.`);
    }
}

// Handle password reset
async function handlePasswordReset(email) {
    Chatbot.awaitingAction = null;
    
    try {
        const token = Math.random().toString(36).substring(2, 15);
        Chatbot.resetTokens[email] = token;
        
        removeTyping();
        addBotMsg(`📧 A password reset link has been sent to **${email}**.\n\nIn a production environment, you'd receive an email with reset instructions. For this demo, please contact the administrator to reset your password.\n\nIs there anything else I can help with?`);
        
    } catch (e) {
        removeTyping();
        addBotMsg(`❌ Error processing request: ${e.message}`);
    }
}

// Send a message programmatically (for suggestion buttons)
function sendChatMsg(message) {
    const input = document.getElementById('chatInput');
    if (!input) return;
    input.value = message;
    sendChat();
}

/* ============================================================
   ENHANCED SUGGESTIONS SYSTEM
============================================================ */

// Get contextual suggestions based on conversation
function getContextualSuggestions(lastMessage, intent) {
    const user = Session.getUser();
    const lower = lastMessage?.toLowerCase() || '';
    
    if (!user) {
        return [
            'Sign in',
            'Sign up',
            'Show me events on map',
            'What can you do?'
        ];
    }
    
    // Map-related suggestions
    if (intent?.category === 'map') {
        return [
            'Show Beirut on map',
            'Take me to Faraya',
            'Show football events on map',
            'Open full map'
        ];
    }
    
    if (lower.includes('event') || lower.includes('sport')) {
        return [
            'Show on map',
            'Events in Beirut',
            'Football events',
            'Upcoming events'
        ];
    }
    
    if (lower.includes('beirut') || lower.includes('region')) {
        return [
            'Show Beirut on map',
            'Events in Mount Lebanon',
            'North Lebanon events',
            'Show all regions'
        ];
    }
    
    if (lower.includes('map')) {
        return [
            'Show skiing on map',
            'Navigate to Baalbek',
            'Where is Faraya?',
            'Show nearby events'
        ];
    }
    
    return [
        'Open map',
        'Show me Beirut on map',
        'Upcoming events',
        'Event prices',
        'Help'
    ];
}

/* ============================================================
   OVERRIDE INITIALIZATION
============================================================ */

// Override the existing toggleChat to add map features
const originalToggleChat = toggleChat;
toggleChat = function() {
    if (!Session.getUser()) {
        navigate('signin');
        toast('Please sign in to use the AI Assistant', 'info');
        return;
    }
    
    originalToggleChat();
    
    // If just opened, add personalized greeting with map hints
    if (chatOpen && !chatInitialized) {
        setTimeout(() => {
            const user = Session.getUser();
            if (user) {
                const personalizedGreeting = `👋 Hi ${user.name.split(' ')[0]}! I'm SportBot with map navigation! 🗺️\n\n` +
                    `I can help you:\n\n` +
                    `• 🗺️ **Navigate Map**: "Show me Beirut on map"\n` +
                    `• 🔐 **Sign in/out** of your account\n` +
                    `• 📅 **Find events** by sport or region\n` +
                    `• 💰 **Check prices** for any event\n` +
                    `• 📍 **Locate venues**: "Take me to Faraya"\n\n` +
                    `What would you like to do?`;
                
                const msgs = document.getElementById('chatMessages');
                if (msgs) {
                    msgs.innerHTML = '';
                    addBotMsg(personalizedGreeting);
                }
            }
        }, 100);
    }
};

/* ============================================================
   GLOBAL FUNCTION OVERRIDES FOR MAP INTEGRATION
============================================================ */

// Enhanced getBotReply with chatbot and map integration
const originalGetBotReply = getBotReply;
getBotReply = function(msg) {
    const intent = understandIntent(msg);
    
    if (intent.category === 'map') {
        handleMapIntent(msg).then(response => {
            addBotMsg(response);
        });
        return "Let me show you that on the map... 🗺️";
    }
    
    if (intent.category === 'events') {
        const response = getEventResponse(intent.action, msg);
        if (response) return response;
    }
    
    if (intent.category === 'profile') {
        return getProfileResponse();
    }
    
    return originalGetBotReply(msg);
};

/* ============================================================
   KEYBOARD SHORTCUTS & QUICK COMMANDS
============================================================ */

// Add keyboard shortcut for quick map navigation
document.addEventListener('keydown', function(e) {
    // Ctrl+M or Cmd+M to open map
    if ((e.ctrlKey || e.metaKey) && e.key === 'm') {
        e.preventDefault();
        if (chatOpen) {
            sendChatMsg('open map');
        } else {
            navigate('map');
            toast('🗺️ Map opened! (Ctrl+M shortcut)', 'info', 2000);
        }
    }
});

/* ============================================================
   INITIALIZATION
============================================================ */
console.log('🤖 Smart Chatbot with Map Navigation initialized');
console.log('🗺️ Map Features:');
console.log('  - "show me [event] on map" - Navigate to event location');
console.log('  - "take me to [venue]" - Find specific venue');
console.log('  - "show [region] on map" - View all events in region');
console.log('  - "open map" - Open full interactive map');
console.log('  - "show nearby events" - Find events near you');
console.log('  - Ctrl+M - Quick map shortcut');
console.log('🔐 Auth Features: Sign in, sign up, sign out, password reset');
console.log('📅 Event Features: Search by sport, region, price, date');

/* ============================================================
   VOICE INPUT — speak to the chatbot
   Uses browser's built-in SpeechRecognition — no API, no cloud
============================================================ */

(function addVoiceInput() {

  /* ── 1. Inject mic button styles ── */
  const style = document.createElement('style');
  style.textContent = `
    .chat-mic-btn {
      width: 36px; height: 36px; flex-shrink: 0;
      border-radius: 50%; border: none; cursor: pointer;
      display: flex; align-items: center; justify-content: center;
      font-size: .85rem; transition: all .2s ease;
      background: var(--gray-200); color: var(--gray-600);
    }
    .chat-mic-btn:hover { background: var(--gray-300); color: var(--gray-800); }
    .chat-mic-btn.listening {
      background: #ef4444; color: #fff;
      animation: mic-pulse 1s ease-in-out infinite;
    }
    .chat-mic-btn.no-support { opacity: .3; cursor: not-allowed; }
    @keyframes mic-pulse {
      0%, 100% { box-shadow: 0 0 0 0 rgba(239,68,68,.5); }
      50%       { box-shadow: 0 0 0 8px rgba(239,68,68,0); }
    }
    .chat-voice-hint {
      font-size: .7rem; color: var(--gray-400); text-align: center;
      padding: .2rem 1rem .1rem; background: #fff;
    }
  `;
  document.head.appendChild(style);

  /* ── 2. Inject mic button into the chat input area ── */
  function injectMicButton() {
    const inputArea = document.querySelector('.chat-input-area');
    if (!inputArea || document.getElementById('voiceMicBtn')) return;

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

    const btn = document.createElement('button');
    btn.id = 'voiceMicBtn';
    btn.className = 'chat-mic-btn';
    btn.title = 'Tap to speak';
    btn.innerHTML = '<i class="fas fa-microphone"></i>';

    if (!SpeechRecognition) {
      btn.classList.add('no-support');
      btn.title = 'Voice not supported in this browser';
      inputArea.appendChild(btn);
      return;
    }

    /* ── 3. Speech recognition logic ── */
    const recognition = new SpeechRecognition();
    recognition.lang = 'en-US';
    recognition.continuous = false;
    recognition.interimResults = true;

    let listening = false;

    function startListening() {
      const input = document.getElementById('chatInput');
      if (input) input.value = '';
      recognition.start();
    }

    function stopListening() {
      recognition.stop();
    }

    btn.addEventListener('click', () => {
      if (listening) stopListening();
      else startListening();
    });

    recognition.onstart = () => {
      listening = true;
      btn.classList.add('listening');
      btn.title = 'Listening… tap to stop';
      btn.innerHTML = '<i class="fas fa-stop"></i>';
      const input = document.getElementById('chatInput');
      if (input) input.placeholder = '🎙 Listening…';
    };

    recognition.onresult = (e) => {
      const transcript = Array.from(e.results)
        .map(r => r[0].transcript).join('');
      const input = document.getElementById('chatInput');
      if (input) input.value = transcript;
    };

    recognition.onend = () => {
      listening = false;
      btn.classList.remove('listening');
      btn.title = 'Tap to speak';
      btn.innerHTML = '<i class="fas fa-microphone"></i>';
      const input = document.getElementById('chatInput');
      if (input) input.placeholder = 'Ask me anything… or tap 🎤';

      // Auto-send if something was transcribed
      const msg = document.getElementById('chatInput')?.value?.trim();
      if (msg) sendChat();
    };

    recognition.onerror = (e) => {
      listening = false;
      btn.classList.remove('listening');
      btn.innerHTML = '<i class="fas fa-microphone"></i>';
      const input = document.getElementById('chatInput');
      if (input) input.placeholder = 'Ask me anything…';
      if (e.error !== 'no-speech' && e.error !== 'aborted') {
        toast('🎤 ' + (e.error === 'not-allowed'
          ? 'Microphone access denied. Please allow mic in your browser.'
          : 'Voice error: ' + e.error), 'error', 3000);
      }
    };

    inputArea.appendChild(btn);
  }

  /* ── 4. Wait for the chat window to be in the DOM, then inject ── */
  function tryInject() {
    if (document.querySelector('.chat-input-area')) {
      injectMicButton();
    } else {
      // Chat window is hidden on load — inject when it first opens
      const observer = new MutationObserver(() => {
        if (document.querySelector('.chat-input-area')) {
          injectMicButton();
          observer.disconnect();
        }
      });
      observer.observe(document.body, { childList: true, subtree: true });
    }
  }

  // Also re-inject if the window was rebuilt (e.g. after DOM changes)
  const originalToggleChat2 = toggleChat;
  toggleChat = function () {
    originalToggleChat2.apply(this, arguments);
    setTimeout(injectMicButton, 150);
  };

  tryInject();

})();