/**
 * SMS Parser for Indian Bank & Payment Messages
 * Extracts transaction details from SMS messages
 */

// Common patterns for Indian bank/payment SMS
const AMOUNT_PATTERNS = [
  /(?:Spent|Sent|Received|Debited|Credited)\s*Rs\.?\s*([0-9,]+(?:\.[0-9]{1,2})?)/i,
  /Rs\.?\s*([0-9,]+(?:\.[0-9]{1,2})?)\s*(?:spent|sent|debited|credited|received)/i,
  /(?:Rs\.?|INR|₹)\s*([0-9,]+(?:\.[0-9]{1,2})?)/i,
  /(?:amount|amt|debited|credited|spent|paid|received|transferred)\s*(?:of|:)?\s*(?:Rs\.?|INR|₹)?\s*([0-9,]+(?:\.[0-9]{1,2})?)/i,
  /([0-9,]+(?:\.[0-9]{1,2})?)\s*(?:Rs\.?|INR|₹)/i,
];

const MERCHANT_PATTERNS = [
  /(?:At|at)\s+([A-Z0-9\s&\-\.]+?)(?:\s+On|\s+on)/i,
  /(?:To|to)\s+([A-Z0-9\s&\-\.]+?)(?:\s+On|\s+on|\s+Ref|$)/i,
  /(?:From|from)\s+([A-Z0-9\s&\-\.]+?)(?:\s+On|\s+on|\s+Ref|$)/i,
  /(?:at|to|from|@)\s+([A-Za-z0-9\s&\-\.]+?)(?:\s+on|\s+ref|\s+UPI|\.|$)/i,
  /(?:paid to|sent to|received from|transferred to)\s+([A-Za-z0-9\s&\-\.]+?)(?:\s+on|\s+ref|\.|$)/i,
  /VPA\s+([a-zA-Z0-9@\.\-]+)/i,
  /UPI:([A-Za-z0-9\s&\-\.@]+?)(?:\s+on|\s+ref|\.|$)/i,
];

