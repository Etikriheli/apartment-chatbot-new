// הגדרות עם ה-Supabase הנכון שלך
const SUPABASE_URL = process.env.SUPABASE_URL || 'YOUR_SUPABASE_URL';
const SUPABASE_KEY = process.env.SUPABASE_KEY || 'YOUR_SUPABASE_KEY';
const API_KEY = process.env.API_KEY || 'YOUR_OPENAI_API_KEY';

let chatCount = 0;
let totalCost = 0;

// אלמנטים
const messagesDiv = document.getElementById('messages');
const inputEl = document.getElementById('input');
const statusEl = document.getElementById('status');
const usageEl = document.getElementById('usage');

// פונקציה להוספת הודעה
function addMessage(sender, text) {
    const div = document.createElement('div');
    div.className = 'message';
    const msgClass = sender === 'user' ? 'user-msg' : 'bot-msg';
    const time = new Date().toLocaleTimeString('he-IL', {hour: '2-digit', minute: '2-digit'});
    
    div.innerHTML = `
        <div class="${msgClass}">
            ${text.replace(/\n/g, '<br>')}
            <div class="time">${time}</div>
        </div>
    `;
    
    messagesDiv.appendChild(div);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

// פונקציה להצגת אפקט הקלדה
function showTyping() {
    const div = document.createElement('div');
    div.className = 'typing';
    div.id = 'typing';
    div.innerHTML = '<div class="typing-dots"><span class="dot"></span><span class="dot"></span><span class="dot"></span></div>';
    messagesDiv.appendChild(div);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

// פונקציה להסתרת אפקט הקלדה
function hideTyping() {
    const typing = document.getElementById('typing');
    if (typing) typing.remove();
}

// פונקציה לחישוב מרחק עריכה (לזיהוי שגיאות הקלדה)
function levenshteinDistance(str1, str2) {
    const matrix = [];
    for (let i = 0; i <= str2.length; i++) {
        matrix[i] = [i];
    }
    for (let j = 0; j <= str1.length; j++) {
        matrix[0][j] = j;
    }
    for (let i = 1; i <= str2.length; i++) {
        for (let j = 1; j <= str1.length; j++) {
            if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
                matrix[i][j] = matrix[i - 1][j - 1];
            } else {
                matrix[i][j] = Math.min(
                    matrix[i - 1][j - 1] + 1,
                    matrix[i][j - 1] + 1,
                    matrix[i - 1][j] + 1
                );
            }
        }
    }
    return matrix[str2.length][str1.length];
}

// פונקציה לזיהוי עיר חכם עם שגיאות הקלדה
function detectCity(query) {
    const cityMappings = {
        'תל אביב': 'תל אביב', 'תלאביב': 'תל אביב', 'ת"א': 'תל אביב', 'תא': 'תל אביב',
        'בתל אביב': 'תל אביב', 'בתלאביב': 'תל אביב', 'tel aviv': 'תל אביב', 'telaviv': 'תל אביב',
        'ירושלים': 'ירושלים', 'בירושלים': 'ירושלים', 'ירושל': 'ירושלים', 'ירוש': 'ירושלים',
        'jerusalem': 'ירושלים', 'חיפה': 'חיפה', 'בחיפה': 'חיפה', 'haifa': 'חיפה',
        'רמת גן': 'רמת גן', 'רמתגן': 'רמת גן', 'ברמת גן': 'רמת גן', 'רמת-גן': 'רמת גן',
        'פתח תקווה': 'פתח תקווה', 'פתחתקווה': 'פתח תקווה', 'בפתח תקווה': 'פתח תקווה', 'פת"ת': 'פתח תקווה',
        'הרצליה': 'הרצליה', 'בהרצליה': 'הרצליה', 'נתניה': 'נתניה', 'בנתניה': 'נתניה',
        'ראשון לציון': 'ראשון לציון', 'ראשוןלציון': 'ראשון לציון', 'בראשון לציון': 'ראשון לציון',
        'באר שבע': 'באר שבע', 'בבאר שבע': 'באר שבע', 'ב"ש': 'באר שבע',
        'כפר סבא': 'כפר סבא', 'כפרסבא': 'כפר סבא', 'בכפר סבא': 'כפר סבא'
    };

    const queryLower = query.toLowerCase();
    
    // שלב 1: התאמה מדויקת
    for (const [searchTerm, cityName] of Object.entries(cityMappings)) {
        if (queryLower.includes(searchTerm.toLowerCase())) {
            console.log('🏙️ Exact city match:', cityName, 'from:', searchTerm);
            return cityName;
        }
    }
    
    // שלב 2: זיהוי שגיאות הקלדה
    const words = queryLower.split(/\s+/);
    const mainCities = ['תל אביב', 'ירושלים', 'חיפה', 'רמת גן', 'פתח תקווה', 'הרצליה', 'נתניה', 'ראשון לציון', 'באר שבע', 'כפר סבא'];
    
    for (const word of words) {
        if (word.length >= 3) {
            for (const city of mainCities) {
                const cityWords = city.split(' ');
                for (const cityWord of cityWords) {
                    const distance = levenshteinDistance(word, cityWord.toLowerCase());
                    if (distance <= 2 && word.length >= 4 && cityWord.length >= 4) {
                        console.log('🏙️ Fuzzy city match:', city, 'from:', word, '→', cityWord, 'distance:', distance);
                        return city;
                    }
                }
            }
        }
    }
    
    return null;
}

// פונקציה לחיפוש דירות ב-Supabase עם פילטרים חכמים
async function searchApartments(query) {
    try {
        console.log('🔍 Starting search with query:', query);
        
        // חיפוש עיר
        const detectedCity = detectCity(query);
        
        // חיפוש מחיר/תקציב
        const priceMatch = query.match(/(\d+)\s*(אלף|שקל)/);
        const maxPrice = priceMatch ? parseInt(priceMatch[1]) * (priceMatch[2] === 'אלף' ? 1000 : 1) : null;
        
        // חיפוש חדרים
        const roomsMatch = query.match(/(\d+)\s*חדרים?/);
        const rooms = roomsMatch ? parseInt(roomsMatch[1]) : null;
        
        // סוג עסקה
        const isRental = query.includes('השכרה') || query.includes('לשכור') || query.includes('להשכיר');
        const isSale = query.includes('מכירה') || query.includes('לקנות') || query.includes('למכירה');
        
        // בניית URL עם פילטרים
        let searchUrl = `${SUPABASE_URL}/rest/v1/apartments?select=*`;
        const params = [];
        
        if (detectedCity) {
            params.push(`city=eq.${encodeURIComponent(detectedCity)}`);
            console.log('🏙️ Filtering by city:', detectedCity);
        }
        
        if (rooms) {
            params.push(`rooms=eq.${rooms}`);
            console.log('🛏️ Filtering by rooms:', rooms);
        }
        
        if (isRental && !isSale) {
            params.push(`transaction_type=eq.השכרה`);
            console.log('🏠 Filtering for rentals');
        } else if (isSale && !isRental) {
            params.push(`transaction_type=eq.מכירה`);
            console.log('💰 Filtering for sales');
        }
        
        if (maxPrice) {
            params.push(`price=lte.${maxPrice}`);
            console.log('💰 Filtering by max price:', maxPrice);
        }
        
        // מיון לפי מחיר עולה
        params.push('order=price.asc');
        params.push('limit=8');
        
        if (params.length > 2) {
            searchUrl += '&' + params.join('&');
        } else {
            searchUrl += '&order=price.asc&limit=8';
        }
        
        console.log('🔎 Final search URL:', searchUrl);

        const response = await fetch(searchUrl, {
            headers: {
                'apikey': SUPABASE_KEY,
                'Authorization': `Bearer ${SUPABASE_KEY}`,
                'Content-Type': 'application/json'
            }
        });

        if (response.ok) {
            const data = await response.json();
            console.log('🎯 Search results:', data.length, 'apartments found');
            if (data.length > 0) {
                console.log('🏠 Sample result:', data[0]);
                if (detectedCity) {
                    console.log('🏙️ City filter applied successfully for:', detectedCity);
                }
            }
            return data || [];
        } else {
            console.error('❌ Search failed:', response.status, await response.text());
            return [];
        }
    } catch (e) {
        console.error('💥 Search error:', e);
        return [];
    }
}

// פונקציה לניתוח מידע מהשיחה
function analyzeConversation(conversationText) {
    const text = conversationText.toLowerCase();
    
    const hasCity = detectCity(text) !== null;
    const hasBudget = /\d+\s*(שקל|אלף)/.test(text) || text.includes('תקציב') || /\d+\s*₪/.test(text);
    const hasFloor = text.includes('קומה') || text.includes('קרקע') || text.includes('גבוה') || /קומה\s*\d+/.test(text);
    const hasTransactionType = text.includes('השכרה') || text.includes('קנייה') || text.includes('מכירה') || text.includes('לשכור') || text.includes('לקנות');
    const hasSize = text.includes('מטר') || text.includes('גודל') || text.includes('שטח') || /\d+\s*מ"ר/.test(text);
    const hasRooms = /\d+\s*חדרים?/.test(text) || text.includes('סטודיו') || text.includes('חדר');
    
    return { hasCity, hasBudget, hasFloor, hasTransactionType, hasSize, hasRooms };
}

// פונקציה לקריאה ל-AI
async function callAI(message, apartments) {
    try {
        console.log('🤖 AI called with apartments:', apartments.length);
        
        const apartmentData = apartments.length > 0 ? 
            `דירות זמינות במאגר (${apartments.length} דירות נמצאו):\n${apartments.map((apt, i) => 
                `דירה ${i+1}: ${apt.apartment_type || 'דירה'} ${apt.rooms || '?'} חדרים ב${apt.city || 'לא ידוע'}, ${apt.street || 'רחוב לא ידוע'} | ${apt.size_sqm}מ"ר | קומה ${apt.floor || 'קרקע'} | ${apt.furniture || 'ללא ריהוט'} | ${apt.price?.toLocaleString()}₪ ל${apt.transaction_type}`
            ).join('\n')}` : 
            'לא נמצאו דירות במאגר עדיין - המשך לאסוף מידע.';

        // שמירת היסטוריית השיחה
        const conversationHistory = Array.from(messagesDiv.children)
            .filter(msg => msg.className === 'message')
            .slice(-10)
            .map(msg => {
                const isUser = msg.querySelector('.user-msg');
                const text = msg.querySelector(isUser ? '.user-msg' : '.bot-msg').textContent.replace(/\d{2}:\d{2}/, '').trim();
                return `${isUser ? 'משתמש' : 'יוסי'}: ${text}`;
            }).join('\n');

        // ניתוח המידע הקיים
        const analysis = analyzeConversation(conversationHistory);
        const detailsCount = Object.values(analysis).filter(Boolean).length;
        
        // בדיקה אם זו ההודעה הראשונה
        const isFirstMessage = conversationHistory.trim() === '' || conversationHistory.includes('היי! 👋 אני יוסי');
        
        console.log('📊 Conversation analysis:', analysis, 'Details:', detailsCount, 'First message:', isFirstMessage);

        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${API_KEY}`
            },
            body: JSON.stringify({
                model: 'gpt-4o-mini',
                messages: [{
                    role: 'system',
                    content: `אתה יוסי, סוכן דירות מקצועי וסבלני! 

היסטוריית השיחה:
${conversationHistory}

${apartmentData}

**בדוק אילו פרטים חסרים מההיסטוריה:**
- עיר: ${analysis.hasCity ? '✅' : '❌'}
- תקציב: ${analysis.hasBudget ? '✅' : '❌'}
- קומה מועדפת: ${analysis.hasFloor ? '✅' : '❌'}  
- סוג עסקה (השכרה/קנייה): ${analysis.hasTransactionType ? '✅' : '❌'}
- גודל דירה/שטח: ${analysis.hasSize ? '✅' : '❌'}
- מספר חדרים: ${analysis.hasRooms ? '✅' : '❌'}
פרטים קיימים: ${detailsCount}/6

**הוראות מחייבות:**

${detailsCount === 6 ? `
🎯 יש את כל 6 הפרטים! עכשיו בדוק במאגר:

${apartments.length > 0 ? `
יש ${apartments.length} דירות במאגר! הצג את הדירות האמיתיות מהמאגר:
- **חובה: השתמש רק בנתונים המדויקים מהמאגר שקיבלת!**
- **אל תמציא כתובות, רחובות, או פרטים שלא מופיעים במאגר!**
- הצג כל דירה עם הפרטים המדויקים: מחיר, עיר, רחוב, חדרים, גודל, קומה, ריהוט
- הסבר למה כל דירה מתאימה
- תן המלצה על הדירה הטובה ביותר
` : `
😞 לא מצאתי דירות במאגר שמתאימות לכל הקריטריונים שלך:
- עיר: ${detectedCity || 'לא צוין'}
- תקציב: ${maxPrice ? maxPrice.toLocaleString() + '₪' : 'לא צוין'}
- חדרים: ${rooms || 'לא צוין'}
- סוג עסקה: ${isRental ? 'השכרה' : isSale ? 'מכירה' : 'לא צוין'}

אולי תרצה לשנות קריטריון אחד? למשל:
🏙️ עיר אחרת?
💰 תקציב גבוה יותר?
🛏️ מספר חדרים שונה?

**לא ימציא דירות שלא קיימות במאגר!**
`}
` : isFirstMessage || detailsCount === 0 ? `
👋 זוהי ההודעה הראשונה! התחל עם: "באיזה עיר אתה מחפש דירה?"
` : `
📝 חסרים עוד ${6-detailsCount} פרטים! שאל בדיוק את השאלה הבאה בסדר:

1. ${!analysis.hasCity ? '🏙️ "באיזה עיר אתה מחפש דירה?"' : '✅ עיר'}
2. ${!analysis.hasBudget ? '💰 "מה התקציב שלך? (לחודש אם השכרה, סה"כ אם קנייה)"' : '✅ תקציב'}
3. ${!analysis.hasFloor ? '🏢 "איזה קומה אתה מעדיף? (קרקע, גבוה, ללא העדפה)"' : '✅ קומה'}
4. ${!analysis.hasTransactionType ? '🏠 "זה לקנייה או להשכרה?"' : '✅ סוג עסקה'}
5. ${!analysis.hasSize ? '📏 "איזה גודל דירה אתה מחפש? (קטנה/בינונית/גדולה)"' : '✅ גודל'}
6. ${!analysis.hasRooms ? '🛏️ "כמה חדרים אתה צריך?"' : '✅ חדרים'}

שאל רק את השאלה הראשונה שחסרה! אל תזרוק דירות עד שיש הכל!
`}

תמיד שאל שאלה אחת בלבד ובסדר הנכון!`
                }, {
                    role: 'user',
                    content: message
                }],
                max_tokens: 600,
                temperature: 0.3
            })
        });

        if (response.ok) {
            const data = await response.json();
            chatCount++;
            totalCost += 0.003;
            updateUsage();
            return data.choices[0].message.content;
        } else {
            const errorText = await response.text();
            console.error('OpenAI error:', response.status, errorText);
            return '❌ שגיאה זמנית. נסה שוב בעוד רגע.';
        }
    } catch (e) {
        console.error('AI call error:', e);
        return '🌐 בעיה בחיבור. בדוק את החיבור לאינטרנט.';
    }
}

