/**
 * SMS Parser for Indian Bank & Payment Messages
 * Extracts transaction details from SMS messages
 */

// Common patterns for Indian bank/payment SMS
const AMOUNT_PATTERNS = [
  /(?:Rs\.?|INR|₹)\s*([0-9,]+(?:\.[0-9]{1,2})?)/i,
  /(?:amount|amt|debited|credited|spent|paid|received|transferred)\s*(?:of|:)?\s*(?:Rs\.?|INR|₹)?\s*([0-9,]+(?:\.[0-9]{1,2})?)/i,
  /([0-9,]+(?:\.[0-9]{1,2})?)\s*(?:Rs\.?|INR|₹)/i,
  /(?:debit|credit|txn|transaction)\s*(?:of|:)?\s*(?:Rs\.?|INR|₹)?\s*([0-9,]+(?:\.[0-9]{1,2})?)/i,
];

const MERCHANT_PATTERNS = [
  /(?:at|to|from|@)\s+([A-Za-z0-9\s&\-\.]+?)(?:\s+on|\s+ref|\s+UPI|\.|$)/i,
  /(?:paid to|sent to|received from|transferred to)\s+([A-Za-z0-9\s&\-\.]+?)(?:\s+on|\s+ref|\.|$)/i,
  /VPA\s+([a-zA-Z0-9@\.\-]+)/i,
  /UPI:([A-Za-z0-9\s&\-\.@]+?)(?:\s+on|\s+ref|\.|$)/i,
];

const CARD_PATTERNS = [
  /(?:card|a\/c|ac|acct|account)\s*(?:no\.?|number|#|ending|xx)?\s*[xX*]+([0-9]{4})/i,
  /([0-9]{4})[xX*]+[0-9]*\s*(?:card|a\/c)/i,
];

// Transaction type detection
const DEBIT_KEYWORDS = [
  'debited', 'debit', 'spent', 'paid', 'withdrawn', 'purchase', 
  'payment', 'sent', 'transferred', 'deducted', 'charged'
];

const CREDIT_KEYWORDS = [
  'credited', 'credit', 'received', 'refund', 'cashback', 
  'deposited', 'added', 'reversed'
];

// Bank sender IDs
const BANK_SENDERS = [
  'HDFCBK', 'ICICIB', 'SBIINB', 'AXISBK', 'KOTAKB', 'PNBSMS',
  'BOIIND', 'CANBNK', 'UNIONB', 'IABORB', 'YESBNK', 'INDUSB',
  'PAYTMB', 'GPAY', 'PHONPE', 'AMAZONP', 'JIOMNY', 'CRED',
  'SLICE', 'LAZYPAY', 'SIMPL', 'BHARPE', 'MOBIKWI', 'FREECHARGE'
];

// Category detection based on keywords
const CATEGORY_KEYWORDS = {
  food: ['swiggy', 'zomato', 'restaurant', 'cafe', 'food', 'pizza', 'burger', 'dominos', 'mcdonalds', 'kfc', 'starbucks', 'dunkin', 'subway', 'biryani', 'kitchen'],
  transport: ['uber', 'ola', 'rapido', 'metro', 'railway', 'irctc', 'petrol', 'diesel', 'fuel', 'parking', 'toll', 'fastag', 'cab', 'auto'],
  shopping: ['amazon', 'flipkart', 'myntra', 'ajio', 'nykaa', 'meesho', 'snapdeal', 'shopclues', 'mall', 'store', 'mart', 'retail'],
  bills: ['electricity', 'water', 'gas', 'broadband', 'wifi', 'internet', 'mobile', 'recharge', 'dth', 'tatasky', 'airtel', 'jio', 'vi ', 'bsnl', 'bill'],
  entertainment: ['netflix', 'prime', 'hotstar', 'spotify', 'gaana', 'youtube', 'movie', 'pvr', 'inox', 'cinema', 'bookmyshow', 'game'],
  health: ['pharmacy', 'medical', 'hospital', 'clinic', 'doctor', 'apollo', 'medplus', '1mg', 'pharmeasy', 'netmeds', 'healthkart'],
  groceries: ['bigbasket', 'grofers', 'blinkit', 'zepto', 'instamart', 'dmart', 'reliance', 'more', 'grocery', 'supermarket', 'vegetables', 'fruits'],
  transfer: ['transfer', 'sent to', 'neft', 'imps', 'rtgs', 'upi'],
  atm: ['atm', 'withdrawal', 'cash withdrawal', 'withdrawn'],
};

/**
 * Parse SMS message and extract transaction details
 */
export const parseSMS = (message, sender = '', timestamp = null) => {
  const result = {
    isTransaction: false,
    type: null, // 'debit' or 'credit'
    amount: null,
    merchant: null,
    cardLast4: null,
    category: 'other',
    rawMessage: message,
    sender: sender,
    timestamp: timestamp || new Date().toISOString(),
    confidence: 0,
  };

  const lowerMessage = message.toLowerCase();
  const upperSender = sender.toUpperCase();

  // Check if sender is a known bank/payment service
  const isFromBank = BANK_SENDERS.some(bank => upperSender.includes(bank));
  
  // Check for transaction keywords
  const hasDebitKeyword = DEBIT_KEYWORDS.some(kw => lowerMessage.includes(kw));
  const hasCreditKeyword = CREDIT_KEYWORDS.some(kw => lowerMessage.includes(kw));

  if (!isFromBank && !hasDebitKeyword && !hasCreditKeyword) {
    return result;
  }

  // Extract amount
  let amount = null;
  for (const pattern of AMOUNT_PATTERNS) {
    const match = message.match(pattern);
    if (match) {
      amount = parseFloat(match[1].replace(/,/g, ''));
      if (!isNaN(amount) && amount > 0) {
        result.amount = amount;
        result.confidence += 30;
        break;
      }
    }
  }

  if (!result.amount) {
    return result;
  }

  // Determine transaction type
  if (hasDebitKeyword && !hasCreditKeyword) {
    result.type = 'debit';
    result.confidence += 20;
  } else if (hasCreditKeyword && !hasDebitKeyword) {
    result.type = 'credit';
    result.confidence += 20;
  } else if (hasDebitKeyword && hasCreditKeyword) {
    // If both present, check which comes first or use context
    const debitIndex = Math.min(...DEBIT_KEYWORDS.map(kw => {
      const idx = lowerMessage.indexOf(kw);
      return idx === -1 ? Infinity : idx;
    }));
    const creditIndex = Math.min(...CREDIT_KEYWORDS.map(kw => {
      const idx = lowerMessage.indexOf(kw);
      return idx === -1 ? Infinity : idx;
    }));
    result.type = debitIndex < creditIndex ? 'debit' : 'credit';
    result.confidence += 10;
  } else {
    // Default to debit for expense tracking
    result.type = 'debit';
  }

  // Extract merchant/recipient
  for (const pattern of MERCHANT_PATTERNS) {
    const match = message.match(pattern);
    if (match) {
      result.merchant = match[1].trim().substring(0, 50);
      result.confidence += 15;
      break;
    }
  }

  // Extract card last 4 digits
  for (const pattern of CARD_PATTERNS) {
    const match = message.match(pattern);
    if (match) {
      result.cardLast4 = match[1];
      result.confidence += 10;
      break;
    }
  }

  // Detect category based on merchant/message content
  const searchText = `${lowerMessage} ${(result.merchant || '').toLowerCase()}`;
  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    if (keywords.some(kw => searchText.includes(kw))) {
      result.category = category;
      result.confidence += 15;
      break;
    }
  }

  // Mark as valid transaction if confidence is high enough
  if (result.amount && result.type && result.confidence >= 30) {
    result.isTransaction = true;
  }

  // Bonus confidence for bank sender
  if (isFromBank) {
    result.confidence += 20;
  }

  return result;
};