const CARD_PATTERNS = [
  /Card\s*(\d{4})/i,
  /A\/C\s*\*(\d{4})/i,
  /(?:card|a\/c|ac|acct|account)\s*(?:no\.?|number|#|ending|xx)?\s*[xX*]*(\d{4})/i,
  /(\d{4})[xX*]+\d*\s*(?:card|a\/c)/i,
];

// Transaction type detection
const DEBIT_KEYWORDS = [
  'spent', 'debited', 'debit', 'paid', 'withdrawn', 'purchase', 
  'payment', 'sent', 'transferred', 'deducted', 'charged'
];

const CREDIT_KEYWORDS = [
  'credited', 'credit', 'received', 'refund', 'cashback', 
  'deposited', 'added', 'reversed'
];

// Bank sender IDs
const BANK_SENDERS = [
  'HDFC', 'ICICI', 'SBI', 'AXIS', 'KOTAK', 'PNB', 'BOI', 'CANARA',
  'UNION', 'IOB', 'YES', 'INDUS', 'PAYTM', 'GPAY', 'PHONPE', 
  'AMAZON', 'CRED', 'SLICE', 'LAZYPAY', 'SIMPL', 'BHARPE', 'MOBIKWIK'
];

// Category detection based on keywords
const CATEGORY_KEYWORDS = {
  food: ['swiggy', 'zomato', 'restaurant', 'cafe', 'food', 'pizza', 'burger', 'dominos', 'mcdonalds', 'kfc', 'starbucks', 'dunkin', 'subway', 'biryani', 'kitchen', 'mysore cafe', 'hotel', 'dhaba'],
  transport: ['uber', 'ola', 'rapido', 'metro', 'railway', 'irctc', 'petrol', 'diesel', 'fuel', 'parking', 'toll', 'fastag', 'cab', 'auto'],
  shopping: ['amazon', 'flipkart', 'myntra', 'ajio', 'nykaa', 'meesho', 'snapdeal', 'shopclues', 'mall', 'store', 'mart', 'retail'],
  bills: ['electricity', 'water', 'gas', 'broadband', 'wifi', 'internet', 'mobile', 'recharge', 'dth', 'tatasky', 'airtel', 'jio', 'vi ', 'bsnl', 'bill'],
  entertainment: ['netflix', 'prime', 'hotstar', 'spotify', 'gaana', 'youtube', 'movie', 'pvr', 'inox', 'cinema', 'bookmyshow', 'game'],
  health: ['pharmacy', 'medical', 'hospital', 'clinic', 'doctor', 'apollo', 'medplus', '1mg', 'pharmeasy', 'netmeds', 'healthkart'],
  groceries: ['bigbasket', 'grofers', 'blinkit', 'zepto', 'instamart', 'dmart', 'reliance', 'more', 'grocery', 'supermarket', 'vegetables', 'fruits'],
  transfer: ['transfer', 'neft', 'imps', 'rtgs'],
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

  if (!message || message.length < 10) {
    return result;
  }

  const lowerMessage = message.toLowerCase();
  const upperMessage = message.toUpperCase();

  // Check for transaction keywords
  const hasDebitKeyword = DEBIT_KEYWORDS.some(kw => lowerMessage.includes(kw));
  const hasCreditKeyword = CREDIT_KEYWORDS.some(kw => lowerMessage.includes(kw));

  // Check if contains bank-related content
  const hasBankContent = BANK_SENDERS.some(bank => upperMessage.includes(bank)) ||
                         lowerMessage.includes('bank') ||
                         lowerMessage.includes('card') ||
                         lowerMessage.includes('a/c') ||
                         lowerMessage.includes('upi');

  if (!hasBankContent && !hasDebitKeyword && !hasCreditKeyword) {
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
    result.confidence += 25;
  } else if (hasCreditKeyword && !hasDebitKeyword) {
    result.type = 'credit';
    result.confidence += 25;
  } else if (hasDebitKeyword && hasCreditKeyword) {
    // If both present, check which comes first
    const debitIndex = Math.min(...DEBIT_KEYWORDS.map(kw => {
      const idx = lowerMessage.indexOf(kw);
      return idx === -1 ? Infinity : idx;
    }));
    const creditIndex = Math.min(...CREDIT_KEYWORDS.map(kw => {
      const idx = lowerMessage.indexOf(kw);
      return idx === -1 ? Infinity : idx;
    }));
    result.type = debitIndex < creditIndex ? 'debit' : 'credit';
    result.confidence += 15;
  } else {
    // Default to debit for expense tracking
    result.type = 'debit';
    result.confidence += 10;
  }

  // Extract merchant/recipient
  for (const pattern of MERCHANT_PATTERNS) {
    const match = message.match(pattern);
    if (match) {
      let merchant = match[1].trim();
      // Clean up merchant name
      merchant = merchant.replace(/\s+/g, ' ').substring(0, 50);
      if (merchant.length > 2) {
        result.merchant = merchant;
        result.confidence += 15;
        break;
      }
    }
  }

  // Extract card/account last 4 digits
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

  // Bonus confidence for bank content
  if (hasBankContent) {
    result.confidence += 15;
  }

  return result;
};

/**
 * Convert parsed SMS to expense object
 * Now handles both debits (expenses) and credits (income)
 */
export const smsToExpense = (parsedSMS) => {
  if (!parsedSMS.isTransaction) {
    return null;
  }

  // For credits (money received), we still track it but mark it as income
  const isIncome = parsedSMS.type === 'credit';

  return {
    amount: parsedSMS.amount,
    category: isIncome ? 'income' : parsedSMS.category,
    description: parsedSMS.merchant || (isIncome ? 'Money Received' : 'SMS Transaction'),
    date: parsedSMS.timestamp,
    source: 'sms',
    type: parsedSMS.type, // 'debit' or 'credit'
    cardLast4: parsedSMS.cardLast4,
    rawMessage: parsedSMS.rawMessage,
    sender: parsedSMS.sender,
    confidence: parsedSMS.confidence,
    isIncome: isIncome,
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
 * Test SMS parsing with HDFC formats
 */
export const testParser = () => {
  const testMessages = [
    {
      message: "Spent Rs.657.44 On HDFC Bank Card 0586 At ZOMATO On 2026-01-08:14:22:20.Not You?",
      sender: "HDFCBK"
    },
    {
      message: "Sent Rs.121.00 From HDFC Bank A/C *5495 To THE MYSORE CAFE On 08/01/26 Ref 116846258804",
      sender: "HDFCBK"
    },
    {
      message: "Rs.5000.00 credited to your A/C *5495 on 08/01/26. NEFT from JOHN DOE",
      sender: "HDFCBK"
    },
    {
      message: "INR 1,500 spent on HDFC Credit Card XX5678 at Amazon on 06-Jan-25",
      sender: "HDFCBK"
    },
  ];

  return testMessages.map(({ message, sender }) => ({
    input: { message, sender },
    output: parseSMS(message, sender),
  }));
};