// פונקציה ראשית לשליחת הודעה
async function send() {
    const message = inputEl.value.trim();
    if (!message) return;

    addMessage('user', message);
    inputEl.value = '';
    showTyping();

    try {
        // חיפוש דירות על בסיס כל ההיסטוריה + הודעה נוכחית
        const allMessages = Array.from(messagesDiv.children)
            .filter(msg => msg.className === 'message')
            .map(msg => {
                const isUser = msg.querySelector('.user-msg');
                return msg.querySelector(isUser ? '.user-msg' : '.bot-msg').textContent.replace(/\d{2}:\d{2}/, '').trim();
            }).join(' ');

        const fullContext = allMessages + ' ' + message;
        console.log('🔍 Searching with full context:', fullContext);
        
        const apartments = await searchApartments(fullContext);
        const response = await callAI(message, apartments);
        
        hideTyping();
        addMessage('bot', response);
    } catch (e) {
        hideTyping();
        console.error('Send error:', e);
        addMessage('bot', 'מצטער, יש בעיה טכנית. נסה שוב.');
    }
}

// פונקציה להגדרת טקסט בשדה הקלט
function setInput(text) {
    inputEl.value = text;
}

// פונקציה לעדכון נתוני שימוש
function updateUsage() {
    usageEl.textContent = `שיחות: ${chatCount} | עלות: $${totalCost.toFixed(3)}`;
}

// מאזיני אירועים
inputEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        send();
    }
});

// התחלה
window.addEventListener('load', () => {
    addMessage('bot', 'היי! 👋 אני יוסי, הסוכן שלך לחיפוש דירות.\n\nבאיזה עיר אתה מחפש דירה? 🏠');
});