/**
 * Convert parsed SMS to expense object
 */
export const smsToExpense = (parsedSMS) => {
  if (!parsedSMS.isTransaction || parsedSMS.type !== 'debit') {
    return null;
  }

  return {
    amount: parsedSMS.amount,
    category: parsedSMS.category,
    description: parsedSMS.merchant || 'SMS Transaction',
    date: parsedSMS.timestamp,
    source: 'sms',
    cardLast4: parsedSMS.cardLast4,
    rawMessage: parsedSMS.rawMessage,
    sender: parsedSMS.sender,
    confidence: parsedSMS.confidence,
  };
};

/**
 * Generate unique ID for SMS to prevent duplicates
 */
export const generateSMSId = (message, timestamp) => {
  const str = `${message.substring(0, 50)}_${timestamp}`;
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(36);
};

/**
 * Test SMS parsing (for development)
 */
export const testParser = () => {
  const testMessages = [
    {
      message: "Rs.499.00 debited from A/c XX1234 on 06-Jan-25. UPI:SWIGGY. Avl Bal:Rs.15,234.50",
      sender: "HDFCBK"
    },
    {
      message: "INR 1,500 spent on HDFC Credit Card XX5678 at Amazon on 06-Jan-25",
      sender: "HDFCBK"
    },
    {
      message: "Your a/c XXX4321 credited with Rs.25000.00 on 06-Jan-25. NEFT from JOHN DOE",
      sender: "ICICIB"
    },
    {
      message: "Paid Rs.150 to Uber via UPI. UPI Ref: 123456789012",
      sender: "GPAY"
    },
  ];

  return testMessages.map(({ message, sender }) => ({
    input: { message, sender },
    output: parseSMS(message, sender),
  }));
};

